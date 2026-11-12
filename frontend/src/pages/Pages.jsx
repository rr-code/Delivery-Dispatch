import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Package, Truck, CheckCircle2, Users, AlertTriangle, ArrowRight, Plus, Wand2, Search, X, Star, Bike, Car, Clock,
  MapPin, RefreshCw, Play, Pause, Activity, Sparkles, Send, Eraser, KeyRound, Eye, EyeOff, Route, Timer, CircleSlash,
  UserRoundX, ShieldCheck, Gauge, ChevronRight, Loader2, Wrench,
} from 'lucide-react';
import {
  useDispatch, login, askAgent, clearLog, createOrder, assignOrder, autoAssignAll, getCandidates, setDeliveryStatus,
  reassignDelivery, setDriverStatus, updateOrder, checkDelays, simulateTick, deliveryByOrder, getExceptions,
  ACTIVE, DELAY_MIN, fmtTime, relTime, km, mins, label, shortId,
} from '../api/client';
import { Badge, Priority, Avatar, Stat, Empty, CardHead, MapView, OrderRef } from '../components';

const AREAS = {
  'Adyar': [13.0067, 80.2575], 'Alwarpet': [13.0339, 80.255], 'Anna Nagar': [13.085, 80.2101], 'Ashok Nagar': [13.035, 80.212],
  'Besant Nagar': [13.0002, 80.2668], 'Chromepet': [12.9516, 80.1462], 'Egmore': [13.0732, 80.2609], 'Guindy': [13.0067, 80.2206],
  'Kilpauk': [13.0836, 80.2425], 'Kodambakkam': [13.0521, 80.2255], 'Koyambedu': [13.0694, 80.1948], 'Mylapore': [13.0368, 80.2676],
  'Nungambakkam': [13.0569, 80.2425], 'Perungudi': [12.9654, 80.2461], 'Porur': [13.0382, 80.1565], 'Purasawalkam': [13.0865, 80.255],
  'Royapettah': [13.054, 80.264], 'Saidapet': [13.0213, 80.2231], 'Sholinganallur': [12.901, 80.2279], 'T. Nagar': [13.0418, 80.2341],
  'Tambaram': [12.9249, 80.1], 'Thiruvanmiyur': [12.983, 80.2594], 'Thoraipakkam': [12.9416, 80.2362], 'Vadapalani': [13.05, 80.2121],
  'Velachery': [12.9815, 80.218],
};
const VEHICLE_ICON = { bike: Bike, scooter: Bike, car: Car, van: Truck };
const EVENT_ICON = { assigned: Truck, delivered: CheckCircle2, delay: Timer, driver_unavailable: UserRoundX, order_created: Package, failed: CircleSlash, order_cancelled: CircleSlash };
const eventTone = (t) => (/deliver/.test(t) ? 'mint' : /delay|fail|unavail|cancel|manual/.test(t) ? 'rose' : /assign|reassign/.test(t) ? 'sky' : 'lilac');

function useAction() {
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');
  const run = async (key, fn) => {
    setBusy(key); setErr('');
    try { return await fn(); } catch (e) { setErr(e.message); return null; } finally { setBusy(null); }
  };
  return { busy, err, setErr, run };
}

const Spin = ({ on, icon: Icon, size = 15 }) => (on ? <Loader2 size={size} className="spin" /> : <Icon size={size} />);
const ErrorNote = ({ msg, onClose }) => (msg ? <div className="note error" role="alert"><AlertTriangle size={15} /><span>{msg}</span>{onClose && <button className="icon-btn" onClick={onClose} aria-label="Dismiss"><X size={14} /></button>}</div> : null);
const Loading = () => <div className="loading"><Loader2 size={18} className="spin" />Loading live data…</div>;

// ===========================================================================
// Login
// ===========================================================================
export function PasscodeScreen() {
  const { authError } = useDispatch();
  const [code, setCode] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault(); if (!code || busy) return;
    setBusy(true); setErr('');
    try { await login(code); } catch (x) { setErr(x.message); setCode(''); setBusy(false); }
  };
  const shown = err || authError;
  return (
    <div className="login">
      <aside className="login-brand">
        <div className="brand"><span className="logo"><Truck size={18} /></span><div><b>Dispatch Agent</b><small>Delivery operations</small></div></div>
        <div className="login-pitch">
          <h1>Every delivery, one control room.</h1>
          <p>Assign drivers, follow routes on a live map and resolve delays early, with an AI agent that works from your real dispatch data.</p>
          <ul>
            <li><span><Sparkles size={16} /></span><div><b>AI dispatch agent</b><small>Ask about orders, drivers and delays in plain language</small></div></li>
            <li><span><Route size={16} /></span><div><b>Live tracking</b><small>Drivers, pickups and drop-offs on a street map</small></div></li>
            <li><span><ShieldCheck size={16} /></span><div><b>Rule-checked actions</b><small>Capacity, load and time windows enforced on every assignment</small></div></li>
          </ul>
        </div>
        <small className="login-foot">© {new Date().getFullYear()} Dispatch Agent</small>
      </aside>
      <main className="login-main">
        <form className="lockcard" onSubmit={submit} noValidate>
          <span className="logo login-logo"><Truck size={20} /></span>
          <h2>Sign in</h2>
          <p className="muted">Sign in to your dispatch workspace.</p>
          <div className="method"><span className="method-icon"><KeyRound size={16} /></span><div><b>App passcode</b><small>Your team's shared access passcode</small></div></div>
          <label className="field" htmlFor="passcode">
            <span>Passcode</span>
            <div className={'pwd' + (shown ? ' invalid' : '')}>
              <input id="passcode" type={show ? 'text' : 'password'} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter app passcode"
                aria-invalid={Boolean(shown)} aria-describedby={shown ? 'passcode-error' : undefined} autoComplete="current-password" autoFocus disabled={busy} />
              <button type="button" className="icon-btn reveal" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide passcode' : 'Show passcode'} disabled={busy}>
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          {shown && <p id="passcode-error" className="lockerr" role="alert">{shown}</p>}
          <button type="submit" className="btn primary block" disabled={busy || !code}>{busy ? <><Loader2 size={16} className="spin" />Signing in…</> : 'Sign in'}</button>
          <p className="muted small center">Don't have the passcode? Ask your dispatch admin.</p>
        </form>
      </main>
    </div>
  );
}

// ===========================================================================
// Dashboard
// ===========================================================================
export function Dashboard({ go }) {
  const s = useDispatch();
  const { drivers, orders, deliveries, events, loaded } = s;
  const exceptions = useMemo(() => getExceptions(s), [orders, deliveries, events]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!loaded) return <Loading />;
  const live = deliveries.filter((d) => ACTIVE.includes(d.status));
  const pending = orders.filter((o) => o.status === 'pending');
  const today = new Date().toDateString();
  const deliveredToday = deliveries.filter((d) => d.status === 'delivered' && new Date(d.delivered_at || d.assigned_at).toDateString() === today);
  const delayed = live.filter((d) => (d.delay_minutes || 0) >= DELAY_MIN);
  const free = drivers.filter((d) => d.status === 'available' && d.active_orders < d.max_active_orders);

  return (
    <>
      <div className="stats">
        <Stat icon={Package} tone="butter" label="Pending orders" value={pending.length} sub={`${pending.filter((o) => o.priority === 'urgent').length} urgent`} onClick={() => go('Orders')} />
        <Stat icon={Truck} tone="sky" label="Active deliveries" value={live.length} sub={`${live.filter((d) => d.status !== 'assigned').length} with parcel`} onClick={() => go('Live Tracking')} />
        <Stat icon={CheckCircle2} tone="mint" label="Delivered today" value={deliveredToday.length} sub={`${deliveries.filter((d) => d.status === 'failed').length} failed`} />
        <Stat icon={Users} tone="lilac" label="Drivers free" value={free.length} sub={`of ${drivers.length} on roster`} onClick={() => go('Drivers')} />
        <Stat icon={AlertTriangle} tone="rose" label="Needs attention" value={exceptions.length} sub={`${delayed.length} delayed`} onClick={() => go('Exceptions')} />
      </div>
      <div className="dash">
        <section className="card flush">
          <CardHead title="Live operations" sub={`${live.length} deliveries on the road · ${pending.length} awaiting a driver`}>
            <button className="btn ghost sm" onClick={() => go('Live Tracking')}>Open tracking<ChevronRight size={14} /></button>
          </CardHead>
          <MapView drivers={drivers} orders={orders} deliveries={deliveries} height="fill" />
        </section>
        <div className="col">
          <section className="card">
            <CardHead title="Needs attention" sub={exceptions.length ? `${exceptions.length} open` : 'All clear'}>
              {exceptions.length > 0 && <button className="btn ghost sm" onClick={() => go('Exceptions')}>View all</button>}
            </CardHead>
            {exceptions.length === 0 ? <Empty icon={ShieldCheck} title="Nothing needs attention" /> : (
              <ul className="list">
                {exceptions.slice(0, 4).map((x) => (
                  <li key={x.id} className={'ex-row ' + x.severity}><span className="dot" /><div><b>{x.title}</b><small>{x.detail}</small></div></li>
                ))}
              </ul>
            )}
          </section>
          <section className="card grow">
            <CardHead title="Recent activity" />
            <ActivityFeed events={events.slice(0, 5)} />
          </section>
        </div>
      </div>
    </>
  );
}

function ActivityFeed({ events }) {
  if (!events.length) return <Empty icon={Activity} title="No activity yet" />;
  return (
    <ul className="feed">
      {events.map((e) => {
        const Icon = EVENT_ICON[e.type] || Activity;
        return (
          <li key={e.id}><span className={'feed-icon ' + eventTone(e.type)}><Icon size={14} /></span>
            <div><span>{e.message}</span><small>{label(e.type)} · {relTime(e.created_at)}</small></div></li>
        );
      })}
    </ul>
  );
}

// ===========================================================================
// Orders
// ===========================================================================
const ORDER_TABS = {
  All: () => true,
  Pending: (o) => o.status === 'pending',
  Active: (o) => ACTIVE.includes(o.status),
  Delivered: (o) => o.status === 'delivered',
  Issues: (o) => ['failed', 'cancelled'].includes(o.status),
};
const emptyForm = { customer_name: '', customer_phone: '', pickup: 'T. Nagar', drop: 'Adyar', weight_kg: '2', priority: 'normal', window: '' };

export function Orders() {
  const { orders, deliveries, loaded } = useDispatch();
  const [tab, setTab] = useState('All');
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [f, setF] = useState(emptyForm);
  const { busy, err, setErr, run } = useAction();
  const [notice, setNotice] = useState('');
  const byOrder = useMemo(() => deliveryByOrder(deliveries), [deliveries]);
  if (!loaded) return <Loading />;

  const needle = q.trim().toLowerCase();
  const rows = orders.filter(ORDER_TABS[tab]).filter((o) => !needle || [o.customer_name, o.pickup_address, o.drop_address, o.id].some((v) => String(v || '').toLowerCase().includes(needle)));
  const pendingCount = orders.filter((o) => o.status === 'pending').length;

  const submit = (e) => {
    e.preventDefault();
    if (!f.customer_name.trim()) return setErr('Customer name is required.');
    if (f.pickup === f.drop) return setErr('Pickup and drop-off must be different areas.');
    const [plat, plng] = AREAS[f.pickup], [dlat, dlng] = AREAS[f.drop];
    run('create', async () => {
      await createOrder({
        customer_name: f.customer_name.trim(), customer_phone: f.customer_phone.trim() || undefined,
        pickup_address: `${f.pickup}, Chennai`, pickup_lat: plat, pickup_lng: plng, drop_address: `${f.drop}, Chennai`, drop_lat: dlat, drop_lng: dlng,
        weight_kg: Number(f.weight_kg) || 1, priority: f.priority,
        time_window_end: f.window ? new Date(Date.now() + Number(f.window) * 60000).toISOString() : undefined,
      });
      setF(emptyForm); setShowForm(false); setNotice('Order created.');
    });
  };
  const autoAll = () => run('auto', async () => {
    const r = await autoAssignAll();
    const ok = (r?.results || []).filter((x) => x.assigned).length;
    setNotice(`Auto-assign finished: ${ok} of ${(r?.results || []).length} pending orders assigned.`);
  });

  return (
    <div className="stack">
      <div className="toolbar">
        <div className="tabs" role="tablist">
          {Object.keys(ORDER_TABS).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {t}<span>{orders.filter(ORDER_TABS[t]).length}</span>
            </button>
          ))}
        </div>
        <div className="search"><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer, area or ID" aria-label="Search orders" /></div>
        <button className="btn ghost" onClick={autoAll} disabled={busy === 'auto' || !pendingCount}><Spin on={busy === 'auto'} icon={Wand2} />Auto-assign pending</button>
        <button className="btn primary" onClick={() => { setShowForm((v) => !v); setErr(''); }}>{showForm ? <X size={15} /> : <Plus size={15} />}{showForm ? 'Close' : 'New order'}</button>
      </div>

      {notice && <div className="note ok"><CheckCircle2 size={15} /><span>{notice}</span><button className="icon-btn" onClick={() => setNotice('')} aria-label="Dismiss"><X size={14} /></button></div>}
      <ErrorNote msg={err} onClose={() => setErr('')} />

      {showForm && (
        <form className="card form-grid" onSubmit={submit}>
          <label className="field"><span>Customer</span><input value={f.customer_name} onChange={(e) => setF({ ...f, customer_name: e.target.value })} placeholder="Business or person" autoFocus /></label>
          <label className="field"><span>Phone</span><input value={f.customer_phone} onChange={(e) => setF({ ...f, customer_phone: e.target.value })} placeholder="Optional" /></label>
          <label className="field"><span>Pickup area</span><select value={f.pickup} onChange={(e) => setF({ ...f, pickup: e.target.value })}>{Object.keys(AREAS).map((a) => <option key={a}>{a}</option>)}</select></label>
          <label className="field"><span>Drop-off area</span><select value={f.drop} onChange={(e) => setF({ ...f, drop: e.target.value })}>{Object.keys(AREAS).map((a) => <option key={a}>{a}</option>)}</select></label>
          <label className="field"><span>Weight (kg)</span><input type="number" min="0.1" step="0.1" value={f.weight_kg} onChange={(e) => setF({ ...f, weight_kg: e.target.value })} /></label>
          <label className="field"><span>Priority</span><select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="normal">Normal</option><option value="urgent">Urgent</option></select></label>
          <label className="field"><span>Deliver within</span><select value={f.window} onChange={(e) => setF({ ...f, window: e.target.value })}><option value="">No deadline</option><option value="60">1 hour</option><option value="120">2 hours</option><option value="240">4 hours</option><option value="480">8 hours</option></select></label>
          <div className="form-actions"><button type="submit" className="btn primary" disabled={busy === 'create'}><Spin on={busy === 'create'} icon={Plus} />Create order</button></div>
        </form>
      )}

      <div className="card flush">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Order</th><th>Route</th><th className="num">Weight</th><th>Priority</th><th>Deadline</th><th>Status</th><th>Driver</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {rows.map((o) => {
                const d = byOrder[o.id];
                const missed = o.status === 'pending' && o.time_window_end && new Date(o.time_window_end) < new Date();
                return (
                  <tr key={o.id}>
                    <td><OrderRef o={o} /></td>
                    <td><span className="route">{o.pickup_address.replace(', Chennai', '')}<ArrowRight size={13} />{o.drop_address.replace(', Chennai', '')}</span></td>
                    <td className="num">{Number(o.weight_kg)} kg</td>
                    <td><Priority p={o.priority} /></td>
                    <td className={missed ? 'late' : ''}>{o.time_window_end ? fmtTime(o.time_window_end) : <span className="muted">—</span>}{missed && <small> missed</small>}</td>
                    <td><Badge s={o.status} /></td>
                    <td>{o.status === 'pending' ? <AssignCell order={o} onError={setErr} /> : d?.drivers ? <span className="who"><Avatar name={d.drivers.name} status="busy" size="sm" />{d.drivers.name}</span> : <span className="muted">—</span>}</td>
                    <td className="row-actions">
                      {['pending', 'assigned'].includes(o.status) && (
                        <button className="icon-btn" title="Cancel order" aria-label={`Cancel order for ${o.customer_name}`} disabled={busy === 'cancel' + o.id}
                          onClick={() => window.confirm(`Cancel the order for ${o.customer_name}?`) && run('cancel' + o.id, () => updateOrder(o.id, { status: 'cancelled' }))}><X size={15} /></button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <Empty icon={Package} title="No orders match">Try a different tab or search.</Empty>}
        </div>
      </div>
    </div>
  );
}

function AssignCell({ order, onError }) {
  const [cands, setCands] = useState(null);
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try { setCands(await getCandidates(order.id)); } catch (e) { onError(e.message); } finally { setBusy(false); }
  };
  const pick = async (driver_id) => {
    setBusy(true);
    try { await assignOrder(order.id, driver_id || undefined); setCands(null); } catch (e) { onError(`Could not assign ${order.customer_name}: ${e.message}`); } finally { setBusy(false); }
  };
  if (!cands) return <button className="btn ghost sm" onClick={open} disabled={busy}><Spin on={busy} icon={Truck} size={14} />Assign</button>;
  if (!cands.length) return <span className="muted small">No eligible driver <button className="link" onClick={() => setCands(null)}>close</button></span>;
  return (
    <select className="sm" autoFocus defaultValue="" disabled={busy} onChange={(e) => e.target.value && pick(e.target.value === 'auto' ? '' : e.target.value)} onBlur={() => !busy && setCands(null)} aria-label="Choose driver">
      <option value="" disabled>Choose driver…</option>
      <option value="auto">Best match (auto)</option>
      {cands.map((c) => <option key={c.driver_id} value={c.driver_id}>{c.name} · {km(c.pickup_distance_m)} · {mins(c.pickup_eta_s)}</option>)}
    </select>
  );
}

// ===========================================================================
// Drivers
// ===========================================================================
export function Drivers() {
  const { drivers, deliveries, loaded } = useDispatch();
  const { busy, err, setErr, run } = useAction();
  const [filter, setFilter] = useState('all');
  if (!loaded) return <Loading />;
  const jobOf = Object.fromEntries(deliveries.filter((d) => ACTIVE.includes(d.status)).map((d) => [d.driver_id, d]));
  const counts = drivers.reduce((m, d) => ({ ...m, [d.status]: (m[d.status] || 0) + 1 }), {});
  const rows = drivers.filter((d) => filter === 'all' || d.status === filter);
  return (
    <div className="stack">
      <div className="toolbar">
        <div className="tabs">
          {['all', 'available', 'busy', 'on_break', 'offline'].map((k) => (
            <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{k === 'all' ? 'All' : label(k)}<span>{k === 'all' ? drivers.length : counts[k] || 0}</span></button>
          ))}
        </div>
      </div>
      <ErrorNote msg={err} onClose={() => setErr('')} />
      <div className="card flush">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Driver</th><th>Vehicle</th><th>Status</th><th>Load</th><th className="num">Rating</th><th>Current job</th><th>Last GPS</th><th>Set status</th></tr></thead>
            <tbody>
              {rows.map((d) => {
                const V = VEHICLE_ICON[d.vehicle_type] || Truck;
                const job = jobOf[d.id];
                const pct = Math.min(100, Math.round((d.active_orders / d.max_active_orders) * 100));
                return (
                  <tr key={d.id}>
                    <td><span className="who"><Avatar name={d.name} status={d.status} /><span className="oref"><b>{d.name}</b><small>{d.phone || '—'}</small></span></span></td>
                    <td><span className="vehicle"><V size={15} />{d.vehicle_type}<small>{d.capacity_kg} kg</small></span></td>
                    <td><Badge s={d.status} /></td>
                    <td><span className="load"><span className="bar"><i style={{ width: pct + '%' }} className={pct >= 100 ? 'full' : ''} /></span>{d.active_orders}/{d.max_active_orders}</span></td>
                    <td className="num"><span className="rating"><Star size={13} />{Number(d.rating).toFixed(1)}</span></td>
                    <td>{job ? <span className="oref"><b>{job.orders?.customer_name}</b><small>{label(job.status)} · ETA {fmtTime(job.eta)}</small></span> : <span className="muted">—</span>}</td>
                    <td className="muted">{relTime(d.location?.updated_at)}</td>
                    <td>
                      <select className="sm" value={['available', 'on_break', 'offline'].includes(d.status) ? d.status : ''} disabled={busy === d.id}
                        onChange={(e) => e.target.value && run(d.id, () => setDriverStatus(d.id, e.target.value))} aria-label={`Set status for ${d.name}`}>
                        {d.status === 'busy' && <option value="">Busy (auto)</option>}
                        <option value="available">Available</option><option value="on_break">On break</option><option value="offline">Offline</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <Empty icon={Users} title="No drivers in this group" />}
        </div>
      </div>
      <p className="muted small">Setting a driver to offline or on break automatically reassigns deliveries they haven't picked up yet.</p>
    </div>
  );
}

// ===========================================================================
// Live tracking
// ===========================================================================
const STEPS = ['assigned', 'picked_up', 'in_transit', 'delivered'];
const late = (x) => (x.delay_minutes || 0) >= DELAY_MIN;
const NEXT = { assigned: ['picked_up', 'Mark picked up'], picked_up: ['in_transit', 'Mark in transit'], in_transit: ['delivered', 'Mark delivered'] };

export function Tracking() {
  const { drivers, orders, deliveries, loaded } = useDispatch();
  const [sel, setSel] = useState(null);
  const [sim, setSim] = useState(false);
  const { busy, err, setErr, run } = useAction();
  const live = deliveries.filter((d) => ACTIVE.includes(d.status));

  useEffect(() => {
    if (!sim) return undefined;
    let stop = false;
    const loop = async () => { if (stop) return; try { await simulateTick(); } catch (e) { setErr(e.message); setSim(false); return; } setTimeout(loop, 2500); };
    loop();
    return () => { stop = true; };
  }, [sim]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!loaded) return <Loading />;
  const d = live.find((x) => x.id === sel) || deliveries.find((x) => x.id === sel);

  return (
    <div className="track">
      <aside className="card flush track-list">
        <CardHead title="On the road" sub={`${live.length} active deliveries · ${live.filter(late).length} delayed`} />
        <div className="track-tools">
          <button className={'btn sm ' + (sim ? 'primary' : 'ghost')} onClick={() => setSim((v) => !v)} title="Move drivers along their routes">{sim ? <Pause size={14} /> : <Play size={14} />}{sim ? 'Pause simulation' : 'Simulate movement'}</button>
          <button className="btn ghost sm" onClick={() => run('delays', checkDelays)} disabled={busy === 'delays'} title="Re-estimate ETAs and flag delays"><Spin on={busy === 'delays'} icon={Timer} size={14} />Check delays</button>
        </div>
        <ErrorNote msg={err} onClose={() => setErr('')} />
        {live.length === 0 ? <Empty icon={Truck} title="No active deliveries">Assign pending orders to see them here.</Empty> : (
          <ul className="dlist">
            {live.map((x) => (
              <li key={x.id}>
                <button className={'drow' + (sel === x.id ? ' on' : '')} onClick={() => setSel(sel === x.id ? null : x.id)}>
                  <Avatar name={x.drivers?.name} status="busy" size="sm" />
                  <span className="oref"><b>{x.orders?.customer_name}</b><small>{x.drivers?.name} · ETA {fmtTime(x.eta)}</small></span>
                  {late(x) ? <span className="badge s-failed">{x.delay_minutes}m late</span> : <Badge s={x.status} />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
      <section className="card flush track-map">
        <MapView drivers={drivers} orders={orders} deliveries={deliveries} selected={sel} onSelect={setSel} height="100%" showPending={!sel} />
        {d && (
          <div className="detail">
            <div className="detail-head">
              <span className="oref"><b>{d.orders?.customer_name}</b><small>#{shortId(d.order_id)} · {d.drivers?.name} ({d.drivers?.vehicle_type})</small></span>
              <button className="icon-btn" onClick={() => setSel(null)} aria-label="Close details"><X size={16} /></button>
            </div>
            <ol className="steps">
              {STEPS.map((st, i) => <li key={st} className={STEPS.indexOf(d.status) >= i ? 'done' : ''}><span />{label(st)}</li>)}
            </ol>
            <dl className="facts">
              <div><dt><Clock size={13} />ETA</dt><dd className={late(d) ? 'late' : ''}>{fmtTime(d.eta)}{late(d) && ` (+${d.delay_minutes} min)`}</dd></div>
              <div><dt><Route size={13} />Trip</dt><dd>{km(d.distance_m)}</dd></div>
              <div><dt><MapPin size={13} />Drop-off</dt><dd>{d.orders?.drop_address?.replace(', Chennai', '')}</dd></div>
              <div><dt><Gauge size={13} />Deadline</dt><dd>{fmtTime(d.orders?.time_window_end)}</dd></div>
            </dl>
            {ACTIVE.includes(d.status) && (
              <div className="detail-actions">
                <button className="btn primary sm" disabled={!!busy} onClick={() => run('next', () => setDeliveryStatus(d.id, NEXT[d.status][0]))}><Spin on={busy === 'next'} icon={CheckCircle2} size={14} />{NEXT[d.status][1]}</button>
                {d.status === 'assigned' && <button className="btn ghost sm" disabled={!!busy} onClick={() => run('re', () => reassignDelivery(d.id))}><Spin on={busy === 're'} icon={RefreshCw} size={14} />Reassign</button>}
                <button className="btn ghost sm danger" disabled={!!busy} onClick={() => window.confirm('Mark this delivery as failed?') && run('fail', () => setDeliveryStatus(d.id, 'failed', 'Marked failed by dispatcher'))}>Mark failed</button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// ===========================================================================
// Agent console
// ===========================================================================
const GREETING = 'Hi, I am the dispatch agent. I read live orders, drivers and deliveries from the database. Ask me anything about dispatch, or ask me to assign a driver.';
const SUGGESTIONS = ['How many pending orders do we have?', 'Which drivers are available right now?', 'Show me the delayed deliveries.', 'Which urgent orders still need a driver?'];
const WRITE_TOOLS = new Set(['assign_driver', 'reassign_order', 'update_delivery_status', 'flag_delay', 'log_event']);
const greeting = () => [{ from: 'agent', text: GREETING, at: new Date() }];

export function AgentConsole() {
  const { log } = useDispatch();
  const [msgs, setMsgs] = useState(greeting);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const chatRef = useRef(null);
  useEffect(() => { const el = chatRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs, busy]);

  const ask = async (raw) => {
    const q = raw.trim(); if (!q || busy) return;
    const history = msgs.slice(1).filter((m) => !m.error).map((m) => ({ role: m.from === 'you' ? 'user' : 'assistant', text: m.text }));
    setText(''); setBusy(true); setMsgs((m) => [...m, { from: 'you', text: q, at: new Date() }]);
    try { const r = await askAgent(q, history); setMsgs((m) => [...m, { from: 'agent', text: r, at: new Date() }]); }
    catch (err) { setMsgs((m) => [...m, { from: 'agent', text: err.message, error: true, at: new Date() }]); }
    finally { setBusy(false); }
  };
  const reset = () => { if (!busy) { setMsgs(greeting()); clearLog(); } };

  return (
    <div className="console">
      <section className="card flush chatcard">
        <div className="chat-head">
          <span className="agent-av"><Sparkles size={16} /></span>
          <div><b>Dispatch agent</b><small><i className={'pulse-dot' + (busy ? ' working' : '')} />{busy ? 'Checking live data…' : 'Gemini · connected to live data'}</small></div>
          <button className="btn ghost sm" onClick={reset} disabled={busy || msgs.length <= 1}><Eraser size={14} />New chat</button>
        </div>
        <div className="chat" ref={chatRef} aria-live="polite">
          {msgs.map((m, i) => (
            <div key={i} className={'mrow ' + m.from}>
              {m.from === 'agent' && <span className={'m-av' + (m.error ? ' error' : '')}>{m.error ? <AlertTriangle size={13} /> : <Sparkles size={13} />}</span>}
              <div className={'msg ' + m.from + (m.error ? ' error' : '')}>{m.text}<time>{fmtTime(m.at)}</time></div>
            </div>
          ))}
          {busy && <div className="mrow agent"><span className="m-av"><Sparkles size={13} /></span><div className="msg agent typing" aria-label="Agent is typing"><i /><i /><i /></div></div>}
          {msgs.length <= 1 && !busy && (
            <div className="suggest"><span>Try asking</span><div className="chips">{SUGGESTIONS.map((s) => <button key={s} className="chip-btn" onClick={() => ask(s)}>{s}</button>)}</div></div>
          )}
        </div>
        <form className="composer" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about orders, drivers, routes or delays…" disabled={busy} maxLength={2000} aria-label="Message the agent" />
          <button type="submit" className="btn primary" disabled={busy || !text.trim()}><Send size={15} />Send</button>
        </form>
      </section>
      <section className="card flush logcard">
        <CardHead title="Tool calls" sub="Every database read or write the agent makes, newest first"><span className="count-pill">{log.length}</span></CardHead>
        {log.length === 0 ? <Empty icon={Wrench} title="No tool calls yet">Ask the agent a question to see what it looks up.</Empty> : (
          <ol className="timeline">
            {log.map((l, i) => ({ ...l, i })).reverse().map((l) => {
              const write = WRITE_TOOLS.has(l.tool);
              const failed = String(l.result).startsWith('error');
              const args = l.args && Object.keys(l.args).length ? JSON.stringify(l.args) : null;
              return (
                <li key={l.i} className={(write ? 'write' : '') + (failed ? ' failed' : '')}>
                  <div className="tl-head"><code>{l.tool}</code><span className={'tag ' + (write ? 'write' : 'read')}>{write ? 'write' : 'read'}</span></div>
                  {args && <code className="tl-args">{args}</code>}
                  <span className="tl-res">{l.result}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

// ===========================================================================
// Exceptions
// ===========================================================================
const EX_ICON = { delay: Timer, window: Clock, urgent: AlertTriangle, failed: CircleSlash };

export function Exceptions() {
  const s = useDispatch();
  const { busy, err, setErr, run } = useAction();
  const items = useMemo(() => getExceptions(s), [s.orders, s.deliveries, s.events]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s.loaded) return <Loading />;
  return (
    <div className="stack">
      <div className="toolbar">
        <p className="muted grow-1">{items.length ? `${items.length} item${items.length === 1 ? '' : 's'} need a decision. Delays are re-checked when you run the delay check.` : 'Nothing needs attention right now.'}</p>
        <button className="btn ghost" onClick={() => run('check', checkDelays)} disabled={busy === 'check'}><Spin on={busy === 'check'} icon={Timer} />Run delay check</button>
      </div>
      <ErrorNote msg={err} onClose={() => setErr('')} />
      {items.length === 0 ? <div className="card"><Empty icon={ShieldCheck} title="All clear">No delays, missed windows or unassigned urgent orders.</Empty></div> : (
        <div className="ex-grid">
          {items.map((x) => {
            const Icon = EX_ICON[x.kind] || AlertTriangle;
            const k = (a) => a + x.id;
            return (
              <article key={x.id} className={'card ex ' + x.severity}>
                <div className="ex-top"><span className="ex-icon"><Icon size={16} /></span><div><b>{x.title}</b><small>{x.detail}</small></div></div>
                <div className="ex-actions">
                  {x.kind === 'delay' && x.delivery.status === 'assigned' && <button className="btn primary sm" disabled={!!busy} onClick={() => run(k('re'), () => reassignDelivery(x.delivery.id))}><Spin on={busy === k('re')} icon={RefreshCw} size={14} />Reassign to faster driver</button>}
                  {x.kind === 'delay' && x.delivery.status !== 'assigned' && <span className="muted small">Parcel already picked up: contact the driver or the customer.</span>}
                  {x.kind === 'window' && <>
                    <button className="btn primary sm" disabled={!!busy} onClick={() => run(k('ext'), () => updateOrder(x.order.id, { time_window_end: new Date(Date.now() + 2 * 3600e3).toISOString() }))}><Spin on={busy === k('ext')} icon={Clock} size={14} />Extend window 2 h</button>
                    <button className="btn ghost sm danger" disabled={!!busy} onClick={() => run(k('cx'), () => updateOrder(x.order.id, { status: 'cancelled' }))}>Cancel order</button>
                  </>}
                  {x.kind === 'urgent' && <button className="btn primary sm" disabled={!!busy} onClick={() => run(k('as'), () => assignOrder(x.order.id))}><Spin on={busy === k('as')} icon={Wand2} size={14} />Assign best driver</button>}
                  {x.kind === 'failed' && <span className="muted small">Recorded {relTime(x.delivery.assigned_at)}. Create a new order to retry.</span>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
