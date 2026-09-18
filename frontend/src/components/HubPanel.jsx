import { MapPinned } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'

function formatCoords(coordinates) {
  if (!coordinates) return null
  const lat = coordinates.latitude ?? coordinates.lat
  const lon =
    coordinates.longitude ?? coordinates.lng ?? coordinates.lon
  if (lat == null && lon == null) return null
  const latStr = lat != null ? Number(lat).toFixed(5) : '—'
  const lonStr = lon != null ? Number(lon).toFixed(5) : '—'
  return `${latStr}, ${lonStr}`
}

export default function HubPanel({ hub }) {
  if (!hub) {
    return (
      <EmptyState
        icon={<MapPinned className="size-5" />}
        title="Select a hub"
        description="Pick one from the network rail to inspect location and graph binding."
      />
    )
  }

  return (
    <Card className="h-full max-w-3xl shadow-shadow">
      <CardHeader className="border-b-2 border-border bg-secondary-background">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-foreground">
              Hub
            </p>
            <CardTitle className="truncate text-xl tracking-tight sm:text-2xl">
              {hub.name || hub.code || hub.id}
            </CardTitle>
          </div>
          {hub.type ? (
            <Badge variant="neutral" className="uppercase tracking-[0.08em]">
              {hub.type}
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-5">
        <DetailSection title="Identity">
          <DetailGrid>
            <DetailField label="Name" value={hub.name} />
            <DetailField label="Code" value={hub.code} mono />
            <DetailField label="Type" value={hub.type} />
            <DetailField label="ID" value={hub.id} mono />
          </DetailGrid>
        </DetailSection>

        <DetailSection title="Location">
          <DetailGrid>
            <DetailField label="City" value={hub.city} />
            <DetailField
              className="sm:col-span-2"
              label="Address"
              value={hub.address}
            />
            <DetailField
              label="Coordinates"
              value={formatCoords(hub.coordinates)}
              mono
            />
          </DetailGrid>
        </DetailSection>

        <DetailSection title="Graph binding">
          <DetailGrid>
            <DetailField
              label="Graph node key"
              value={hub.graphNodeKey}
              mono
            />
          </DetailGrid>
        </DetailSection>
      </CardContent>
    </Card>
  )
}
