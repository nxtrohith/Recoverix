import { Truck } from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  DetailField,
  DetailGrid,
  DetailSection,
} from '@/components/ops/DetailField'
import { EmptyState } from '@/components/ops/EmptyState'
import { StatusBadge } from '@/components/ops/StatusBadge'

export default function VehiclePanel({ vehicle, loading, error }) {
  if (loading && !vehicle) {
    return (
      <EmptyState
        icon={<Truck className="size-5" />}
        title="Loading vehicle"
        description="Fetching fleet position and capacity…"
      />
    )
  }

  if (error && !vehicle) {
    return <EmptyState title="Couldn’t load vehicle" description={error} />
  }

  if (!vehicle) {
    return (
      <EmptyState
        icon={<Truck className="size-5" />}
        title="Select a vehicle"
        description="Pick one from the fleet rail to inspect capacity and route."
      />
    )
  }


  const capacity = vehicle.capacity
  const load = vehicle.currentLoad
  const path = vehicle.currentPath

  return (
    <Card className="h-full max-w-3xl shadow-shadow">
      <CardHeader className="border-b-2 border-border bg-secondary-background">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-foreground">
              Vehicle{loading ? ' · updating…' : ''}
            </p>
            <CardTitle className="truncate text-xl tracking-tight sm:text-2xl">
              {vehicle.vehicleNumber || vehicle.id}
            </CardTitle>
          </div>
          <StatusBadge status={vehicle.status} />
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-5">
        <DetailSection title="Identity">
          <DetailGrid>
            <DetailField label="Number" value={vehicle.vehicleNumber} />
            <DetailField label="Type" value={vehicle.type || vehicle.vehicleType} />
            <DetailField label="Status" value={vehicle.status} />
            <DetailField label="ID" value={vehicle.id} mono />
          </DetailGrid>
        </DetailSection>

        <DetailSection title="Position">
          <DetailGrid>
            <DetailField
              label="Current location"
              value={vehicle.currentLocationName}
            />
            <DetailField label="Current node" value={vehicle.currentNode} />
            <DetailField label="Destination" value={vehicle.destination} />
            <DetailField
              label="Destination node"
              value={vehicle.destinationNode}
            />
          </DetailGrid>
        </DetailSection>

        <DetailSection title="Capacity">
          <DetailGrid>
            <DetailField
              label="Capacity"
              value={
                capacity
                  ? `${capacity.weight} kg / ${capacity.volume} m³`
                  : null
              }
              mono
            />
            <DetailField
              label="Current load"
              value={load ? `${load.weight} kg / ${load.volume} m³` : null}
              mono
            />
            <DetailField
              label="Available capacity"
              value={`${vehicle.availableWeight ?? '—'} kg / ${vehicle.availableVolume ?? '—'} m³`}
              mono
            />
            <DetailField label="ETA" value={vehicle.eta} />
          </DetailGrid>
        </DetailSection>

        <DetailSection title="Route">
          <DetailGrid>
            <DetailField
              label="Assigned route"
              value={vehicle.currentRouteId}
              mono
            />
            <DetailField
              className="sm:col-span-2"
              label="Computed path"
              value={path?.length ? path.join(' → ') : null}
            />
          </DetailGrid>
        </DetailSection>
      </CardContent>
    </Card>
  )
}
