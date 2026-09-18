import { useOutletContext } from 'react-router-dom'
import { Phone } from 'lucide-react'
import RecoveryCandidates from '../components/RecoveryCandidates'
import { RecoveryIncidentView } from '../components/recovery'
import RecoveryPlan from '../components/RecoveryPlan'
import { PageHeader } from '@/components/ops/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function RecoveryPage() {
  const ctx = useOutletContext()
  const hasIncident =
    ctx.incidentForAlert?.status && ctx.incidentForAlert.status !== 'RESOLVED'
  const callStatus =
    ctx.driverCall?.status ||
    (ctx.driverNotification?.delivered ? 'delivered' : ctx.driverNotification ? 'pending' : null)
  const callActive =
    callStatus === 'initiated' ||
    callStatus === 'connected' ||
    callStatus === 'in_progress'
  const callFailed = callStatus === 'failed'
  const isSarvamVoice =
    ctx.driverCall?.channel === 'sarvam_voice' ||
    ctx.driverNotification?.channel === 'sarvam_voice'
  const canRetryCall =
    Boolean(ctx.handleRetryDriverCall) &&
    (ctx.incidentForAlert?.status === 'ASSIGNED' ||
      ctx.incidentForAlert?.status === 'PICKUP_CONFIRMED')

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        kicker="Exception management"
        title="Recovery & incidents"
        description="Assess disruptions, assign recovery capacity, and close incidents"
        actions={
          hasIncident ? (
            <Badge variant="neutral" className="bg-status-misplaced/20 uppercase tracking-[0.08em]">
              Active incident
            </Badge>
          ) : (
            <Badge variant="neutral" className="bg-status-delivered/20 uppercase tracking-[0.08em]">
              No active incidents
            </Badge>
          )
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 scrollbar sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5 pb-6">
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
          <Card className="shadow-shadow">
            <CardHeader className="flex flex-row items-center justify-between gap-3 border-b-2 border-border">
              <CardTitle className="flex items-center gap-2 text-base">
                <Phone className="size-4" />
                {isSarvamVoice
                  ? 'Sarvam outbound voice call (Telugu)'
                  : ctx.driverNotification?.simulated
                    ? 'Driver contact (log fallback)'
                    : 'Driver contact status'}
              </CardTitle>
              {canRetryCall ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => ctx.handleRetryDriverCall()}
                  disabled={ctx.retryingCall}
                >
                  {ctx.retryingCall ? 'Calling…' : 'Retry call'}
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              <div className="flex flex-wrap gap-3 text-xs">
                <span>
                  Status:{' '}
                  <strong
                    className={
                      callActive
                        ? 'text-status-delivered'
                        : callFailed
                          ? 'text-status-misplaced'
                          : undefined
                    }
                  >
                    {callStatus}
                  </strong>
                </span>
                {ctx.driverCall?.phone || ctx.driverNotification?.phone ? (
                  <span>
                    Phone:{' '}
                    <strong>
                      {ctx.driverCall?.phone || ctx.driverNotification?.phone}
                    </strong>
                  </span>
                ) : null}
                <span>
                  Language:{' '}
                  <strong>
                    {ctx.driverCall?.language ||
                      ctx.driverNotification?.language ||
                      'Telugu'}
                  </strong>
                </span>
                {ctx.driverCall?.channel || ctx.driverNotification?.channel ? (
                  <span>
                    Channel:{' '}
                    <strong>
                      {ctx.driverCall?.channel || ctx.driverNotification?.channel}
                    </strong>
                  </span>
                ) : null}
                {ctx.driverNotification?.callKind ? (
                  <span>
                    Kind: <strong>{ctx.driverNotification.callKind}</strong>
                  </span>
                ) : null}
                {ctx.driverCall?.call_id ? (
                  <span>
                    Call ID:{' '}
                    <code className="font-mono">
                      {ctx.driverCall.call_id.slice(0, 8)}…
                    </code>
                  </span>
                ) : null}
                {ctx.driverNotification?.simulated ? (
                  <Badge variant="neutral" className="bg-status-delayed/25">
                    Telephony not configured
                  </Badge>
                ) : null}
                {ctx.driverCall?.error ? (
                  <Badge variant="neutral" className="bg-status-misplaced/25">
                    {ctx.driverCall.error}
                  </Badge>
                ) : null}
              </div>
              {ctx.driverNotification?.detail ? (
                <p className="text-xs text-muted-foreground">
                  {ctx.driverNotification.detail}
                </p>
              ) : null}
              {ctx.driverNotification?.message ? (
                <pre className="overflow-x-auto rounded-base border-2 border-border bg-secondary-background p-3 font-mono text-xs whitespace-pre-wrap">
                  {ctx.driverNotification.message}
                </pre>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-2">
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
      </div>
    </div>
  )
}
