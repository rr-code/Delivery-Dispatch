import { db } from "../supabase.js";
import { ApiError } from "../errors.js";
import { ACTIVE_STATUSES, DRIVER_STATUSES, UNAVAILABLE_STATUSES, VEHICLES } from "../constants.js";

async function enrich(drivers) {
  if (!drivers.length) return [];
  const ids = drivers.map((d) => d.id);
  const [locRes, delRes] = await Promise.all([
    db().from("driver_latest_location").select("*").in("driver_id", ids),
    db().from("deliveries").select("driver_id").in("driver_id", ids).in("status", ACTIVE_STATUSES),
  ]);
  if (locRes.error) throw new ApiError(500, locRes.error.message);
  if (delRes.error) throw new ApiError(500, delRes.error.message);

  const locs = Object.fromEntries(
    locRes.data.map((l) => [l.driver_id, { lat: l.lat, lng: l.lng, speed_kmh: Number(l.speed_kmh), updated_at: l.updated_at }])
  );
  const counts = {};
  for (const r of delRes.data) counts[r.driver_id] = (counts[r.driver_id] || 0) + 1;

  return drivers.map((d) => ({
    ...d,
    capacity_kg: Number(d.capacity_kg),
    rating: Number(d.rating),
    location: locs[d.id] || null,
    active_orders: counts[d.id] || 0,
  }));
}

export async function listDrivers({ status } = {}) {
  let q = db().from("drivers").select("*").order("name");
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new ApiError(500, error.message);
  return enrich(data);
}

export async function getDriver(id) {
  const { data, error } = await db().from("drivers").select("*").eq("id", id).maybeSingle();
  if (error) throw new ApiError(error.code === "22P02" ? 400 : 500, error.message);
  if (!data) return null;
  return (await enrich([data]))[0];
}

export async function recordLocation(driver_id, { lat, lng, speed_kmh = 0 }) {
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || la < -90 || la > 90) throw new ApiError(400, "lat must be a number between -90 and 90");
  if (!Number.isFinite(lo) || lo < -180 || lo > 180) throw new ApiError(400, "lng must be a number between -180 and 180");
  const { data, error } = await db()
    .from("driver_locations")
    .insert({ driver_id, lat: la, lng: lo, speed_kmh: Number(speed_kmh) || 0 })
    .select()
    .single();
  if (error) throw new ApiError(error.code === "23503" ? 404 : 500, error.code === "23503" ? "Driver not found" : error.message);
  return data;
}

export async function createDriver(b) {
  if (!b?.name) throw new ApiError(400, "name is required");
  const vehicle_type = b.vehicle_type ?? "bike";
  if (!VEHICLES.includes(vehicle_type)) throw new ApiError(400, `vehicle_type must be one of: ${VEHICLES.join(", ")}`);
  const capacity_kg = Number(b.capacity_kg ?? 20);
  const max_active_orders = Number(b.max_active_orders ?? 3);
  if (!(capacity_kg > 0)) throw new ApiError(400, "capacity_kg must be > 0");
  if (!(max_active_orders > 0)) throw new ApiError(400, "max_active_orders must be > 0");

  const { data, error } = await db()
    .from("drivers")
    .insert({ name: b.name, phone: b.phone ?? null, vehicle_type, capacity_kg, max_active_orders })
    .select()
    .single();
  if (error) throw new ApiError(500, error.message);

  if (b.lat != null && b.lng != null) await recordLocation(data.id, { lat: b.lat, lng: b.lng });
  return getDriver(data.id);
}

export async function updateDriver(id, b) {
  const patch = {};
  for (const k of ["name", "phone", "vehicle_type", "capacity_kg", "max_active_orders", "status"]) {
    if (b?.[k] !== undefined) patch[k] = b[k];
  }
  if (patch.status && !DRIVER_STATUSES.includes(patch.status)) {
    throw new ApiError(400, `status must be one of: ${DRIVER_STATUSES.join(", ")}`);
  }
  if (patch.vehicle_type && !VEHICLES.includes(patch.vehicle_type)) {
    throw new ApiError(400, `vehicle_type must be one of: ${VEHICLES.join(", ")}`);
  }
  if (!Object.keys(patch).length) throw new ApiError(400, "No updatable fields supplied");

  const { data, error } = await db().from("drivers").update(patch).eq("id", id).select().maybeSingle();
  if (error) throw new ApiError(error.code === "22P02" ? 400 : 500, error.message);
  if (!data) throw new ApiError(404, "Driver not found");
  return getDriver(id);
}

// Keep available/busy in sync with the number of live deliveries.
// Never overrides offline/on_break (those are set by the driver or a dispatcher).
export async function refreshDriverLoad(driver_id) {
  const d = await getDriver(driver_id);
  if (!d || UNAVAILABLE_STATUSES.includes(d.status)) return;
  const next = d.active_orders >= d.max_active_orders ? "busy" : "available";
  if (next !== d.status) {
    const { error } = await db().from("drivers").update({ status: next }).eq("id", driver_id);
    if (error) console.error("refreshDriverLoad failed:", error.message);
  }
}
