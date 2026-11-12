import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ACTIVE, DELAY_MIN, label, initials, fmtTime, km, shortId } from './api/client';

export const Badge = ({ s, children }) => <span className={'badge s-' + s}>{children || label(s)}</span>;

export const Priority = ({ p }) => <span className={'chip ' + (p === 'urgent' ? 'urgent' : '')}>{p}</span>;

export const Avatar = ({ name, status, size }) => (
  <span className={'avatar s-' + (status || 'none') + (size === 'sm' ? ' sm' : '')} aria-hidden="true">{initials(name)}</span>
);

export function Stat({ icon: Icon, tone, label: text, value, sub, onClick }) {
  return (
    <button type="button" className={'stat ' + tone} onClick={onClick} disabled={!onClick}>
      <span className="stat-icon"><Icon size={18} strokeWidth={2} /></span>
      <span className="stat-body"><span className="stat-label">{text}</span><span className="stat-value">{value}</span>{sub && <span className="stat-sub">{sub}</span>}</span>
    </button>
  );
}

export const Empty = ({ icon: Icon, title, children }) => (
  <div className="empty">{Icon && <Icon size={22} strokeWidth={1.75} />}<b>{title}</b>{children && <p>{children}</p>}</div>
);

export const CardHead = ({ title, sub, children }) => (
  <div className="card-head"><div><h3>{title}</h3>{sub && <p>{sub}</p>}</div>{children && <div className="card-actions">{children}</div>}</div>
);

// ---------------------------------------------------------------------------
// Live map: OpenStreetMap streets (CARTO Positron) with drivers, pickups, drops and routes.
// ---------------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ll = (lat, lng) => [Number(lat), Number(lng)];
const valid = (p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1]);

const driverIcon = (d, selected) => L.divIcon({
  className: '', iconSize: [30, 30], iconAnchor: [15, 15],
  html: `<div class="mk-driver s-${d.status}${selected ? ' sel' : ''}">${esc(initials(d.name))}</div>`,
});
const dropIcon = (cls) => L.divIcon({ className: '', iconSize: [22, 30], iconAnchor: [11, 29], html: `<div class="mk-pin ${cls}"><span></span></div>` });
const pickupIcon = (cls) => L.divIcon({ className: '', iconSize: [14, 14], iconAnchor: [7, 7], html: `<div class="mk-pickup ${cls}"></div>` });

const ROUTE = { toPickup: '#8a76ee', loaded: '#4d8fdc', late: '#df5f80' };

// Route line with a white casing so it stays readable over busy streets.
function routeLine(g, pts, { color, weight, opacity, dashArray }, onClick) {
  L.polyline(pts, { color: '#ffffff', weight: weight + 4, opacity: 0.85 * opacity, interactive: false }).addTo(g);
  L.polyline(pts, { color, weight, opacity, dashArray }).on('click', onClick).addTo(g);
}

export function MapView({ drivers, orders, deliveries, selected, onSelect, height = 440, showPending = true }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const fitted = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const m = L.map(el.current, { zoomControl: true, scrollWheelZoom: true, attributionControl: true }).setView([13.03, 80.22], 12);
    // OpenStreetMap standard tiles (no API key). Colours are softened in CSS (.map .leaflet-tile-pane).
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current, g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const byId = Object.fromEntries(drivers.map((d) => [d.id, d]));
    const live = deliveries.filter((d) => ACTIVE.includes(d.status) && d.orders);
    const pts = [];
    const sel = (id) => () => onSelectRef.current?.(id);
    const dim = (id) => (selected && selected !== id ? 0.25 : 1);

    for (const d of live) {
      const o = d.orders;
      const drv = byId[d.driver_id];
      const pos = drv?.location ? ll(drv.location.lat, drv.location.lng) : null;
      const pickup = ll(o.pickup_lat, o.pickup_lng);
      const drop = ll(o.drop_lat, o.drop_lng);
      const late = (d.delay_minutes || 0) >= DELAY_MIN;
      const isSel = selected === d.id;
      const w = isSel ? 5 : 3.5;
      if (d.status === 'assigned') {
        if (valid(pos)) routeLine(g, [pos, pickup], { color: late ? ROUTE.late : ROUTE.toPickup, weight: w, opacity: dim(d.id), dashArray: '8 7' }, sel(d.id));
        routeLine(g, [pickup, drop], { color: late ? ROUTE.late : ROUTE.loaded, weight: w - 1, opacity: 0.6 * dim(d.id), dashArray: '2 8' }, sel(d.id));
        L.marker(pickup, { icon: pickupIcon('assigned'), opacity: dim(d.id) }).bindTooltip(`Pickup · ${esc(o.customer_name)}<br><small>${esc(o.pickup_address)}</small>`).on('click', sel(d.id)).addTo(g);
      } else if (valid(pos)) {
        routeLine(g, [pos, drop], { color: late ? ROUTE.late : ROUTE.loaded, weight: w, opacity: dim(d.id) }, sel(d.id));
      }
      L.marker(drop, { icon: dropIcon((late ? 'late ' : '') + 's-' + d.status), opacity: dim(d.id), zIndexOffset: isSel ? 500 : 0 })
        .bindTooltip(`<b>${esc(o.customer_name)}</b> · drop-off<br><small>${esc(o.drop_address)} · ETA ${fmtTime(d.eta)}${late ? ` · <span class="tt-late">${d.delay_minutes} min late</span>` : ''}</small>`)
        .on('click', sel(d.id)).addTo(g);
      pts.push(pickup, drop);
      if (valid(pos)) pts.push(pos);
    }

    if (showPending) {
      for (const o of orders.filter((x) => x.status === 'pending')) {
        const p = ll(o.pickup_lat, o.pickup_lng);
        if (!valid(p)) continue;
        L.marker(p, { icon: dropIcon('pending'), opacity: selected ? 0.35 : 1 })
          .bindTooltip(`<b>${esc(o.customer_name)}</b> · awaiting driver<br><small>Pickup: ${esc(o.pickup_address)} · ${esc(o.weight_kg)} kg${o.priority === 'urgent' ? ' · urgent' : ''}</small>`)
          .addTo(g);
        pts.push(p);
      }
    }

    const activeDriverIds = new Set(live.map((d) => d.driver_id));
    const selDriver = live.find((d) => d.id === selected)?.driver_id;
    for (const d of drivers) {
      if (!d.location) continue;
      const p = ll(d.location.lat, d.location.lng);
      if (!valid(p)) continue;
      const job = live.find((x) => x.driver_id === d.id);
      L.marker(p, { icon: driverIcon(d, selDriver === d.id), zIndexOffset: activeDriverIds.has(d.id) ? 1000 : 800, opacity: selected && selDriver !== d.id ? 0.45 : 1 })
        .bindTooltip(`<b>${esc(d.name)}</b> · ${esc(label(d.status))}<br><small>${esc(d.vehicle_type)} · ${d.active_orders}/${d.max_active_orders} jobs${job ? ' · to ' + esc(job.orders?.customer_name) : ''}</small>`)
        .on('click', job ? sel(job.id) : () => {})
        .addTo(g);
      pts.push(p);
    }

    if (!fitted.current && pts.length) {
      m.fitBounds(L.latLngBounds(pts), { padding: [28, 28], maxZoom: 14 });
      fitted.current = true;
    }
  }, [drivers, orders, deliveries, selected, showPending]);

  // Zoom to the selected delivery.
  useEffect(() => {
    const m = map.current;
    const d = deliveries.find((x) => x.id === selected);
    if (!m || !d?.orders) return;
    const drv = drivers.find((x) => x.id === d.driver_id);
    const pts = [ll(d.orders.pickup_lat, d.orders.pickup_lng), ll(d.orders.drop_lat, d.orders.drop_lng)];
    if (drv?.location) pts.push(ll(drv.location.lat, drv.location.lng));
    m.flyToBounds(L.latLngBounds(pts.filter(valid)), { padding: [60, 60], maxZoom: 14, duration: 0.6 });
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={'map-wrap' + (height === 'fill' ? ' fill' : '')} style={height === 'fill' ? undefined : { height }}>
      <div ref={el} className="map" role="region" aria-label="Live delivery map" />
      <div className="legend">
        <span><i className="lg-driver s-available" />Driver free</span>
        <span><i className="lg-driver s-busy" />Driver on job</span>
        <span><i className="lg-pickup" />Pickup</span>
        <span><i className="lg-pin" />Drop-off</span>
        {showPending && <span><i className="lg-pin pending" />Awaiting driver</span>}
        <span><i className="lg-line dashed" />To pickup</span>
        <span><i className="lg-line" />With parcel</span>
        <span><i className="lg-line late" />Delayed</span>
      </div>
    </div>
  );
}

export const OrderRef = ({ o }) => (
  <span className="oref"><b>{o?.customer_name || 'Unnamed'}</b><small>#{shortId(o?.id)}</small></span>
);

export const Distance = ({ m }) => <span className="muted">{km(m)}</span>;
