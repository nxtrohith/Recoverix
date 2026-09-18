import { GitBranch, MapPin, Network, Package, Truck } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { KpiCard } from '@/components/ops/KpiCard'

function formatValue(value, loading) {
  if (loading) return null
  if (value == null) return '—'
  return Number(value).toLocaleString('en-IN')
}

function pad2(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return String(n).padStart(2, '0')
}

export default function MetricsBar({
  hubsCount,
  nodesCount,
  edgesCount,
  vehiclesCount,
  shipmentsCount,
  inTransitCount,
  deliveredCount,
  exceptionCount,
  misplacedCount,
  loading,
  error,
}) {
  const hasShipmentBreakdown =
    inTransitCount != null ||
    deliveredCount != null ||
    exceptionCount != null ||
    misplacedCount != null

  return (
    <section aria-label="Operational metrics" className="flex flex-col gap-3">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {hasShipmentBreakdown ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <KpiCard
            featured
            tone="accent"
            label="Total shipments"
            value={formatValue(shipmentsCount, loading)}
            sub="Tracked packages"
            loading={loading}
            icon={<Package className="size-5" strokeWidth={2.2} />}
          />
          <KpiCard
            label="In transit"
            value={loading ? null : pad2(inTransitCount ?? 0)}
            sub="Moving now"
            loading={loading}
            tone="default"
          />
          <KpiCard
            label="Delivered"
            value={loading ? null : pad2(deliveredCount ?? 0)}
            sub="Closed loops"
            loading={loading}
            tone="ok"
          />
          <KpiCard
            label="Exceptions"
            value={loading ? null : pad2(exceptionCount ?? 0)}
            sub="Needs attention"
            loading={loading}
            tone="warn"
          />
          <KpiCard
            label="Misplaced"
            value={loading ? null : pad2(misplacedCount ?? 0)}
            sub="Recovery queue"
            loading={loading}
            tone="critical"
            className={misplacedCount > 0 ? 'shadow-shadow' : undefined}
          />
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
        <KpiCard
          label="Hubs"
          value={formatValue(hubsCount, loading)}
          sub="Operational locations"
          loading={loading}
          icon={<MapPin className="size-4" />}
        />
        <KpiCard
          label="Nodes"
          value={formatValue(nodesCount, loading)}
          sub="Telangana network"
          loading={loading}
          icon={<Network className="size-4" />}
        />
        <KpiCard
          label="Edges"
          value={formatValue(edgesCount, loading)}
          sub="Directed legs"
          loading={loading}
          icon={<GitBranch className="size-4" />}
        />
        <KpiCard
          label="Fleet"
          value={formatValue(vehiclesCount, loading)}
          sub="Active vehicles"
          loading={loading}
          icon={<Truck className="size-4" />}
        />
        {!hasShipmentBreakdown ? (
          <KpiCard
            label="Shipments"
            value={formatValue(shipmentsCount, loading)}
            sub="Tracked packages"
            loading={loading}
            icon={<Package className="size-4" />}
          />
        ) : null}
      </div>
    </section>
  )
}
