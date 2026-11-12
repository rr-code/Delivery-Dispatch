import { ok, handle, ApiError } from "../../../../lib/http.js";
import { getOrder } from "../../../../lib/services/orders.js";
import { rankCandidates } from "../../../../lib/services/assignment.js";

export const dynamic = "force-dynamic";

// GET /api/dispatch/candidates?order_id=...  -> eligible drivers ranked by routed pickup ETA
export const GET = handle(async (req) => {
  const order_id = new URL(req.url).searchParams.get("order_id");
  if (!order_id) throw new ApiError(400, "order_id query parameter is required");
  const order = await getOrder(order_id);
  if (!order) throw new ApiError(404, "Order not found");
  return ok(await rankCandidates(order));
});
