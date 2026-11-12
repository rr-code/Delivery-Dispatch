import { NextResponse } from "next/server";
import { ApiError } from "./errors.js";
import { passcodeConfigured, verifySession, bearerToken } from "./auth.js";

export { ApiError };

export const ok = (data, status = 200) => NextResponse.json({ data }, { status });

// Routes reachable without a session token. Everything else requires "Authorization: Bearer <token>".
// (Checked here rather than in middleware.js so the API runs entirely on the Node.js runtime.)
const PUBLIC_PATHS = new Set(["/api/health", "/api/auth/login"]);

async function requireSession(req) {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  if (PUBLIC_PATHS.has(path)) return;
  if (!passcodeConfigured()) throw new ApiError(503, "APP_PASSCODE is not configured on the server");
  if (!(await verifySession(bearerToken(req)))) throw new ApiError(401, "Not logged in");
}

// Wraps a route handler: enforces the passcode session, converts thrown ApiErrors into clean JSON responses.
export function handle(fn) {
  return async (req, ctx) => {
    try {
      await requireSession(req);
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof ApiError) {
        return NextResponse.json({ error: e.message, details: e.details ?? null }, { status: e.status });
      }
      console.error(e);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

export async function readJson(req) {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, "Invalid or missing JSON body");
  }
}

export function required(obj, fields) {
  const missing = fields.filter((f) => obj?.[f] === undefined || obj?.[f] === null || obj?.[f] === "");
  if (missing.length) throw new ApiError(400, `Missing fields: ${missing.join(", ")}`);
}
