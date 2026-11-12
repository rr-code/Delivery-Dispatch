// Passcode auth. APP_PASSCODE lives only on the server. A correct passcode gets a signed,
// expiring session token; every other /api route requires it as "Authorization: Bearer <token>"
// (enforced in middleware.js). Uses Web Crypto so it runs in both the Edge middleware and Node routes.

const enc = new TextEncoder();
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export function passcodeConfigured() {
  return Boolean(process.env.APP_PASSCODE);
}

async function hmac(key, data) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Compares HMAC digests rather than raw strings so timing doesn't reveal the passcode.
export async function checkPasscode(input) {
  const secret = process.env.APP_PASSCODE;
  if (!secret || typeof input !== "string") return false;
  const [a, b] = await Promise.all([hmac("passcode-check", input), hmac("passcode-check", secret)]);
  return sameBytes(a, b);
}

// Tokens are signed with a key derived from APP_PASSCODE, so changing the passcode logs everyone out.
const signingKey = () => `session:${process.env.APP_PASSCODE}`;

export async function createSession() {
  const exp = Date.now() + SESSION_TTL_MS;
  const sig = b64url(await hmac(signingKey(), String(exp)));
  return { token: `${exp}.${sig}`, expires_at: new Date(exp).toISOString() };
}

export async function verifySession(token) {
  if (!passcodeConfigured() || typeof token !== "string") return false;
  const [exp, sig] = token.split(".");
  if (!/^\d+$/.test(exp || "") || !sig || Number(exp) < Date.now()) return false;
  const expected = b64url(await hmac(signingKey(), exp));
  return sameBytes(enc.encode(expected), enc.encode(sig));
}

export function bearerToken(req) {
  return req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}
