import { ok, handle, readJson, ApiError } from "../../../../lib/http.js";
import { getRoute } from "../../../../lib/services/routing.js";

export const dynamic = "force-dynamic";

// Body: { from: {lat, lng}, to: {lat, lng} }
export const POST = handle(async (req) => {
  const { from, to } = await readJson(req);
  if (!from || !to) throw new ApiError(400, "from and to ({lat, lng}) are required");
  const r = await getRoute(from, to);
  return ok({ distance_m: Math.round(r.distance_m), duration_s: Math.round(r.duration_s), polyline: r.polyline, source: r.source });
});
