export const Badge = ({ s }) => <span className={'badge ' + s}>{s.replace('_', ' ')}</span>;

export const Kpi = ({ label, value, tone, icon }) => (
  <div className={'kpi ' + (tone || '')}>
    <div className="kicon">{icon}</div>
    <div><div className="kv">{value}</div><div className="kl">{label}</div></div>
  </div>
);

export const Avatar = ({ name, status }) => (
  <div className={'avatar ' + status}>{name.split(' ').map((w) => w[0]).join('').slice(0, 2)}</div>
);

export const Legend = () => (
  <div className="legend">
    <span><i className="lg available" />Available</span><span><i className="lg busy" />On delivery</span>
    <span><i className="lg offline" />Offline</span><span><i className="lg sq" />Drop point</span>
  </div>
);

export function MapView({ drivers, orders, selected }) {
  const sel = orders.find((o) => o.id === selected);
  const sd = sel && drivers.find((d) => d.id === sel.driverId);
  return (
    <div>
      <svg viewBox="0 0 100 100" className="map" role="img" aria-label="Simulated dispatch map">
        {[...Array(9)].map((_, i) => (
          <g key={i}><line x1={(i + 1) * 10} y1="0" x2={(i + 1) * 10} y2="100" /><line x1="0" y1={(i + 1) * 10} x2="100" y2={(i + 1) * 10} /></g>
        ))}
        <path className="road" d="M0 35 L100 35 M0 70 L100 70 M30 0 L30 100 M65 0 L65 100 M0 10 L100 90" />
        {orders.filter((o) => o.status !== 'delivered').map((o) => (
          <g key={o.id}>
            <rect x={o.drop.x - 1.6} y={o.drop.y - 1.6} width="3.2" height="3.2" rx=".6" className={'pin ' + o.status} />
            <text x={o.drop.x + 2.6} y={o.drop.y + 1}>{o.id}</text>
          </g>
        ))}
        {sel && sd && <polyline points={`${sd.x},${sd.y} ${sel.drop.x},${sel.drop.y}`} className="route" />}
        {drivers.map((d) => (
          <g key={d.id}>
            {d.status === 'busy' && <circle cx={d.x} cy={d.y} r="2" className="pulse" />}
            <circle cx={d.x} cy={d.y} r="2" className={'dot ' + d.status} />
            <text x={d.x + 3} y={d.y - 2.4} className="dname">{d.name.split(' ')[0]}</text>
          </g>
        ))}
      </svg>
      <Legend />
    </div>
  );
}
