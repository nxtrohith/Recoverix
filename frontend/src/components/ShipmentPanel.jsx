import { useState } from 'react'
import { Package } from 'lucide-react'
import {
  getAvailableRecoveryAction,
  buildAssignConfirmation,
  RECOVERY_ACTION_LABELS,
} from './recovery/recoveryActions'
import { firstPresent } from './recovery/recoveryStatus'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DetailField, DetailGrid } from '@/components/ops/DetailField'
import { EmptyState } from '@/components/ops/EmptyState'
import { StatusBadge } from '@/components/ops/StatusBadge'
import { cn } from '@/lib/utils'

const LIFECYCLE_STEPS = [
  'NORMAL',
  'MISPLACED',
  'RECOVERY_ANALYSIS',
  'RECOVERY_ASSIGNED',
  'PICKUP_CONFIRMED',
  'RECOVERED',
]

function LifecycleBar({ current }) {
  const active = current || 'NORMAL'
  const idx = LIFECYCLE_STEPS.indexOf(active)
  return (
    <div
      className="flex flex-wrap gap-1.5"
      aria-label={`Lifecycle status ${active}`}
    >
      {LIFECYCLE_STEPS.map((step, i) => (
        <span
          key={step}
          className={cn(
            'rounded-base border-2 border-border px-2 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.06em] transition-colors duration-200',
            i === idx && 'bg-main shadow-shadow',
            i < idx && 'bg-status-delivered/20',
            i > idx && 'bg-secondary-background text-muted-foreground',
          )}
        >
          {step.replace(/_/g, ' ')}
        </span>
      ))}
    </div>
  )
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
  const [confirmKind, setConfirmKind] = useState(null)

  if (loading) {
    return (
      <EmptyState
        icon={<Package className="size-5" />}
        title="Loading shipment"
        description="Fetching the latest tracking and recovery state…"
      />
    )
  }

  if (error) {
    return (
      <EmptyState
        title="Couldn’t load shipment"
        description={error}
      />
    )
  }

  if (!shipment) {
    return (
      <EmptyState
        icon={<Package className="size-5" />}
        title="Select a shipment"
        description="Pick one from the manifest to inspect routing, lifecycle, and recovery actions."
      />
    )
  }

  const latestEvent = shipment.events?.[0]
  const lifecycle = shipment.lifecycleStatus || 'NORMAL'
  const flags = []
  if (shipment.needsRecovery) flags.push('NEEDS RECOVERY')
  if (lifecycle !== 'NORMAL') flags.push(lifecycle.replace(/_/g, ' '))

  const resolvedIncident = incident || shipment.activeIncident || null
  const available = getAvailableRecoveryAction({
    incident: resolvedIncident,
    shipment,
    recoveryAnalysis,
  })

  const canSimulate =
    lifecycle === 'NORMAL' || lifecycle === 'RECOVERED' || !shipment.needsRecovery
  const busy = analyzing || assigning || confirmingPickup || resolving || simulating
  const assignDetails = buildAssignConfirmation({
    analysis: recoveryAnalysis,
    vehicles,
    incident: resolvedIncident,
  })
  const pickupHub =
    firstPresent(
      resolvedIncident?.pickupNode,
      recoveryAnalysis?.recoveryPlan?.pickupNode,
      shipment.actualLocation,
      shipment.currentLocation,
    ) || '—'

  const onActionClick = (kind) => {
    if (busy) return
    if (kind === 'analyze') {
      if (onAnalyze) onAnalyze()
      return
    }
    setConfirmKind(kind)
  }

  const runConfirmed = async () => {
    const kind = confirmKind
    setConfirmKind(null)
    if (kind === 'assign' && onAssign) await onAssign()
    else if (kind === 'pickup' && onConfirmPickup) await onConfirmPickup()
    else if (kind === 'resolve' && onMarkRecovered) await onMarkRecovered()
  }

  return (
    <>
      <Card className="h-full shadow-none">
        <CardHeader className="border-b-2 border-border">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <CardTitle className="text-lg tracking-tight">
                {shipment.trackingNumber || shipment.id}
              </CardTitle>
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={shipment.status} />
                <StatusBadge status={lifecycle} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {canSimulate ? (
                <Button
                  type="button"
                  variant="neutral"
                  size="sm"
                  onClick={onSimulateIncident}
                  disabled={busy}
                >
                  {simulating ? 'Simulating…' : 'Simulate incident'}
                </Button>
              ) : null}
              {available === 'analyze' ? (
                <Button type="button" size="sm" onClick={() => onActionClick('analyze')} disabled={busy}>
                  {analyzing ? 'Analyzing…' : RECOVERY_ACTION_LABELS.analyze}
                </Button>
              ) : null}
              {available === 'assign' ? (
                <Button type="button" size="sm" onClick={() => onActionClick('assign')} disabled={busy}>
                  {assigning ? 'Assigning…' : RECOVERY_ACTION_LABELS.assign}
                </Button>
              ) : null}
              {available === 'pickup' ? (
                <Button type="button" size="sm" onClick={() => onActionClick('pickup')} disabled={busy}>
                  {confirmingPickup ? 'Confirming…' : RECOVERY_ACTION_LABELS.pickup}
                </Button>
              ) : null}
              {available === 'resolve' ? (
                <Button type="button" size="sm" onClick={() => onActionClick('resolve')} disabled={busy}>
                  {resolving ? 'Resolving…' : RECOVERY_ACTION_LABELS.resolve}
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          <LifecycleBar current={lifecycle} />

          {flags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {flags.map((f) => (
                <Badge key={f} variant="neutral" className="bg-status-delayed/25 uppercase tracking-[0.06em]">
                  {f}
                </Badge>
              ))}
            </div>
          ) : null}

          <DetailGrid>
            <DetailField label="ID" value={shipment.id} />
            <DetailField label="Tracking" value={shipment.trackingNumber} />
            <DetailField label="Status" value={shipment.status} />
            <DetailField label="Lifecycle" value={lifecycle} />
            <DetailField label="Current location" value={shipment.currentLocation} />
            <DetailField label="Current node" value={shipment.currentNode} />
            <DetailField
              label="Expected location"
              value={shipment.expectedLocation || shipment.expectedNode}
            />
            <DetailField label="Expected node" value={shipment.expectedNode} />
            <DetailField
              label="Actual location"
              value={shipment.actualLocation || shipment.currentLocation}
            />
            <DetailField
              label="Actual node"
              value={shipment.actualNode || shipment.currentNode}
            />
            <DetailField label="Destination" value={shipment.destination} />
            <DetailField label="Destination node" value={shipment.destinationNode} />
            <DetailField label="Assigned vehicle" value={shipment.assignedVehicleNumber} />
            <DetailField label="Priority" value={shipment.priority} />
            <DetailField label="Deadline" value={shipment.deadline} />
            <DetailField label="Weight" value={shipment.weight} />
            <DetailField
              className="sm:col-span-2"
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
          </DetailGrid>
        </CardContent>
      </Card>

      <Dialog open={confirmKind === 'assign'} onOpenChange={(o) => !o && setConfirmKind(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign vehicle {assignDetails.vehicleLabel}?</DialogTitle>
            <DialogDescription>Confirm the persisted recovery plan assignment.</DialogDescription>
          </DialogHeader>
          <DetailGrid className="sm:grid-cols-2">
            <DetailField label="Pickup" value={assignDetails.pickup} />
            <DetailField label="Destination" value={assignDetails.destination} />
            <DetailField label="Driver" value={assignDetails.driver} />
            <DetailField label="Type" value={assignDetails.typeLabel} />
            <DetailField label="Score" value={assignDetails.scoreLabel} />
          </DetailGrid>
          <DialogFooter>
            <Button type="button" variant="neutral" onClick={() => setConfirmKind(null)} disabled={assigning}>
              Cancel
            </Button>
            <Button type="button" onClick={runConfirmed} disabled={assigning}>
              {assigning ? 'Working…' : 'Confirm assignment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmKind === 'pickup'} onOpenChange={(o) => !o && setConfirmKind(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm pickup</DialogTitle>
            <DialogDescription>
              Confirm pickup from <strong>{pickupHub}</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="neutral" onClick={() => setConfirmKind(null)} disabled={confirmingPickup}>
              Cancel
            </Button>
            <Button type="button" onClick={runConfirmed} disabled={confirmingPickup}>
              {confirmingPickup ? 'Working…' : 'Confirm pickup'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmKind === 'resolve'} onOpenChange={(o) => !o && setConfirmKind(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve this recovery incident?</DialogTitle>
            <DialogDescription>
              The shipment has completed the recovery workflow.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="neutral" onClick={() => setConfirmKind(null)} disabled={resolving}>
              Cancel
            </Button>
            <Button type="button" onClick={runConfirmed} disabled={resolving}>
              {resolving ? 'Working…' : 'Resolve incident'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
