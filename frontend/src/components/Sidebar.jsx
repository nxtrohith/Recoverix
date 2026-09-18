import { NavLink } from 'react-router-dom'
import {
  AlertTriangle,
  LayoutDashboard,
  MapPinned,
  Package,
  RefreshCw,
  Search,
  Truck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/dashboard', end: true, label: 'Overview', icon: LayoutDashboard },
  { to: '/dashboard/shipments', label: 'Shipments', icon: Package, countKey: 'shipments' },
  { to: '/dashboard/vehicles', label: 'Fleet', icon: Truck, countKey: 'vehicles' },
  { to: '/dashboard/hubs', label: 'Hubs', icon: MapPinned, countKey: 'hubs' },
  { to: '/dashboard/recovery', label: 'Exceptions', icon: AlertTriangle, badgeKey: 'incident' },
  { to: '/dashboard/search', label: 'Search', icon: Search },
]

export default function Sidebar({
  incidentCount = 0,
  hubsCount = 0,
  vehiclesCount = 0,
  shipmentsCount = 0,
  health = null,
  healthError = null,
  healthLoading = false,
  onRefreshHealth,
  searchQuery = '',
  onSearchChange,
  onSearchSubmit,
  searchHint = '',
}) {
  const counts = {
    shipments: shipmentsCount,
    vehicles: vehiclesCount,
    hubs: hubsCount,
  }

  const statusLabel = healthLoading
    ? 'Connecting'
    : healthError
      ? 'Offline'
      : health?.status === 'ok'
        ? 'Live'
        : 'Unknown'

  const statusOk = !healthLoading && !healthError && health?.status === 'ok'

  return (
    <aside
      className="flex w-[var(--sidebar-w)] shrink-0 flex-col border-r-2 border-border bg-secondary-background max-md:w-full max-md:border-r-0 max-md:border-b-2"
      aria-label="Main navigation"
    >
      <div className="border-b-2 border-border px-4 py-4">
        <div className="flex items-center gap-3">
          <div
            className="flex size-10 items-center justify-center rounded-base border-2 border-border bg-main shadow-shadow"
            aria-hidden
          >
            <Truck className="size-5" strokeWidth={2.25} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-heading tracking-tight">SH-205</p>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Ops control
            </p>
          </div>
        </div>
      </div>

      <form
        className="border-b-2 border-border p-3"
        onSubmit={(e) => {
          e.preventDefault()
          onSearchSubmit?.()
        }}
      >
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="Shipment, vehicle, hub…"
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            aria-label="Global search"
            className="h-9 pl-9 text-sm"
          />
        </div>
        {searchHint ? (
          <p className="mt-2 text-xs text-muted-foreground">{searchHint}</p>
        ) : null}
      </form>

      <nav className="flex-1 overflow-y-auto p-3 scrollbar">
        <p className="mb-2 px-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Operations
        </p>
        <ul className="flex flex-col gap-1">
          {NAV.map((item) => {
            const Icon = item.icon
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-2.5 rounded-base border-2 border-transparent px-2.5 py-2 text-sm font-medium transition-all duration-200',
                      isActive
                        ? 'border-border bg-main shadow-shadow'
                        : 'hover:border-border hover:bg-background',
                    )
                  }
                >
                  <Icon className="size-4 shrink-0" strokeWidth={2.1} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badgeKey === 'incident' ? (
                    <Badge
                      variant="neutral"
                      className={cn(
                        'min-w-6 justify-center px-1.5 py-0 text-[0.65rem]',
                        incidentCount > 0 && 'bg-status-misplaced/20',
                      )}
                    >
                      {incidentCount}
                    </Badge>
                  ) : item.countKey ? (
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {counts[item.countKey] ?? 0}
                    </span>
                  ) : null}
                </NavLink>
              </li>
            )
          })}
        </ul>

        <p className="mt-6 mb-2 px-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Network
        </p>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5 rounded-base px-2.5 py-2 text-sm">
            <LayoutDashboard className="size-4 text-muted-foreground" />
            <span className="flex-1">Graph nodes</span>
            <span className="font-mono text-xs tabular-nums">
              {health?.graph?.nodeCount ?? '—'}
            </span>
          </div>
        </div>
      </nav>

      <div className="border-t-2 border-border p-3">
        <div className="flex items-center gap-2 rounded-base border-2 border-border bg-background px-2.5 py-2">
          <span
            className={cn(
              'size-2 shrink-0 rounded-[1px]',
              statusOk ? 'bg-status-delivered' : healthLoading ? 'bg-status-delayed' : 'bg-status-misplaced',
            )}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate text-xs font-medium">
            Backend {statusLabel}
            {health?.graph?.loaded ? ` · ${health.graph.nodeCount}n` : ''}
          </span>
          {onRefreshHealth ? (
            <Button
              type="button"
              variant="neutral"
              size="icon-xs"
              onClick={onRefreshHealth}
              title="Refresh backend status"
              aria-label="Refresh backend status"
              className="shadow-none"
            >
              <RefreshCw className="size-3.5" />
            </Button>
          ) : null}
        </div>
        <NavLink
          to="/"
          className="mt-2 block px-1 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground"
        >
          ← Landing
        </NavLink>
      </div>
    </aside>
  )
}
