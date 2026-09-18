import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Phone } from 'lucide-react'
import {
  getAvailableRecoveryAction,
  hasPersistedRecoveryPlan,
  buildAssignConfirmation,
  RECOVERY_ACTION_LABELS,
} from './recovery/recoveryActions'
import { firstPresent } from './recovery/recoveryStatus'
import { candidateTypeLabel } from './recovery/candidateUtils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DetailField, DetailGrid } from '@/components/ops/DetailField'
import { StatusBadge } from '@/components/ops/StatusBadge'
import { cn } from '@/lib/utils'

function strategyLabel(pickupCase) {
  if (!pickupCase) return 'Recovery'
  if (pickupCase === 'at_node' || pickupCase === 'pass_through') return 'Piggyback'
  if (pickupCase === 'detour') return 'Alternate Vehicle / Detour'
  return pickupCase
}

export default function IncidentAlert({
  incident,
  shipment,
  completion,
  recoveryAnalysis = null,
  vehicles = [],
  onViewRecovery,
  onAssign,
  onConfirmPickup,
  onMarkRecovered,
  recovering,
  assigning = false,
  confirmingPickup,
  resolving,
}) {
  const [confirmKind, setConfirmKind] = useState(null)

  if (completion) {
    return (
      <Alert className="bg-status-delivered/15">
        <CheckCircle2 />
        <AlertTitle>Incident resolved</AlertTitle>
        <AlertDescription>
          <DetailGrid className="mt-3 sm:grid-cols-2 xl:grid-cols-4">
            <DetailField
              label="Shipment"
              value={completion.trackingNumber || shipment?.trackingNumber}
            />
            <DetailField
              label="Recovery vehicle"
              value={completion.recoveryVehicleNumber}
            />
            <DetailField
              label="Recovery route"
              value={completion.recoveryRouteLabel}
            />
            <DetailField label="Status" value={completion.status || 'RECOVERED'} />
          </DetailGrid>
        </AlertDescription>
      </Alert>
    )
  }

  if (!incident || incident.status === 'RESOLVED') {
    return null
  }

  const tracking =
    shipment?.trackingNumber ||
    incident.shipmentTrackingNumber ||
    incident.shipmentId
  const vehicle =
    incident.recoveryVehicleNumber ||
    incident.vehicleNumber ||
    shipment?.assignedVehicleNumber ||
    '—'
  const hub = incident.hubName || shipment?.currentLocation || '—'
  const dest =
    incident.destinationNode ||
    incident.destinationName ||
    shipment?.destination ||
    '—'

  const isAssigned = incident.status === 'ASSIGNED'
  const isPickupConfirmed = incident.status === 'PICKUP_CONFIRMED'
  const isRecoveryActive = isAssigned || isPickupConfirmed
  const available = getAvailableRecoveryAction({
    incident,
    shipment,
    recoveryAnalysis,
  })
  const busy = recovering || assigning || confirmingPickup || resolving
  const assignDetails = buildAssignConfirmation({
    analysis: recoveryAnalysis,
    vehicles,
    incident,
  })
  const pickupHub =
    firstPresent(
      incident.pickupNode,
      recoveryAnalysis?.recoveryPlan?.pickupNode,
      shipment?.actualLocation,
      shipment?.currentLocation,
      hub,
    ) || '—'

  let headline = 'Recovery required'
  if (isPickupConfirmed) headline = 'Pickup confirmed'
  else if (isAssigned) headline = 'Recovery assigned · driver contacted'

  const onPrimaryClick = () => {
    if (!available || busy) return
    if (available === 'analyze') {
      if (onViewRecovery) onViewRecovery()
      return
    }
    setConfirmKind(available)
  }

  const runConfirmed = async () => {
    const kind = confirmKind
    setConfirmKind(null)
    if (kind === 'assign' && onAssign) await onAssign()
    else if (kind === 'pickup' && onConfirmPickup) await onConfirmPickup()
    else if (kind === 'resolve' && onMarkRecovered) await onMarkRecovered()
  }

  const primaryLabel =
    available === 'analyze'
      ? recovering
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
            : null

  return (
    <>
      <Alert
        className={cn(
          isPickupConfirmed
            ? 'bg-status-delivered/15'
            : isAssigned
              ? 'bg-status-recovering/15'
              : 'bg-status-misplaced/10',
        )}
      >
        <AlertTriangle />
        <AlertTitle className="flex flex-wrap items-center gap-2">
          <span>{headline}</span>
          <StatusBadge
            status={
              isPickupConfirmed
                ? 'recovering'
                : isAssigned
                  ? 'recovering'
                  : 'misplaced'
            }
          />
        </AlertTitle>
        <AlertDescription>
          <p className="text-xs text-muted-foreground">
            {incident.incidentType || 'MISPLACED_SHIPMENT'} · {incident.incidentId}
          </p>

          <DetailGrid className="mt-3 sm:grid-cols-2 xl:grid-cols-4">
            <DetailField label="Shipment ID" value={tracking} />
            <DetailField label="Truck" value={vehicle} />
            <DetailField label="Last known location" value={hub} />
            <DetailField label="Expected destination" value={dest} />
            {isRecoveryActive && incident.pickupCase ? (
              <DetailField
                label="Strategy"
                value={strategyLabel(incident.pickupCase)}
              />
            ) : null}
            {isRecoveryActive && incident.recoveryPath?.length ? (
              <DetailField
                className="sm:col-span-2"
                label="Recovery route"
                value={incident.recoveryPath.join(' → ')}
              />
            ) : null}
          </DetailGrid>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {available === 'analyze' || available === 'assign' ? (
              <span className="text-xs text-muted-foreground">
                {available === 'assign' && hasPersistedRecoveryPlan(recoveryAnalysis)
                  ? 'Selected recovery plan ready to assign.'
                  : 'Recovery analysis available.'}
              </span>
            ) : null}
            {isAssigned && incident.driverMessage ? (
              <Badge variant="neutral" className="bg-status-delivered/20 gap-1">
                <Phone className="size-3" />
                Driver contacted
              </Badge>
            ) : null}
            {available && primaryLabel ? (
              <Button
                type="button"
                size="sm"
                onClick={onPrimaryClick}
                disabled={busy}
                className="ml-auto"
              >
                {primaryLabel}
              </Button>
            ) : null}
          </div>
        </AlertDescription>
      </Alert>

      <Dialog open={confirmKind === 'assign'} onOpenChange={(o) => !o && setConfirmKind(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign vehicle {assignDetails.vehicleLabel}?</DialogTitle>
            <DialogDescription>
              Confirm the persisted recovery plan assignment.
            </DialogDescription>
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
              Confirm that the driver has picked up the misplaced shipment from{' '}
              <strong>{pickupHub}</strong>.
              {incident.pickupCase
                ? ` · ${candidateTypeLabel(incident.pickupCase)}`
                : ''}
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
