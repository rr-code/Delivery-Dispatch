import { db } from "../supabase.js";
import { ApiError } from "../errors.js";
import { ACTIVE_STATUSES, TRANSITIONS } from "../constants.js";
import { refreshDriverLoad } from "./drivers.js";
import { logEvent } from "./events.js";

const SELECT = "*, orders(*), drivers(id,name,vehicle_type,status)";

export async function getDelivery(id) {
  const { data, error } = await db().from("deliveries").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw new ApiError(error.code === "22P02" ? 400 : 500, error.message);
  return data;
}

export async function listDeliveries({ active = true, status, driver_id, limit = 100 } = {}) {
  let q = db()
    .from("deliveries")
    .select(SELECT)
    .order("assigned_at", { ascending: true })
    .limit(Math.min(Number(limit) || 100, 500));
  if (status) q = q.eq("status", status);
  else if (active) q = q.in("status", ACTIVE_STATUSES);
  if (driver_id) q = q.eq("driver_id", driver_id);
  const { data, error } = await q;
  if (error) throw new ApiError(500, error.message);
  return data;
}

export async function updateDeliveryStatus({ delivery_id, status, actor = "user", reason }) {
  const d = await getDelivery(delivery_id);
  if (!d) throw new ApiError(404, "Delivery not found");

  const allowed = TRANSITIONS[d.status] || [];
  if (!allowed.includes(status)) {
    throw new ApiError(409, `Cannot change delivery from '${d.status}' to '${status}'`, { allowed });
  }

  const patch = { status };
  if (status === "picked_up") patch.picked_up_at = new Date().toISOString();
  if (status === "delivered") patch.delivered_at = new Date().toISOString();

  const { error } = await db().from("deliveries").update(patch).eq("id", delivery_id);
  if (error) throw new ApiError(500, error.message);
  await db().from("orders").update({ status }).eq("id", d.order_id);
  await refreshDriverLoad(d.driver_id);

  await logEvent({
    type: `delivery_${status}`,
    message: reason ? `Delivery marked ${status}: ${reason}` : `Delivery marked ${status}`,
    order_id: d.order_id,
    delivery_id,
    driver_id: d.driver_id,
    created_by: actor,
  });
  return getDelivery(delivery_id);
}
