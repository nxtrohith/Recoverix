import { useState } from 'react';
import {
  getAvailableRecoveryAction,
  hasPersistedRecoveryPlan,
  buildAssignConfirmation,
  RECOVERY_ACTION_LABELS,
} from './recovery/recoveryActions';
import { firstPresent } from './recovery/recoveryStatus';
import { candidateTypeLabel } from './recovery/candidateUtils';

function strategyLabel(pickupCase) {
  if (!pickupCase) return 'Recovery';
  if (pickupCase === 'at_node' || pickupCase === 'pass_through') return 'Piggyback';
  if (pickupCase === 'detour') return 'Alternate Vehicle / Detour';
  return pickupCase;
}

function ConfirmBlock({ title, children, onCancel, onConfirm, confirmLabel, busy }) {
  return (
    <div className="recovery-confirm" role="dialog" aria-label={title}>
      <div className="recovery-confirm-card">
        <h4>{title}</h4>
        <div className="recovery-confirm-body">{children}</div>
        <div className="recovery-action-buttons">
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function IncidentAlert({
  incident,
  shipment,
  completion,
  recoveryAnalysis = null,
  vehicles = [],
  onViewRecovery,
  onAssign,
  onConfirmPickup,
  onMarkRecovered,
  recovering,
  assigning = false,
  confirmingPickup,
  resolving,
}) {
  const [confirmKind, setConfirmKind] = useState(null);

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
        <p className="ok-text">RECOVERY COMPLETE</p>
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
  const available = getAvailableRecoveryAction({
    incident,
    shipment,
    recoveryAnalysis,
  });
  const busy = recovering || assigning || confirmingPickup || resolving;
  const assignDetails = buildAssignConfirmation({
    analysis: recoveryAnalysis,
    vehicles,
    incident,
  });
  const pickupHub =
    firstPresent(
      incident.pickupNode,
      recoveryAnalysis?.recoveryPlan?.pickupNode,
      shipment?.actualLocation,
      shipment?.currentLocation,
      hub,
    ) || '—';

  let headline = '⚠ RECOVERY REQUIRED';
  if (isPickupConfirmed) headline = '✓ PICKUP CONFIRMED (SIMULATED)';
  else if (isAssigned) headline = '⟳ RECOVERY ASSIGNED · DRIVER CONTACTED';

  const onPrimaryClick = () => {
    if (!available || busy) return;
    if (available === 'analyze') {
      if (onViewRecovery) onViewRecovery();
      return;
    }
    setConfirmKind(available);
  };

  const runConfirmed = async () => {
    const kind = confirmKind;
    setConfirmKind(null);
    if (kind === 'assign' && onAssign) await onAssign();
    else if (kind === 'pickup' && onConfirmPickup) await onConfirmPickup();
    else if (kind === 'resolve' && onMarkRecovered) await onMarkRecovered();
  };

  const primaryLabel =
    available === 'analyze'
      ? recovering
        ? 'Analyzing…'
        : RECOVERY_ACTION_LABELS.analyze
      : available === 'assign'
        ? assigning
          ? 'Assigning…'
          : RECOVERY_ACTION_LABELS.assign
        : available === 'pickup'
          ? confirmingPickup
            ? 'Confirming…'
            : RECOVERY_ACTION_LABELS.pickup
          : available === 'resolve'
            ? resolving
              ? 'Resolving…'
              : RECOVERY_ACTION_LABELS.resolve
            : null;

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
        {available === 'analyze' || available === 'assign' ? (
          <span className="muted">
            {available === 'assign' && hasPersistedRecoveryPlan(recoveryAnalysis)
              ? 'Selected recovery plan ready to assign.'
              : 'Recovery analysis available.'}
          </span>
        ) : null}
        {isAssigned && incident.driverMessage ? (
          <span className="ok-text">✓ Driver contacted</span>
        ) : null}
        {available && primaryLabel ? (
          <button
            type="button"
            className="primary"
            onClick={onPrimaryClick}
            disabled={busy}
          >
            {primaryLabel}
          </button>
        ) : null}
      </div>

      {confirmKind === 'assign' ? (
        <ConfirmBlock
          title={`Assign Vehicle ${assignDetails.vehicleLabel}?`}
          onCancel={() => setConfirmKind(null)}
          onConfirm={runConfirmed}
          confirmLabel="Confirm Assignment"
          busy={assigning}
        >
          <dl className="recovery-confirm-dl">
            <div>
              <dt>Pickup</dt>
              <dd>{assignDetails.pickup}</dd>
            </div>
            <div>
              <dt>Destination</dt>
              <dd>{assignDetails.destination}</dd>
            </div>
            <div>
              <dt>Driver</dt>
              <dd>{assignDetails.driver}</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{assignDetails.typeLabel}</dd>
            </div>
            <div>
              <dt>Score</dt>
              <dd>{assignDetails.scoreLabel}</dd>
            </div>
          </dl>
        </ConfirmBlock>
      ) : null}

      {confirmKind === 'pickup' ? (
        <ConfirmBlock
          title="Confirm pickup"
          onCancel={() => setConfirmKind(null)}
          onConfirm={runConfirmed}
          confirmLabel="Confirm Pickup"
          busy={confirmingPickup}
        >
          <p>
            Confirm that the driver has picked up the misplaced shipment from{' '}
            <strong>{pickupHub}</strong>?
          </p>
          <p className="muted cell-sub">
            Vehicle {vehicle}
            {incident.pickupCase
              ? ` · ${candidateTypeLabel(incident.pickupCase)}`
              : ''}
          </p>
        </ConfirmBlock>
      ) : null}

      {confirmKind === 'resolve' ? (
        <ConfirmBlock
          title="Resolve this recovery incident?"
          onCancel={() => setConfirmKind(null)}
          onConfirm={runConfirmed}
          confirmLabel="Resolve Incident"
          busy={resolving}
        >
          <p>The shipment has completed the recovery workflow.</p>
        </ConfirmBlock>
      ) : null}
    </section>
  );
}
