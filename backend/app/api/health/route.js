import { ok, handle } from "../../../lib/http.js";
import { geminiConfigured } from "../../../lib/agent/gemini.js";

export const dynamic = "force-dynamic";

export const GET = handle(async () =>
  ok({
    status: "ok",
    time: new Date().toISOString(),
    supabase_configured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    gemini_configured: geminiConfigured(),
    routing_provider: (process.env.ROUTING_PROVIDER || "mock").toLowerCase(),
  })
);
