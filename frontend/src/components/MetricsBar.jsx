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
    {
      label: 'Hubs',
      value: hubsCount,
      icon: '📍',
      sub: 'Operational locations',
    },
    {
      label: 'Graph Nodes',
      value: nodesCount,
      icon: '🔵',
      sub: 'Telangana network',
    },
    {
      label: 'Graph Edges',
      value: edgesCount,
      icon: '↔️',
      sub: 'Directed legs',
    },
    {
      label: 'Vehicles',
      value: vehiclesCount,
      icon: '🚛',
      sub: 'Active fleet',
    },
    {
      label: 'Shipments',
      value: shipmentsCount,
      icon: '📦',
      sub: 'Tracked packages',
    },
  ];

  return (
    <section aria-label="Network metrics">
      {error ? (
        <p className="error-text" style={{ marginBottom: 8 }}>
          ⚠️ {error}
        </p>
      ) : null}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 12,
        }}
      >
        {items.map((item) => (
          <div key={item.label} className="metric-card">
            <div style={{ fontSize: '1.1rem', lineHeight: 1, marginBottom: 4 }}>
              {item.icon}
            </div>
            <div className="metric-value">
              {loading ? (
                <span
                  className="skeleton"
                  style={{ display: 'inline-block', width: 40, height: 28 }}
                />
              ) : item.value == null ? (
                '—'
              ) : (
                item.value
              )}
            </div>
            <div className="metric-label">{item.label}</div>
            <div className="metric-sub">{item.sub}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
