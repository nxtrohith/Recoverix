import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  formatEventTime,
  getRecoveryTimelineSteps,
  recoveryStatusContext,
  recoveryStatusWaitingHint,
  recoveryStepLabel,
  resolveRecoveryDisplayStatus,
  selectRecoveryEvents,
  shouldShowRecoveryTimeline,
  firstPresent,
} from './recoveryStatus'
import {
  buildAssignConfirmation,
  getAvailableRecoveryAction,
  RECOVERY_ACTION_LABELS,
} from './recoveryActions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STEP_DELAY_MS = 480

/**
 * Build factual detail rows for a lifecycle step from backend payloads only.
 */
function stepDetails(step, { shipment, incident, recoveryAnalysis, driverNotification, driverCall }) {
  const network = recoveryAnalysis?.network || {}
  const plan = recoveryAnalysis?.recoveryPlan
  const selected = recoveryAnalysis?.selectedRecovery
  const rows = []

  if (step === 'RECOVERY_REQUIRED') {
    rows.push({
      label: 'Expected hub',
      value:
        firstPresent(
          shipment?.expectedLocation,
          shipment?.expectedNode,
          network.expectedNode,
        ) || '—',
    })
    rows.push({
      label: 'Actual hub',
      value:
        firstPresent(
          shipment?.actualLocation,
          shipment?.actualNode,
          shipment?.currentLocation,
          incident?.hubName,
          network.actualNode,
        ) || '—',
    })
    rows.push({
      label: 'Tracking',
      value: shipment?.trackingNumber || '—',
    })
    if (incident?.incidentId) {
      rows.push({ label: 'Incident', value: incident.incidentId })
    }
    if (incident?.analysisStatus) {
      rows.push({ label: 'Analysis', value: incident.analysisStatus })
    }
  }

  if (step === 'ASSIGNED' || step === 'DRIVER_CONTACTED') {
    rows.push({
      label: 'Vehicle',
      value:
        firstPresent(
          incident?.recoveryVehicleNumber,
          selected?.vehicleNumber,
          plan?.driverId,
        ) || '—',
    })
    rows.push({
      label: 'Pickup',
      value:
        firstPresent(
          incident?.pickupNode,
          plan?.pickupNode,
          network.actualNode,
          shipment?.actualLocation,
        ) || '—',
    })
    rows.push({
      label: 'Destination',
      value:
        firstPresent(
          incident?.destinationNode,
          plan?.destinationNode,
          network.destinationNode,
          shipment?.destination,
        ) || '—',
    })
    const path = incident?.recoveryPath || selected?.path || []
    if (path.length) {
      rows.push({ label: 'Recovery path', value: path.join(' → ') })
    }
    if (incident?.assignedAt) {
      rows.push({ label: 'Assigned at', value: formatEventTime(incident.assignedAt) })
    }
  }

  if (step === 'DRIVER_CONTACTED') {
    rows.push({
      label: 'Call channel',
      value:
        firstPresent(
          driverCall?.channel,
          incident?.driverCallChannel,
          driverNotification?.channel,
        ) || '—',
    })
    rows.push({
      label: 'Call status',
      value:
        firstPresent(
          driverCall?.status,
          incident?.driverCallStatus,
        ) || '—',
    })
    if (incident?.driverMessage || driverNotification?.message) {
      rows.push({
        label: 'Driver message',
        value: incident?.driverMessage || driverNotification?.message,
      })
    }
  }

  if (step === 'PICKUP_CONFIRMED' || step === 'RECOVERED') {
    rows.push({
      label: 'Pickup hub',
      value:
        firstPresent(
          incident?.pickupNode,
          shipment?.actualLocation,
          shipment?.currentLocation,
        ) || '—',
    })
    if (incident?.pickupConfirmedAt) {
      rows.push({
        label: 'Confirmed at',
        value: formatEventTime(incident.pickupConfirmedAt),
      })
    }
    rows.push({
      label: 'Vehicle',
      value: incident?.recoveryVehicleNumber || '—',
    })
  }

  if (step === 'RESOLVED') {
    rows.push({
      label: 'Resolved at',
      value: formatEventTime(incident?.resolvedAt) || '—',
    })
    rows.push({
      label: 'Shipment status',
      value: shipment?.status || '—',
    })
  }

  return rows
}

/**
 * Interactive recovery timeline: each lifecycle step is a box on a dotted rail.
 * Current step hosts the operator action button (analyze / assign / pickup / resolve).
 */
export default function RecoveryTimeline({
  shipment = null,
  incident = null,
  recoveryAnalysis = null,
  vehicles = [],
  lifecycleStatus = null,
  driverNotification = null,
  driverCall = null,
  loading = false,
  eventsLoading = false,
  error = null,
  hideTitle = false,
  analyzing = false,
  assigning = false,
  confirmingPickup = false,
  resolving = false,
  onAnalyze = null,
  onAssign = null,
  onConfirmPickup = null,
  onResolve = null,
  /** When true, embed action buttons inside the current step box */
  interactive = true,
}) {
  const current = resolveRecoveryDisplayStatus({
    shipment,
    incident,
    lifecycleStatus,
    driverNotification,
  })

  const visible = shouldShowRecoveryTimeline({
    shipment,
    incident,
    lifecycleStatus,
  })

  const steps = useMemo(
    () => (current ? getRecoveryTimelineSteps(current) : []),
    [current],
  )

  const available = getAvailableRecoveryAction({
    incident,
    shipment,
    recoveryAnalysis,
    driverNotification,
  })

  const assignDetails = buildAssignConfirmation({
    analysis: recoveryAnalysis,
    vehicles,
    incident,
  })

  const [revealed, setRevealed] = useState(0)
  const revealKey = `${shipment?.id || ''}|${current || ''}|${incident?.incidentId || ''}`

  // Slow cascade: reveal one step box at a time whenever the flow resets
  useEffect(() => {
    if (!steps.length) {
      setRevealed(0)
      return
    }
    setRevealed(1)
    if (steps.length === 1) return undefined
    let n = 1
    const id = setInterval(() => {
      n += 1
      setRevealed(n)
      if (n >= steps.length) clearInterval(id)
    }, STEP_DELAY_MS)
    return () => clearInterval(id)
  }, [revealKey, steps.length])

  if (!visible && !loading && !current) return null

  if (!visible && !current) {
    return (
      <div className="recovery-step-timeline" aria-busy="true">
        {hideTitle ? null : (
          <h3 className="mb-3 text-sm font-heading tracking-tight">Recovery timeline</h3>
        )}
        <p className="text-sm text-muted-foreground">Loading recovery status…</p>
      </div>
    )
  }

  if (!current) {
    return (
      <div className="recovery-step-timeline">
        {hideTitle ? null : (
          <h3 className="mb-3 text-sm font-heading tracking-tight">Recovery timeline</h3>
        )}
        {error ? (
          <p className="text-sm text-status-misplaced">{error}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            No active recovery status for this shipment.
          </p>
        )}
      </div>
    )
  }

  const isComplete = current === 'RESOLVED'
  const contextText = recoveryStatusContext(current)
  const waitingHint = recoveryStatusWaitingHint(current)
  const events = selectRecoveryEvents(shipment?.events)

  const actionBusy =
    (available === 'analyze' && analyzing) ||
    (available === 'assign' && assigning) ||
    (available === 'pickup' && confirmingPickup) ||
    (available === 'resolve' && resolving)

  const primaryLabel =
    available === 'analyze'
      ? analyzing
        ? 'Analyzing…'
        : RECOVERY_ACTION_LABELS.analyze
      : available === 'assign'
        ? assigning
          ? 'Assigning…'
          : RECOVERY_ACTION_LABELS.assign
        : available === 'pickup'
          ? confirmingPickup
            ? 'Confirming…'
            : RECOVERY_ACTION_LABELS.pickup
          : available === 'resolve'
            ? resolving
              ? 'Resolving…'
              : RECOVERY_ACTION_LABELS.resolve
            : null

  const onPrimary = () => {
    if (!available || actionBusy) return
    if (available === 'analyze' && onAnalyze) onAnalyze()
    else if (available === 'assign' && onAssign) onAssign()
    else if (available === 'pickup' && onConfirmPickup) onConfirmPickup()
    else if (available === 'resolve' && onResolve) onResolve()
  }

  const visibleSteps = steps.slice(0, Math.max(revealed, 1))

  return (
    <div
      className="recovery-step-timeline"
      aria-label={`Recovery status ${current}`}
      aria-busy={loading || undefined}
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          {hideTitle ? null : (
            <h3 className="text-sm font-heading tracking-tight">Recovery timeline</h3>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isComplete
              ? 'Workflow complete'
              : contextText || waitingHint || 'Follow each step in order'}
          </p>
        </div>
        <Badge
          variant="neutral"
          className={cn(
            'uppercase tracking-[0.08em]',
            isComplete ? 'bg-status-delivered/25' : 'bg-status-misplaced/20',
          )}
        >
          {isComplete ? 'Complete' : recoveryStepLabel(current)}
        </Badge>
      </div>

      {loading ? (
        <p className="mb-3 text-xs text-muted-foreground" role="status">
          Refreshing recovery status…
        </p>
      ) : null}
      {error ? (
        <p className="mb-3 text-sm text-status-misplaced" role="alert">
          {error}
        </p>
      ) : null}

      <ol className="relative m-0 list-none space-y-0 p-0">
        <AnimatePresence initial={false}>
          {visibleSteps.map((item, i) => {
            const isLast = i === visibleSteps.length - 1
            const isCurrent = item.state === 'current'
            const isDone = item.state === 'completed'
            const details = stepDetails(item.step, {
              shipment,
              incident,
              recoveryAnalysis,
              driverNotification,
              driverCall,
            })
            const showAction =
              interactive && isCurrent && available && primaryLabel && !isComplete

            return (
              <motion.li
                key={item.step}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.45,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="relative flex gap-3 pb-5 last:pb-0"
              >
                {/* Rail + dots */}
                <div className="flex w-6 shrink-0 flex-col items-center">
                  <span
                    className={cn(
                      'z-[1] mt-4 size-3.5 shrink-0 rounded-full border-2 border-border',
                      isDone && 'bg-status-delivered',
                      isCurrent && 'bg-main shadow-shadow',
                      item.state === 'upcoming' && 'bg-secondary-background',
                    )}
                    aria-hidden
                  />
                  {!isLast || revealed < steps.length ? (
                    <span
                      className={cn(
                        'mt-1 w-0 flex-1 border-l-2 border-dashed',
                        isDone ? 'border-foreground/40' : 'border-border',
                      )}
                      aria-hidden
                    />
                  ) : null}
                </div>

                {/* Step box */}
                <div
                  className={cn(
                    'min-w-0 flex-1 rounded-base border-2 border-border bg-secondary-background p-3.5 transition-shadow duration-300',
                    isCurrent && 'bg-main/15 shadow-shadow',
                    item.state === 'upcoming' && 'opacity-70',
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-[0.65rem] font-bold tabular-nums text-muted-foreground">
                        STEP {String(i + 1).padStart(2, '0')}
                      </p>
                      <h4 className="mt-0.5 text-sm font-heading tracking-tight">
                        {item.label}
                      </h4>
                    </div>
                    <span
                      className={cn(
                        'rounded-base border-2 border-border px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.06em]',
                        isDone && 'bg-status-delivered/25',
                        isCurrent && 'bg-main shadow-shadow',
                        item.state === 'upcoming' && 'bg-background text-muted-foreground',
                      )}
                    >
                      {isDone ? 'Done' : isCurrent ? 'Now' : 'Next'}
                    </span>
                  </div>

                  {isCurrent && waitingHint ? (
                    <p className="mt-2 text-xs text-muted-foreground">{waitingHint}</p>
                  ) : null}

                  {details.length > 0 ? (
                    <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                      {details.map((row) => (
                        <div key={`${item.step}-${row.label}`} className="min-w-0">
                          <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                            {row.label}
                          </dt>
                          <dd className="mt-0.5 break-words font-mono text-xs text-foreground">
                            {row.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {isDone
                        ? 'Completed.'
                        : isCurrent
                          ? recoveryStatusContext(item.step) || 'In progress.'
                          : 'Waiting for earlier steps.'}
                    </p>
                  )}

                  {showAction ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t-2 border-border pt-3">
                      <Button
                        type="button"
                        size="sm"
                        onClick={onPrimary}
                        disabled={actionBusy}
                        aria-busy={actionBusy}
                      >
                        {primaryLabel}
                      </Button>
                      {available === 'assign' ? (
                        <span className="text-xs text-muted-foreground">
                          {assignDetails.vehicleLabel !== '—'
                            ? `Plan vehicle: ${assignDetails.vehicleLabel}`
                            : 'Uses persisted recovery plan'}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ol>

      {revealed < steps.length ? (
        <p className="mt-2 font-mono text-[0.65rem] text-muted-foreground">
          Revealing steps… {revealed}/{steps.length}
        </p>
      ) : null}

      {eventsLoading && events.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">Loading event history…</p>
      ) : null}
    </div>
  )
}
