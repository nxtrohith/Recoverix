function fmt(value, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toFixed(digits);
}

export default function RecoveryCandidates({
  analysis,
  loading,
  error,
  selectedCandidateId,
}) {
  if (loading) {
    return (
      <section className="panel">
        <h2>Recovery Candidates</h2>
        <p className="muted">Running recovery analysis…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel">
        <h2>Recovery Candidates</h2>
        <p className="error-text">{error}</p>
      </section>
    );
  }

  if (!analysis) {
    return (
      <section className="panel">
        <h2>Recovery Candidates</h2>
        <p className="muted">Click “Analyze Recovery” on a shipment to load candidates.</p>
      </section>
    );
  }

  const candidates = analysis.candidates || [];
  const network = analysis.network || {};
  const selectedId =
    selectedCandidateId || analysis.selectedRecovery?.candidateId || null;

  if (!candidates.length) {
    return (
      <section className="panel">
        <h2>Recovery Candidates</h2>
        <p className="warn-text">No recovery candidates returned.</p>
        {analysis.reasons?.length ? (
          <ul>
            {analysis.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : null}
      </section>
    );
  }

  return (
    <section className="panel recovery-candidates">
      <h2>Recovery Candidates</h2>
      <p className="muted">
        Status: <strong>{analysis.status}</strong> · total{' '}
        {network.candidateCount ?? candidates.length} · feasible{' '}
        {network.feasibleCount ?? candidates.filter((c) => c.feasible).length} ·
        infeasible{' '}
        {(network.candidateCount ?? candidates.length) -
          (network.feasibleCount ?? candidates.filter((c) => c.feasible).length)}
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>State</th>
              <th>Vehicle</th>
              <th>Path</th>
              <th>Feasible</th>
              <th>Score</th>
              <th>Distance</th>
              <th>Travel Time</th>
              <th>Cost</th>
              <th>Capacity</th>
              <th>Deadline buffer</th>
              <th>Explanation</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => {
              const m = c.metrics || {};
              const isSelected = selectedId && c.candidateId === selectedId;
              let state = c.feasible ? 'FEASIBLE' : 'INFEASIBLE';
              if (isSelected) state = 'SELECTED';
              return (
                <tr
                  key={c.candidateId}
                  className={
                    isSelected
                      ? 'row-selected'
                      : c.feasible
                        ? 'row-feasible'
                        : 'row-infeasible'
                  }
                >
                  <td>
                    <span className={`badge badge-${state.toLowerCase()}`}>
                      {state}
                    </span>
                  </td>
                  <td>
                    {c.vehicleNumber || c.vehicleId}
                    <div className="cell-sub">{c.vehicleId}</div>
                  </td>
                  <td className="path-cell">
                    {(c.path || []).join(' → ') || '—'}
                  </td>
                  <td>{c.feasible ? 'yes' : `no${c.rejectionReason ? `: ${c.rejectionReason}` : ''}`}</td>
                  <td>{c.score == null ? '—' : fmt(c.score, 4)}</td>
                  <td>{fmt(m.distance)} km</td>
                  <td>{fmt(m.travelTime)} min</td>
                  <td>{fmt(m.cost, 2)}</td>
                  <td>
                    {m.availableCapacity
                      ? `${fmt(m.availableCapacity.weight, 0)} kg / ${fmt(m.availableCapacity.volume, 1)} m³`
                      : '—'}
                  </td>
                  <td>
                    {m.deadlineBuffer == null
                      ? '—'
                      : `${fmt(m.deadlineBuffer, 0)} min`}
                  </td>
                  <td className="explain-cell">{c.explanation || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
