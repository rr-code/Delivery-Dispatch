import { db } from "../supabase.js";
import { ApiError } from "../errors.js";
import { ACTIVE_STATUSES, PRIORITIES } from "../constants.js";
import { geocode } from "./routing.js";
import { logEvent } from "./events.js";
import { refreshDriverLoad } from "./drivers.js";

const validLat = (n) => Number.isFinite(n) && n >= -90 && n <= 90;
const validLng = (n) => Number.isFinite(n) && n >= -180 && n <= 180;

async function resolvePoint(body, prefix) {
  const lat = body[`${prefix}_lat`];
  const lng = body[`${prefix}_lng`];
  if (lat != null && lng != null) {
    const la = Number(lat);
    const lo = Number(lng);
    if (!validLat(la) || !validLng(lo)) throw new ApiError(400, `${prefix}_lat/${prefix}_lng out of range`);
    return { lat: la, lng: lo };
  }
  return geocode(body[`${prefix}_address`]);
}

export async function createOrder(body) {
  if (!body?.pickup_address) throw new ApiError(400, "pickup_address is required");
  if (!body?.drop_address) throw new ApiError(400, "drop_address is required");

  const weight_kg = Number(body.weight_kg ?? 1);
  if (!(weight_kg > 0)) throw new ApiError(400, "weight_kg must be > 0");

  const priority = body.priority ?? "normal";
  if (!PRIORITIES.includes(priority)) throw new ApiError(400, `priority must be one of: ${PRIORITIES.join(", ")}`);

  let time_window_end = null;
  if (body.time_window_end) {
    const t = new Date(body.time_window_end);
    if (Number.isNaN(t.getTime())) throw new ApiError(400, "time_window_end must be an ISO date-time");
    time_window_end = t.toISOString();
  }

  const [pickup, drop] = await Promise.all([resolvePoint(body, "pickup"), resolvePoint(body, "drop")]);

  const { data, error } = await db()
    .from("orders")
    .insert({
      customer_name: body.customer_name ?? null,
      customer_phone: body.customer_phone ?? null,
      pickup_address: body.pickup_address,
      pickup_lat: pickup.lat,
      pickup_lng: pickup.lng,
      drop_address: body.drop_address,
      drop_lat: drop.lat,
      drop_lng: drop.lng,
      weight_kg,
      priority,
      time_window_end,
    })
    .select()
    .single();
  if (error) throw new ApiError(500, error.message);

  await logEvent({ type: "order_created", message: `Order created (${priority}, ${weight_kg} kg)`, order_id: data.id });
  return data;
}

export async function listOrders({ status, limit = 100 } = {}) {
  let q = db()
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Math.min(Number(limit) || 100, 500));
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new ApiError(500, error.message);
  return data;
}

export async function getOrder(id) {
  const { data, error } = await db().from("orders").select("*").eq("id", id).maybeSingle();
  if (error) throw new ApiError(error.code === "22P02" ? 400 : 500, error.message);
  return data ? { ...data, weight_kg: Number(data.weight_kg) } : null;
}

export async function getOrderWithDeliveries(id) {
  const order = await getOrder(id);
  if (!order) return null;
  const { data, error } = await db()
    .from("deliveries")
    .select("*, drivers(id,name,vehicle_type)")
    .eq("order_id", id)
    .order("assigned_at", { ascending: false });
  if (error) throw new ApiError(500, error.message);
  return { ...order, deliveries: data };
}

// Supported edits: priority, time_window_end, and cancelling (only before pickup).
export async function updateOrder(id, body) {
  const order = await getOrder(id);
  if (!order) throw new ApiError(404, "Order not found");

  if (body.status !== undefined) {
    if (body.status !== "cancelled") {
      throw new ApiError(400, "Order status is driven by its delivery. Only status 'cancelled' can be set here.");
    }
    if (!["pending", "assigned"].includes(order.status)) {
      throw new ApiError(409, `Order is '${order.status}' and can no longer be cancelled`);
    }
    const { data: live } = await db()
      .from("deliveries")
      .select("id, driver_id")
      .eq("order_id", id)
      .in("status", ACTIVE_STATUSES);
    for (const d of live || []) {
      await db().from("deliveries").update({ status: "cancelled" }).eq("id", d.id);
      await refreshDriverLoad(d.driver_id);
    }
    await db().from("orders").update({ status: "cancelled" }).eq("id", id);
    await logEvent({ type: "order_cancelled", message: "Order cancelled", order_id: id });
  }

  const patch = {};
  if (body.priority !== undefined) {
    if (!PRIORITIES.includes(body.priority)) throw new ApiError(400, `priority must be one of: ${PRIORITIES.join(", ")}`);
    patch.priority = body.priority;
  }
  if (body.time_window_end !== undefined) {
    if (body.time_window_end === null) patch.time_window_end = null;
    else {
      const t = new Date(body.time_window_end);
      if (Number.isNaN(t.getTime())) throw new ApiError(400, "time_window_end must be an ISO date-time");
      patch.time_window_end = t.toISOString();
    }
  }
  if (Object.keys(patch).length) {
    const { error } = await db().from("orders").update(patch).eq("id", id);
    if (error) throw new ApiError(500, error.message);
  }
  return getOrderWithDeliveries(id);
}
