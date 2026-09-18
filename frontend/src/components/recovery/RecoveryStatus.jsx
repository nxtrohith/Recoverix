import {
  RECOVERY_DISPLAY_STEPS,
  recoveryStepIndex,
  recoveryStepLabel,
  resolveRecoveryDisplayStatus,
} from './recoveryStatus';

/**
 * Operator-facing recovery lifecycle stepper.
 * Maps backend incident/lifecycle fields — does not invent workflow states.
 */
export default function RecoveryStatus({
  shipment,
  incident,
  lifecycleStatus,
}) {
  const current = resolveRecoveryDisplayStatus({
    shipment,
    incident,
    lifecycleStatus,
  });
  const idx = recoveryStepIndex(current);

  if (!current) {
    return (
      <div className="recovery-section recovery-status">
        <h3>Recovery Status</h3>
        <p className="muted">No active recovery status for this shipment.</p>
      </div>
    );
  }

  const driverContactedIdx = RECOVERY_DISPLAY_STEPS.indexOf('DRIVER_CONTACTED');

  return (
    <div className="recovery-section recovery-status">
      <div className="panel-header-row">
        <h3>Recovery Status</h3>
        <span className="flag flag-warn">{recoveryStepLabel(current)}</span>
      </div>

      <div
        className="lifecycle-bar recovery-status-bar"
        aria-label={`Recovery status ${current}`}
      >
        {RECOVERY_DISPLAY_STEPS.map((step, i) => {
          const isActive = i === idx;
          // Once DRIVER_CONTACTED is reached, ASSIGNED is complete too
          const isDone =
            (idx >= 0 && i < idx) ||
            (step === 'ASSIGNED' && idx >= driverContactedIdx);
          return (
            <span
              key={step}
              className={`lifecycle-step ${isActive ? 'lifecycle-active' : ''} ${
                isDone ? 'lifecycle-done' : ''
              }`}
            >
              {isActive ? '● ' : ''}
              {recoveryStepLabel(step)}
            </span>
          );
        })}
      </div>

      {incident?.status ? (
        <p className="cell-sub">
          Backend incident status: <code>{incident.status}</code>
          {shipment?.lifecycleStatus || incident?.lifecycleStatus ? (
            <>
              {' '}
              · lifecycle:{' '}
              <code>
                {shipment?.lifecycleStatus || incident?.lifecycleStatus}
              </code>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
