function fmt(value, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toFixed(digits);
}

function strategyLabel(pickupCase) {
  if (pickupCase === 'at_node' || pickupCase === 'pass_through') return 'Piggyback';
  if (pickupCase === 'detour') return 'Alternate / Detour';
  if (pickupCase === 'none') return 'Direct Recovery';
  return pickupCase || '—';
}

export default function RecoveryCandidates({
  analysis,
  loading,
  error,
  selectedCandidateId,
  assignedCandidateId,
  onSelectRecovery,
  assigning,
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
        <p className="muted">
          Simulate an incident or click “Analyze Recovery” to load candidates.
        </p>
      </section>
    );
  }

  const candidates = analysis.candidates || [];
  const network = analysis.network || {};
  const selectedId =
    assignedCandidateId ||
    selectedCandidateId ||
    analysis.selectedRecovery?.candidateId ||
    null;

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
      <h2>Recovery Options</h2>
      <p className="muted">
        Status: <strong>{analysis.status}</strong> · total{' '}
        {network.candidateCount ?? candidates.length} · feasible{' '}
        {network.feasibleCount ?? candidates.filter((c) => c.feasible).length}
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>State</th>
              <th>Strategy</th>
              <th>Vehicle</th>
              <th>Path</th>
              <th>Feasible</th>
              <th>Score</th>
              <th>Distance</th>
              <th>Travel Time</th>
              <th>Cost</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => {
              const m = c.metrics || {};
              const isSelected = selectedId && c.candidateId === selectedId;
              let state = c.feasible ? 'FEASIBLE' : 'INFEASIBLE';
              if (isSelected && assignedCandidateId) state = 'ASSIGNED';
              else if (isSelected) state = 'SELECTED';
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
                  <td>{strategyLabel(c.pickupCase)}</td>
                  <td>
                    {c.vehicleNumber || c.vehicleId}
                    <div className="cell-sub">{c.vehicleId}</div>
                  </td>
                  <td className="path-cell">
                    {(c.path || []).join(' → ') || '—'}
                  </td>
                  <td>
                    {c.feasible
                      ? 'yes'
                      : `no${c.rejectionReason ? `: ${c.rejectionReason}` : ''}`}
                  </td>
                  <td>{c.score == null ? '—' : fmt(c.score, 4)}</td>
                  <td>{fmt(m.distance)} km</td>
                  <td>{fmt(m.travelTime)} min</td>
                  <td>{fmt(m.cost, 2)}</td>
                  <td>
                    {c.feasible && onSelectRecovery ? (
                      <button
                        type="button"
                        className="primary"
                        disabled={assigning || Boolean(assignedCandidateId)}
                        onClick={() => onSelectRecovery(c)}
                      >
                        {assignedCandidateId === c.candidateId
                          ? 'Assigned'
                          : assigning
                            ? 'Assigning…'
                            : 'Select Recovery'}
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
