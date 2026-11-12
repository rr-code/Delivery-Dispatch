const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

// Straight-line distance in metres. Used ONLY by the GPS simulation and the "mock" routing fallback.
export function haversineM(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Move from `from` toward `to` by `meters` (simulated GPS).
export function moveToward(from, to, meters) {
  const d = haversineM(from, to);
  if (d === 0 || d <= meters) return { lat: to.lat, lng: to.lng, arrived: true, remaining_m: 0 };
  const f = meters / d;
  return {
    lat: from.lat + (to.lat - from.lat) * f,
    lng: from.lng + (to.lng - from.lng) * f,
    arrived: false,
    remaining_m: d - meters,
  };
}
