import { useEffect, useState } from 'react';
import { drivers, orders, alerts } from './mockData';

// Backend base URL. Unused while the mock store below is active.
export const API_URL = import.meta.env.VITE_API_URL || '';

let state = { drivers: [...drivers], orders: [...orders], alerts: [...alerts], log: [] };
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
