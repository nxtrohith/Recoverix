import CandidateTypeBadge from './recovery/CandidateTypeBadge';
import ScoreBreakdown from './recovery/ScoreBreakdown';
import {
  candidateComponentScores,
  candidateScore,
  factualSelectionSummary,
  findVehicle,
  fmtNum,
  isCandidateFeasible,
} from './recovery/candidateUtils';

function Field({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd>{String(value)}</dd>
    </div>
  );
}

/**
 * Persisted selected recovery plan — backend authoritative.
 * Does not pick a candidate by score on the frontend.
 */
export default function RecoveryPlan({
  analysis,
  loading,
  error,
  vehicles = [],
  assigned = false,
  pickupConfirmed = false,
}) {
  if (loading) {
    return (
      <section className="panel recovery-plan">
        <h2>Selected Recovery Plan</h2>
        <p className="muted">Loading recovery information…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel recovery-plan">
        <h2>Selected Recovery Plan</h2>
        <p className="error-text">{error}</p>
      </section>
    );
  }

  if (!analysis) {
    return (
      <section className="panel recovery-plan">
        <h2>Selected Recovery Plan</h2>
        <p className="muted">No analysis yet.</p>
      </section>
    );
  }

  const selected = analysis.selectedRecovery;
  const plan = analysis.recoveryPlan;
  const network = analysis.network || {};
  const selectedFull = (analysis.candidates || []).find(
    (c) =>
      c.candidateId === selected?.candidateId ||
      c.candidateId === plan?.candidateId,
  );

  if (analysis.status === 'NO_FEASIBLE_RECOVERY' || (!selected && !plan)) {
    return (
      <section className="panel recovery-plan">
        <h2>Selected Recovery Plan</h2>
        <p className="warn-text">
          <strong>NO FEASIBLE RECOVERY</strong>
        </p>
        {analysis.selectionExplanation ? (
          <p>{analysis.selectionExplanation}</p>
        ) : null}
        {analysis.reasons?.length ? (
          <ul>
            {analysis.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">
            The backend did not return a selected recovery plan.
          </p>
        )}
      </section>
    );
  }

  if (!selected && !plan) {
    return (
      <section className="panel recovery-plan">
        <h2>Selected Recovery Plan</h2>
        <p className="muted">No selected recovery plan from the backend.</p>
      </section>
    );
  }

  const vehicleId =
    selected?.vehicleId || plan?.selectedVehicleId || selectedFull?.vehicleId;
  const vehicle = findVehicle(vehicles, vehicleId);
  const vehicleLabel =
    selected?.vehicleNumber ||
    selectedFull?.vehicleNumber ||
    vehicle?.vehicleNumber ||
    vehicleId;
  const driver =
    plan?.driverId ||
    selected?.vehicleNumber ||
    selectedFull?.vehicleNumber ||
    vehicle?.vehicleNumber ||
    null;
  const pickupCase =
    selected?.pickupCase || plan?.candidateType || selectedFull?.pickupCase;
  const pickup =
    plan?.pickupNode ||
    network.actualNode ||
    network.currentNode ||
    selected?.path?.[0] ||
    selectedFull?.path?.[0] ||
    null;
  const destination =
    plan?.destinationNode ||
    network.destinationNode ||
    (selected?.path?.length
      ? selected.path[selected.path.length - 1]
      : null) ||
    (selectedFull?.path?.length
      ? selectedFull.path[selectedFull.path.length - 1]
      : null);
  const score =
    selected?.score ??
    plan?.score ??
    candidateScore(selectedFull);
  const travelTime =
    selected?.estimatedTravelTimeMin ?? plan?.estimatedTime ?? null;
  const arrival = selected?.estimatedArrival || null;
  const path = selected?.path || plan?.path || selectedFull?.path || [];
  const explanation =
    selected?.explanation ||
    plan?.explanation ||
    analysis.selectionExplanation ||
    selectedFull?.explanation ||
    null;
  const factual = factualSelectionSummary({
    candidate: selectedFull,
    selected,
    plan,
    network,
  });
  const components =
    candidateComponentScores(selectedFull) || plan?.componentScores || null;
  const feasible = selectedFull
    ? isCandidateFeasible(selectedFull)
    : analysis.status === 'RECOVERY_PLAN_AVAILABLE' ||
      analysis.status === 'RECOVERY_ASSIGNED' ||
      analysis.status === 'PICKUP_CONFIRMED';

  const planStatus = pickupConfirmed
    ? 'PICKUP_CONFIRMED'
    : assigned
      ? 'RECOVERY_ASSIGNED'
      : plan?.status || analysis.status;

  const m = selectedFull?.metrics || {};

  return (
    <section className="panel recovery-plan recovery-plan-selected shadow-shadow">
      <div className="panel-header-row">
        <h2>Selected recovery plan</h2>
        <span className="badge badge-selected">SELECTED</span>
      </div>

      <p className="ok-text">Status: {planStatus}</p>

      <dl className="detail-grid">
        <Field label="Vehicle" value={vehicleLabel} />
        <Field label="Driver" value={driver} />
        <Field label="Vehicle type" value={vehicle?.type || vehicle?.vehicleType} />
        <div className="field">
          <dt>Candidate type</dt>
          <dd>
            <CandidateTypeBadge pickupCase={pickupCase} />
          </dd>
        </div>
        <Field label="Pickup location" value={pickup} />
        <Field label="Destination" value={destination} />
        <Field
          label="Score"
          value={score != null ? fmtNum(score, 2) : null}
        />
        <Field
          label="Estimated delivery"
          value={
            arrival ||
            (travelTime != null ? `${fmtNum(travelTime)} min` : null)
          }
        />
        <Field
          label="Feasibility"
          value={feasible ? 'Feasible' : 'Not feasible'}
        />
        <Field
          label="Distance"
          value={
            selected?.estimatedDistance != null
              ? `${fmtNum(selected.estimatedDistance)} km`
              : plan?.estimatedDistance != null
                ? `${fmtNum(plan.estimatedDistance)} km`
                : m.distance != null
                  ? `${fmtNum(m.distance)} km`
                  : null
          }
        />
        <Field
          label="Detour"
          value={
            m.detourDistanceKm != null
              ? `${fmtNum(m.detourDistanceKm)} km`
              : null
          }
        />
        <Field
          label="Remaining capacity"
          value={
            m.availableCapacity
              ? `${fmtNum(m.availableCapacity.weight, 0)} kg / ${fmtNum(m.availableCapacity.volume, 1)} m³`
              : null
          }
        />
        <Field
          label="Plan ID"
          value={plan?.id || selected?.recoveryOptionId}
        />
      </dl>

      {path.length ? (
        <div className="candidate-full-path">
          <h3>Recovery path</h3>
          <p className="path-cell">{path.join(' → ')}</p>
        </div>
      ) : null}

      <div className="selection-explanation">
        <h3>Why selected</h3>
        {explanation ? (
          <p>{explanation}</p>
        ) : factual ? (
          <p>{factual}</p>
        ) : (
          <p className="muted">No explanation returned by the backend.</p>
        )}
        {analysis.selectionExplanation &&
        explanation &&
        analysis.selectionExplanation !== explanation ? (
          <p className="muted">{analysis.selectionExplanation}</p>
        ) : null}
      </div>

      <ScoreBreakdown
        componentScores={components}
        totalScore={score}
        title="Recovery Score"
      />
    </section>
  );
}
