import { ok, handle, readJson, ApiError } from "../../../../lib/http.js";
import { UNAVAILABLE_STATUSES } from "../../../../lib/constants.js";
import { getDriver, updateDriver } from "../../../../lib/services/drivers.js";
import { handleDriverUnavailable } from "../../../../lib/services/monitor.js";
import { logEvent } from "../../../../lib/services/events.js";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req, ctx) => {
  const { id } = await ctx.params;
  const driver = await getDriver(id);
  if (!driver) throw new ApiError(404, "Driver not found");
  return ok(driver);
});

// Setting status to offline/on_break automatically releases and reassigns not-yet-picked-up deliveries.
export const PATCH = handle(async (req, ctx) => {
  const { id } = await ctx.params;
  const body = await readJson(req);
  const before = await getDriver(id);
  if (!before) throw new ApiError(404, "Driver not found");

  const driver = await updateDriver(id, body);

  let reassignment = null;
  if (UNAVAILABLE_STATUSES.includes(driver.status) && !UNAVAILABLE_STATUSES.includes(before.status)) {
    await logEvent({ type: "driver_unavailable", message: `${driver.name} is now ${driver.status}`, driver_id: id });
    reassignment = await handleDriverUnavailable({ driver_id: id, reason: `Driver set to ${driver.status}` });
  }
  return ok({ driver, reassignment });
});
