import { useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import DemoCaseSwitcher from '../components/DemoCaseSwitcher'
import IncidentAlert from '../components/IncidentAlert'
import LogisticsMap from '../components/LogisticsMap'
import MetricsBar from '../components/MetricsBar'
import { PageHeader } from '@/components/ops/PageHeader'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

function normalizeStatus(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, '_')
}

export default function OverviewPage() {
  const ctx = useOutletContext()

  const kpis = useMemo(() => {
    const shipments = ctx.shipments || []
    let inTransit = 0
    let delivered = 0
    let exception = 0
    let misplaced = 0

    for (const s of shipments) {
      const st = normalizeStatus(s.status)
      const life = normalizeStatus(s.lifecycleStatus)
      if (st === 'in_transit' || st === 'intransit') inTransit += 1
      else if (st === 'delivered') delivered += 1
      else if (st === 'delayed' || st === 'exception') exception += 1

      if (
        st === 'misplaced' ||
        life === 'misplaced' ||
        s.needsRecovery ||
        s.isMisplaced
      ) {
        misplaced += 1
      } else if (
        life === 'recovery_assigned' ||
        life === 'pickup_confirmed' ||
        life === 'recovery_analysis'
      ) {
        exception += 1
      }
    }

    return { inTransit, delivered, exception, misplaced }
  }, [ctx.shipments])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        kicker="Control center"
        title="Overview"
        description="Live network health and fleet movement across Telangana"
        actions={
          <>
            <Badge variant="neutral" className="hidden font-mono text-[0.65rem] sm:inline-flex">
              API {ctx.apiBaseUrl}
            </Badge>
            {ctx.healthError ? (
              <>
                <Button type="button" size="sm" variant="neutral" onClick={ctx.refreshHealth}>
                  <RefreshCw className="size-3.5" />
                  Retry
                </Button>
                <Button type="button" size="sm" onClick={ctx.loadDashboard}>
                  Reload
                </Button>
              </>
            ) : (
              <Badge
                variant="neutral"
                className={
                  ctx.health?.status === 'ok'
                    ? 'bg-status-delivered/20'
                    : 'bg-status-delayed/25'
                }
              >
                {ctx.healthLoading
                  ? 'Connecting'
                  : ctx.health?.status === 'ok'
                    ? 'Systems live'
                    : 'Degraded'}
              </Badge>
            )}
          </>
        }
      />

      {/* Scroll shell is not flex-col: flex children were shrinking (map clipped, no overflow). */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 scrollbar sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5 pb-6">
        <MetricsBar
          hubsCount={ctx.hubs.length}
          nodesCount={ctx.graph?.nodes?.length ?? ctx.health?.graph?.nodeCount ?? null}
          edgesCount={ctx.graph?.edges?.length ?? ctx.health?.graph?.edgeCount ?? null}
          vehiclesCount={ctx.vehicles.length}
          shipmentsCount={ctx.shipments.length}
          inTransitCount={kpis.inTransit}
          deliveredCount={kpis.delivered}
          exceptionCount={kpis.exception}
          misplacedCount={kpis.misplaced}
          loading={ctx.listsLoading || ctx.graphLoading}
          error={ctx.listsError || ctx.graphError}
        />

        {ctx.showAlert ? (
          <IncidentAlert
            incident={ctx.incidentForAlert}
            shipment={ctx.selectedShipment}
            completion={ctx.completionBanner}
            recoveryAnalysis={ctx.recoveryAnalysis}
            vehicles={ctx.vehicles}
            onViewRecovery={ctx.analyzeRecovery}
            onAssign={ctx.handleAssignPersistedPlan}
            onConfirmPickup={ctx.handleConfirmPickup}
            onMarkRecovered={ctx.handleMarkRecovered}
            recovering={ctx.recoveryLoading}
            assigning={ctx.assigning}
            confirmingPickup={ctx.confirmingPickup}
            resolving={ctx.resolving}
          />
        ) : null}

        <Card className="shrink-0 overflow-hidden p-0 shadow-shadow">
          <CardHeader className="border-b-2 border-border bg-secondary-background py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Live operations map</CardTitle>
                <CardDescription>
                  Hubs, fleet positions, and active recovery paths
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <DemoCaseSwitcher
                  activeDemoCase={ctx.activeDemoCase}
                  setActiveDemoCase={ctx.setActiveDemoCase}
                  onSwitch={ctx.loadDashboard}
                />
                <Badge variant="neutral" className="uppercase tracking-[0.08em]">
                  Primary surface
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <LogisticsMap
              graph={ctx.graph}
              loading={ctx.graphLoading}
              error={ctx.graphError}
              vehicles={ctx.vehicles}
              selectedShipment={ctx.selectedShipment}
              selectedVehicle={ctx.selectedVehicle}
              recoveryAnalysis={ctx.recoveryAnalysis}
              activeIncident={ctx.incidentForAlert}
              focusNodeId={ctx.focusNodeId}
              previewCandidateId={ctx.previewCandidateId}
            />
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  )
}
