import {
  RECOVERY_DISPLAY_STEPS,
  recoveryStepIndex,
  recoveryStepLabel,
  resolveRecoveryDisplayStatus,
} from './recoveryStatus';

/**
 * Operator-facing recovery lifecycle timeline.
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
  const isComplete = current === 'RESOLVED';

  return (
    <div className="recovery-section recovery-status">
      <div className="panel-header-row">
        <h3>Recovery Status</h3>
        <span className={`flag ${isComplete ? 'flag-ok' : 'flag-warn'}`}>
          {isComplete ? 'RECOVERY COMPLETE' : recoveryStepLabel(current)}
        </span>
      </div>

      <ol
        className="recovery-timeline"
        aria-label={`Recovery status ${current}`}
      >
        {RECOVERY_DISPLAY_STEPS.map((step, i) => {
          const isActive = i === idx;
          // Once DRIVER_CONTACTED is reached, ASSIGNED is complete too
          const isDone =
            (idx >= 0 && i < idx) ||
            (step === 'ASSIGNED' && idx >= driverContactedIdx) ||
            (isComplete && i <= idx);
          const marker = isDone ? '✓' : isActive ? '●' : '○';
          return (
            <li
              key={step}
              className={`recovery-timeline-step ${
                isActive ? 'recovery-timeline-active' : ''
              } ${isDone ? 'recovery-timeline-done' : ''}`}
            >
              <span className="recovery-timeline-marker" aria-hidden="true">
                {marker}
              </span>
              <span className="recovery-timeline-label">
                {recoveryStepLabel(step)}
              </span>
              {i < RECOVERY_DISPLAY_STEPS.length - 1 ? (
                <span className="recovery-timeline-arrow" aria-hidden="true">
                  ↓
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

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
