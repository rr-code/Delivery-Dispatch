import { ok, handle, readJson } from "../../../lib/http.js";
import { listDrivers, createDriver } from "../../../lib/services/drivers.js";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const status = new URL(req.url).searchParams.get("status") || undefined;
  return ok(await listDrivers({ status }));
});

export const POST = handle(async (req) => ok(await createDriver(await readJson(req)), 201));
