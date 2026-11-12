import { useState, useEffect } from 'react';
import { useDispatch, checkSession, logout } from './api/client';
import { Dashboard, Orders, Drivers, Tracking, AgentConsole, Exceptions, PasscodeScreen } from './pages/Pages.jsx';

const PAGES = {
  Dashboard: [Dashboard, '▦', 'Overview of live operations'],
  Orders: [Orders, '☰', 'Create and assign delivery orders'],
  Drivers: [Drivers, '●', 'Driver availability and load'],
  'Live Tracking': [Tracking, '➤', 'Simulated GPS and routes'],
  'Agent Console': [AgentConsole, '✦', 'Talk to the dispatch agent'],
  Exceptions: [Exceptions, '⚠', 'Delays and driver issues to review'],
};

export default function App() {
  const [page, setPage] = useState('Dashboard');
  const { alerts, authed } = useDispatch();
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { checkSession(); }, []);
  if (authed === null) return <div className="lock"><p className="muted">Loading…</p></div>;
  if (!authed) return <PasscodeScreen />;
  const [Page, , sub] = PAGES[page];
  return (
    <div className="app">
      <nav>
        <div className="brand"><span className="logo">🚚</span><div><b>Dispatch Agent</b><small>AI delivery control</small></div></div>
        {Object.entries(PAGES).map(([p, [, icon]]) => (
          <button key={p} className={p === page ? 'active' : ''} onClick={() => setPage(p)}>
            <span className="ni">{icon}</span>{p}{p === 'Exceptions' && alerts.length > 0 && <span className="count">{alerts.length}</span>}
          </button>
        ))}
        <div className="navfoot"><span>Prototype · mock data</span><button className="ghost lockbtn" onClick={logout}>🔒 Lock</button></div>
      </nav>
      <div className="content">
        <header>
          <div><h2>{page}</h2><p className="muted">{sub}</p></div>
          <div className="live"><span className="ldot" />Live · {now.toLocaleTimeString()}</div>
        </header>
        <main><Page /></main>
      </div>
    </div>
  );
}
