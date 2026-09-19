import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import IncidentMetadata from './IncidentMetadata'
import LocationDivergence from './LocationDivergence'
import RecoveryActions from './RecoveryActions'
import RecoveryFlowStep from './RecoveryFlowStep'
import RecoveryTimeline from './RecoveryTimeline'
import RouteSummary from './RouteSummary'
import ShipmentSummary from './ShipmentSummary'
/**
 * Operator-facing recovery incident panel.
 * Progressive stepped reveal with bounce-in motion after simulate / actions.
 * Does not rank candidates or choose vehicles — assignment uses the persisted plan.
 */
export default function RecoveryIncidentView({
  shipment,
  incident = null,
  recoveryAnalysis = null,
  vehicles = [],
  driverNotification = null,
  driverCall = null,
  retryingCall = false,
  shipmentLoading = false,
  shipmentError = null,
  incidentLoading = false,
  incidentError = null,
  recoveryLoading = false,
  recoveryError = null,
  analyzing = false,
  assigning = false,
  confirmingPickup = false,
  resolving = false,
  actionError = null,
  actionFeedback = null,
  onAnalyze,
  onAssign,
  onConfirmPickup,
  onResolve,
  onRetryAction,
  onRetryCall,
  onClearActionError,
}) {
  // ShipmentPanel owns generic search/load failures; only surface them here
  // when we already have recovery context.
  const hasRecoveryContext = Boolean(
    incident ||
      shipment?.needsRecovery ||
      shipment?.isMisplaced ||
      (shipment?.lifecycleStatus && shipment.lifecycleStatus !== 'NORMAL') ||
      recoveryAnalysis,
  )

  const resolvedIncident = (() => {
    if (!shipment && !incident) return null
    const fromProp = incident
    const fromShipment = shipment?.activeIncident || null
    if (
      fromProp &&
      (!shipment?.id || !fromProp.shipmentId || fromProp.shipmentId === shipment.id)
    ) {
      return fromProp
    }
    return fromShipment
  })()

  const network = recoveryAnalysis?.network || null
  const recoveryShipment = recoveryAnalysis?.shipment || null

  const displayShipment = useMemo(() => {
    if (!shipment) return null
    if (!recoveryShipment) {
      return {
        ...shipment,
        actualLocation: shipment.actualLocation || shipment.currentLocation,
      }
    }
    return {
      ...shipment,
      actualLocation:
        shipment.actualLocation ||
        recoveryShipment.actualLocation ||
        shipment.currentLocation,
      expectedLocation:
        shipment.expectedLocation || recoveryShipment.expectedLocation,
      isMisplaced:
        shipment.isMisplaced ?? recoveryShipment.isMisplaced ?? null,
      needsRecovery:
        shipment.needsRecovery ?? recoveryShipment.needsRecovery ?? false,
      plannedRoute: shipment.plannedRoute?.length
        ? shipment.plannedRoute
        : network?.plannedRoute || shipment.plannedRoute,
    }
  }, [shipment, recoveryShipment, network])

  const lifecycle = displayShipment?.lifecycleStatus || 'NORMAL'
  const flowKey = [
    displayShipment?.id,
    lifecycle,
    resolvedIncident?.status || '',
    recoveryAnalysis ? 'analysis' : 'no-analysis',
  ].join('|')

  const inRecovery =
    displayShipment &&
    (displayShipment.needsRecovery ||
      displayShipment.isMisplaced === true ||
      (resolvedIncident && resolvedIncident.status !== 'RESOLVED') ||
      lifecycle === 'MISPLACED' ||
      lifecycle === 'RECOVERY_ANALYSIS' ||
      lifecycle === 'RECOVERY_ASSIGNED' ||
      lifecycle === 'PICKUP_CONFIRMED' ||
      lifecycle === 'RECOVERED')

  const showResolvedContext =
    resolvedIncident?.status === 'RESOLVED' || lifecycle === 'RECOVERED'

  const eligibleSteps = useMemo(() => {
    if (!displayShipment || (!inRecovery && !showResolvedContext)) return []

    const steps = [
      { id: 'summary', title: null, accent: true },
      { id: 'timeline', title: 'Recovery timeline', accent: true },
      { id: 'divergence', title: 'Location divergence' },
      { id: 'route', title: 'Route details' },
    ]

    // Call status / retry lives beside the timeline when assignment is active
    if (
      resolvedIncident?.status === 'ASSIGNED' ||
      resolvedIncident?.status === 'PICKUP_CONFIRMED' ||
      actionError ||
      actionFeedback ||
      driverCall ||
      driverNotification
    ) {
      steps.splice(2, 0, { id: 'actions', title: 'Driver & follow-up', accent: false })
    }

    if (resolvedIncident || incidentLoading) {
      steps.push({ id: 'metadata', title: 'Incident metadata' })
    }

    return steps
  }, [
    displayShipment,
    inRecovery,
    showResolvedContext,
    resolvedIncident,
    incidentLoading,
    actionError,
    actionFeedback,
    driverCall,
    driverNotification,
  ])

  const [revealedCount, setRevealedCount] = useState(0)
  const prevFlowKey = useRef('')

  // Reset / restart cascade when shipment enters a new recovery phase
  useEffect(() => {
    if (!eligibleSteps.length) {
      setRevealedCount(0)
      prevFlowKey.current = flowKey
      return
    }

    const phaseChanged = prevFlowKey.current !== flowKey
    prevFlowKey.current = flowKey

    if (phaseChanged) {
      // Summary first; timeline (with actions) reveals next
      const immediate = Math.min(1, eligibleSteps.length)
      setRevealedCount(immediate)
    }
  }, [flowKey, eligibleSteps.length])

  // Slow steady cascade for remaining diagnostic steps
  useEffect(() => {
    if (revealedCount <= 0) return
    if (revealedCount >= eligibleSteps.length) return

    const timer = setTimeout(() => {
      setRevealedCount((n) => Math.min(n + 1, eligibleSteps.length))
    }, 520)

    return () => clearTimeout(timer)
  }, [revealedCount, eligibleSteps.length, flowKey])

  if (shipmentLoading && !hasRecoveryContext && !shipment) {
    return null
  }

  if (shipmentLoading && hasRecoveryContext) {
    return (
      <section className="rounded-base border-2 border-border bg-secondary-background p-5 shadow-shadow" aria-busy="true">
        <h2 className="text-lg font-heading">Recovery incident</h2>
        <p className="mt-2 text-sm text-muted-foreground">Loading shipment…</p>
      </section>
    )
  }

  if (shipmentError && hasRecoveryContext) {
    return (
      <section className="rounded-base border-2 border-border bg-secondary-background p-5 shadow-shadow">
        <h2 className="text-lg font-heading">Recovery incident</h2>
        <p className="mt-2 text-sm text-status-misplaced">{shipmentError}</p>
      </section>
    )
  }

  if (!shipment || !displayShipment) {
    return null
  }

  if (!inRecovery && !showResolvedContext) {
    return null
  }

  const visibleSteps = eligibleSteps.slice(0, revealedCount)

  const renderStepBody = (id) => {
    switch (id) {
      case 'summary':
        return <ShipmentSummary shipment={displayShipment} />
      case 'timeline':
        return (
          <RecoveryTimeline
            shipment={displayShipment}
            incident={resolvedIncident}
            recoveryAnalysis={recoveryAnalysis}
            vehicles={vehicles}
            lifecycleStatus={displayShipment.lifecycleStatus}
            driverNotification={driverNotification}
            driverCall={driverCall}
            loading={
              (incidentLoading && !resolvedIncident) ||
              (shipmentLoading && Boolean(resolvedIncident || displayShipment))
            }
            eventsLoading={shipmentLoading && Boolean(displayShipment)}
            error={
              (incidentError && !resolvedIncident ? incidentError : null) ||
              (recoveryError && !recoveryAnalysis ? recoveryError : null)
            }
            hideTitle
            interactive
            analyzing={analyzing || recoveryLoading}
            assigning={assigning}
            confirmingPickup={confirmingPickup}
            resolving={resolving}
            onAnalyze={onAnalyze}
            onAssign={onAssign}
            onConfirmPickup={onConfirmPickup}
            onResolve={onResolve}
          />
        )
      case 'actions':
        return (
          <RecoveryActions
            shipment={displayShipment}
            incident={resolvedIncident}
            recoveryAnalysis={recoveryAnalysis}
            vehicles={vehicles}
            driverNotification={driverNotification}
            driverCall={driverCall}
            retryingCall={retryingCall}
            analyzing={analyzing || recoveryLoading}
            assigning={assigning}
            confirmingPickup={confirmingPickup}
            resolving={resolving}
            actionError={actionError}
            actionFeedback={actionFeedback}
            onAnalyze={onAnalyze}
            onAssign={onAssign}
            onConfirmPickup={onConfirmPickup}
            onResolve={onResolve}
            onRetry={onRetryAction}
            onRetryCall={onRetryCall}
            onClearError={onClearActionError}
            hideTitle
            hidePrimaryAction
          />
        )
      case 'divergence':
        return (
          <LocationDivergence
            shipment={displayShipment}
            incident={resolvedIncident}
            recoveryNetwork={network}
            hideTitle
          />
        )
      case 'route':
        return (
          <RouteSummary
            shipment={displayShipment}
            recoveryNetwork={network}
            hideTitle
          />
        )
      case 'metadata':
        if (incidentLoading) {
          return <p className="text-sm text-muted-foreground">Loading incident…</p>
        }
        if (incidentError && !resolvedIncident) {
          return <p className="text-sm text-status-misplaced">{incidentError}</p>
        }
        return (
          <IncidentMetadata
            incident={resolvedIncident}
            shipment={displayShipment}
            hideTitle
          />
        )
      default:
        return null
    }
  }

  return (
    <section
      className="space-y-3"
      aria-label="Recovery incident details"
    >
      <div className="flex flex-wrap items-end justify-between gap-2 px-0.5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-foreground">
            Exception flow
          </p>
          <p className="text-sm text-muted-foreground">
            Step boxes reveal one by one — act from the current step
          </p>
        </div>
        <p className="font-mono text-xs tabular-nums text-foreground">
          {Math.min(revealedCount, eligibleSteps.length)} / {eligibleSteps.length}
        </p>
      </div>

      <AnimatePresence mode="popLayout">
        {visibleSteps.map((step, index) => (
          <RecoveryFlowStep
            key={`${flowKey}-${step.id}`}
            step={index + 1}
            title={step.title}
            accent={step.accent}
            className="[&_.recovery-section]:mt-0 [&_.recovery-section]:border-0 [&_.recovery-section]:bg-transparent [&_.recovery-section]:p-0 [&_.recovery-section]:shadow-none"
          >
            {renderStepBody(step.id)}
          </RecoveryFlowStep>
        ))}
      </AnimatePresence>

      {recoveryLoading ? (
        <p className="text-sm text-muted-foreground">Loading recovery information…</p>
      ) : null}
      {recoveryError && !recoveryAnalysis ? (
        <p className="text-sm text-status-misplaced">{recoveryError}</p>
      ) : null}
    </section>
  )
}
