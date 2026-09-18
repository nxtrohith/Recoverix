import { useOutletContext } from 'react-router-dom';
import ShipmentPanel from '../components/ShipmentPanel';

function StatusBadge({ status }) {
  if (!status) return null;
  const s = String(status).toLowerCase();
  let cls = 'badge badge-neutral';
  if (s === 'in_transit' || s === 'in transit') cls = 'badge badge-info';
  else if (s === 'delivered') cls = 'badge badge-ok';
  else if (s === 'misplaced' || s === 'exception') cls = 'badge badge-bad';
  else if (s === 'delayed') cls = 'badge badge-warn';
  else if (s === 'recovered') cls = 'badge badge-ok';
  return <span className={cls}>{status}</span>;
}

export default function ShipmentsPage() {
  const ctx = useOutletContext();
  const shipments = ctx.shipments || [];

  return (
    <>
      {/* Top bar */}
      <div className="dashboard-topbar">
        <div>
          <div className="dashboard-topbar-title">Shipments</div>
        </div>
        <div className="dashboard-topbar-actions">
          <span className="badge badge-neutral">{shipments.length} total</span>
        </div>
      </div>

      {/* Three-column layout: list | detail | (empty or future) */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: Shipment list */}
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
              All Shipments ({shipments.length})
            </p>
            {ctx.listsError ? (
              <p className="error-text" style={{ marginTop: 6 }}>{ctx.listsError}</p>
            ) : null}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {!shipments.length ? (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
                    <path d="M3 8.5 12 4l9 4.5v7L12 20 3 15.5v-7z" />
                    <path d="M12 20V11M3.5 8.5 12 13l8.5-4.5" />
                  </svg>
                </div>
                <p className="empty-state-title">No shipments</p>
                <p className="empty-state-sub">No shipment data loaded from the API.</p>
              </div>
            ) : (
              shipments.map((s) => {
                const isSelected = ctx.selectedShipment?.id === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`list-item${isSelected ? ' is-selected' : ''}`}
                    onClick={() => ctx.loadShipment(s.id)}
                  >
                    <div
                      className="list-item-icon"
                      style={{
                        background: isSelected ? 'var(--accent-soft)' : 'var(--bg)',
                        color: isSelected ? 'var(--accent)' : 'var(--muted)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      📦
                    </div>
                    <div className="list-item-body">
                      <div className="list-item-title">{s.trackingNumber || s.id}</div>
                      <div className="list-item-sub">
                        {s.destination ? `→ ${s.destination}` : s.status || 'Unknown status'}
                      </div>
                    </div>
                    <StatusBadge status={s.status} />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Shipment detail panel */}
        <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg)', padding: '20px 24px' }}>
          <ShipmentPanel
            shipment={ctx.selectedShipment}
            incident={ctx.incidentForAlert}
            recoveryAnalysis={ctx.recoveryAnalysis}
            vehicles={ctx.vehicles}
            loading={ctx.shipmentLoading}
            error={ctx.shipmentError}
            onAnalyze={ctx.analyzeRecovery}
            analyzing={ctx.recoveryLoading}
            onSimulateIncident={ctx.handleSimulateIncident}
            simulating={ctx.simulating}
            onAssign={ctx.handleAssignPersistedPlan}
            assigning={ctx.assigning}
            onConfirmPickup={ctx.handleConfirmPickup}
            confirmingPickup={ctx.confirmingPickup}
            onMarkRecovered={ctx.handleMarkRecovered}
            resolving={ctx.resolving}
          />
        </div>
      </div>
    </>
  );
}
