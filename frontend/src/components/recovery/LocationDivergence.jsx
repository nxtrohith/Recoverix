import { firstPresent } from './recoveryStatus';

/**
 * Emphasize expected → actual location divergence.
 * Only marks misplaced when the backend says so (isMisplaced / needsRecovery),
 * not merely because currentLocation is present.
 */
export default function LocationDivergence({
  shipment,
  incident,
  recoveryNetwork,
  hideTitle = false,
}) {
  if (!shipment && !recoveryNetwork) return null;

  const expected = firstPresent(
    shipment?.expectedLocation,
    recoveryNetwork?.expectedNode,
    shipment?.expectedNode,
  );
  const actual = firstPresent(
    shipment?.actualLocation,
    shipment?.currentLocation,
    recoveryNetwork?.actualNode,
    shipment?.actualNode,
    shipment?.currentNode,
    recoveryNetwork?.currentNode,
  );

  const expectedNode = firstPresent(
    shipment?.expectedNode,
    recoveryNetwork?.expectedNode,
  );
  const actualNode = firstPresent(
    shipment?.actualNode,
    shipment?.currentNode,
    recoveryNetwork?.actualNode,
    recoveryNetwork?.currentNode,
  );

  const pickup = firstPresent(
    incident?.pickupNode,
    actualNode,
    actual,
  );

  const backendMisplaced = shipment?.isMisplaced === true;
  const nodesDiverge =
    expectedNode != null &&
    actualNode != null &&
    String(expectedNode) !== String(actualNode);
  const showMisplacedCallout = backendMisplaced && nodesDiverge;

  const hasDivergence =
    expected != null || actual != null || pickup != null;

  if (!hasDivergence) {
    return (
      <div className="recovery-section location-divergence">
        {hideTitle ? null : <h3>Location Divergence</h3>}
        <p className="muted">Expected / actual location not available from the API.</p>
      </div>
    );
  }

  return (
    <div
      className={`recovery-section location-divergence ${
        showMisplacedCallout ? 'location-divergence-misplaced' : ''
      }`}
    >
      {hideTitle ? null : (
        <div className="panel-header-row">
          <h3>Location Divergence</h3>
          {showMisplacedCallout ? (
            <span className="flag flag-warn">MISPLACED</span>
          ) : backendMisplaced ? (
            <span className="flag flag-warn">MISPLACED FLAG</span>
          ) : null}
        </div>
      )}
      {hideTitle && (showMisplacedCallout || backendMisplaced) ? (
        <div className="mb-3 flex justify-end">
          <span className="flag flag-warn">
            {showMisplacedCallout ? 'MISPLACED' : 'MISPLACED FLAG'}
          </span>
        </div>
      ) : null}

      <p className="divergence-caption muted">
        Recovery starts from the <strong>actual recorded location</strong>, not the
        expected hub.
      </p>

      <div className="divergence-row" aria-label="Expected to actual location">
        <div className="divergence-side">
          <span className="divergence-label">Expected</span>
          <span className="divergence-value">{expected || '—'}</span>
          {expectedNode && expected !== expectedNode ? (
            <span className="cell-sub">{expectedNode}</span>
          ) : null}
        </div>
        <span className="divergence-arrow" aria-hidden="true">
          →
        </span>
        <div className="divergence-side divergence-actual">
          <span className="divergence-label">Actual</span>
          <span className="divergence-value">{actual || '—'}</span>
          {actualNode && actual !== actualNode ? (
            <span className="cell-sub">{actualNode}</span>
          ) : null}
        </div>
      </div>

      {pickup ? (
        <p className="recovery-pickup">
          <span className="muted">Recovery pickup:</span>{' '}
          <strong>{pickup}</strong>
        </p>
      ) : null}

      {showMisplacedCallout ? (
        <p className="warn-text divergence-reason">
          Expected hub differs from actual recorded hub — recovery is required from{' '}
          {actual || actualNode}.
        </p>
      ) : null}
    </div>
  );
}
