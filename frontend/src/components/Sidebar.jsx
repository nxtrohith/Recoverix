import { NavLink } from 'react-router-dom';
import './Sidebar.css';

/* ─── Icon components ─── */
function Icon({ children, ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

function LogoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2" y="7" width="14" height="10" rx="2" fill="#4f46e5" />
      <path d="M16 10h3l3 3v4h-6V10z" fill="#818cf8" />
      <circle cx="6.5" cy="17" r="1.5" fill="white" />
      <circle cx="14.5" cy="17" r="1.5" fill="white" />
    </svg>
  );
}

function OverviewIcon()  { return <Icon><path d="M3 6.5 9 4l6 2.5L21 4v15.5L15 22l-6-2.5L3 22V6.5z"/><path d="M9 4v15.5M15 6.5V22"/></Icon>; }
function ShipmentIcon()  { return <Icon><path d="M3 8.5 12 4l9 4.5v7L12 20 3 15.5v-7z"/><path d="M12 20V11M3.5 8.5 12 13l8.5-4.5"/></Icon>; }
function TruckIcon()     { return <Icon><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7V10z"/><circle cx="7" cy="17" r="1.5"/><circle cx="17" cy="17" r="1.5"/></Icon>; }
function AlertIcon()     { return <Icon><path d="M12 3 21 19H3L12 3z"/><path d="M12 10v4M12 16.5v.5"/></Icon>; }
function SearchIcon()    { return <Icon><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></Icon>; }
function HubsIcon()      { return <Icon><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></Icon>; }
function RefreshIcon()   { return <Icon><path d="M20 11a8 8 0 0 0-14.6-4.6M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14.6 4.6M20 20v-5h-5"/></Icon>; }

const NAV = [
  { to: '/dashboard',          end: true,  label: 'Overview',   icon: 'overview',  countKey: null },
  { to: '/dashboard/shipments',            label: 'Shipments',  icon: 'shipment',  countKey: 'shipments' },
  { to: '/dashboard/vehicles',             label: 'Vehicles',   icon: 'truck',     countKey: 'vehicles' },
  { to: '/dashboard/recovery',             label: 'Incidents',  icon: 'alert',     badgeKey: 'incident' },
  { to: '/dashboard/search',               label: 'Search',     icon: 'search',    countKey: null },
];

function NavIconEl({ type }) {
  if (type === 'overview') return <OverviewIcon />;
  if (type === 'shipment') return <ShipmentIcon />;
  if (type === 'truck')    return <TruckIcon />;
  if (type === 'alert')    return <AlertIcon />;
  if (type === 'search')   return <SearchIcon />;
  if (type === 'hubs')     return <HubsIcon />;
  return <SearchIcon />;
}

export default function Sidebar({
  incidentCount = 0,
  hubsCount = 0,
  vehiclesCount = 0,
  shipmentsCount = 0,
  health = null,
  healthError = null,
  healthLoading = false,
  onRefreshHealth,
  searchQuery = '',
  onSearchChange,
  onSearchSubmit,
  searchHint = '',
}) {
  const counts = { shipments: shipmentsCount, vehicles: vehiclesCount, hubs: hubsCount };

  const statusLabel = healthLoading
    ? 'Connecting…'
    : healthError
    ? 'Offline'
    : health?.status === 'ok'
    ? 'Connected'
    : 'Unknown';

  const statusClass = healthLoading
    ? 'status-pending'
    : healthError || health?.status !== 'ok'
    ? 'status-bad'
    : 'status-ok';

  const nodeCount = health?.graph?.nodeCount;

  return (
    <aside className="workspace-panel" aria-label="Main navigation">
      {/* Header */}
      <div className="ws-header">
        <div className="ws-brand-row">
          <div className="ws-brand-logo" aria-hidden>
            <LogoIcon />
          </div>
          <div className="ws-brand">
            <span className="ws-brand-name">SH-205</span>
            <span className="ws-brand-sub">Recovery Ops</span>
          </div>
        </div>
      </div>

        {/* Search */}
        <form
          className="ws-search"
          onSubmit={(e) => { e.preventDefault(); onSearchSubmit?.(); }}
        >
          <span className="ws-search-icon"><SearchIcon /></span>
          <input
            type="search"
            placeholder="Search shipment, vehicle, hub…"
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            aria-label="Global search"
          />
        </form>
        {searchHint ? <p className="ws-search-hint">{searchHint}</p> : null}

        {/* Nav */}
        <nav className="ws-nav">
          <p className="ws-section-label">Workspace</p>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `ws-link${isActive ? ' is-active' : ''}`
              }
            >
              <span className="ws-link-icon">
                <NavIconEl type={item.icon} />
              </span>
              <span className="ws-link-label">{item.label}</span>
              {item.badgeKey === 'incident' ? (
                <span className={`ws-count${incidentCount > 0 ? ' ws-count-alert' : ''}`}>
                  {incidentCount}
                </span>
              ) : item.countKey ? (
                <span className="ws-count">{counts[item.countKey] ?? 0}</span>
              ) : null}
            </NavLink>
          ))}
        </nav>

        <div className="ws-browse-section">
          <p className="ws-section-label">Network</p>
          <div className="ws-browse-item">
            <span className="ws-browse-icon"><HubsIcon /></span>
            <span className="ws-browse-label">Hubs</span>
            <span className="ws-count">{hubsCount}</span>
          </div>
          <div className="ws-browse-item">
            <span className="ws-browse-icon">
              <Icon>
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </Icon>
            </span>
            <span className="ws-browse-label">Graph nodes</span>
            <span className="ws-count">{nodeCount ?? '—'}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="ws-footer">
          <div className={`ws-status ${statusClass}`}>
            <span className="status-dot" />
            <span className="ws-status-label">
              Backend {statusLabel}
              {health?.graph?.loaded ? ` · ${health.graph.nodeCount}n` : ''}
            </span>
            {onRefreshHealth ? (
              <button
                type="button"
                className="ws-refresh"
                onClick={onRefreshHealth}
                title="Refresh backend status"
                aria-label="Refresh backend status"
              >
                <RefreshIcon />
              </button>
            ) : null}
          </div>
          <NavLink to="/" className="ws-home-link">
            ← Landing page
          </NavLink>
        </div>
      </aside>
  );
}
