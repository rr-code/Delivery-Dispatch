import { NextResponse } from "next/server";
import { passcodeConfigured, verifySession, bearerToken } from "./lib/auth.js";

// Every /api route needs a valid session token except these.
const PUBLIC = new Set(["/api/health", "/api/auth/login"]);

const cors = () => ({
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
});

const deny = (status, error) => NextResponse.json({ error, details: null }, { status, headers: cors() });

export async function middleware(req) {
  const path = req.nextUrl.pathname.replace(/\/+$/, "");
  if (req.method === "OPTIONS" || PUBLIC.has(path)) return NextResponse.next();
  if (!passcodeConfigured()) return deny(503, "APP_PASSCODE is not configured on the server");
  if (!(await verifySession(bearerToken(req)))) return deny(401, "Not logged in");
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
