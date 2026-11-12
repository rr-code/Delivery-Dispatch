import { useState } from 'react';
import { useDispatch, createOrder, assignOrder, resolveAlert, askAgent, approxKm, login } from '../api/client';

export function PasscodeScreen() {
  const { authError } = useDispatch();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault(); if (!code || busy) return;
    setBusy(true); setErr('');
    try { await login(code); } catch (x) { setErr(x.message); setCode(''); setBusy(false); }
  };
  const shown = err || authError;
  return (
    <div className="lock">
      <form className="card lockcard" onSubmit={submit}>
        <span className="logo">🚚</span>
        <h2>Dispatch Agent</h2>
        <p className="muted">Enter the team passcode to continue.</p>
        <input type="password" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Passcode" aria-label="Passcode"
          aria-invalid={Boolean(shown)} autoComplete="current-password" autoFocus disabled={busy} />
        {shown && <p className="lockerr" role="alert">{shown}</p>}
        <button type="submit" disabled={busy || !code}>{busy ? 'Checking…' : 'Unlock'}</button>
      </form>
    </div>
  );
}
import { Badge, Kpi, MapView, Avatar } from '../components';

export function Dashboard() {
  const { drivers, orders, alerts } = useDispatch();
  return (
    <>
      <div className="kpis">
        <Kpi icon="🚚" label="Active deliveries" value={orders.filter((o) => o.status === 'in_transit').length} />
        <Kpi icon="📦" label="Pending orders" value={orders.filter((o) => o.status === 'pending').length} tone="warn" />
        <Kpi icon="🧑" label="Free drivers" value={drivers.filter((d) => d.status === 'available').length} />
        <Kpi icon="⚠️" label="Open alerts" value={alerts.length} tone="bad" />
      </div>
      <div className="grid2">
        <div className="card"><h3>Live map</h3><MapView drivers={drivers} orders={orders} /></div>
        <div className="card"><h3>Alerts</h3>
          {alerts.length === 0 && <p className="muted">No open alerts.</p>}
          {alerts.map((a) => <div key={a.id} className={'alert ' + a.type}><Badge s={a.type} /><p>{a.msg}</p></div>)}
        </div>
      </div>
    </>
  );
}

export function Orders() {
  const { orders, drivers } = useDispatch();
  const [f, setF] = useState({ customer: '', dropLabel: '', priority: 'normal' });
  const free = drivers.filter((d) => d.status === 'available');
  const submit = (e) => { e.preventDefault(); if (!f.customer) return; createOrder(f); setF({ customer: '', dropLabel: '', priority: 'normal' }); };
  return (
    <>
      <form className="card row" onSubmit={submit}>
        <input placeholder="Customer" value={f.customer} onChange={(e) => setF({ ...f, customer: e.target.value })} />
        <input placeholder="Drop location" value={f.dropLabel} onChange={(e) => setF({ ...f, dropLabel: e.target.value })} />
        <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option>normal</option><option>high</option></select>
        <button type="submit">Create order</button>
      </form>
      <div className="card scroll">
        <table>
          <thead><tr><th>ID</th><th>Customer</th><th>Drop</th><th>Priority</th><th>Status</th><th>Driver</th></tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{o.id}</td><td>{o.customer}</td><td>{o.drop.label}</td><td><span className={'chip ' + o.priority}>{o.priority}</span></td><td><Badge s={o.status} /></td>
                <td>{o.driverId ? o.driverId : (
                  <select defaultValue="" onChange={(e) => e.target.value && assignOrder(o.id, e.target.value)}>
                    <option value="">Assign…</option>{free.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function Drivers() {
  const { drivers } = useDispatch();
  return (
    <div className="cards">
      {drivers.map((d) => (
        <div key={d.id} className="card">
          <div className="dhead"><Avatar name={d.name} status={d.status} /><div><h3>{d.name}</h3><p className="muted">{d.id} · {d.phone}</p></div><Badge s={d.status} /></div>
          <p>Load: {d.load} order(s)</p>
          <p className="muted">Last location: {d.x.toFixed(0)}, {d.y.toFixed(0)} (simulated)</p>
        </div>
      ))}
    </div>
  );
}

export function Tracking() {
  const { drivers, orders } = useDispatch();
  const live = orders.filter((o) => o.driverId);
  const [sel, setSel] = useState('O1');
  const o = orders.find((x) => x.id === sel), d = o && drivers.find((x) => x.id === o.driverId);
  return (
    <div className="grid2">
      <div className="card"><h3>Live tracking</h3><MapView drivers={drivers} orders={orders} selected={sel} /></div>
      <div className="card"><h3>Route summary</h3>
        <select value={sel} onChange={(e) => setSel(e.target.value)}>{live.map((x) => <option key={x.id} value={x.id}>{x.id} · {x.customer}</option>)}</select>
        {o && d && <div className="stack"><p>Driver: <b>{d.name}</b></p><p>To: {o.drop.label}</p><p>Distance left: ~{approxKm(d, o.drop)} km</p>
          <p className="muted">Simulated values. Real distance and ETA will come from the backend routing service.</p></div>}
      </div>
    </div>
  );
}

export function AgentConsole() {
  const { log } = useDispatch();
  const [msgs, setMsgs] = useState([{ from: 'agent', text: 'Hi, I am the dispatch agent. Ask about orders, drivers, routes or delays.' }]);
  const [text, setText] = useState('');
  const send = async (e) => {
    e.preventDefault(); if (!text) return;
    const q = text; setText(''); setMsgs((m) => [...m, { from: 'you', text: q }]);
    const r = await askAgent(q); setMsgs((m) => [...m, { from: 'agent', text: r }]);
  };
  return (
    <div className="grid2">
      <div className="card"><h3>Agent chat</h3>
        <div className="chat">{msgs.map((m, i) => <div key={i} className={'msg ' + m.from}>{m.text}</div>)}</div>
        <form className="row" onSubmit={send}><input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask the agent…" /><button type="submit">Send</button></form>
      </div>
      <div className="card"><h3>Tool call log</h3>
        {log.length === 0 && <p className="muted">No tool calls yet.</p>}
        {log.map((l, i) => <div key={i} className="alert"><b>{l.tool}</b><code>{JSON.stringify(l.args)}</code><span className="muted">{l.result}</span></div>)}
      </div>
    </div>
  );
}

export function Exceptions() {
  const { alerts } = useDispatch();
  return (
    <div className="cards">
      {alerts.length === 0 && <p className="muted">No exceptions to review.</p>}
      {alerts.map((a) => (
        <div key={a.id} className="card"><h3><Badge s={a.type} /> {a.orderId}</h3><p>{a.msg}</p>
          <p className="muted">Agent suggestion: {a.suggestion}</p>
          <div className="row"><button onClick={() => resolveAlert(a.id, true)}>Approve</button><button className="ghost" onClick={() => resolveAlert(a.id, false)}>Reject</button></div>
        </div>
      ))}
    </div>
  );
}
