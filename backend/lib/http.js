import { NextResponse } from "next/server";
import { ApiError } from "./errors.js";

export { ApiError };

export const ok = (data, status = 200) => NextResponse.json({ data }, { status });

// Wraps a route handler: converts thrown ApiErrors into clean JSON responses.
export function handle(fn) {
  return async (req, ctx) => {
    try {
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
