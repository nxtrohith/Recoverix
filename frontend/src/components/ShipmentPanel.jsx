import { useState } from 'react';
import {
  getAvailableRecoveryAction,
  buildAssignConfirmation,
  RECOVERY_ACTION_LABELS,
} from './recovery/recoveryActions';
import { firstPresent } from './recovery/recoveryStatus';

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

export default function ShipmentPanel({
  shipment,
  incident = null,
  recoveryAnalysis = null,
  vehicles = [],
  loading,
  error,
  onAnalyze,
  analyzing,
  onSimulateIncident,
  simulating,
  onAssign,
  assigning = false,
  onConfirmPickup,
  confirmingPickup,
  onMarkRecovered,
  resolving,
}) {
  const [confirmKind, setConfirmKind] = useState(null);

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

  const resolvedIncident = incident || shipment.activeIncident || null;
  const available = getAvailableRecoveryAction({
    incident: resolvedIncident,
    shipment,
    recoveryAnalysis,
  });

  const canSimulate =
    lifecycle === 'NORMAL' || lifecycle === 'RECOVERED' || !shipment.needsRecovery;
  const busy = analyzing || assigning || confirmingPickup || resolving || simulating;
  const assignDetails = buildAssignConfirmation({
    analysis: recoveryAnalysis,
    vehicles,
    incident: resolvedIncident,
  });
  const pickupHub =
    firstPresent(
      resolvedIncident?.pickupNode,
      recoveryAnalysis?.recoveryPlan?.pickupNode,
      shipment.actualLocation,
      shipment.currentLocation,
    ) || '—';

  const onActionClick = (kind) => {
    if (busy) return;
    if (kind === 'analyze') {
      if (onAnalyze) onAnalyze();
      return;
    }
    setConfirmKind(kind);
  };

  const runConfirmed = async () => {
    const kind = confirmKind;
    setConfirmKind(null);
    if (kind === 'assign' && onAssign) await onAssign();
    else if (kind === 'pickup' && onConfirmPickup) await onConfirmPickup();
    else if (kind === 'resolve' && onMarkRecovered) await onMarkRecovered();
  };

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
              disabled={busy}
            >
              {simulating ? 'Simulating…' : 'Simulate Incident'}
            </button>
          ) : null}
          {available === 'analyze' ? (
            <button
              type="button"
              className="primary"
              onClick={() => onActionClick('analyze')}
              disabled={busy}
            >
              {analyzing ? 'Analyzing…' : RECOVERY_ACTION_LABELS.analyze}
            </button>
          ) : null}
          {available === 'assign' ? (
            <button
              type="button"
              className="primary"
              onClick={() => onActionClick('assign')}
              disabled={busy}
            >
              {assigning ? 'Assigning…' : RECOVERY_ACTION_LABELS.assign}
            </button>
          ) : null}
          {available === 'pickup' ? (
            <button
              type="button"
              className="primary"
              onClick={() => onActionClick('pickup')}
              disabled={busy}
            >
              {confirmingPickup ? 'Confirming…' : RECOVERY_ACTION_LABELS.pickup}
            </button>
          ) : null}
          {available === 'resolve' ? (
            <button
              type="button"
              className="primary"
              onClick={() => onActionClick('resolve')}
              disabled={busy}
            >
              {resolving ? 'Resolving…' : RECOVERY_ACTION_LABELS.resolve}
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
