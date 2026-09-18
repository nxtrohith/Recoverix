import { useOutletContext } from 'react-router-dom'
import { Truck } from 'lucide-react'
import VehiclePanel from '../components/VehiclePanel'
import { PageHeader } from '@/components/ops/PageHeader'
import { StatusBadge } from '@/components/ops/StatusBadge'
import { EmptyState } from '@/components/ops/EmptyState'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export default function VehiclesPage() {
  const ctx = useOutletContext()
  const vehicles = ctx.vehicles || []

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        kicker="Fleet directory"
        title="Vehicles"
        description="Capacity, assignments, and current network position"
        actions={
          <Badge variant="neutral" className="font-mono tabular-nums">
            {vehicles.length} in fleet
          </Badge>
        }
      />

      <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[minmax(280px,360px)_1fr]">
        <aside className="flex min-h-0 flex-col overflow-hidden border-b-2 border-border bg-secondary-background lg:border-r-2 lg:border-b-0">
          <div className="flex shrink-0 items-center justify-between border-b-2 border-border px-4 py-3">
            <h2 className="text-sm font-heading tracking-tight">Fleet</h2>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {vehicles.length}
            </span>
          </div>
          {ctx.listsError ? (
            <p className="shrink-0 border-b-2 border-border px-4 py-2 text-xs text-status-misplaced">
              {ctx.listsError}
            </p>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto scrollbar">
            {!vehicles.length ? (
              <EmptyState
                icon={<Truck className="size-5" />}
                title="No vehicles"
                description="No fleet data loaded from the API."
                className="py-12"
              />
            ) : (
              <ul className="flex flex-col gap-1 p-2">
                {vehicles.map((v) => {
                  const isSelected = ctx.selectedVehicle?.id === v.id
                  return (
                    <li key={v.id}>
                      <button
                        type="button"
                        className={cn(
                          'flex w-full items-center gap-3 rounded-base border-2 px-3 py-2.5 text-left transition-all duration-200',
                          isSelected
                            ? 'border-border bg-main shadow-shadow'
                            : 'border-transparent hover:border-border hover:bg-background',
                        )}
                        onClick={() => ctx.loadVehicle(v.id)}
                      >
                        <span
                          className="flex size-8 shrink-0 items-center justify-center rounded-base border-2 border-border bg-secondary-background"
                          aria-hidden
                        >
                          <Truck className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">
                            {v.vehicleNumber || v.id}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {v.currentLocationName
                              ? `@ ${v.currentLocationName}`
                              : v.currentNode || 'Location unknown'}
                          </span>
                        </span>
                        <StatusBadge status={v.status} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </aside>

        <main className="min-h-0 overflow-y-auto bg-background/40 p-4 sm:p-5">
          <VehiclePanel
            vehicle={ctx.selectedVehicle}
            loading={ctx.vehicleLoading}
            error={ctx.vehicleError}
          />
        </main>
      </div>
    </div>
  )
}
