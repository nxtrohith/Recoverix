import { useOutletContext } from 'react-router-dom';
import RecoveryCandidates from '../components/RecoveryCandidates';
import { RecoveryIncidentView } from '../components/recovery';
import RecoveryPlan from '../components/RecoveryPlan';

export default function RecoveryPage() {
  const ctx = useOutletContext();
  const hasIncident =
    ctx.incidentForAlert?.status && ctx.incidentForAlert.status !== 'RESOLVED';

  return (
    <>
      {/* Top bar */}
      <div className="dashboard-topbar">
        <div>
          <div className="dashboard-topbar-title">Recovery &amp; Incidents</div>
        </div>
        <div className="dashboard-topbar-actions">
          {hasIncident ? (
            <span className="badge badge-bad">Active incident</span>
          ) : (
            <span className="badge badge-ok">No active incidents</span>
          )}
        </div>
      </div>

      {/* Page body */}
      <div className="page-padded">
        <RecoveryIncidentView
          shipment={ctx.selectedShipment}
          incident={ctx.incidentForAlert}
          recoveryAnalysis={ctx.recoveryAnalysis}
          vehicles={ctx.vehicles}
          driverNotification={ctx.driverNotification}
          driverCall={ctx.driverCall}
          retryingCall={ctx.retryingCall}
          shipmentLoading={ctx.shipmentLoading}
          shipmentError={ctx.shipmentError}
          incidentLoading={ctx.incidentsLoading && !ctx.incidentForAlert}
          incidentError={ctx.incidentsError}
          recoveryLoading={ctx.recoveryLoading}
          recoveryError={ctx.recoveryError}
          analyzing={ctx.recoveryLoading}
          assigning={ctx.assigning}
          confirmingPickup={ctx.confirmingPickup}
          resolving={ctx.resolving}
          actionError={ctx.actionError}
          actionFeedback={ctx.actionFeedback}
          onAnalyze={ctx.analyzeRecovery}
          onAssign={ctx.handleAssignPersistedPlan}
          onConfirmPickup={ctx.handleConfirmPickup}
          onResolve={ctx.handleMarkRecovered}
          onRetryAction={ctx.retryLastAction}
          onRetryCall={ctx.handleRetryDriverCall}
          onClearActionError={ctx.clearActionError}
        />

        {ctx.driverCall || ctx.driverNotification ? (
          <section className="panel" aria-label="Driver voice communication">
            <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="panel-title">
                {ctx.driverCall?.channel === 'sarvam_voice' || ctx.driverNotification?.channel === 'sarvam_voice'
                  ? '📞 Sarvam Outbound Voice Call (Telugu)'
                  : '📞 Driver Contact Status'}
              </h2>
              {ctx.handleRetryDriverCall && (ctx.incidentForAlert?.status === 'ASSIGNED' || ctx.incidentForAlert?.status === 'PICKUP_CONFIRMED') ? (
                <button
                  type="button"
                  onClick={() => ctx.handleRetryDriverCall()}
                  disabled={ctx.retryingCall}
                  className="primary"
                  style={{ fontSize: '0.78rem', padding: '4px 10px' }}
                >
                  {ctx.retryingCall ? 'Calling…' : '🔄 Retry Call'}
                </button>
              ) : null}
            </div>
            <div className="panel-body">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10, fontSize: '0.8rem', color: 'var(--muted)' }}>
                <span>
                  Status: <strong style={{
                    color: (ctx.driverCall?.status === 'initiated' || ctx.driverCall?.status === 'connected' || ctx.driverCall?.status === 'in_progress') ? '#2e7d32' : (ctx.driverCall?.status === 'failed' ? '#c62828' : 'inherit')
                  }}>{ctx.driverCall?.status || (ctx.driverNotification?.delivered ? 'delivered' : 'pending')}</strong>
                </span>
                {ctx.driverCall?.phone || ctx.driverNotification?.phone ? (
                  <span>Phone: <strong>{ctx.driverCall?.phone || ctx.driverNotification?.phone}</strong></span>
                ) : null}
                <span>Language: <strong>{ctx.driverCall?.language || ctx.driverNotification?.language || 'Telugu'}</strong></span>
                {ctx.driverCall?.call_id ? (
                  <span>Call ID: <code>{ctx.driverCall.call_id.slice(0, 8)}…</code></span>
                ) : null}
                {ctx.driverCall?.error ? (
                  <span className="badge badge-bad" style={{ marginLeft: 'auto' }}>
                    {ctx.driverCall.error}
                  </span>
                ) : null}
              </div>
              {ctx.driverNotification?.message ? (
                <pre className="driver-message">{ctx.driverNotification.message}</pre>
              ) : null}
            </div>
          </section>
        ) : null}


        <div className="recovery-grid">
          <RecoveryCandidates
            analysis={ctx.recoveryAnalysis}
            loading={ctx.recoveryLoading}
            error={ctx.recoveryError}
            vehicles={ctx.vehicles}
            selectedCandidateId={
              ctx.recoveryAnalysis?.selectedRecovery?.candidateId ||
              ctx.recoveryAnalysis?.recoveryPlan?.candidateId ||
              null
            }
            assignedCandidateId={
              ctx.incidentForAlert?.status === 'ASSIGNED' ||
              ctx.incidentForAlert?.status === 'PICKUP_CONFIRMED'
                ? ctx.incidentForAlert.selectedCandidateId
                : null
            }
            onPreviewCandidate={ctx.setPreviewCandidateId}
          />
          <RecoveryPlan
            analysis={ctx.recoveryAnalysis}
            loading={ctx.recoveryLoading}
            error={ctx.recoveryError}
            vehicles={ctx.vehicles}
            assigned={
              ctx.incidentForAlert?.status === 'ASSIGNED' ||
              ctx.incidentForAlert?.status === 'PICKUP_CONFIRMED'
            }
            pickupConfirmed={ctx.incidentForAlert?.status === 'PICKUP_CONFIRMED'}
          />
        </div>
      </div>
    </>
  );
}
