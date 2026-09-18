function strategyLabel(pickupCase) {
  if (!pickupCase) return 'Recovery';
  if (pickupCase === 'at_node' || pickupCase === 'pass_through') return 'Piggyback';
  if (pickupCase === 'detour') return 'Alternate Vehicle / Detour';
  return pickupCase;
}

export default function IncidentAlert({
  incident,
  shipment,
  completion,
  onViewRecovery,
  onConfirmPickup,
  onMarkRecovered,
  recovering,
  confirmingPickup,
  resolving,
}) {
  if (completion) {
    return (
      <section className="incident-alert incident-alert-ok" role="status">
        <div className="incident-alert-header">
          <strong>✓ Incident Resolved</strong>
        </div>
        <dl className="incident-alert-grid">
          <div>
            <dt>Shipment</dt>
            <dd>{completion.trackingNumber || shipment?.trackingNumber || '—'}</dd>
          </div>
          <div>
            <dt>Recovery Vehicle</dt>
            <dd>{completion.recoveryVehicleNumber || '—'}</dd>
          </div>
          <div>
            <dt>Recovery Route</dt>
            <dd>{completion.recoveryRouteLabel || '—'}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{completion.status || 'RECOVERED'}</dd>
          </div>
        </dl>
      </section>
    );
  }

  if (!incident || incident.status === 'RESOLVED') {
    return null;
  }

  const tracking =
    shipment?.trackingNumber ||
    incident.shipmentTrackingNumber ||
    incident.shipmentId;
  const vehicle =
    incident.recoveryVehicleNumber ||
    incident.vehicleNumber ||
    shipment?.assignedVehicleNumber ||
    '—';
  const hub = incident.hubName || shipment?.currentLocation || '—';
  const dest =
    incident.destinationNode ||
    incident.destinationName ||
    shipment?.destination ||
    '—';

  const isAssigned = incident.status === 'ASSIGNED';
  const isPickupConfirmed = incident.status === 'PICKUP_CONFIRMED';
  const isRecoveryActive = isAssigned || isPickupConfirmed;

  let headline = '⚠ RECOVERY REQUIRED';
  if (isPickupConfirmed) headline = '✓ PICKUP CONFIRMED (SIMULATED)';
  else if (isAssigned) headline = '⟳ RECOVERY ASSIGNED · DRIVER CONTACTED';

  return (
    <section
      className={`incident-alert ${
        isPickupConfirmed
          ? 'incident-alert-ok'
          : isAssigned
            ? 'incident-alert-assigned'
            : 'incident-alert-warn'
      }`}
      role="alert"
    >
      <div className="incident-alert-header">
        <strong>{headline}</strong>
        <span className="muted">
          {incident.incidentType || 'MISPLACED_SHIPMENT'} · {incident.incidentId}
        </span>
      </div>
      <dl className="incident-alert-grid">
        <div>
          <dt>Shipment</dt>
          <dd>{tracking}</dd>
        </div>
        <div>
          <dt>Vehicle</dt>
          <dd>{vehicle}</dd>
        </div>
        <div>
          <dt>Current Hub</dt>
          <dd>{hub}</dd>
        </div>
        <div>
          <dt>Destination</dt>
          <dd>{dest}</dd>
        </div>
        {isRecoveryActive && incident.pickupCase ? (
          <div>
            <dt>Strategy</dt>
            <dd>{strategyLabel(incident.pickupCase)}</dd>
          </div>
        ) : null}
        {isRecoveryActive && incident.recoveryPath?.length ? (
          <div className="incident-route">
            <dt>Recovery Route</dt>
            <dd>{incident.recoveryPath.join(' → ')}</dd>
          </div>
        ) : null}
      </dl>
      <div className="incident-alert-actions">
        {!isRecoveryActive ? (
          <>
            <span className="muted">Recovery analysis available.</span>
            <button type="button" className="primary" onClick={onViewRecovery} disabled={recovering}>
              {recovering ? 'Loading…' : 'View Recovery'}
            </button>
          </>
        ) : isAssigned ? (
          <button
            type="button"
            className="primary"
            onClick={onConfirmPickup}
            disabled={confirmingPickup}
          >
            {confirmingPickup ? 'Confirming…' : 'Confirm Pickup (Simulated)'}
          </button>
        ) : (
          <button
            type="button"
            className="primary"
            onClick={onMarkRecovered}
            disabled={resolving}
          >
            {resolving ? 'Resolving…' : 'Resolve Incident'}
          </button>
        )}
      </div>
    </section>
  );
}
