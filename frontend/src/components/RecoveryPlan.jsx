function Field({ label, value }) {
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd>{value == null || value === '' ? '—' : String(value)}</dd>
    </div>
  );
}

function fmt(value, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toFixed(digits);
}

export default function RecoveryPlan({ analysis, loading, error, assigned }) {
  if (loading) {
    return (
      <section className="panel">
        <h2>Selected Recovery Plan</h2>
        <p className="muted">Waiting for analysis…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel">
        <h2>Selected Recovery Plan</h2>
        <p className="error-text">{error}</p>
      </section>
    );
  }

  if (!analysis) {
    return (
      <section className="panel">
        <h2>Selected Recovery Plan</h2>
        <p className="muted">No analysis yet.</p>
      </section>
    );
  }

  const selected = analysis.selectedRecovery;
  const selectedFull = (analysis.candidates || []).find(
    (c) => c.candidateId === selected?.candidateId,
  );

  if (analysis.status === 'NO_FEASIBLE_RECOVERY' || !selected) {
    return (
      <section className="panel">
        <h2>Selected Recovery Plan</h2>
        <p className="warn-text">No feasible recovery plan.</p>
        {analysis.selectionExplanation ? (
          <p>{analysis.selectionExplanation}</p>
        ) : null}
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

  const breakdown = selectedFull?.breakdown;
  const metrics = selectedFull?.metrics;

  return (
    <section className="panel recovery-plan">
      <h2>Selected Recovery Plan</h2>
      <p className={assigned ? 'ok-text' : 'ok-text'}>
        Status: {assigned ? 'RECOVERY_ASSIGNED' : analysis.status}
      </p>
      {analysis.selectionExplanation ? (
        <p className="muted">{analysis.selectionExplanation}</p>
      ) : null}

      <dl className="detail-grid">
        <Field label="Candidate ID" value={selected.candidateId} />
        <Field label="Vehicle ID" value={selected.vehicleId} />
        <Field label="Vehicle number" value={selected.vehicleNumber} />
        <Field label="Pickup case" value={selected.pickupCase} />
        <Field label="Path" value={(selected.path || []).join(' → ')} />
        <Field
          label="Distance"
          value={
            selected.estimatedDistance != null
              ? `${fmt(selected.estimatedDistance)} km`
              : null
          }
        />
        <Field
          label="Travel time"
          value={
            selected.estimatedTravelTimeMin != null
              ? `${fmt(selected.estimatedTravelTimeMin)} min`
              : null
          }
        />
        <Field
          label="Cost"
          value={
            selected.estimatedCost != null
              ? fmt(selected.estimatedCost, 2)
              : null
          }
        />
        <Field label="Score" value={selected.score != null ? fmt(selected.score, 4) : null} />
        <Field label="ETA" value={selected.estimatedArrival} />
        <Field label="Explanation" value={selected.explanation} />
        <Field
          label="Available capacity"
          value={
            metrics?.availableCapacity
              ? `${fmt(metrics.availableCapacity.weight, 0)} kg / ${fmt(metrics.availableCapacity.volume, 1)} m³`
              : null
          }
        />
        <Field
          label="Deadline buffer"
          value={
            metrics?.deadlineBuffer != null
              ? `${fmt(metrics.deadlineBuffer, 0)} min`
              : null
          }
        />
      </dl>

      {breakdown ? (
        <div className="breakdown">
          <h3>Score breakdown (from FastAPI)</h3>
          <ul>
            {Object.entries(breakdown).map(([key, val]) => (
              <li key={key}>
                <strong>{key}</strong>: {fmt(val, 4)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

