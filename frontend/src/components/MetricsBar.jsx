import { CheckCircle2, Clock, Gauge, Percent } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { KpiCard } from '@/components/ops/KpiCard'
import ScoreHoverValue from '@/components/recovery/ScoreHoverValue'

function formatValue(value, loading) {
  if (loading) return null
  if (value == null) return '—'
  return Number(value).toLocaleString('en-IN')
}

function pad2(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return String(n).padStart(2, '0')
}

/** Score components are normalized ~0-1; render as a human-readable percentage. */
function formatPercent(ratio, loading) {
  if (loading) return null
  if (ratio == null || Number.isNaN(ratio)) return '—'
  return `${Math.round(Math.min(Math.max(ratio, 0), 1) * 100)}%`
}

function formatMinutes(minutes, loading) {
  if (loading) return null
  if (minutes == null || Number.isNaN(minutes)) return '—'
  if (minutes < 60) return `${Math.round(minutes)}m`
  return `${(minutes / 60).toFixed(1)}h`
}

export default function MetricsBar({
  shipmentsCount,
  inTransitCount,
  deliveredCount,
  exceptionCount,
  misplacedCount,
  loading,
  error,
  // Optimization KPIs — sourced from GET /api/incidents/stats
  optimizationScore,
  resolvedCount,
  activeRecoveryCount,
  resolutionRate,
  avgRecoveryMinutes,
  totalIncidents,
  avgComponentScores,
  statsLoading,
  statsError,
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

      {statsError ? (
        <Alert variant="destructive">
          <AlertDescription>{statsError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          featured
          tone="accent"
          label="Optimization score"
          value={
            statsLoading ? null : (
              <ScoreHoverValue
                scoreLabel={formatPercent(optimizationScore, false)}
                score={optimizationScore}
                componentScores={avgComponentScores}
              />
            )
          }
          sub={
            totalIncidents
              ? `Avg across ${totalIncidents} recovery plan${totalIncidents === 1 ? '' : 's'} — hover for factors`
              : 'Avg recovery plan fit'
          }
          loading={statsLoading}
          icon={<Gauge className="size-5" strokeWidth={2.2} />}
        />
        <KpiCard
          label="Misplaced solved"
          value={formatValue(resolvedCount, statsLoading)}
          sub="Recoveries completed"
          loading={statsLoading}
          tone="ok"
          icon={<CheckCircle2 className="size-4" />}
        />
        <KpiCard
          label="Resolution rate"
          value={formatPercent(resolutionRate, statsLoading)}
          sub={
            activeRecoveryCount
              ? `${activeRecoveryCount} still in progress`
              : 'Solved vs. total incidents'
          }
          loading={statsLoading}
          tone="default"
          icon={<Percent className="size-4" />}
        />
        <KpiCard
          label="Avg pickup time"
          value={formatMinutes(avgRecoveryMinutes, statsLoading)}
          sub="Detection to driver pickup"
          loading={statsLoading}
          tone="default"
          icon={<Clock className="size-4" />}
        />
      </div>
    </section>
  )
}
