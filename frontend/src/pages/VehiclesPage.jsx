import { useOutletContext } from 'react-router-dom';
import VehiclePanel from '../components/VehiclePanel';

function VehicleStatusBadge({ status }) {
  if (!status) return null;
  const s = String(status).toLowerCase();
  let cls = 'badge badge-neutral';
  if (s === 'available') cls = 'badge badge-ok';
  else if (s === 'in_transit' || s === 'in transit') cls = 'badge badge-info';
  else if (s === 'loading') cls = 'badge badge-warn';
  else if (s === 'offline' || s === 'maintenance') cls = 'badge badge-bad';
  return <span className={cls}>{status}</span>;
}

export default function VehiclesPage() {
  const ctx = useOutletContext();
  const vehicles = ctx.vehicles || [];

  return (
    <>
      {/* Top bar */}
      <div className="dashboard-topbar">
        <div>
          <div className="dashboard-topbar-title">Vehicles</div>
        </div>
        <div className="dashboard-topbar-actions">
          <span className="badge badge-neutral">{vehicles.length} in fleet</span>
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: Vehicle list */}
        <div
          style={{
            width: 280,
            flexShrink: 0,
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: '#fff',
          }}
        >
          <div
            style={{
              padding: '12px 14px 10px',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
            }}
          >
            <p className="ws-section-label" style={{ padding: 0, margin: 0 }}>
              Fleet ({vehicles.length})
            </p>
            {ctx.listsError ? (
              <p className="error-text" style={{ marginTop: 6 }}>{ctx.listsError}</p>
            ) : null}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {!vehicles.length ? (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
                    <path d="M3 7h11v10H3zM14 10h4l3 3v4h-7V10z" />
                    <circle cx="7" cy="17" r="1.5" />
                    <circle cx="17" cy="17" r="1.5" />
                  </svg>
                </div>
                <p className="empty-state-title">No vehicles</p>
                <p className="empty-state-sub">No fleet data loaded from the API.</p>
              </div>
            ) : (
              vehicles.map((v) => {
                const isSelected = ctx.selectedVehicle?.id === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    className={`list-item${isSelected ? ' is-selected' : ''}`}
                    onClick={() => ctx.loadVehicle(v.id)}
                  >
                    <div
                      className="list-item-icon"
                      style={{
                        background: isSelected ? 'var(--accent-soft)' : 'var(--bg)',
                        color: isSelected ? 'var(--accent)' : 'var(--muted)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      🚛
                    </div>
                    <div className="list-item-body">
                      <div className="list-item-title">{v.vehicleNumber || v.id}</div>
                      <div className="list-item-sub">
                        {v.currentLocationName
                          ? `@ ${v.currentLocationName}`
                          : v.currentNode || 'Location unknown'}
                      </div>
                    </div>
                    <VehicleStatusBadge status={v.status} />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Vehicle detail */}
        <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg)', padding: '20px 24px' }}>
          <VehiclePanel
            vehicle={ctx.selectedVehicle}
            loading={ctx.vehicleLoading}
            error={ctx.vehicleError}
          />
        </div>
      </div>
    </>
  );
}
