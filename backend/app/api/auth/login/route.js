import { ok, handle, readJson, ApiError } from "../../../../lib/http.js";
import { passcodeConfigured, checkPasscode, createSession } from "../../../../lib/auth.js";

export const dynamic = "force-dynamic";

// Best-effort brute-force guard (per server instance): 10 wrong attempts per IP per 15 minutes.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map();

const clientIp = (req) => (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";

// POST /api/auth/login  Body: { passcode }  ->  { data: { token, expires_at } }
export const POST = handle(async (req) => {
  if (!passcodeConfigured()) throw new ApiError(503, "APP_PASSCODE is not configured on the server");

  const ip = clientIp(req);
  const entry = failures.get(ip);
  if (entry && Date.now() - entry.first > WINDOW_MS) failures.delete(ip);
  if ((failures.get(ip)?.count || 0) >= MAX_FAILURES) {
    throw new ApiError(429, "Too many incorrect attempts. Try again in 15 minutes.");
  }

  const body = await readJson(req);
  if (typeof body?.passcode !== "string" || !body.passcode) throw new ApiError(400, "passcode is required");

  if (!(await checkPasscode(body.passcode))) {
    const e = failures.get(ip) || { count: 0, first: Date.now() };
    failures.set(ip, { ...e, count: e.count + 1 });
    await new Promise((r) => setTimeout(r, 500)); // slow down guessing
    throw new ApiError(401, "Incorrect passcode");
  }

  failures.delete(ip);
  return ok(await createSession());
});
