import {
  SCORE_COMPONENT_KEYS,
  candidateScore,
  fmtNum,
  scoreComponentLabel,
} from './candidateUtils';

/**
 * Backend component scores for a candidate / plan.
 * Does not recalculate totals.
 */
export default function ScoreBreakdown({
  componentScores,
  totalScore,
  title = 'Recovery Score',
}) {
  if (!componentScores && totalScore == null) {
    return (
      <div className="score-breakdown">
        <h4>{title}</h4>
        <p className="muted">Score breakdown not available from the API.</p>
      </div>
    );
  }

  const entries = SCORE_COMPONENT_KEYS.filter(
    (key) => componentScores && componentScores[key] != null,
  ).map((key) => [key, componentScores[key]]);

  // Include any unexpected keys the backend may return
  if (componentScores) {
    for (const [key, val] of Object.entries(componentScores)) {
      if (!SCORE_COMPONENT_KEYS.includes(key) && val != null) {
        entries.push([key, val]);
      }
    }
  }

  const total = totalScore != null ? totalScore : null;

  return (
    <div className="score-breakdown">
      <h4>{title}</h4>
      {entries.length ? (
        <dl className="score-breakdown-grid">
          {entries.map(([key, val]) => (
            <div key={key} className="score-breakdown-row">
              <dt>{scoreComponentLabel(key)}</dt>
              <dd>{fmtNum(val, 2)}</dd>
            </div>
          ))}
          {total != null ? (
            <div className="score-breakdown-row score-breakdown-total">
              <dt>Total Score</dt>
              <dd>{fmtNum(total, 2)}</dd>
            </div>
          ) : null}
        </dl>
      ) : total != null ? (
        <p>
          Total Score: <strong>{fmtNum(total, 2)}</strong>
        </p>
      ) : null}
    </div>
  );
}

/**
 * Compact score for card headers — backend value only.
 */
export function ScorePill({ candidate }) {
  const score = candidateScore(candidate);
  if (score == null) return <span className="score-pill muted">—</span>;
  return <span className="score-pill">{fmtNum(score, 2)}</span>;
}
