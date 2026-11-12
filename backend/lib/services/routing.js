import { ApiError } from "../errors.js";
import { haversineM } from "../geo.js";

// All distances/ETAs come from here. The LLM never computes them.
// ROUTING_PROVIDER = mapbox | google | mock
//   mock = straight-line x1.3 at 25 km/h, labelled source:"estimate". For offline demos only.

const cache = new Map();
const TTL_MS = 10 * 60 * 1000;

const provider = () => (process.env.ROUTING_PROVIDER || "mock").toLowerCase();
const cacheKey = (a, b) => [a.lat, a.lng, b.lat, b.lng].map((n) => Number(n).toFixed(4)).join(",");

function check(p, name) {
  if (!p || !Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lng))) {
    throw new ApiError(400, `Invalid coordinates for ${name}`);
  }
  return { lat: Number(p.lat), lng: Number(p.lng) };
}

async function fetchJson(url, headers) {
  let res;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  } catch (e) {
    throw new ApiError(502, `Routing service unreachable: ${e.message}`);
  }
  if (!res.ok) throw new ApiError(502, `Routing service error ${res.status}`);
  return res.json();
}

async function mapboxRoute(a, b) {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) throw new ApiError(500, "MAPBOX_TOKEN is not set");
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${a.lng},${a.lat};${b.lng},${b.lat}` +
    `?overview=full&geometries=polyline&access_token=${token}`;
  const data = await fetchJson(url);
  const r = data.routes?.[0];
  if (!r) throw new ApiError(502, "Mapbox returned no route");
  return { distance_m: r.distance, duration_s: r.duration, polyline: r.geometry, source: "mapbox" };
}

async function googleRoute(a, b) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new ApiError(500, "GOOGLE_MAPS_API_KEY is not set");
  const url =
    `https://maps.googleapis.com/maps/api/directions/json?origin=${a.lat},${a.lng}` +
    `&destination=${b.lat},${b.lng}&mode=driving&key=${key}`;
  const data = await fetchJson(url);
  if (data.status !== "OK") throw new ApiError(502, `Google Directions status: ${data.status}`);
  const r = data.routes[0];
  const leg = r.legs[0];
  return {
    distance_m: leg.distance.value,
    duration_s: leg.duration_in_traffic?.value ?? leg.duration.value,
    polyline: r.overview_polyline?.points ?? null,
    source: "google",
  };
}

function mockRoute(a, b) {
  const distance_m = haversineM(a, b) * 1.3;
  return { distance_m, duration_s: distance_m / (25 / 3.6), polyline: null, source: "estimate" };
}

export async function getRoute(from, to) {
  const a = check(from, "from");
  const b = check(to, "to");
  const k = cacheKey(a, b);
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const p = provider();
  const value = p === "mapbox" ? await mapboxRoute(a, b) : p === "google" ? await googleRoute(a, b) : mockRoute(a, b);
  cache.set(k, { at: Date.now(), value });
  return value;
}

// Address -> { lat, lng }. Needs a real provider.
export async function geocode(address) {
  const p = provider();
  if (p === "mapbox") {
    const token = process.env.MAPBOX_TOKEN;
    if (!token) throw new ApiError(500, "MAPBOX_TOKEN is not set");
    const data = await fetchJson(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?limit=1&access_token=${token}`
    );
    const c = data.features?.[0]?.center;
    if (!c) throw new ApiError(422, `Could not geocode address: ${address}`);
    return { lat: c[1], lng: c[0] };
  }
  if (p === "google") {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) throw new ApiError(500, "GOOGLE_MAPS_API_KEY is not set");
    const data = await fetchJson(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`
    );
    const loc = data.results?.[0]?.geometry?.location;
    if (!loc) throw new ApiError(422, `Could not geocode address: ${address}`);
    return { lat: loc.lat, lng: loc.lng };
  }
  throw new ApiError(400, "Geocoding needs ROUTING_PROVIDER=mapbox or google. Send lat/lng with the order instead.");
}
