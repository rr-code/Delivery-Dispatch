import { ok, handle, readJson, required } from "../../../../../lib/http.js";
import { updateDeliveryStatus } from "../../../../../lib/services/deliveries.js";

export const dynamic = "force-dynamic";

// Body: { status: "picked_up" | "in_transit" | "delivered" | "failed" | "cancelled", reason? }
export const PATCH = handle(async (req, ctx) => {
  const { id } = await ctx.params;
  const body = await readJson(req);
  required(body, ["status"]);
  return ok(await updateDeliveryStatus({ delivery_id: id, status: body.status, reason: body.reason, actor: "user" }));
});
