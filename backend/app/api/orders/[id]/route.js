import { ok, handle, readJson, ApiError } from "../../../../lib/http.js";
import { getOrderWithDeliveries, updateOrder } from "../../../../lib/services/orders.js";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req, ctx) => {
  const { id } = await ctx.params;
  const order = await getOrderWithDeliveries(id);
  if (!order) throw new ApiError(404, "Order not found");
  return ok(order);
});

export const PATCH = handle(async (req, ctx) => {
  const { id } = await ctx.params;
  return ok(await updateOrder(id, await readJson(req)));
});
