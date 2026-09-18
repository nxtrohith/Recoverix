export default function Header({
  health,
  healthError,
  healthLoading,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  searchHint,
}) {
  const statusLabel = healthLoading
    ? 'checking…'
    : healthError
      ? 'offline'
      : health?.status || 'unknown';

  const statusClass = healthLoading
    ? 'status-pending'
    : healthError || health?.status !== 'ok'
      ? 'status-bad'
      : 'status-ok';

  return (
    <header className="app-header">
      <div className="brand">
        <h1>SH-205 Recovery Dashboard</h1>
        <p className="subtitle">Intelligent Shipment Piggybacking</p>
      </div>

      <div className={`system-status ${statusClass}`} title={healthError || ''}>
        <span className="status-dot" />
        <span>
          Backend: <strong>{statusLabel}</strong>
          {health?.database ? ` · DB ${health.database}` : ''}
          {health?.graph?.loaded
            ? ` · graph ${health.graph.nodeCount}n/${health.graph.edgeCount}e`
            : ''}
        </span>
      </div>

      <form
        className="global-search"
        onSubmit={(e) => {
          e.preventDefault();
          onSearchSubmit();
        }}
      >
        <input
          type="search"
          placeholder="Search shipment / vehicle / hub…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Global search"
        />
        <button type="submit">Search</button>
        {searchHint ? <span className="search-hint">{searchHint}</span> : null}
      </form>
    </header>
  );
}
