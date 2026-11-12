import { ApiError } from "../errors.js";
import { listOrders, getOrderWithDeliveries } from "../services/orders.js";
import { listDrivers, getDriver } from "../services/drivers.js";
import { getRoute } from "../services/routing.js";
import { getOrder } from "../services/orders.js";
import { rankCandidates, assignDriver, reassignDelivery } from "../services/assignment.js";
import { listDeliveries, updateDeliveryStatus } from "../services/deliveries.js";
import { checkDelays, flagDelay } from "../services/monitor.js";
import { logEvent } from "../services/events.js";

// Tool schemas sent to Gemini (function calling). Gemini never touches the database:
// every tool below calls the same service layer the REST routes use, so all business rules apply.

const str = (description) => ({ type: "STRING", description });
const num = (description) => ({ type: "NUMBER", description });

export const declarations = [
  // ---- read tools ----
  {
    name: "get_pending_orders",
    description: "List orders that still need a driver, urgent first then oldest first.",
    parameters: { type: "OBJECT", properties: { limit: num("Max orders to return (default 20)") } },
  },
  {
    name: "get_order_details",
    description: "Full details of one order including its delivery history.",
    parameters: { type: "OBJECT", properties: { order_id: str("Order UUID") }, required: ["order_id"] },
  },
  {
    name: "get_available_drivers",
    description: "Drivers with status 'available', with current location and active order count.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "get_driver_details",
    description: "One driver's status, capacity, location and active order count.",
    parameters: { type: "OBJECT", properties: { driver_id: str("Driver UUID") }, required: ["driver_id"] },
  },
  {
    name: "get_candidate_drivers",
    description:
      "Eligible drivers for an order (status, capacity, load already checked), ranked best-first by routed ETA to pickup. Prefer this before assign_driver.",
    parameters: { type: "OBJECT", properties: { order_id: str("Order UUID") }, required: ["order_id"] },
  },
  {
    name: "get_route_estimate",
    description: "Driving distance (metres) and duration (seconds) between two points from the routing service.",
    parameters: {
      type: "OBJECT",
      properties: {
        from_lat: num("Start latitude"),
        from_lng: num("Start longitude"),
        to_lat: num("End latitude"),
        to_lng: num("End longitude"),
      },
      required: ["from_lat", "from_lng", "to_lat", "to_lng"],
    },
  },
  {
    name: "get_active_deliveries",
    description: "Deliveries currently assigned, picked up or in transit, with ETA and delay.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "get_delayed_deliveries",
    description: "Re-estimates all live deliveries with the routing service and returns those running late.",
    parameters: { type: "OBJECT", properties: { threshold_min: num("Minutes late to count as delayed (default from config)") } },
  },
  // ---- write tools (validated by the backend, may return an error) ----
  {
    name: "assign_driver",
    description: "Assign a driver to a pending order. The backend enforces eligibility and time-window rules and may reject.",
    parameters: {
      type: "OBJECT",
      properties: { order_id: str("Order UUID"), driver_id: str("Driver UUID"), reason: str("Short reason for the choice") },
      required: ["order_id", "driver_id"],
    },
  },
  {
    name: "reassign_order",
    description:
      "Move a delivery that is still in 'assigned' state to a different driver (or pick the best one automatically if new_driver_id is omitted).",
    parameters: {
      type: "OBJECT",
      properties: { delivery_id: str("Delivery UUID"), new_driver_id: str("Optional replacement driver UUID"), reason: str("Why") },
      required: ["delivery_id", "reason"],
    },
  },
  {
    name: "update_delivery_status",
    description: "Change a delivery status. Allowed: assigned->picked_up/failed/cancelled, picked_up->in_transit/delivered/failed, in_transit->delivered/failed.",
    parameters: {
      type: "OBJECT",
      properties: {
        delivery_id: str("Delivery UUID"),
        status: { type: "STRING", description: "New status", enum: ["picked_up", "in_transit", "delivered", "failed", "cancelled"] },
      },
      required: ["delivery_id", "status"],
    },
  },
  {
    name: "flag_delay",
    description: "Record that a delivery is running late so dispatchers see it.",
    parameters: {
      type: "OBJECT",
      properties: { delivery_id: str("Delivery UUID"), delay_minutes: num("Minutes late"), reason: str("Why") },
      required: ["delivery_id", "delay_minutes"],
    },
  },
  {
    name: "log_event",
    description: "Add a note to the dispatch audit log (e.g. an order that needs human attention).",
    parameters: {
      type: "OBJECT",
      properties: { type: str("Short event type, e.g. note"), message: str("What happened"), order_id: str("Optional order UUID") },
      required: ["type", "message"],
    },
  },
];

// Extra read tools for conversational chat. Users refer to orders by customer name, address or a
// short id, and ask about drivers in any status, so chat needs lookups the batch dispatcher doesn't.
// Kept out of `declarations` so the batch dispatch agent is unchanged.
export const chatOnlyDeclarations = [
  {
    name: "find_orders",
    description:
      "Search orders in any status. Matches `query` against the order id prefix, customer name, pickup address and drop address (case-insensitive). Returns total_matching (an exact count) plus up to `limit` orders, newest first. Use this to count orders by status and to resolve a customer name or short id to a full order id.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: str("Optional text: customer name, part of an address, or the first characters of the order id"),
        status: {
          type: "STRING",
          description: "Optional order status filter",
          enum: ["pending", "assigned", "picked_up", "in_transit", "delivered", "failed", "cancelled"],
        },
        limit: num("Max orders to return (default 20, max 50)"),
      },
    },
  },
  {
    name: "get_all_drivers",
    description: "All drivers (any status, or filtered by status) with location, active order count, capacity and rating.",
    parameters: {
      type: "OBJECT",
      properties: {
        status: { type: "STRING", description: "Optional driver status filter", enum: ["available", "busy", "offline", "on_break"] },
      },
    },
  },
];

export const chatDeclarations = [...declarations, ...chatOnlyDeclarations];

export const WRITE_TOOLS = new Set(["assign_driver", "reassign_order", "update_delivery_status", "flag_delay", "log_event"]);

const ORDER_SCAN_LIMIT = 500;

const executors = {
  find_orders: async ({ query, status, limit } = {}) => {
    const orders = await listOrders({ status, limit: ORDER_SCAN_LIMIT });
    const q = query?.trim().toLowerCase();
    const matches = q
      ? orders.filter(
          (o) =>
            o.id.toLowerCase().startsWith(q) ||
            o.customer_name?.toLowerCase().includes(q) ||
            o.pickup_address?.toLowerCase().includes(q) ||
            o.drop_address?.toLowerCase().includes(q)
        )
      : orders;
    return {
      total_matching: matches.length,
      // listOrders caps the scan; if we hit the cap the count is a lower bound.
      count_is_lower_bound: orders.length >= ORDER_SCAN_LIMIT,
      orders: matches.slice(0, Math.min(Number(limit) || 20, 50)),
    };
  },
  get_all_drivers: async ({ status } = {}) => listDrivers({ status }),

  get_pending_orders: async ({ limit } = {}) => {
    const orders = await listOrders({ status: "pending", limit: 200 });
    const sorted = orders.sort(
      (a, b) => (a.priority === "urgent" ? 0 : 1) - (b.priority === "urgent" ? 0 : 1) || new Date(a.created_at) - new Date(b.created_at)
    );
    return sorted.slice(0, Number(limit) || 20);
  },
  get_order_details: async ({ order_id }) => {
    const o = await getOrderWithDeliveries(order_id);
    if (!o) throw new ApiError(404, "Order not found");
    return o;
  },
  get_available_drivers: async () => listDrivers({ status: "available" }),
  get_driver_details: async ({ driver_id }) => {
    const d = await getDriver(driver_id);
    if (!d) throw new ApiError(404, "Driver not found");
    return d;
  },
  get_candidate_drivers: async ({ order_id }) => {
    const order = await getOrder(order_id);
    if (!order) throw new ApiError(404, "Order not found");
    return rankCandidates(order);
  },
  get_route_estimate: async ({ from_lat, from_lng, to_lat, to_lng }) => {
    const r = await getRoute({ lat: from_lat, lng: from_lng }, { lat: to_lat, lng: to_lng });
    return { distance_m: Math.round(r.distance_m), duration_s: Math.round(r.duration_s), source: r.source };
  },
  get_active_deliveries: async () => listDeliveries({ active: true }),
  get_delayed_deliveries: async ({ threshold_min } = {}) => {
    const r = await checkDelays({ threshold_min });
    return { threshold_min: r.threshold_min, checked: r.checked, delayed: r.delayed };
  },
  assign_driver: async ({ order_id, driver_id, reason }) => assignDriver({ order_id, driver_id, reason, actor: "agent" }),
  reassign_order: async ({ delivery_id, new_driver_id, reason }) => reassignDelivery({ delivery_id, new_driver_id, reason, actor: "agent" }),
  update_delivery_status: async ({ delivery_id, status }) => updateDeliveryStatus({ delivery_id, status, actor: "agent" }),
  flag_delay: async ({ delivery_id, delay_minutes, reason }) => flagDelay({ delivery_id, delay_minutes, reason, actor: "agent" }),
  log_event: async ({ type, message, order_id }) => {
    await logEvent({ type, message, order_id: order_id ?? null, created_by: "agent" });
    return { logged: true };
  },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const declarationByName = Object.fromEntries(chatDeclarations.map((d) => [d.name, d]));

// Checks model-supplied arguments against the tool schema before anything touches the database.
// Returns { args } (cleaned, numbers coerced, unknown keys dropped) or { error } for the model to fix.
export function validateArgs(name, rawArgs) {
  const decl = declarationByName[name];
  if (!decl) return { error: `Unknown tool: ${name}` };
  if (rawArgs != null && (typeof rawArgs !== "object" || Array.isArray(rawArgs))) {
    return { error: "Arguments must be an object" };
  }
  const props = decl.parameters?.properties || {};
  const input = rawArgs || {};
  const args = {};
  const problems = [];

  for (const field of decl.parameters?.required || []) {
    if (input[field] === undefined || input[field] === null || input[field] === "") problems.push(`${field} is required`);
  }
  for (const [key, spec] of Object.entries(props)) {
    const v = input[key];
    if (v === undefined || v === null || v === "") continue;
    if (spec.type === "NUMBER") {
      const n = Number(v);
      if (!Number.isFinite(n)) problems.push(`${key} must be a number`);
      else args[key] = n;
    } else if (spec.type === "STRING") {
      if (typeof v !== "string") problems.push(`${key} must be a string`);
      else if (spec.enum && !spec.enum.includes(v)) problems.push(`${key} must be one of: ${spec.enum.join(", ")}`);
      else if (/_id$/.test(key) && !UUID_RE.test(v.trim())) {
        problems.push(`${key} must be a full UUID (look it up first, e.g. with find_orders or get_all_drivers)`);
      } else args[key] = v.trim();
    } else {
      args[key] = v;
    }
  }
  return problems.length ? { error: `Invalid arguments for ${name}: ${problems.join("; ")}` } : { args };
}

// Runs one tool call. Rule violations are returned to the model as { error } so it can adapt.
export async function executeTool(name, args) {
  const fn = executors[name];
  if (!fn) return { error: `Unknown tool: ${name}` };
  const checked = validateArgs(name, args);
  if (checked.error) return { error: checked.error };
  try {
    return await fn(checked.args);
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message, details: e.details ?? null };
    console.error(`Tool ${name} failed:`, e);
    return { error: "Tool failed unexpectedly" };
  }
}
