import { db } from "../supabase.js";

export async function logEvent({
  type,
  message,
  order_id = null,
  delivery_id = null,
  driver_id = null,
  created_by = "system",
  meta = null,
}) {
  const { error } = await db()
    .from("delivery_events")
    .insert({ type, message, order_id, delivery_id, driver_id, created_by, meta });
  if (error) console.error("logEvent failed:", error.message);
}

export async function listEvents({ limit = 50, order_id } = {}) {
  let q = db()
    .from("delivery_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Math.min(Number(limit) || 50, 200));
  if (order_id) q = q.eq("order_id", order_id);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
}
