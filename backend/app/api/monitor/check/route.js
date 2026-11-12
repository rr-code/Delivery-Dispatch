import { ok, handle } from "../../../../lib/http.js";
import { checkDelays } from "../../../../lib/services/monitor.js";

export const dynamic = "force-dynamic";

// Body (optional): { threshold_min }. The UI can call this on a timer.
export const POST = handle(async (req) => {
  const body = await req.json().catch(() => ({}));
  return ok(await checkDelays({ threshold_min: body.threshold_min }));
});
