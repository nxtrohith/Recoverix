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
          onClearActionError={ctx.clearActionError}
        />

        {ctx.driverNotification ? (
          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">
                {ctx.driverNotification.simulated
                  ? '📞 Driver Contact (Log Fallback)'
                  : '📞 Driver Called (Sarvam)'}
              </h2>
            </div>
            <div className="panel-body">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10, fontSize: '0.8rem', color: 'var(--muted)' }}>
                <span>Channel: <strong>{ctx.driverNotification.channel}</strong></span>
                {ctx.driverNotification.callKind ? (
                  <span>Kind: <strong>{ctx.driverNotification.callKind}</strong></span>
                ) : null}
                <span>Delivered: <strong>{String(ctx.driverNotification.delivered)}</strong></span>
                {ctx.driverNotification.language ? (
                  <span>Lang: <strong>{ctx.driverNotification.language}</strong></span>
                ) : null}
                {ctx.driverNotification.simulated ? (
                  <span className="badge badge-warn">Telephony not configured</span>
                ) : null}
              </div>
              {ctx.driverNotification.detail ? (
                <p className="text-xs muted" style={{ marginBottom: 8 }}>{ctx.driverNotification.detail}</p>
              ) : null}
              <pre className="driver-message">{ctx.driverNotification.message}</pre>
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
