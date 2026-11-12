import { useState, useEffect, useMemo } from 'react';
import { LayoutDashboard, Package, Users, Map, Sparkles, AlertTriangle, Truck, RefreshCw, Lock, Loader2 } from 'lucide-react';
import { useDispatch, checkSession, logout, refresh, getExceptions, relTime } from './api/client';
import { Dashboard, Orders, Drivers, Tracking, AgentConsole, Exceptions, PasscodeScreen } from './pages/Pages.jsx';

const PAGES = {
  Dashboard: [Dashboard, LayoutDashboard, 'Live overview of orders, drivers and deliveries'],
  Orders: [Orders, Package, 'Create, assign and manage delivery orders'],
  Drivers: [Drivers, Users, 'Roster, availability and current load'],
  'Live Tracking': [Tracking, Map, 'Follow active deliveries on the map'],
  'Agent Console': [AgentConsole, Sparkles, 'Ask the AI dispatch agent'],
  Exceptions: [Exceptions, AlertTriangle, 'Delays and issues that need a decision'],
};

export default function App() {
  const [page, setPage] = useState('Dashboard');
  const s = useDispatch();
  const { authed, syncing, syncError, lastSync } = s;
  const [, tick] = useState(0);

  useEffect(() => { checkSession(); }, []);
  useEffect(() => {
    if (!authed) return undefined;
    refresh();
    const poll = setInterval(refresh, 10000);
    const clock = setInterval(() => tick((n) => n + 1), 5000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, [authed]);
  const exceptionCount = useMemo(() => getExceptions(s).length, [s.orders, s.deliveries, s.events]); // eslint-disable-line react-hooks/exhaustive-deps

  if (authed === null) return <div className="boot"><Loader2 size={20} className="spin" /></div>;
  if (!authed) return <PasscodeScreen />;
  const [Page, , sub] = PAGES[page];

  return (
    <div className="app">
      <nav className="side">
        <div className="brand"><span className="logo"><Truck size={18} /></span><div><b>Dispatch Agent</b><small>Chennai operations</small></div></div>
        <div className="nav-items">
          {Object.entries(PAGES).map(([p, [, Icon]]) => (
            <button key={p} className={p === page ? 'on' : ''} onClick={() => setPage(p)} aria-current={p === page ? 'page' : undefined}>
              <Icon size={17} strokeWidth={1.9} /><span>{p}</span>
              {p === 'Exceptions' && exceptionCount > 0 && <em>{exceptionCount}</em>}
            </button>
          ))}
        </div>
        <button className="nav-lock" onClick={logout}><Lock size={15} /><span>Lock</span></button>
      </nav>
      <div className="content">
        <header className="top">
          <div><h1>{page}</h1><p>{sub}</p></div>
          <div className="sync">
            {syncError ? <span className="sync-err" title={syncError}>Sync failed</span> : <span className="muted">{lastSync ? `Updated ${relTime(lastSync)}` : 'Connecting…'}</span>}
            <button className="icon-btn" onClick={refresh} disabled={syncing} aria-label="Refresh data" title="Refresh"><RefreshCw size={15} className={syncing ? 'spin' : ''} /></button>
          </div>
        </header>
        <main className="page"><Page go={setPage} /></main>
      </div>
    </div>
  );
}
