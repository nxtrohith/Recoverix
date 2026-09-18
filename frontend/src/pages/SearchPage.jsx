import { useOutletContext } from 'react-router-dom'
import SearchPanel from '../components/SearchPanel'
import { PageHeader } from '@/components/ops/PageHeader'

export default function SearchPage() {
  const ctx = useOutletContext()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        kicker="Network index"
        title="Search"
        description="Find any shipment, vehicle, or hub in the operating network"
      />
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
        <SearchPanel
          shipments={ctx.shipments}
          vehicles={ctx.vehicles}
          hubs={ctx.hubs}
          selectedShipmentId={ctx.selectedShipment?.id}
          selectedVehicleId={ctx.selectedVehicle?.id}
          onSelectShipment={ctx.loadShipment}
          onSelectVehicle={ctx.loadVehicle}
          onSelectHub={(hub) => {
            if (hub.graphNodeKey) ctx.setFocusNodeId(hub.graphNodeKey)
            ctx.setSearchHint?.(
              `Focused hub ${hub.name || hub.graphNodeKey || hub.id}`,
            )
          }}
          listError={ctx.listsError}
        />
      </div>
    </div>
  )
}
