import {
  formatEventTime,
  getRecoveryTimelineSteps,
  recoveryEventDescription,
  recoveryEventLabel,
  recoveryStatusContext,
  recoveryStatusWaitingHint,
  recoveryStepLabel,
  resolveRecoveryDisplayStatus,
  selectRecoveryEvents,
  shouldShowRecoveryTimeline,
} from './recoveryStatus';

/**
 * Operator-facing recovery lifecycle timeline + event history.
 * Maps backend incident/lifecycle/shipment events — does not invent workflow state.
 *
 * @param {{
 *   shipment?: import('../../types/api.ts').Shipment | null,
 *   incident?: import('../../types/api.ts').Incident | null,
 *   lifecycleStatus?: string | null,
 *   driverNotification?: import('../../types/api.ts').DriverNotification | null,
 *   loading?: boolean,
 *   eventsLoading?: boolean,
 *   error?: string | null,
 * }} props
 */
export default function RecoveryTimeline({
  shipment = null,
  incident = null,
  lifecycleStatus = null,
  driverNotification = null,
  loading = false,
  eventsLoading = false,
  error = null,
  hideTitle = false,
}) {
  const current = resolveRecoveryDisplayStatus({
    shipment,
    incident,
    lifecycleStatus,
    driverNotification,
  });

  const visible = shouldShowRecoveryTimeline({
    shipment,
    incident,
    lifecycleStatus,
  });

  // Keep prior valid status while refreshing — only blank when nothing known
  if (!visible && !loading && !current) {
    return null;
  }

  if (!visible && !current) {
    return (
      <div className="recovery-section recovery-timeline-panel" aria-busy="true">
        {hideTitle ? null : <h3>Recovery Status</h3>}
        <p className="muted">Loading recovery status…</p>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="recovery-section recovery-timeline-panel">
        {hideTitle ? null : <h3>Recovery Status</h3>}
        {error ? (
          <p className="error-text">{error}</p>
        ) : (
          <p className="muted">No active recovery status for this shipment.</p>
        )}
      </div>
    );
  }

  const steps = getRecoveryTimelineSteps(current);
  const isComplete = current === 'RESOLVED';
  const contextText = recoveryStatusContext(current);
  const waitingHint = recoveryStatusWaitingHint(current);
  const events = selectRecoveryEvents(shipment?.events);
  const showEventsSection = eventsLoading || events.length > 0 || Boolean(shipment);

  return (
    <div
      className="recovery-section recovery-timeline-panel"
      aria-label={`Recovery status ${current}`}
      aria-busy={loading || undefined}
    >
      <div className="panel-header-row">
        {hideTitle ? <span /> : <h3>Recovery Status</h3>}
        <span className={`flag ${isComplete ? 'flag-ok' : 'flag-warn'}`}>
          {isComplete ? 'RECOVERY COMPLETE' : recoveryStepLabel(current)}
        </span>
      </div>

      {loading ? (
        <p className="muted recovery-refresh-hint" role="status">
          Refreshing recovery status…
        </p>
      ) : null}

      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}

      {isComplete ? (
        <div className="recovery-current-status recovery-current-complete" role="status">
          <p className="recovery-current-label">CURRENT STATUS</p>
          <p className="recovery-current-value ok-text">
            <span aria-hidden="true">✓ </span>
            RECOVERY COMPLETE
          </p>
          <p className="muted">The recovery workflow has been completed.</p>
        </div>
      ) : (
        <div className="recovery-current-status" role="status">
          <p className="recovery-current-label">CURRENT STATUS</p>
          <p className="recovery-current-value">
            <span className="recovery-current-dot" aria-hidden="true">
              ●
            </span>{' '}
            {current.replace(/_/g, ' ')}
          </p>
          {contextText ? <p className="muted">{contextText}</p> : null}
          {waitingHint ? <p className="muted">{waitingHint}</p> : null}
        </div>
      )}

      <ol className="recovery-timeline" aria-label="Recovery lifecycle">
        {steps.map((item, i) => {
          const marker =
            item.state === 'completed' ? '✓' : item.state === 'current' ? '●' : '○';
          return (
            <li
              key={item.step}
              className={`recovery-timeline-step recovery-timeline-${item.state}`}
            >
              <span className="recovery-timeline-marker" aria-hidden="true">
                {marker}
              </span>
              <span className="recovery-timeline-label">{item.label}</span>
              {i < steps.length - 1 ? (
                <span className="recovery-timeline-arrow" aria-hidden="true">
                  ↓
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      {showEventsSection ? (
        <RecoveryEventLog
          events={events}
          loading={eventsLoading}
          incident={incident}
          shipment={shipment}
        />
      ) : null}

      {incident?.status || shipment?.lifecycleStatus || incident?.lifecycleStatus ? (
        <p className="cell-sub recovery-backend-refs">
          {incident?.status ? (
            <>
              Backend incident status: <code>{incident.status}</code>
            </>
          ) : null}
          {shipment?.lifecycleStatus || incident?.lifecycleStatus ? (
            <>
              {incident?.status ? ' · ' : null}
              lifecycle:{' '}
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

/**
 * Event history from shipment.events — recovery types only.
 * Omits fabricated entries when the API returns none.
 */
function RecoveryEventLog({ events, loading, incident, shipment }) {
  return (
    <div className="recovery-event-log" aria-label="Recovery event history">
      <h4 className="recovery-event-log-title">Event history</h4>
      {loading && events.length === 0 ? (
        <p className="muted">Loading event history…</p>
      ) : null}
      {loading && events.length > 0 ? (
        <p className="muted recovery-refresh-hint">Refreshing events…</p>
      ) : null}
      {!loading && events.length === 0 ? (
        <p className="muted">
          No recovery event history returned for this shipment.
        </p>
      ) : null}
      {events.length > 0 ? (
        <ol className="recovery-event-list">
          {events.map((ev) => {
            const time = formatEventTime(ev.timestamp);
            const desc = recoveryEventDescription(ev, { incident, shipment });
            const vehicle = incident?.recoveryVehicleNumber || null;
            const driver =
              incident?.recoveryDriverId &&
              incident.recoveryDriverId !== vehicle
                ? incident.recoveryDriverId
                : null;
            const showMeta =
              (ev.type === 'recovery_started' ||
                ev.type === 'recovery_pickup_confirmed') &&
              (vehicle || driver || ev.location);

            return (
              <li
                key={ev.id || `${ev.type}-${ev.timestamp}`}
                className="recovery-event-item"
              >
                <div className="recovery-event-row">
                  <span className="recovery-event-time">{time || '—'}</span>
                  <span className="recovery-event-type">
                    {recoveryEventLabel(ev.type)}
                  </span>
                </div>
                {desc ? (
                  <p className="recovery-event-desc muted">{desc}</p>
                ) : null}
                {showMeta && !desc ? (
                  <p className="recovery-event-meta cell-sub">
                    {[
                      vehicle ? `Vehicle ${vehicle}` : null,
                      driver ? `Driver ${driver}` : null,
                      ev.location || null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
