import { useEffect, useState } from 'react';
import { drivers, orders, alerts } from './mockData';

// Backend base URL. Used for passcode login; the pages below still use the mock store.
export const API_URL = import.meta.env.VITE_API_URL || '';

// authed: null = checking, false = show passcode screen, true = unlocked
let state = { drivers: [...drivers], orders: [...orders], alerts: [...alerts], log: [], authed: null, authError: '' };
const subs = new Set();
const emit = (patch) => { state = { ...state, ...patch }; subs.forEach((f) => f(state)); };

// Simulated driver GPS: in-transit drivers move toward their drop point.
setInterval(() => {
  const moved = state.drivers.map((d) => {
    const o = state.orders.find((x) => x.id === d.orderId && x.status === 'in_transit');
    if (!o) return d;
    const dx = o.drop.x - d.x, dy = o.drop.y - d.y, dist = Math.hypot(dx, dy);
    if (dist < 2) return d;
    return { ...d, x: d.x + (dx / dist) * 1.5, y: d.y + (dy / dist) * 1.5 };
  });
  emit({ drivers: moved });
}, 2000);

export function useDispatch() {
  const [s, setS] = useState(state);
  useEffect(() => { subs.add(setS); return () => subs.delete(setS); }, []);
  return s;
}

// Simulated map scale, for display only. Real distances must come from the backend routing service.
export const approxKm = (a, b) => (Math.hypot(a.x - b.x, a.y - b.y) * 0.3).toFixed(1);

export async function createOrder({ customer, dropLabel, priority }) {
  const r = () => Math.round(10 + Math.random() * 80);
  const o = { id: 'O' + (state.orders.length + 1), customer, pickup: { x: r(), y: r(), label: 'Hub A' }, drop: { x: r(), y: r(), label: dropLabel || 'Drop point' }, status: 'pending', driverId: null, priority };
  emit({ orders: [...state.orders, o] });
}

export async function assignOrder(orderId, driverId) {
  emit({
    orders: state.orders.map((o) => (o.id === orderId ? { ...o, driverId, status: 'in_transit' } : o)),
    drivers: state.drivers.map((d) => (d.id === driverId ? { ...d, status: 'busy', load: 1, orderId } : d)),
    log: [...state.log, { tool: 'assign_driver', args: { orderId, driverId }, result: 'validated and saved' }],
  });
}

export async function resolveAlert(id, approve) {
  const a = state.alerts.find((x) => x.id === id);
  if (approve && a && a.type === 'driver_unavailable') await assignOrder(a.orderId, 'D3');
  emit({ alerts: state.alerts.filter((x) => x.id !== id) });
}

export async function askAgent(text) {
  const t = text.toLowerCase();
  let tool = 'get_pending_orders', reply = 'There are ' + state.orders.filter((o) => o.status === 'pending').length + ' pending orders.';
  if (t.includes('driver')) { tool = 'get_available_drivers'; reply = state.drivers.filter((d) => d.status === 'available').map((d) => d.name).join(', ') + ' are available.'; }
  else if (t.includes('route')) { tool = 'get_route'; reply = 'Route details will come from the backend routing service.'; }
  else if (t.includes('delay')) { tool = 'get_delayed_deliveries'; reply = 'Order O2 is delayed by about 12 minutes.'; }
  emit({ log: [...state.log, { tool, args: { query: text }, result: 'mock response' }] });
  return reply;
}

// ---- Passcode auth ----
// The passcode is checked only by the backend (POST /api/auth/login). It returns a signed session
// token, kept in localStorage and sent as "Authorization: Bearer <token>" on API calls.
const TOKEN_KEY = 'dispatch_session';
const token = {
  get() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set(v) { try { if (v) localStorage.setItem(TOKEN_KEY, v); else localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ } },
};

async function api(path, { method = 'GET', body } = {}) {
  if (!API_URL) throw new Error('VITE_API_URL is not set. Add it to frontend/.env.local and restart Vite.');
  const headers = { 'Content-Type': 'application/json' };
  const t = token.get();
  if (t) headers.Authorization = 'Bearer ' + t;
  let res;
  try {
    res = await fetch(API_URL.replace(/\/+$/, '') + path, { method, headers, body: body && JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  } catch (e) {
    throw new Error(e?.name === 'TimeoutError' ? 'The server took too long to respond. Please try again.' : 'Could not reach the server. Is the backend running?');
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(json?.error || 'Request failed (HTTP ' + res.status + ').');
    err.status = res.status;
    throw err;
  }
  return json?.data;
}

export async function login(passcode) {
  if (!passcode) throw new Error('Please enter the passcode.');
  const data = await api('/api/auth/login', { method: 'POST', body: { passcode } });
  token.set(data.token);
  emit({ authed: true, authError: '' });
}

export function logout() {
  token.set(null);
  emit({ authed: false, authError: '' });
}

// On startup: unlock straight away if the saved token is still valid.
export async function checkSession() {
  if (!token.get()) return emit({ authed: false });
  try {
    await api('/api/auth/session');
    emit({ authed: true });
  } catch (e) {
    if (e.status === 401) token.set(null);
    emit({ authed: false, authError: e.status === 401 ? 'Your session has expired. Please enter the passcode again.' : e.message });
  }
}
