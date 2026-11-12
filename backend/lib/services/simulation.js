import { db } from "../supabase.js";
import { ApiError } from "../errors.js";
import { VEHICLE_SPEED_KMH, UNAVAILABLE_STATUSES } from "../constants.js";
import { moveToward } from "../geo.js";
import { listDrivers } from "./drivers.js";
import { listDeliveries, updateDeliveryStatus } from "./deliveries.js";

// Simulated GPS for the prototype. Each tick moves every driver that has a live delivery
// in a straight line toward their next stop (pickup, then drop) and stores a new location row.
// SIM_SPEED_MULTIPLIER speeds things up for demos (default 10x).
export async function tick({ step_seconds = 30, auto_progress = true } = {}) {
  const step = Number(step_seconds);
  if (!(step > 0 && step <= 3600)) throw new ApiError(400, "step_seconds must be between 1 and 3600");
  const mult = Number(process.env.SIM_SPEED_MULTIPLIER || 10);

  const [drivers, deliveries] = await Promise.all([listDrivers(), listDeliveries({ active: true })]);
  const firstByDriver = {};
  for (const d of deliveries) if (!firstByDriver[d.driver_id]) firstByDriver[d.driver_id] = d; // oldest first

  const rows = [];
  const arrivals = [];
  const moved = [];

  for (const drv of drivers) {
    const del = firstByDriver[drv.id];
    if (!del || !drv.location || UNAVAILABLE_STATUSES.includes(drv.status)) continue;
    const o = del.orders;
    const target =
      del.status === "assigned"
        ? { lat: Number(o.pickup_lat), lng: Number(o.pickup_lng) }
        : { lat: Number(o.drop_lat), lng: Number(o.drop_lng) };

    const speed = VEHICLE_SPEED_KMH[drv.vehicle_type] ?? 25;
    const meters = (speed / 3.6) * step * mult;
    const pos = moveToward(drv.location, target, meters);

    rows.push({ driver_id: drv.id, lat: pos.lat, lng: pos.lng, speed_kmh: pos.arrived ? 0 : speed });
    moved.push({ driver_id: drv.id, name: drv.name, lat: pos.lat, lng: pos.lng, arrived: pos.arrived, remaining_m: Math.round(pos.remaining_m) });
    if (pos.arrived) arrivals.push({ delivery: del });
  }

  if (rows.length) {
    const { error } = await db().from("driver_locations").insert(rows);
    if (error) throw new ApiError(500, error.message);
  }

  const progressed = [];
  if (auto_progress) {
    for (const { delivery } of arrivals) {
      const id = delivery.id;
      const note = { actor: "simulation", reason: "simulated arrival" };
      if (delivery.status === "assigned") {
        await updateDeliveryStatus({ delivery_id: id, status: "picked_up", ...note });
        await updateDeliveryStatus({ delivery_id: id, status: "in_transit", ...note });
        progressed.push({ delivery_id: id, now: "in_transit" });
      } else {
        if (delivery.status === "picked_up") await updateDeliveryStatus({ delivery_id: id, status: "in_transit", ...note });
        await updateDeliveryStatus({ delivery_id: id, status: "delivered", ...note });
        progressed.push({ delivery_id: id, now: "delivered" });
      }
    }
  }
  return { moved, progressed };
}
