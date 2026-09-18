import { useState } from 'react';
import CandidateCard from './recovery/CandidateCard';
import { isCandidateFeasible } from './recovery/candidateUtils';

/**
 * Recovery candidate comparison panel.
 * Display / explain only — does not assign recovery or contact drivers.
 */
export default function RecoveryCandidates({
  analysis,
  loading,
  error,
  vehicles = [],
  /** Backend-persisted / assigned selected candidate id (authoritative). */
  selectedCandidateId = null,
  assignedCandidateId = null,
  /** When a candidate is expanded for inspection, preview its backend path on the map. */
  onPreviewCandidate = null,
}) {
  const [expandedId, setExpandedId] = useState(null);

  if (loading) {
    return (
      <section className="panel recovery-candidates shadow-shadow">
        <h2>Recovery vehicles</h2>
        <p className="muted">Loading recovery candidates…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel recovery-candidates shadow-shadow">
        <h2>Recovery vehicles</h2>
        <p className="error-text">{error}</p>
      </section>
    );
  }

  if (!analysis) {
    return (
      <section className="panel recovery-candidates">
        <h2>Recovery vehicles</h2>
        <p className="muted">
          Simulate an incident or run recovery analysis to load candidates.
        </p>
      </section>
    );
  }

  const candidates = analysis.candidates || [];
  const network = analysis.network || {};
  const persistedSelectedId =
    assignedCandidateId ||
    selectedCandidateId ||
    analysis.selectedRecovery?.candidateId ||
    analysis.recoveryPlan?.candidateId ||
    null;

  const feasible = candidates.filter(isCandidateFeasible);
  const rejected = candidates.filter((c) => !isCandidateFeasible(c));
  const noFeasible =
    analysis.status === 'NO_FEASIBLE_RECOVERY' ||
    (candidates.length > 0 && feasible.length === 0);

  if (!candidates.length) {
    return (
      <section className="panel recovery-candidates">
        <h2>Recovery Vehicles</h2>
        {analysis.status === 'NO_FEASIBLE_RECOVERY' ? (
          <>
            <p className="warn-text">
              <strong>NO FEASIBLE RECOVERY</strong>
            </p>
            {analysis.reasons?.length ? (
              <ul>
                {analysis.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">No candidates were returned by the API.</p>
            )}
          </>
        ) : (
          <p className="warn-text">No recovery candidates returned.</p>
        )}
      </section>
    );
  }

  const toggle = (id) => {
    setExpandedId((prev) => {
      const next = prev === id ? null : id;
      if (onPreviewCandidate) onPreviewCandidate(next);
      return next;
    });
  };

  return (
    <section className="panel recovery-candidates shadow-shadow">
      <div className="panel-header-row">
        <h2>Recovery vehicles</h2>
        <p className="muted candidate-count-summary">
          {network.candidateCount ?? candidates.length} total ·{' '}
          {network.feasibleCount ?? feasible.length} feasible
          {analysis.status ? (
            <>
              {' '}
              · <strong>{analysis.status}</strong>
            </>
          ) : null}
        </p>
      </div>

      {noFeasible ? (
        <div className="no-feasible-banner" role="status">
          <strong>NO FEASIBLE RECOVERY</strong>
          {analysis.reasons?.length ? (
            <ul>
              {analysis.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              All returned candidates were rejected by the backend.
            </p>
          )}
        </div>
      ) : null}

      {feasible.length ? (
        <div className="candidate-section">
          <h3>Feasible Candidates</h3>
          <div className="candidate-card-list">
            {feasible.map((c) => (
              <CandidateCard
                key={c.candidateId}
                candidate={c}
                network={network}
                vehicles={vehicles}
                isPersistedSelected={
                  Boolean(
                    persistedSelectedId && c.candidateId === persistedSelectedId,
                  )
                }
                expanded={expandedId === c.candidateId}
                onToggleExpand={() => toggle(c.candidateId)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {rejected.length ? (
        <div className="candidate-section">
          <h3>Rejected Candidates</h3>
          <div className="candidate-card-list">
            {rejected.map((c) => (
              <CandidateCard
                key={c.candidateId}
                candidate={c}
                network={network}
                vehicles={vehicles}
                isPersistedSelected={false}
                expanded={expandedId === c.candidateId}
                onToggleExpand={() => toggle(c.candidateId)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
