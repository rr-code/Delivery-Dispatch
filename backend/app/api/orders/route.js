import { ok, handle, readJson } from "../../../lib/http.js";
import { listOrders, createOrder } from "../../../lib/services/orders.js";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const p = new URL(req.url).searchParams;
  return ok(await listOrders({ status: p.get("status") || undefined, limit: p.get("limit") || 100 }));
});

export const POST = handle(async (req) => ok(await createOrder(await readJson(req)), 201));
