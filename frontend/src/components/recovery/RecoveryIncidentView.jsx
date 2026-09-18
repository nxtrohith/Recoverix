import IncidentMetadata from './IncidentMetadata';
import LocationDivergence from './LocationDivergence';
import RecoveryStatus from './RecoveryStatus';
import RouteSummary from './RouteSummary';
import ShipmentSummary from './ShipmentSummary';

/**
 * Operator-facing recovery incident panel.
 * Display / organization only — no candidate ranking or assignment actions.
 *
 * @param {{
 *   shipment: import('../../types/api.ts').Shipment | null,
 *   incident?: import('../../types/api.ts').Incident | null,
 *   recoveryAnalysis?: import('../../types/api.ts').RecoveryAnalysis | null,
 *   shipmentLoading?: boolean,
 *   shipmentError?: string | null,
 *   incidentLoading?: boolean,
 *   incidentError?: string | null,
 *   recoveryLoading?: boolean,
 *   recoveryError?: string | null,
 * }} props
 */
export default function RecoveryIncidentView({
  shipment,
  incident = null,
  recoveryAnalysis = null,
  shipmentLoading = false,
  shipmentError = null,
  incidentLoading = false,
  incidentError = null,
  recoveryLoading = false,
  recoveryError = null,
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

      <RecoveryStatus
        shipment={displayShipment}
        incident={resolvedIncident}
        lifecycleStatus={displayShipment.lifecycleStatus}
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
