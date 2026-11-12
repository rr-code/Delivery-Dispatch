import { createClient } from "@supabase/supabase-js";
import { ApiError } from "./errors.js";

let client;

// Server-side client using the service role key. NEVER import this from frontend code.
export function db() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new ApiError(500, "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set");
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}
