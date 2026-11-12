import { ok, handle } from "../../../../lib/http.js";

export const dynamic = "force-dynamic";

// GET /api/auth/session  ->  200 if the bearer token is valid (checked by middleware.js), 401 otherwise.
export const GET = handle(async () => ok({ authenticated: true }));
