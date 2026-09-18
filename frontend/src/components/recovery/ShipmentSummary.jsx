import { StatusBadge } from '@/components/ops/StatusBadge'
import { DetailField, DetailGrid } from '@/components/ops/DetailField'
import { firstPresent } from './recoveryStatus'

/**
 * Compact shipment identity + route endpoints for the recovery incident header.
 */
export default function ShipmentSummary({ shipment }) {
  if (!shipment) return null

  const origin = firstPresent(shipment.origin, shipment.originNode)
  const destination = firstPresent(shipment.destination, shipment.destinationNode)
  const actual = firstPresent(
    shipment.actualLocation,
    shipment.currentLocation,
    shipment.actualNode,
    shipment.currentNode,
  )
  const expected = firstPresent(shipment.expectedLocation, shipment.expectedNode)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-foreground">
            Shipment / incident
          </p>
          <h2 className="truncate text-xl font-heading tracking-tight sm:text-2xl">
            {shipment.trackingNumber || shipment.id}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={shipment.status} />
          {shipment.priority ? (
            <StatusBadge status={String(shipment.priority).toLowerCase() === 'high' ? 'critical' : 'active'}>
              {String(shipment.priority).toUpperCase()}
            </StatusBadge>
          ) : null}
        </div>
      </div>

      <DetailGrid className="gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
        <DetailField label="Shipment ID" value={shipment.id} mono />
        <DetailField label="Tracking" value={shipment.trackingNumber} />
        <DetailField label="Status" value={shipment.status} />
        <DetailField label="Priority" value={shipment.priority} />
      </DetailGrid>

      <div className="rounded-base border-2 border-border bg-background p-3">
        <DetailGrid className="sm:grid-cols-2">
          <DetailField label="Origin" value={origin} />
          <DetailField label="Destination" value={destination} />
          <DetailField label="Expected location" value={expected} />
          <DetailField label="Current / actual" value={actual} />
        </DetailGrid>
      </div>
    </div>
  )
}
