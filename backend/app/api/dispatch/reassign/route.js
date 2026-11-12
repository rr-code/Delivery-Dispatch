import { ok, handle, readJson, required } from "../../../../lib/http.js";
import { reassignDelivery } from "../../../../lib/services/assignment.js";

export const dynamic = "force-dynamic";

// Body: { delivery_id, new_driver_id?, reason? }
// Only deliveries still in 'assigned' status can be moved.
export const POST = handle(async (req) => {
  const body = await readJson(req);
  required(body, ["delivery_id"]);
  return ok(
    await reassignDelivery({
      delivery_id: body.delivery_id,
      new_driver_id: body.new_driver_id,
      reason: body.reason || "Manual reassignment",
      actor: "user",
    })
  );
});
