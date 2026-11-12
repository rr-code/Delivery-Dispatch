import { ok, handle } from "../../../../lib/http.js";
import { tick } from "../../../../lib/services/simulation.js";

export const dynamic = "force-dynamic";

// Body (optional): { step_seconds: 30, auto_progress: true }
// Call repeatedly (e.g. every 3-5 s from the UI) to animate simulated drivers.
export const POST = handle(async (req) => {
  const body = await req.json().catch(() => ({}));
  return ok(await tick({ step_seconds: body.step_seconds ?? 30, auto_progress: body.auto_progress ?? true }));
});
