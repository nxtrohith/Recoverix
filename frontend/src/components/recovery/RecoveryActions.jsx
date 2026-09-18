import { useState } from 'react';
import {
  RECOVERY_ACTION_LABELS,
  buildAssignConfirmation,
  getAvailableRecoveryAction,
  hasPersistedRecoveryPlan,
} from './recoveryActions';
import {
  firstPresent,
  resolveRecoveryDisplayStatus,
} from './recoveryStatus';
import { candidateTypeLabel } from './candidateUtils';

/**
 * Operator recovery action panel — state-gated buttons + confirmations.
 * Server state (after refresh) determines the next available action.
 *
 * @param {{
 *   shipment: import('../../types/api.ts').Shipment | null,
 *   incident?: import('../../types/api.ts').Incident | null,
 *   recoveryAnalysis?: import('../../types/api.ts').RecoveryAnalysis | null,
 *   vehicles?: import('../../types/api.ts').Vehicle[],
 *   driverNotification?: import('../../types/api.ts').DriverNotification | null,
 *   analyzing?: boolean,
 *   assigning?: boolean,
 *   confirmingPickup?: boolean,
 *   resolving?: boolean,
 *   actionError?: string | null,
 *   actionFeedback?: string | null,
 *   onAnalyze?: () => void | Promise<void>,
 *   onAssign?: () => void | Promise<void>,
 *   onConfirmPickup?: () => void | Promise<void>,
 *   onResolve?: () => void | Promise<void>,
 *   onRetry?: () => void | Promise<void>,
 *   onClearError?: () => void,
 * }} props
 */
export default function RecoveryActions({
  shipment,
  incident = null,
  recoveryAnalysis = null,
  vehicles = [],
  driverNotification = null,
  analyzing = false,
  assigning = false,
  confirmingPickup = false,
  resolving = false,
  actionError = null,
  actionFeedback = null,
  onAnalyze,
  onAssign,
  onConfirmPickup,
  onResolve,
  onRetry,
  onClearError,
}) {
  const [confirmKind, setConfirmKind] = useState(null);

  if (!shipment && !incident) return null;

  const display = resolveRecoveryDisplayStatus({
    shipment,
    incident,
    driverNotification,
  });
  const busy = analyzing || assigning || confirmingPickup || resolving;
  const available = getAvailableRecoveryAction({
    incident,
    shipment,
    recoveryAnalysis,
    driverNotification,
  });
  const hasPlan = hasPersistedRecoveryPlan(recoveryAnalysis);

  const vehicleLabel =
    incident?.recoveryVehicleNumber ||
    recoveryAnalysis?.selectedRecovery?.vehicleNumber ||
    recoveryAnalysis?.recoveryPlan?.driverId ||
    '—';
  const pickupHub =
    firstPresent(
      incident?.pickupNode,
      recoveryAnalysis?.recoveryPlan?.pickupNode,
      recoveryAnalysis?.network?.actualNode,
      shipment?.actualLocation,
      shipment?.currentLocation,
    ) || '—';

  const assignDetails = buildAssignConfirmation({
    analysis: recoveryAnalysis,
    vehicles,
    incident,
  });

  const closeConfirm = () => setConfirmKind(null);

  const runConfirmed = async () => {
    const kind = confirmKind;
    closeConfirm();
    if (kind === 'assign' && onAssign) await onAssign();
    else if (kind === 'pickup' && onConfirmPickup) await onConfirmPickup();
    else if (kind === 'resolve' && onResolve) await onResolve();
  };

  const primaryLabel =
    available === 'analyze'
      ? analyzing
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

  const onPrimaryClick = () => {
    if (!available || busy) return;
    if (available === 'analyze') {
      if (onAnalyze) onAnalyze();
      return;
    }
    setConfirmKind(available);
  };

  const isComplete = display === 'RESOLVED';
  const driverContacted =
    Boolean(incident?.driverMessage || driverNotification) &&
    (display === 'DRIVER_CONTACTED' ||
      display === 'ASSIGNED' ||
      display === 'PICKUP_CONFIRMED' ||
      display === 'RECOVERED' ||
      display === 'RESOLVED');

  return (
    <div className="recovery-section recovery-actions" aria-label="Recovery actions">
      <h3>Recovery Actions</h3>

      {isComplete ? (
        <div className="recovery-complete-banner" role="status">
          <p className="ok-text">
            <strong>✓ RECOVERY COMPLETE</strong>
          </p>
          <p className="muted">The recovery workflow has been completed.</p>
          <p className="muted cell-sub">Recovery actions are disabled.</p>
        </div>
      ) : null}

      {!isComplete && display === 'ASSIGNED' ? (
        <p className="muted">
          Driver assigned: <strong>{vehicleLabel}</strong>
        </p>
      ) : null}

      {driverContacted ? (
        <p className="ok-text" role="status">
          ✓ Driver contacted
          {driverNotification?.channel
            ? ` (${driverNotification.channel}, simulated)`
            : ' (simulated)'}
        </p>
      ) : null}

      {actionFeedback && !actionError ? (
        <p className="ok-text" role="status">
          {actionFeedback}
        </p>
      ) : null}

      {actionError ? (
        <div className="recovery-action-error" role="alert">
          <p className="error-text">{actionError}</p>
          <p className="muted">The recovery state was not changed.</p>
          <div className="recovery-action-buttons">
            {onRetry ? (
              <button type="button" className="primary" onClick={onRetry} disabled={busy}>
                Retry
              </button>
            ) : null}
            {onClearError ? (
              <button type="button" onClick={onClearError} disabled={busy}>
                Dismiss
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {!isComplete && available && !actionError ? (
        <div className="recovery-action-buttons">
          <button
            type="button"
            className="primary"
            onClick={onPrimaryClick}
            disabled={busy}
            aria-busy={busy}
          >
            {primaryLabel}
          </button>
          {available === 'assign' && hasPlan ? (
            <span className="muted cell-sub">
              Uses the persisted selected plan
              {assignDetails.vehicleLabel
                ? ` (${assignDetails.vehicleLabel})`
                : ''}
            </span>
          ) : null}
        </div>
      ) : null}

      {!isComplete && !available && !actionError ? (
        <p className="muted">No recovery actions available for the current state.</p>
      ) : null}

      {confirmKind === 'assign' ? (
        <ConfirmOverlay
          title={`Assign Vehicle ${assignDetails.vehicleLabel}?`}
          onCancel={closeConfirm}
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
        </ConfirmOverlay>
      ) : null}

      {confirmKind === 'pickup' ? (
        <ConfirmOverlay
          title="Confirm pickup"
          onCancel={closeConfirm}
          onConfirm={runConfirmed}
          confirmLabel="Confirm Pickup"
          busy={confirmingPickup}
        >
          <p>
            Confirm that the driver has picked up the misplaced shipment from{' '}
            <strong>{pickupHub}</strong>?
          </p>
          <p className="muted cell-sub">
            Vehicle {vehicleLabel}
            {incident?.pickupCase
              ? ` · ${candidateTypeLabel(incident.pickupCase)}`
              : ''}
          </p>
        </ConfirmOverlay>
      ) : null}

      {confirmKind === 'resolve' ? (
        <ConfirmOverlay
          title="Resolve this recovery incident?"
          onCancel={closeConfirm}
          onConfirm={runConfirmed}
          confirmLabel="Resolve Incident"
          busy={resolving}
        >
          <p>The shipment has completed the recovery workflow.</p>
        </ConfirmOverlay>
      ) : null}
    </div>
  );
}

function ConfirmOverlay({
  title,
  children,
  onCancel,
  onConfirm,
  confirmLabel,
  busy = false,
}) {
  return (
    <div className="recovery-confirm" role="dialog" aria-modal="true" aria-label={title}>
      <div className="recovery-confirm-card">
        <h4>{title}</h4>
        <div className="recovery-confirm-body">{children}</div>
        <div className="recovery-action-buttons">
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
