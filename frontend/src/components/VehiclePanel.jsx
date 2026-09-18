function Field({ label, value }) {
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd>{value == null || value === '' ? '—' : String(value)}</dd>
    </div>
  );
}

export default function VehiclePanel({ vehicle, loading, error }) {
  if (loading) {
    return (
      <section className="panel">
        <h2>Vehicle</h2>
        <p className="muted">Loading vehicle…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel">
        <h2>Vehicle</h2>
        <p className="error-text">{error}</p>
      </section>
    );
  }

  if (!vehicle) {
    return (
      <section className="panel">
        <h2>Vehicle</h2>
        <p className="muted">Select a vehicle to view details.</p>
      </section>
    );
  }

  const capacity = vehicle.capacity;
  const load = vehicle.currentLoad;
  const path = vehicle.currentPath;

  return (
    <section className="panel vehicle-panel">
      <h2>Vehicle</h2>
      <dl className="detail-grid">
        <Field label="ID" value={vehicle.id} />
        <Field label="Number" value={vehicle.vehicleNumber} />
        <Field label="Status" value={vehicle.status} />
        <Field label="Type" value={vehicle.type || vehicle.vehicleType} />
        <Field label="Current location" value={vehicle.currentLocationName} />
        <Field label="Current node" value={vehicle.currentNode} />
        <Field label="Destination" value={vehicle.destination} />
        <Field label="Destination node" value={vehicle.destinationNode} />
        <Field
          label="Capacity"
          value={
            capacity
              ? `${capacity.weight} kg / ${capacity.volume} m³`
              : null
          }
        />
        <Field
          label="Current load"
          value={load ? `${load.weight} kg / ${load.volume} m³` : null}
        />
        <Field
          label="Available capacity"
          value={`${vehicle.availableWeight ?? '—'} kg / ${vehicle.availableVolume ?? '—'} m³`}
        />
        <Field label="Assigned route" value={vehicle.currentRouteId} />
        <Field label="ETA" value={vehicle.eta} />
        <Field
          label="Computed path"
          value={path?.length ? path.join(' → ') : null}
        />
      </dl>
    </section>
  );
}
