import { ok, handle, ApiError } from "../../../../lib/http.js";
import { autoAssignAllPending } from "../../../../lib/services/assignment.js";
import { runAgent, geminiConfigured } from "../../../../lib/agent/gemini.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Body (all optional): { mode: "auto" | "agent" | "rules", instruction?: string }
//   agent -> Gemini decides, using backend tools (needs GEMINI_API_KEY)
//   rules -> plain rule-based auto-assignment, no AI
//   auto  -> agent if GEMINI_API_KEY is set, otherwise rules
export const POST = handle(async (req) => {
  const body = await req.json().catch(() => ({}));
  const mode = body.mode || "auto";
  if (!["auto", "agent", "rules"].includes(mode)) throw new ApiError(400, "mode must be auto, agent or rules");
  if (mode === "agent" && !geminiConfigured()) throw new ApiError(400, "GEMINI_API_KEY is not configured");

  if (mode === "agent" || (mode === "auto" && geminiConfigured())) {
    return ok({ mode: "agent", ...(await runAgent({ instruction: body.instruction, trigger: "dispatch_run" })) });
  }
  return ok({ mode: "rules", results: await autoAssignAllPending() });
});
