import { db } from "../supabase.js";
import { ApiError } from "../errors.js";
import { listDrivers, getDriver, refreshDriverLoad } from "./drivers.js";
import { getOrder } from "./orders.js";
import { getDelivery } from "./deliveries.js";
import { getRoute } from "./routing.js";
import { logEvent } from "./events.js";

// ---- Business rules (enforced here, never by the LLM) ---------------------

// Returns a list of human-readable rule violations (empty = eligible).
export function checkEligibility(order, driver) {
  const v = [];
  if (driver.status !== "available") v.push(`Driver status is '${driver.status}' (must be 'available')`);
  if (Number(driver.capacity_kg) < Number(order.weight_kg)) {
    v.push(`Order weighs ${order.weight_kg} kg but driver capacity is ${driver.capacity_kg} kg`);
  }
  if (driver.active_orders >= driver.max_active_orders) {
    v.push(`Driver already has ${driver.active_orders}/${driver.max_active_orders} active orders`);
  }
  if (!driver.location) v.push("Driver has no known location");
  return v;
}

const pickupPoint = (o) => ({ lat: Number(o.pickup_lat), lng: Number(o.pickup_lng) });
const dropPoint = (o) => ({ lat: Number(o.drop_lat), lng: Number(o.drop_lng) });

// Eligible drivers ranked by routed ETA to pickup.
// Normal orders: ETAs within the same minute count as a tie -> fewer active orders -> higher rating.
// Urgent orders: pure fastest ETA (load is ignored as a tie-breaker priority).
export async function rankCandidates(order, { exclude = [] } = {}) {
  const drivers = (await listDrivers({ status: "available" })).filter((d) => !exclude.includes(d.id));
  const eligible = drivers.filter((d) => checkEligibility(order, d).length === 0);
  const pickup = pickupPoint(order);

  const scored = await Promise.all(
    eligible.map(async (d) => {
      const r = await getRoute(d.location, pickup);
      return {
        driver_id: d.id,
        name: d.name,
        vehicle_type: d.vehicle_type,
        capacity_kg: d.capacity_kg,
        active_orders: d.active_orders,
        max_active_orders: d.max_active_orders,
        rating: d.rating,
        pickup_distance_m: Math.round(r.distance_m),
        pickup_eta_s: Math.round(r.duration_s),
        route_source: r.source,
      };
    })
  );

  const bucket = (c) => (order.priority === "urgent" ? c.pickup_eta_s : Math.round(c.pickup_eta_s / 60));
  scored.sort(
    (a, b) => bucket(a) - bucket(b) || a.pickup_eta_s - b.pickup_eta_s || a.active_orders - b.active_orders || b.rating - a.rating
  );
  return scored;
}

// ---- Assignment -----------------------------------------------------------

export async function assignDriver({ order_id, driver_id, reason, actor = "user" }) {
  const order = await getOrder(order_id);
  if (!order) throw new ApiError(404, "Order not found");
  if (order.status !== "pending") throw new ApiError(409, `Order is '${order.status}', only 'pending' orders can be assigned`);

  const driver = await getDriver(driver_id);
  if (!driver) throw new ApiError(404, "Driver not found");

  const violations = checkEligibility(order, driver);
  if (violations.length) throw new ApiError(422, "Driver is not eligible for this order", { violations });

  const [toPickup, trip] = await Promise.all([
    getRoute(driver.location, pickupPoint(order)),
    getRoute(pickupPoint(order), dropPoint(order)),
  ]);
  const totalSeconds = toPickup.duration_s + trip.duration_s;
  const eta = new Date(Date.now() + totalSeconds * 1000);

  if (order.time_window_end && eta > new Date(order.time_window_end)) {
    throw new ApiError(422, "Driver cannot meet the order's time window", {
      violations: [`Estimated delivery ${eta.toISOString()} is after ${new Date(order.time_window_end).toISOString()}`],
    });
  }

  // Atomic claim: only one caller can flip pending -> assigned.
  const { data: claimed, error: claimErr } = await db()
    .from("orders")
    .update({ status: "assigned" })
    .eq("id", order_id)
    .eq("status", "pending")
    .select()
    .maybeSingle();
  if (claimErr) throw new ApiError(500, claimErr.message);
  if (!claimed) throw new ApiError(409, "Order was just assigned by someone else");

  const { data: delivery, error: insErr } = await db()
    .from("deliveries")
    .insert({
      order_id,
      driver_id,
      status: "assigned",
      assigned_by: actor,
      planned_eta: eta.toISOString(),
      eta: eta.toISOString(),
      distance_m: Math.round(toPickup.distance_m + trip.distance_m),
      duration_s: Math.round(totalSeconds),
      route_polyline: trip.polyline,
    })
    .select()
    .single();
  if (insErr) {
    await db().from("orders").update({ status: "pending" }).eq("id", order_id);
    throw new ApiError(insErr.code === "23505" ? 409 : 500, insErr.message);
  }

  await refreshDriverLoad(driver_id);
  await logEvent({
    type: "assigned",
    message: `Assigned to ${driver.name}. ${reason || ""}`.trim(),
    order_id,
    delivery_id: delivery.id,
    driver_id,
    created_by: actor,
    meta: { eta: eta.toISOString(), route_source: toPickup.source },
  });
  return delivery;
}

export async function autoAssign(order_id, { exclude = [], actor = "system" } = {}) {
  const order = await getOrder(order_id);
  if (!order) throw new ApiError(404, "Order not found");
  if (order.status !== "pending") throw new ApiError(409, `Order is '${order.status}', only 'pending' orders can be assigned`);

  const candidates = await rankCandidates(order, { exclude });
  if (!candidates.length) {
    await logEvent({ type: "no_driver_available", message: "No eligible driver available", order_id, created_by: actor });
    return { order_id, assigned: false, reason: "No eligible driver available" };
  }

  for (const c of candidates) {
    try {
      const delivery = await assignDriver({
        order_id,
        driver_id: c.driver_id,
        reason: `Auto: fastest pickup ETA (${c.pickup_eta_s}s)`,
        actor,
      });
      return { order_id, assigned: true, delivery, chosen: c };
    } catch (e) {
      if (e instanceof ApiError && (e.status === 422 || e.status === 409)) continue;
      throw e;
    }
  }
  return { order_id, assigned: false, reason: "No candidate satisfied the rules (e.g. time window)" };
}

export async function autoAssignAllPending({ actor = "system" } = {}) {
  const { data, error } = await db().from("orders").select("id, priority, created_at").eq("status", "pending");
  if (error) throw new ApiError(500, error.message);
  const sorted = [...data].sort(
    (a, b) => (a.priority === "urgent" ? 0 : 1) - (b.priority === "urgent" ? 0 : 1) || new Date(a.created_at) - new Date(b.created_at)
  );
  const results = [];
  for (const o of sorted) results.push(await autoAssign(o.id, { actor }));
  return results;
}

// ---- Reassignment ---------------------------------------------------------

// Only deliveries that are still 'assigned' (driver has NOT picked up yet) can be moved.
export async function reassignDelivery({ delivery_id, new_driver_id, reason, actor = "system" }) {
  const d = await getDelivery(delivery_id);
  if (!d) throw new ApiError(404, "Delivery not found");
  if (d.status !== "assigned") {
    throw new ApiError(409, `Delivery is '${d.status}'. Only 'assigned' deliveries can be reassigned; picked-up ones need manual handling.`);
  }
  if (new_driver_id && new_driver_id === d.driver_id) throw new ApiError(400, "new_driver_id is the current driver");

  const { error } = await db().from("deliveries").update({ status: "released" }).eq("id", delivery_id).eq("status", "assigned");
  if (error) throw new ApiError(500, error.message);
  await db().from("orders").update({ status: "pending" }).eq("id", d.order_id);
  await refreshDriverLoad(d.driver_id);
  await logEvent({
    type: "reassigned",
    message: `Released from driver ${d.drivers?.name ?? d.driver_id}: ${reason || "no reason given"}`,
    order_id: d.order_id,
    delivery_id,
    driver_id: d.driver_id,
    created_by: actor,
  });

  try {
    const result = new_driver_id
      ? {
          order_id: d.order_id,
          assigned: true,
          delivery: await assignDriver({ order_id: d.order_id, driver_id: new_driver_id, reason: `Reassigned: ${reason || ""}`, actor }),
        }
      : await autoAssign(d.order_id, { exclude: [d.driver_id], actor });
    return { released: true, ...result };
  } catch (e) {
    if (e instanceof ApiError) return { released: true, order_id: d.order_id, assigned: false, error: e.message, details: e.details ?? null };
    throw e;
  }
}
