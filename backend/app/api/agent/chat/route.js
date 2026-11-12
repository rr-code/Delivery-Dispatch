import { ok, handle, readJson } from "../../../../lib/http.js";
import { runChat } from "../../../../lib/agent/gemini.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Conversational dispatch assistant (separate from the batch /api/dispatch/run).
// Body: { message: string, history?: [{ role: "user" | "assistant", text: string }] }
// Returns: { data: { reply, status, run_id, writes_enabled, tool_calls: [{ tool, args, result }] } }
export const POST = handle(async (req) => {
  const body = await readJson(req);
  return ok(await runChat({ message: body?.message, history: body?.history }));
});
