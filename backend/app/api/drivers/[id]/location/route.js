import { ok, handle, readJson } from "../../../../../lib/http.js";
import { recordLocation } from "../../../../../lib/services/drivers.js";

export const dynamic = "force-dynamic";

export const POST = handle(async (req, ctx) => {
  const { id } = await ctx.params;
  return ok(await recordLocation(id, await readJson(req)), 201);
});
