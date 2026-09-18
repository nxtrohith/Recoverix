import CandidateTypeBadge from './CandidateTypeBadge';
import ScoreBreakdown, { ScorePill } from './ScoreBreakdown';
import {
  candidateComponentScores,
  candidateScore,
  findVehicle,
  fmtNum,
  isCandidateFeasible,
  pathSummary,
} from './candidateUtils';

function CheckRow({ label, ok }) {
  if (ok == null) return null;
  return (
    <div className="candidate-check-row">
      <span>{label}</span>
      <span className={ok ? 'ok-text' : 'error-text'}>{ok ? '✓' : '✗'}</span>
    </div>
  );
}

/**
 * Expanded path / metrics for one candidate — backend paths only.
 */
function CandidateDetails({
  candidate,
  vehicle,
  network,
  isPersistedSelected,
}) {
  const m = candidate.metrics || {};
  const path = candidate.path || [];
  const pickup =
    network?.actualNode || network?.currentNode || path[0] || null;
  const destination =
    network?.destinationNode ||
    (path.length ? path[path.length - 1] : null);
  const current =
    vehicle?.currentNode || vehicle?.currentLocationName || null;
  const scores = candidateComponentScores(candidate);
  const score = candidateScore(candidate);

  return (
    <div className="candidate-details">
      <div className="candidate-detail-grid">
        {vehicle?.type || vehicle?.vehicleType ? (
          <div className="field">
            <dt>Vehicle type</dt>
            <dd>{vehicle.type || vehicle.vehicleType}</dd>
          </div>
        ) : null}
        {(vehicle?.vehicleNumber || candidate.vehicleNumber) && (
          <div className="field">
            <dt>Driver</dt>
            <dd>
              {vehicle?.vehicleNumber || candidate.vehicleNumber}
              <span className="cell-sub"> (vehicle handle)</span>
            </dd>
          </div>
        )}
        {current ? (
          <div className="field">
            <dt>Current location</dt>
            <dd>{current}</dd>
          </div>
        ) : null}
        {pickup ? (
          <div className="field">
            <dt>Recovery / pickup node</dt>
            <dd>{pickup}</dd>
          </div>
        ) : null}
        {destination ? (
          <div className="field">
            <dt>Destination</dt>
            <dd>{destination}</dd>
          </div>
        ) : null}
        {m.distance != null ? (
          <div className="field">
            <dt>Distance</dt>
            <dd>{fmtNum(m.distance)} km</dd>
          </div>
        ) : null}
        {m.detourDistanceKm != null ? (
          <div className="field">
            <dt>Detour</dt>
            <dd>
              {fmtNum(m.detourDistanceKm)} km
              {m.detourTimeMin != null
                ? ` · ${fmtNum(m.detourTimeMin)} min`
                : ''}
            </dd>
          </div>
        ) : null}
        {m.travelTime != null ? (
          <div className="field">
            <dt>Estimated recovery time</dt>
            <dd>{fmtNum(m.travelTime)} min</dd>
          </div>
        ) : null}
        {m.availableCapacity ? (
          <div className="field">
            <dt>Remaining capacity</dt>
            <dd>
              {fmtNum(m.availableCapacity.weight, 0)} kg /{' '}
              {fmtNum(m.availableCapacity.volume, 1)} m³
            </dd>
          </div>
        ) : null}
        {m.deadlineBuffer != null ? (
          <div className="field">
            <dt>Deadline buffer</dt>
            <dd>{fmtNum(m.deadlineBuffer, 0)} min</dd>
          </div>
        ) : null}
        {candidate.candidateId ? (
          <div className="field">
            <dt>Candidate ID</dt>
            <dd>
              <code>{candidate.candidateId}</code>
            </dd>
          </div>
        ) : null}
      </div>

      {(current || pickup || destination) && (
        <div className="candidate-path-flow" aria-label="Recovery path flow">
          {current ? (
            <>
              <div className="route-stop">
                <span className="route-stop-name">{current}</span>
                <span className="badge">current</span>
              </div>
              <span className="route-stop-connector">↓</span>
            </>
          ) : null}
          {pickup ? (
            <>
              <div className="route-stop route-stop-actual">
                <span className="route-stop-name">{pickup}</span>
                <span className="badge badge-infeasible">pickup</span>
              </div>
              {destination ? <span className="route-stop-connector">↓</span> : null}
            </>
          ) : null}
          {destination ? (
            <div className="route-stop route-stop-expected">
              <span className="route-stop-name">{destination}</span>
              <span className="badge badge-feasible">destination</span>
            </div>
          ) : null}
        </div>
      )}

      {path.length ? (
        <div className="candidate-full-path">
          <h4>Recovery / delivery path</h4>
          <p className="path-cell">{path.join(' → ')}</p>
        </div>
      ) : (
        <p className="muted">Recovery path not available from the API.</p>
      )}

      {isCandidateFeasible(candidate) ? (
        <ScoreBreakdown
          componentScores={scores}
          totalScore={score}
        />
      ) : null}

      {candidate.explanation ? (
        <div className="candidate-explanation">
          <h4>Explanation</h4>
          <p>{candidate.explanation}</p>
        </div>
      ) : null}

      {candidate.factorsHelped?.length ? (
        <div className="candidate-factors">
          <h4>Factors helped</h4>
          <ul>
            {candidate.factorsHelped.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {candidate.factorsHurt?.length ? (
        <div className="candidate-factors">
          <h4>Factors hurt</h4>
          <ul>
            {candidate.factorsHurt.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {isPersistedSelected ? (
        <p className="ok-text">This is the backend-selected recovery plan.</p>
      ) : null}
    </div>
  );
}

/**
 * Compact comparison card for one recovery candidate.
 */
export default function CandidateCard({
  candidate,
  network,
  vehicles,
  isPersistedSelected,
  expanded,
  onToggleExpand,
}) {
  const feasible = isCandidateFeasible(candidate);
  const vehicle = findVehicle(vehicles, candidate.vehicleId);
  const summary = pathSummary(candidate.path);
  const m = candidate.metrics || {};
  const detourKm = m.detourDistanceKm;

  return (
    <article
      className={[
        'candidate-card',
        feasible ? 'candidate-card-feasible' : 'candidate-card-rejected',
        isPersistedSelected ? 'candidate-card-selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header className="candidate-card-header">
        <div className="candidate-card-title">
          <strong>
            Vehicle {candidate.vehicleNumber || candidate.vehicleId || '—'}
          </strong>
          {candidate.vehicleNumber && candidate.vehicleId ? (
            <span className="cell-sub">{candidate.vehicleId}</span>
          ) : null}
        </div>
        {feasible ? <ScorePill candidate={candidate} /> : null}
      </header>

      <div className="candidate-card-meta">
        <CandidateTypeBadge pickupCase={candidate.pickupCase} />
        {isPersistedSelected ? (
          <span className="badge badge-selected">SELECTED</span>
        ) : null}
        {!feasible ? (
          <span className="badge badge-infeasible">REJECTED</span>
        ) : null}
      </div>

      {summary ? <p className="candidate-path-summary">{summary}</p> : null}

      {feasible ? (
        <div className="candidate-checks">
          <CheckRow label="Capacity" ok />
          <CheckRow label="Deadline" ok />
          {detourKm != null ? (
            <div className="candidate-check-row">
              <span>Detour</span>
              <span>{fmtNum(detourKm)} km</span>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="error-text candidate-rejection">
          {candidate.rejectionReason || 'Rejected (no reason from API)'}
        </p>
      )}

      <div className="candidate-card-actions">
        <button type="button" onClick={onToggleExpand}>
          {expanded ? 'Hide Details' : 'View Details'}
        </button>
        {isPersistedSelected ? (
          <span className="flag flag-warn">Selected plan</span>
        ) : null}
      </div>

      {expanded ? (
        <CandidateDetails
          candidate={candidate}
          vehicle={vehicle}
          network={network}
          isPersistedSelected={isPersistedSelected}
        />
      ) : null}
    </article>
  );
}
