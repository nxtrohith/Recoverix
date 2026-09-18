export default function MetricsBar({
  hubsCount,
  nodesCount,
  edgesCount,
  vehiclesCount,
  shipmentsCount,
  loading,
  error,
}) {
  const items = [
    { label: 'Hubs', value: hubsCount },
    { label: 'Nodes', value: nodesCount },
    { label: 'Edges', value: edgesCount },
    { label: 'Vehicles', value: vehiclesCount },
    { label: 'Shipments', value: shipmentsCount },
  ];

  return (
    <section className="metrics-bar" aria-label="Network metrics">
      {loading ? <span className="muted">Loading metrics…</span> : null}
      {error ? <span className="error-text">{error}</span> : null}
      <div className="metrics-grid">
        {items.map((item) => (
          <div key={item.label} className="metric">
            <span className="metric-value">
              {item.value == null ? '—' : item.value}
            </span>
            <span className="metric-label">{item.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
