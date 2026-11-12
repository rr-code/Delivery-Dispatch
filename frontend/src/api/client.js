import { useEffect, useState } from 'react';

// Backend base URL (e.g. http://localhost:3001). All data comes from the Next.js API.
// Leave VITE_API_URL unset when the frontend and backend share a domain (vercel.json rewrites /api/* to the backend).
export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

// authed: null = checking, false = show login, true = signed in
let state = {
  authed: null, authError: '',
  drivers: [], orders: [], deliveries: [], events: [],
  loaded: false, syncing: false, syncError: '', lastSync: null,
  log: [], // agent tool calls
};
const subs = new Set();
const emit = (patch) => { state = { ...state, ...patch }; subs.forEach((f) => f(state)); };

export function useDispatch() {
  const [s, setS] = useState(state);
  useEffect(() => { subs.add(setS); return () => subs.delete(setS); }, []);
  return s;
}

// ---- Session token (the passcode itself is never stored) ----
const TOKEN_KEY = 'dispatch_session';
const token = {
  get() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set(v) { try { if (v) localStorage.setItem(TOKEN_KEY, v); else localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ } },
};

async function api(path, { method = 'GET', body, timeout = 20000 } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const t = token.get();
  if (t) headers.Authorization = 'Bearer ' + t;
  let res;
  try {
    res = await fetch(API_URL + path, { method, headers, body: body && JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
  } catch (e) {
    throw new Error(e?.name === 'TimeoutError' ? 'The server took too long to respond. Please try again.' : 'Could not reach the server. Is the backend running?');
  }
  const json = await res.json().catch(() => null);
  if (res.status === 401 && path !== '/api/auth/login') {
    token.set(null);
    emit({ authed: false, authError: 'Your session has expired. Please sign in again.' });
  }
  if (!res.ok) {
    const violations = json?.details?.violations;
    const err = new Error((json?.error || 'Request failed (HTTP ' + res.status + ').') + (violations?.length ? ': ' + violations.join('; ') : ''));
    err.status = res.status;
    throw err;
  }
  return json?.data;
}

// ---- Auth ----
export async function login(passcode) {
  if (!passcode) throw new Error('Please enter the passcode.');
  const data = await api('/api/auth/login', { method: 'POST', body: { passcode } });
  token.set(data.token);
  emit({ authed: true, authError: '' });
}

export function logout() {
  token.set(null);
  emit({ authed: false, authError: '', loaded: false, log: [] });
}

export async function checkSession() {
  if (!token.get()) return emit({ authed: false });
  try {
    await api('/api/auth/session');
    emit({ authed: true });
  } catch (e) {
    if (e.status !== 401) emit({ authed: false, authError: e.message });
  }
}

// ---- Data ----
export async function refresh() {
  if (state.syncing) return;
  emit({ syncing: true });
  try {
    const [drivers, orders, deliveries, events] = await Promise.all([
      api('/api/drivers'),
      api('/api/orders?limit=300'),
      api('/api/deliveries?active=false&limit=300'),
      api('/api/events?limit=40'),
    ]);
    emit({ drivers, orders, deliveries, events, loaded: true, syncing: false, syncError: '', lastSync: new Date() });
  } catch (e) {
    emit({ syncing: false, syncError: e.message });
  }
}

const act = async (path, opts) => { const r = await api(path, opts); await refresh(); return r; };

export const createOrder = (body) => act('/api/orders', { method: 'POST', body });
export async function assignOrder(order_id, driver_id) {
  const r = await act('/api/dispatch/assign', { method: 'POST', body: { order_id, ...(driver_id && { driver_id }) } });
  if (r && r.assigned === false) throw new Error(r.reason || 'No eligible driver could take this order.');
  return r;
}
export const autoAssignAll = () => act('/api/dispatch/run', { method: 'POST', body: { mode: 'rules' }, timeout: 60000 });
export const getCandidates = (order_id) => api('/api/dispatch/candidates?order_id=' + encodeURIComponent(order_id));
export const setDeliveryStatus = (id, status, reason) => act(`/api/deliveries/${id}/status`, { method: 'PATCH', body: { status, reason } });
export const reassignDelivery = (delivery_id) => act('/api/dispatch/reassign', { method: 'POST', body: { delivery_id, reason: 'Reassigned by dispatcher' } });
export const setDriverStatus = (id, status) => act(`/api/drivers/${id}`, { method: 'PATCH', body: { status } });
export const updateOrder = (id, body) => act(`/api/orders/${id}`, { method: 'PATCH', body });
export const checkDelays = () => act('/api/monitor/check', { method: 'POST', body: {}, timeout: 60000 });
export const simulateTick = () => act('/api/simulation/tick', { method: 'POST', body: { step_seconds: 6 } });

// ---- Agent chat (Gemini, via POST /api/agent/chat) ----
export function clearLog() { emit({ log: [] }); }

function summarizeResult(r) {
  if (r && typeof r === 'object' && !Array.isArray(r) && r.error) return 'error: ' + r.error;
  if (Array.isArray(r)) return r.length + ' row(s)';
  if (r && typeof r === 'object' && r.order_id && r.driver_id && r.status) return 'delivery ' + String(r.id).slice(0, 8) + ' is ' + r.status;
  if (r && typeof r === 'object' && Array.isArray(r.orders)) return r.total_matching + ' matching order(s)';
  if (r && typeof r === 'object' && Array.isArray(r.delayed)) return r.delayed.length + ' delayed of ' + r.checked + ' checked';
  const s = JSON.stringify(r) ?? '';
  return s.length > 140 ? s.slice(0, 140) + '…' : s;
}

export async function askAgent(text, history = []) {
  const message = String(text ?? '').trim();
  if (!message) throw new Error('Please type a question first.');
  const data = await api('/api/agent/chat', { method: 'POST', body: { message, history }, timeout: 70000 });
  if (!data?.reply) throw new Error('The agent returned an empty response.');
  if (data.tool_calls?.length) {
    emit({ log: [...state.log, ...data.tool_calls.map((c) => ({ tool: c.tool, args: c.args, result: summarizeResult(c.result) }))] });
    if (data.tool_calls.some((c) => !String(c.tool).startsWith('get_') && c.tool !== 'find_orders')) refresh();
  }
  return data.reply;
}

// ---- Derived data helpers ----
export const ACTIVE = ['assigned', 'picked_up', 'in_transit'];
export const DELAY_MIN = 10;

// Latest delivery for each order (deliveries arrive oldest first).
export function deliveryByOrder(deliveries) {
  const m = {};
  for (const d of deliveries) m[d.order_id] = d;
  return m;
}

export function getExceptions({ orders, deliveries, events }) {
  const now = Date.now();
  const out = [];
  for (const d of deliveries) {
    if (ACTIVE.includes(d.status) && (d.delay_minutes || 0) >= DELAY_MIN) {
      out.push({ id: 'delay-' + d.id, kind: 'delay', severity: 'high', delivery: d, order: d.orders,
        title: `${d.orders?.customer_name || 'Order'} is running ${d.delay_minutes} min late`,
        detail: `${d.drivers?.name || 'Driver'} · ${d.status.replace('_', ' ')} · new ETA ${fmtTime(d.eta)}` });
    }
  }
  for (const o of orders) {
    if (o.status !== 'pending') continue;
    if (o.time_window_end && new Date(o.time_window_end).getTime() < now) {
      out.push({ id: 'window-' + o.id, kind: 'window', severity: 'high', order: o,
        title: `${o.customer_name || 'Order'}: delivery window missed`,
        detail: `Still unassigned · window closed at ${fmtTime(o.time_window_end)} · ${o.priority}` });
    } else if (o.priority === 'urgent') {
      out.push({ id: 'urgent-' + o.id, kind: 'urgent', severity: 'medium', order: o,
        title: `Urgent order for ${o.customer_name || 'customer'} has no driver`,
        detail: `${o.pickup_address} → ${o.drop_address}${o.time_window_end ? ' · due ' + fmtTime(o.time_window_end) : ''}` });
    }
  }
  for (const d of deliveries) {
    if (d.status !== 'failed' || d.orders?.status !== 'failed') continue;
    const ev = events.find((e) => e.delivery_id === d.id && /fail/i.test(e.type + e.message));
    out.push({ id: 'failed-' + d.id, kind: 'failed', severity: 'low', delivery: d, order: d.orders,
      title: `Delivery failed for ${d.orders?.customer_name || 'customer'}`,
      detail: `${d.drivers?.name || 'Driver'}${ev ? ' · ' + ev.message : ''}` });
  }
  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

// ---- Formatting ----
export const shortId = (id) => String(id || '').slice(0, 8);
export function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
export function relTime(iso) {
  if (!iso) return '—';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  return new Date(iso).toLocaleDateString();
}
export const km = (m) => (m == null ? '—' : (m / 1000).toFixed(1) + ' km');
export const mins = (s) => (s == null ? '—' : Math.max(1, Math.round(s / 60)) + ' min');
export const label = (s) => String(s || '').replace(/_/g, ' ');
export const initials = (name) => String(name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
