import { Package, Truck, MapPinned } from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { StatusBadge } from '@/components/ops/StatusBadge'
import { cn } from '@/lib/utils'

function BrowseColumn({ title, count, icon, children }) {
  return (
    <Card size="sm" className="min-h-0 shadow-none">
      <CardHeader className="border-b-2 border-border py-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          {icon}
          <span className="flex-1">{title}</span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {count}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[min(52vh,480px)]">{children}</ScrollArea>
      </CardContent>
    </Card>
  )
}

function BrowseButton({ selected, onClick, title, subtitle, badge }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full flex-col gap-1 border-b-2 border-border px-3 py-2.5 text-left transition-colors duration-200 last:border-b-0',
        selected ? 'bg-main' : 'hover:bg-background',
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <strong className="truncate text-sm">{title}</strong>
        {badge}
      </span>
      {subtitle ? (
        <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
      ) : null}
    </button>
  )
}

export default function SearchPanel({
  shipments,
  vehicles,
  hubs,
  selectedShipmentId,
  selectedVehicleId,
  onSelectShipment,
  onSelectVehicle,
  onSelectHub,
  listError,
}) {
  return (
    <section className="space-y-4">
      {listError ? (
        <Alert variant="destructive">
          <AlertDescription>{listError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <BrowseColumn
          title="Shipments"
          count={shipments?.length ?? 0}
          icon={<Package className="size-4" />}
        >
          {!shipments?.length ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              No shipments loaded.
            </p>
          ) : (
            shipments.map((s) => (
              <BrowseButton
                key={s.id}
                selected={selectedShipmentId === s.id}
                onClick={() => onSelectShipment(s.id)}
                title={s.trackingNumber || s.id}
                subtitle={`${s.status || '—'}${s.destination ? ` → ${s.destination}` : ''}`}
                badge={<StatusBadge status={s.status} />}
              />
            ))
          )}
        </BrowseColumn>

        <BrowseColumn
          title="Vehicles"
          count={vehicles?.length ?? 0}
          icon={<Truck className="size-4" />}
        >
          {!vehicles?.length ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              No vehicles loaded.
            </p>
          ) : (
            vehicles.map((v) => (
              <BrowseButton
                key={v.id}
                selected={selectedVehicleId === v.id}
                onClick={() => onSelectVehicle(v.id)}
                title={v.vehicleNumber || v.id}
                subtitle={`${v.status || '—'}${v.currentLocationName ? ` @ ${v.currentLocationName}` : ''}`}
                badge={<StatusBadge status={v.status} />}
              />
            ))
          )}
        </BrowseColumn>

        <BrowseColumn
          title="Hubs"
          count={hubs?.length ?? 0}
          icon={<MapPinned className="size-4" />}
        >
          {!hubs?.length ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              No hubs loaded.
            </p>
          ) : (
            <>
              {hubs.slice(0, 40).map((h) => (
                <BrowseButton
                  key={h.id}
                  onClick={() => onSelectHub(h)}
                  title={h.name || h.code || h.id}
                  subtitle={`${h.type || 'hub'}${h.graphNodeKey ? ` · ${h.graphNodeKey}` : ''}`}
                />
              ))}
              {hubs.length > 40 ? (
                <p className="px-3 py-3 text-xs text-muted-foreground">
                  …and {hubs.length - 40} more (use global search)
                </p>
              ) : null}
            </>
          )}
        </BrowseColumn>
      </div>
    </section>
  )
}
