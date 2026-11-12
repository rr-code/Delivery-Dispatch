import { ok, handle } from "../../../lib/http.js";
import { listDeliveries } from "../../../lib/services/deliveries.js";

export const dynamic = "force-dynamic";

// GET /api/deliveries?active=true|false&status=&driver_id=&limit=
export const GET = handle(async (req) => {
  const p = new URL(req.url).searchParams;
  return ok(
    await listDeliveries({
      active: p.get("active") !== "false",
      status: p.get("status") || undefined,
      driver_id: p.get("driver_id") || undefined,
      limit: p.get("limit") || 100,
    })
  );
});
