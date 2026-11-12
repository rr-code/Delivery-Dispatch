import { ok, handle, readJson, required } from "../../../../lib/http.js";
import { assignDriver, autoAssign } from "../../../../lib/services/assignment.js";

export const dynamic = "force-dynamic";

// Body: { order_id, driver_id?, reason? }
//   with driver_id  -> manual assignment (still validated by the business rules)
//   without         -> automatic: best driver by routed pickup ETA
export const POST = handle(async (req) => {
  const body = await readJson(req);
  required(body, ["order_id"]);
  if (body.driver_id) {
    const delivery = await assignDriver({ order_id: body.order_id, driver_id: body.driver_id, reason: body.reason, actor: "user" });
    return ok({ assigned: true, delivery }, 201);
  }
  return ok(await autoAssign(body.order_id, { actor: "user" }));
});
