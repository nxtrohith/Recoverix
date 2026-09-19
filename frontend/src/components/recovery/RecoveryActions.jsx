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
  driverCall = null,
  retryingCall = false,
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
  onRetryCall,
  onClearError,
  hideTitle = false,
  hidePrimaryAction = false,
}) {
  const [confirmKind, setConfirmKind] = useState(null);


  if (!shipment && !incident) return null;

  const display = resolveRecoveryDisplayStatus({
    shipment,
    incident,
    driverNotification,
  });
  const available = getAvailableRecoveryAction({
    incident,
    shipment,
    recoveryAnalysis,
    driverNotification,
  });
  const hasPlan = hasPersistedRecoveryPlan(recoveryAnalysis, incident);
  // Don't freeze Assign/Resolve while a background analyze is running.
  const busy =
    (available === 'analyze' && analyzing) ||
    (available === 'assign' && assigning) ||
    (available === 'pickup' && confirmingPickup) ||
    (available === 'resolve' && resolving);

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

  const effectiveCallStatus = (() => {
    if (driverCall?.status) {
      const s = String(driverCall.status).toLowerCase();
      if (s === 'in_progress' || s === 'connected' || s === 'answered') return 'answered';
      if (s === 'confirmed' || incident?.pickupConfirmedAt) return 'confirmed';
      if (s === 'declined' || s === 'rejected') return 'declined';
      if (s === 'failed' || driverCall.error) return 'failed';
      if (s === 'initiated' || s === 'ringing') return 'calling';
      if (s === 'not_triggered') return 'not_triggered';
      return s;
    }
    if (incident?.driverCallStatus) {
      const s = String(incident.driverCallStatus).toLowerCase();
      if (s === 'in_progress' || s === 'connected' || s === 'answered') return 'answered';
      if (s === 'confirmed' || incident?.pickupConfirmedAt) return 'confirmed';
      if (s === 'declined' || s === 'rejected') return 'declined';
      if (s === 'failed' || incident.driverCallError) return 'failed';
      if (s === 'initiated' || s === 'ringing') return 'calling';
      if (s === 'not_triggered') return 'not_triggered';
      return s;
    }
    if (driverNotification) {
      if (incident?.pickupConfirmedAt) return 'confirmed';
      if (driverNotification.delivered) return 'calling';
      return 'failed';
    }
    if (
      incident?.status === 'ASSIGNED' ||
      incident?.status === 'PICKUP_CONFIRMED' ||
      display === 'ASSIGNED' ||
      display === 'PICKUP_CONFIRMED'
    ) {
      return 'not_triggered';
    }
    return null;
  })();

  const callPhone =
    driverCall?.phone ||
    incident?.driverCallPhone ||
    driverNotification?.phone ||
    null;
  const callError =
    driverCall?.error ||
    incident?.driverCallError ||
    (driverNotification && !driverNotification.delivered ? driverNotification.detail : null);
  const callId =
    driverCall?.call_id ||
    incident?.driverCallAttemptId ||
    driverNotification?.attemptId ||
    null;

  return (
    <div className="recovery-section recovery-actions" aria-label="Recovery actions">
      {hideTitle ? null : <h3>Recovery Actions</h3>}

      {isComplete ? (
        <div className="recovery-complete-banner" role="status">
          <p className="ok-text">
            <strong>✓ RECOVERY COMPLETE</strong>
          </p>
          <p className="muted">The recovery workflow has been completed.</p>
          <p className="muted cell-sub">Recovery actions are disabled.</p>
        </div>
      ) : null}

      {!isComplete && (display === 'ASSIGNED' || incident?.status === 'ASSIGNED') ? (
        <p className="muted">
          Driver assigned: <strong>{vehicleLabel}</strong>
        </p>
      ) : null}

      {/* Sarvam Outbound Voice Call Status Card */}
      {!isComplete && effectiveCallStatus ? (
        <div
          className="recovery-call-status-card"
          role="region"
          aria-label="Driver voice call status"
          style={{
            margin: '12px 0',
            padding: '12px 14px',
            borderRadius: '8px',
            border: '1px solid var(--border, #e0e0e0)',
            background: 'var(--card-bg, #ffffff)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '6px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.1rem' }}>
                {effectiveCallStatus === 'calling' && '📞'}
                {effectiveCallStatus === 'answered' && '🟢'}
                {effectiveCallStatus === 'confirmed' && '✅'}
                {effectiveCallStatus === 'declined' && '❌'}
                {effectiveCallStatus === 'failed' && '⚠️'}
                {effectiveCallStatus === 'not_triggered' && '⚪'}
              </span>
              <strong style={{ fontSize: '0.9rem', color: 'var(--text)' }}>
                {effectiveCallStatus === 'calling' && 'Calling driver...'}
                {effectiveCallStatus === 'answered' && 'Driver answered'}
                {effectiveCallStatus === 'confirmed' && 'Driver confirmed'}
                {effectiveCallStatus === 'declined' && 'Driver declined'}
                {effectiveCallStatus === 'failed' && 'Call failed'}
                {effectiveCallStatus === 'not_triggered' && 'Call not triggered'}
              </strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: '#e8f5e9',
                  color: '#2e7d32',
                  border: '1px solid #c8e6c9',
                }}
              >
                Telugu Voice Agent
              </span>
              {onRetryCall &&
              (effectiveCallStatus === 'failed' ||
                effectiveCallStatus === 'declined' ||
                effectiveCallStatus === 'not_triggered' ||
                effectiveCallStatus === 'calling') ? (
                <button
                  type="button"
                  onClick={() => onRetryCall()}
                  disabled={retryingCall}
                  style={{
                    fontSize: '0.75rem',
                    padding: '3px 10px',
                    borderRadius: '6px',
                    cursor: retryingCall ? 'not-allowed' : 'pointer',
                    background: 'var(--accent, #1976d2)',
                    color: '#fff',
                    border: 'none',
                  }}
                >
                  {retryingCall
                    ? 'Calling…'
                    : effectiveCallStatus === 'not_triggered'
                      ? '📞 Call Driver'
                      : '🔄 Retry Call'}
                </button>
              ) : null}
            </div>
          </div>

          <div
            style={{
              fontSize: '0.78rem',
              color: 'var(--muted, #666)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              marginTop: '4px',
            }}
          >
            {callPhone ? (
              <span>
                Driver Phone: <strong>{callPhone}</strong>
              </span>
            ) : null}
            {callId ? (
              <span>
                Attempt ID: <code>{callId.slice(0, 8)}…</code>
              </span>
            ) : null}
          </div>

          {callError ? (
            <div
              style={{
                marginTop: '8px',
                padding: '6px 10px',
                borderRadius: '4px',
                background: '#ffebee',
                color: '#c62828',
                fontSize: '0.78rem',
              }}
            >
              <strong>Failure reason:</strong> {callError}
            </div>
          ) : null}

          {effectiveCallStatus === 'calling' ? (
            <p style={{ margin: '6px 0 0', fontSize: '0.76rem', color: 'var(--muted)' }}>
              Sarvam AI Voice Agent is placing an outbound call in Telugu with dynamic recovery instructions.
            </p>
          ) : null}
          {effectiveCallStatus === 'answered' ? (
            <p style={{ margin: '6px 0 0', fontSize: '0.76rem', color: '#2e7d32' }}>
              Driver answered the call and is listening to the Telugu recovery brief.
            </p>
          ) : null}
          {effectiveCallStatus === 'confirmed' ? (
            <p style={{ margin: '6px 0 0', fontSize: '0.76rem', color: '#2e7d32' }}>
              Driver confirmed assignment to pick up shipment from {pickupHub}.
            </p>
          ) : null}
        </div>
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

      {!isComplete && available && !actionError && !hidePrimaryAction ? (
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

      {!isComplete && !available && !actionError && !hidePrimaryAction ? (
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
