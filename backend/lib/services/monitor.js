import { db } from "../supabase.js";
import { ApiError } from "../errors.js";
import { listDrivers } from "./drivers.js";
import { listDeliveries } from "./deliveries.js";
import { reassignDelivery } from "./assignment.js";
import { getRoute } from "./routing.js";
import { logEvent } from "./events.js";

const pt = (lat, lng) => ({ lat: Number(lat), lng: Number(lng) });

// Re-estimate every live delivery with the routing service and flag the late ones.
export async function checkDelays({ threshold_min } = {}) {
  const th = Number(threshold_min ?? process.env.DELAY_THRESHOLD_MIN ?? 10);
  const deliveries = await listDeliveries({ active: true });
  const drivers = Object.fromEntries((await listDrivers()).map((d) => [d.id, d]));

  const report = [];
  for (const d of deliveries) {
    const loc = drivers[d.driver_id]?.location;
    const o = d.orders;
    if (!loc || !o) continue;

    const pickup = pt(o.pickup_lat, o.pickup_lng);
    const drop = pt(o.drop_lat, o.drop_lng);
    let seconds;
    if (d.status === "assigned") {
      const [a, b] = await Promise.all([getRoute(loc, pickup), getRoute(pickup, drop)]);
      seconds = a.duration_s + b.duration_s;
    } else {
      seconds = (await getRoute(loc, drop)).duration_s;
    }

    const newEta = new Date(Date.now() + seconds * 1000);
    const deadline = new Date(o.time_window_end ?? d.planned_eta ?? newEta);
    const delay = Math.max(0, Math.round((newEta - deadline) / 60000));
    const previous = d.delay_minutes || 0;

    await db().from("deliveries").update({ eta: newEta.toISOString(), delay_minutes: delay }).eq("id", d.id);

    if (delay >= th && Math.abs(delay - previous) >= 5) {
      await logEvent({
        type: "delay",
        message: `Running about ${delay} min late`,
        order_id: d.order_id,
        delivery_id: d.id,
        driver_id: d.driver_id,
        meta: { delay_minutes: delay },
      });
    }
    report.push({
      delivery_id: d.id,
      order_id: d.order_id,
      driver_id: d.driver_id,
      driver_name: d.drivers?.name ?? null,
      status: d.status,
      eta: newEta.toISOString(),
      delay_minutes: delay,
      delayed: delay >= th,
    });
  }
  return { threshold_min: th, checked: report.length, delayed: report.filter((r) => r.delayed), all: report };
}

export async function flagDelay({ delivery_id, delay_minutes, reason, actor = "agent" }) {
  const mins = Number(delay_minutes);
  if (!Number.isFinite(mins) || mins < 0) throw new ApiError(400, "delay_minutes must be a number >= 0");
  const { data, error } = await db()
    .from("deliveries")
    .update({ delay_minutes: Math.round(mins) })
    .eq("id", delivery_id)
    .select()
    .maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!data) throw new ApiError(404, "Delivery not found");
  await logEvent({
    type: "delay",
    message: `Delay flagged: ${Math.round(mins)} min. ${reason || ""}`.trim(),
    order_id: data.order_id,
    delivery_id,
    driver_id: data.driver_id,
    created_by: actor,
  });
  return data;
}

// Driver went offline / on break: move not-yet-picked-up work, flag the rest for a human.
export async function handleDriverUnavailable({ driver_id, reason, actor = "system" }) {
  const live = await listDeliveries({ active: true, driver_id });
  const results = [];
  for (const d of live) {
    if (d.status === "assigned") {
      results.push({ delivery_id: d.id, action: "reassign", ...(await reassignDelivery({ delivery_id: d.id, reason: reason || "Driver unavailable", actor })) });
    } else {
      await logEvent({
        type: "manual_handling_required",
        message: `Driver unavailable but delivery is '${d.status}'. Needs manual handling.`,
        order_id: d.order_id,
        delivery_id: d.id,
        driver_id,
        created_by: actor,
      });
      results.push({ delivery_id: d.id, action: "manual_handling_required", status: d.status });
    }
  }
  return results;
}
