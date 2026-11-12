import { ok, handle } from "../../../lib/http.js";
import { listEvents } from "../../../lib/services/events.js";

export const dynamic = "force-dynamic";

// GET /api/events?limit=50&order_id=
export const GET = handle(async (req) => {
  const p = new URL(req.url).searchParams;
  return ok(await listEvents({ limit: p.get("limit") || 50, order_id: p.get("order_id") || undefined }));
});
