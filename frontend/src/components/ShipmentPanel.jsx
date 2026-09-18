function Field({ label, value }) {
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd>{value == null || value === '' ? '—' : String(value)}</dd>
    </div>
  );
}

const LIFECYCLE_STEPS = [
  'NORMAL',
  'MISPLACED',
  'RECOVERY_ANALYSIS',
  'RECOVERY_ASSIGNED',
  'PICKUP_CONFIRMED',
  'RECOVERED',
];

function LifecycleBar({ current }) {
  const active = current || 'NORMAL';
  const idx = LIFECYCLE_STEPS.indexOf(active);
  return (
    <div className="lifecycle-bar" aria-label={`Lifecycle status ${active}`}>
      {LIFECYCLE_STEPS.map((step, i) => (
        <span
          key={step}
          className={`lifecycle-step ${i === idx ? 'lifecycle-active' : ''} ${
            i < idx ? 'lifecycle-done' : ''
          }`}
        >
          {step.replace(/_/g, ' ')}
        </span>
      ))}
    </div>
  );
}

export default function ShipmentPanel({
  shipment,
  loading,
  error,
  onAnalyze,
  analyzing,
  onSimulateIncident,
  simulating,
  onConfirmPickup,
  confirmingPickup,
  onMarkRecovered,
  resolving,
}) {
  if (loading) {
    return (
      <section className="panel">
        <h2>Shipment</h2>
        <p className="muted">Loading shipment…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel">
        <h2>Shipment</h2>
        <p className="error-text">{error}</p>
      </section>
    );
  }

  if (!shipment) {
    return (
      <section className="panel">
        <h2>Shipment</h2>
        <p className="muted">Select or search a shipment to view details.</p>
      </section>
    );
  }

  const latestEvent = shipment.events?.[0];
  const lifecycle = shipment.lifecycleStatus || 'NORMAL';
  const flags = [];
  if (shipment.needsRecovery) flags.push('NEEDS RECOVERY');
  if (lifecycle !== 'NORMAL') flags.push(lifecycle.replace(/_/g, ' '));

  const canSimulate =
    lifecycle === 'NORMAL' || lifecycle === 'RECOVERED' || !shipment.needsRecovery;
  const canConfirmPickup = lifecycle === 'RECOVERY_ASSIGNED';
  const canResolve = lifecycle === 'PICKUP_CONFIRMED';

  return (
    <section className="panel shipment-panel">
      <div className="panel-header-row">
        <h2>Shipment</h2>
        <div className="panel-actions">
          {canSimulate ? (
            <button
              type="button"
              className="danger"
              onClick={onSimulateIncident}
              disabled={simulating}
            >
              {simulating ? 'Simulating…' : 'Simulate Incident'}
            </button>
          ) : null}
          <button
            type="button"
            className="primary"
            onClick={onAnalyze}
            disabled={analyzing}
          >
            {analyzing ? 'Analyzing…' : 'Analyze Recovery'}
          </button>
          {canConfirmPickup ? (
            <button
              type="button"
              className="primary"
              onClick={onConfirmPickup}
              disabled={confirmingPickup}
            >
              {confirmingPickup ? 'Confirming…' : 'Confirm Pickup'}
            </button>
          ) : null}
          {canResolve ? (
            <button
              type="button"
              className="primary"
              onClick={onMarkRecovered}
              disabled={resolving}
            >
              {resolving ? 'Resolving…' : 'Resolve Incident'}
            </button>
          ) : null}
        </div>
      </div>

      <LifecycleBar current={lifecycle} />

      {flags.length > 0 ? (
        <div className="status-flags">
          {flags.map((f) => (
            <span key={f} className="flag flag-warn">
              {f}
            </span>
          ))}
        </div>
      ) : null}

      <dl className="detail-grid">
        <Field label="ID" value={shipment.id} />
        <Field label="Tracking" value={shipment.trackingNumber} />
        <Field label="Status" value={shipment.status} />
        <Field label="Lifecycle" value={lifecycle} />
        <Field label="Current location" value={shipment.currentLocation} />
        <Field label="Current node" value={shipment.currentNode} />
        <Field
          label="Expected location"
          value={shipment.expectedLocation || shipment.expectedNode}
        />
        <Field label="Expected node" value={shipment.expectedNode} />
        <Field
          label="Actual location"
          value={shipment.actualLocation || shipment.currentLocation}
        />
        <Field
          label="Actual node"
          value={shipment.actualNode || shipment.currentNode}
        />
        <Field label="Destination" value={shipment.destination} />
        <Field label="Destination node" value={shipment.destinationNode} />
        <Field label="Assigned vehicle" value={shipment.assignedVehicleNumber} />
        <Field label="Priority" value={shipment.priority} />
        <Field label="Deadline" value={shipment.deadline} />
        <Field label="Weight" value={shipment.weight} />
        <Field
          label="Latest event"
          value={
            latestEvent
              ? `${latestEvent.type}${latestEvent.timestamp ? ` @ ${latestEvent.timestamp}` : ''}${
                  latestEvent.location ? ` · ${latestEvent.location}` : ''
                }`
              : shipment.latestEventType
                ? `${shipment.latestEventType}${
                    shipment.latestEventTime ? ` @ ${shipment.latestEventTime}` : ''
                  }`
                : null
          }
        />
      </dl>
    </section>
  );
}
