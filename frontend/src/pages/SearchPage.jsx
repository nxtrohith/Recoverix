import { useOutletContext } from 'react-router-dom';
import SearchPanel from '../components/SearchPanel';

export default function SearchPage() {
  const ctx = useOutletContext();

  return (
    <>
      {/* Top bar */}
      <div className="dashboard-topbar">
        <div>
          <div className="dashboard-topbar-title">Search</div>
        </div>
        <div className="dashboard-topbar-actions">
          <span className="text-xs muted">Browse all shipments, vehicles &amp; hubs</span>
        </div>
      </div>

      <div className="page-padded">
        <SearchPanel
          shipments={ctx.shipments}
          vehicles={ctx.vehicles}
          hubs={ctx.hubs}
          selectedShipmentId={ctx.selectedShipment?.id}
          selectedVehicleId={ctx.selectedVehicle?.id}
          onSelectShipment={ctx.loadShipment}
          onSelectVehicle={ctx.loadVehicle}
          onSelectHub={(hub) => {
            if (hub.graphNodeKey) ctx.setFocusNodeId(hub.graphNodeKey);
            ctx.setSearchHint?.(`Focused hub ${hub.name || hub.graphNodeKey || hub.id}`);
          }}
          listError={ctx.listsError}
        />
      </div>
    </>
  );
}
