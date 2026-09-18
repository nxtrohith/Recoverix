import IncidentMetadata from './IncidentMetadata';
import LocationDivergence from './LocationDivergence';
import RecoveryActions from './RecoveryActions';
import RecoveryTimeline from './RecoveryTimeline';
import RouteSummary from './RouteSummary';
import ShipmentSummary from './ShipmentSummary';

/**
 * Operator-facing recovery incident panel.
 * Display + state-gated recovery actions (analyze → assign → pickup → resolve).
 * Does not rank candidates or choose vehicles — assignment uses the persisted plan.
 *
 * @param {{
 *   shipment: import('../../types/api.ts').Shipment | null,
 *   incident?: import('../../types/api.ts').Incident | null,
 *   recoveryAnalysis?: import('../../types/api.ts').RecoveryAnalysis | null,
 *   vehicles?: import('../../types/api.ts').Vehicle[],
 *   driverNotification?: import('../../types/api.ts').DriverNotification | null,
 *   shipmentLoading?: boolean,
 *   shipmentError?: string | null,
 *   incidentLoading?: boolean,
 *   incidentError?: string | null,
 *   recoveryLoading?: boolean,
 *   recoveryError?: string | null,
 *   analyzing?: boolean,
 *   assigning?: boolean,
 *   confirmingPickup?: boolean,
 *   resolving?: boolean,
 *   actionError?: string | null,
 *   actionFeedback?: string | null,
 *   onAnalyze?: () => void | Promise<void>,
 *   onAssign?: () => void | Promise<void>,
 *   onConfirmPickup?: () => void | Promise<void>,
 *   onResolve?: () => void | Promise<void>,
 *   onRetryAction?: () => void | Promise<void>,
 *   onClearActionError?: () => void,
 * }} props
 */
export default function RecoveryIncidentView({
  shipment,
  incident = null,
  recoveryAnalysis = null,
  vehicles = [],
  driverNotification = null,
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
  );

  if (shipmentLoading && !hasRecoveryContext && !shipment) {
    return null;
  }

  if (shipmentLoading && hasRecoveryContext) {
    return (
      <section className="panel recovery-incident-view" aria-busy="true">
        <h2>Recovery Incident</h2>
        <p className="muted">Loading shipment…</p>
      </section>
    );
  }

  if (shipmentError && hasRecoveryContext) {
    return (
      <section className="panel recovery-incident-view">
        <h2>Recovery Incident</h2>
        <p className="error-text">{shipmentError}</p>
      </section>
    );
  }

  if (!shipment) {
    return null;
  }

  const resolvedIncident = (() => {
    const fromProp = incident;
    const fromShipment = shipment.activeIncident || null;
    if (
      fromProp &&
      (!shipment.id || !fromProp.shipmentId || fromProp.shipmentId === shipment.id)
    ) {
      return fromProp;
    }
    return fromShipment;
  })();
  const network = recoveryAnalysis?.network || null;
  const recoveryShipment = recoveryAnalysis?.shipment || null;

  // Prefer shipment detail; enrich display names from recovery analysis when present
  const displayShipment = recoveryShipment
    ? {
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
        plannedRoute:
          shipment.plannedRoute?.length
            ? shipment.plannedRoute
            : network?.plannedRoute || shipment.plannedRoute,
      }
    : {
        ...shipment,
        actualLocation: shipment.actualLocation || shipment.currentLocation,
      };

  const inRecovery =
    displayShipment.needsRecovery ||
    displayShipment.isMisplaced === true ||
    (resolvedIncident && resolvedIncident.status !== 'RESOLVED') ||
    displayShipment.lifecycleStatus === 'MISPLACED' ||
    displayShipment.lifecycleStatus === 'RECOVERY_ANALYSIS' ||
    displayShipment.lifecycleStatus === 'RECOVERY_ASSIGNED' ||
    displayShipment.lifecycleStatus === 'PICKUP_CONFIRMED' ||
    displayShipment.lifecycleStatus === 'RECOVERED';

  // Still show resolved completion context when we have an incident
  const showResolvedContext =
    resolvedIncident?.status === 'RESOLVED' ||
    displayShipment.lifecycleStatus === 'RECOVERED';

  if (!inRecovery && !showResolvedContext) {
    return null;
  }

  return (
    <section
      className="panel recovery-incident-view"
      aria-label="Recovery incident details"
    >
      <ShipmentSummary shipment={displayShipment} />

      <LocationDivergence
        shipment={displayShipment}
        incident={resolvedIncident}
        recoveryNetwork={network}
      />

      <RouteSummary shipment={displayShipment} recoveryNetwork={network} />

      <RecoveryTimeline
        shipment={displayShipment}
        incident={resolvedIncident}
        lifecycleStatus={displayShipment.lifecycleStatus}
        driverNotification={driverNotification}
        loading={
          (incidentLoading && !resolvedIncident) ||
          (shipmentLoading && Boolean(resolvedIncident || displayShipment))
        }
        eventsLoading={shipmentLoading && Boolean(displayShipment)}
        error={
          (incidentError && !resolvedIncident ? incidentError : null) ||
          (recoveryError && !recoveryAnalysis ? recoveryError : null)
        }
      />

      <RecoveryActions
        shipment={displayShipment}
        incident={resolvedIncident}
        recoveryAnalysis={recoveryAnalysis}
        vehicles={vehicles}
        driverNotification={driverNotification}
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
        onClearError={onClearActionError}
      />

      {incidentLoading ? (
        <div className="recovery-section">
          <h3>Incident Metadata</h3>
          <p className="muted">Loading incident…</p>
        </div>
      ) : incidentError && !resolvedIncident ? (
        <div className="recovery-section">
          <h3>Incident Metadata</h3>
          <p className="error-text">{incidentError}</p>
        </div>
      ) : (
        <IncidentMetadata
          incident={resolvedIncident}
          shipment={displayShipment}
        />
      )}

      {recoveryLoading ? (
        <p className="muted recovery-section">Loading recovery information…</p>
      ) : null}
      {recoveryError && !recoveryAnalysis ? (
        <p className="error-text recovery-section">{recoveryError}</p>
      ) : null}
    </section>
  );
}
