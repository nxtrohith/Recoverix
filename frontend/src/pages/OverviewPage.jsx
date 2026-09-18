import { useOutletContext } from 'react-router-dom';
import IncidentAlert from '../components/IncidentAlert';
import LogisticsMap from '../components/LogisticsMap';
import MetricsBar from '../components/MetricsBar';

export default function OverviewPage() {
  const ctx = useOutletContext();

  return (
    <>
      {/* Top bar */}
      <div className="dashboard-topbar">
        <div>
          <div className="dashboard-topbar-title">Overview</div>
        </div>
        <div className="dashboard-topbar-actions">
          <span className="api-base muted" style={{ fontSize: '0.75rem' }}>
            API: <code>{ctx.apiBaseUrl}</code>
          </span>
          {ctx.healthError ? (
            <>
              {' '}
              <button type="button" className="btn btn-sm" onClick={ctx.refreshHealth}>Retry</button>
              <button type="button" className="btn btn-sm" onClick={ctx.loadDashboard}>Reload</button>
            </>
          ) : null}
        </div>
      </div>

      {/* Page body */}
      <div className="page-padded">
        {/* Metrics */}
        <MetricsBar
          hubsCount={ctx.hubs.length}
          nodesCount={ctx.graph?.nodes?.length ?? ctx.health?.graph?.nodeCount ?? null}
          edgesCount={ctx.graph?.edges?.length ?? ctx.health?.graph?.edgeCount ?? null}
          vehiclesCount={ctx.vehicles.length}
          shipmentsCount={ctx.shipments.length}
          loading={ctx.listsLoading || ctx.graphLoading}
          error={ctx.listsError || ctx.graphError}
        />

        {/* Incident alert */}
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

        {/* Map */}
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
      </div>
    </>
  );
}
