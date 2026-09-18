export default function SearchPanel({
  shipments,
  vehicles,
  hubs,
  selectedShipmentId,
  selectedVehicleId,
  onSelectShipment,
  onSelectVehicle,
  onSelectHub,
  listError,
}) {
  return (
    <section className="search-panel panel">
      <h2>Browse</h2>
      {listError ? <p className="error-text">{listError}</p> : null}

      <div className="browse-columns">
        <div>
          <h3>Shipments ({shipments?.length ?? 0})</h3>
          {!shipments?.length ? (
            <p className="muted">No shipments loaded.</p>
          ) : (
            <ul className="browse-list">
              {shipments.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={selectedShipmentId === s.id ? 'selected' : ''}
                    onClick={() => onSelectShipment(s.id)}
                  >
                    <strong>{s.trackingNumber || s.id}</strong>
                    <span>
                      {s.status}
                      {s.destination ? ` → ${s.destination}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3>Vehicles ({vehicles?.length ?? 0})</h3>
          {!vehicles?.length ? (
            <p className="muted">No vehicles loaded.</p>
          ) : (
            <ul className="browse-list">
              {vehicles.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    className={selectedVehicleId === v.id ? 'selected' : ''}
                    onClick={() => onSelectVehicle(v.id)}
                  >
                    <strong>{v.vehicleNumber || v.id}</strong>
                    <span>
                      {v.status}
                      {v.currentLocationName ? ` @ ${v.currentLocationName}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3>Hubs ({hubs?.length ?? 0})</h3>
          {!hubs?.length ? (
            <p className="muted">No hubs loaded.</p>
          ) : (
            <ul className="browse-list">
              {hubs.slice(0, 40).map((h) => (
                <li key={h.id}>
                  <button type="button" onClick={() => onSelectHub(h)}>
                    <strong>{h.name || h.code || h.id}</strong>
                    <span>
                      {h.type}
                      {h.graphNodeKey ? ` · ${h.graphNodeKey}` : ''}
                    </span>
                  </button>
                </li>
              ))}
              {hubs.length > 40 ? (
                <li className="muted">…and {hubs.length - 40} more (use search)</li>
              ) : null}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
