function Field({ label, value }) {
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd>{value == null || value === '' ? '—' : String(value)}</dd>
    </div>
  );
}

export default function ShipmentPanel({
  shipment,
  loading,
  error,
  onAnalyze,
  analyzing,
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
  const flags = [];
  if (shipment.needsRecovery) flags.push('NEEDS RECOVERY');
  if (String(shipment.status || '').toLowerCase().includes('misplaced')) {
    flags.push('MISPLACED');
  }
  if (String(shipment.status || '').toLowerCase().includes('delay')) {
    flags.push('DELAYED');
  }

  return (
    <section className="panel shipment-panel">
      <div className="panel-header-row">
        <h2>Shipment</h2>
        <button
          type="button"
          className="primary"
          onClick={onAnalyze}
          disabled={analyzing}
        >
          {analyzing ? 'Analyzing…' : 'Analyze Recovery'}
        </button>
      </div>

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
        <Field label="Current location" value={shipment.currentLocation} />
        <Field label="Current node" value={shipment.currentNode} />
        <Field label="Destination" value={shipment.destination} />
        <Field label="Destination node" value={shipment.destinationNode} />
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
