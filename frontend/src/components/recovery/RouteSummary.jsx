import { firstPresent } from './recoveryStatus';

/**
 * Ordered planned route / stops from the API — no client-side pathfinding.
 * Marks expected and actual hubs when they appear on the route.
 */
export default function RouteSummary({
  shipment,
  recoveryNetwork,
}) {
  const stops =
    (Array.isArray(shipment?.plannedRoute) && shipment.plannedRoute.length
      ? shipment.plannedRoute
      : null) ||
    (Array.isArray(recoveryNetwork?.plannedRoute) && recoveryNetwork.plannedRoute.length
      ? recoveryNetwork.plannedRoute
      : null) ||
    [];

  const origin = firstPresent(shipment?.origin, shipment?.originNode);
  const destination = firstPresent(
    shipment?.destination,
    shipment?.destinationNode,
    recoveryNetwork?.destinationNode,
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

  if (!stops.length && !origin && !destination) {
    return (
      <div className="recovery-section route-summary">
        <h3>Route / Shipment Details</h3>
        <p className="muted">Planned route stops not available from the API.</p>
        {(origin || destination) && (
          <p>
            {origin || '—'}
            <span className="divergence-arrow"> → </span>
            {destination || '—'}
          </p>
        )}
      </div>
    );
  }

  const displayStops =
    stops.length > 0
      ? stops
      : [origin, destination].filter(Boolean);

  return (
    <div className="recovery-section route-summary">
      <h3>Route / Shipment Details</h3>
      <p className="muted route-endpoints">
        {origin || '—'}
        <span className="divergence-arrow"> → </span>
        {destination || '—'}
      </p>

      <ol className="route-stop-list">
        {displayStops.map((stop, index) => {
          const isExpected =
            expectedNode != null && String(stop) === String(expectedNode);
          const isActual =
            actualNode != null && String(stop) === String(actualNode);
          const badges = [];
          if (isExpected) badges.push('expected');
          if (isActual) badges.push('actual');

          return (
            <li
              key={`${stop}-${index}`}
              className={[
                'route-stop',
                isExpected ? 'route-stop-expected' : '',
                isActual ? 'route-stop-actual' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="route-stop-name">{stop}</span>
              {badges.length ? (
                <span className="route-stop-badges">
                  {badges.map((b) => (
                    <span
                      key={b}
                      className={`badge ${
                        b === 'actual' ? 'badge-infeasible' : 'badge-selected'
                      }`}
                    >
                      {b}
                    </span>
                  ))}
                </span>
              ) : null}
              {index < displayStops.length - 1 ? (
                <span className="route-stop-connector" aria-hidden="true">
                  ↓
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      {expectedNode && !displayStops.includes(expectedNode) ? (
        <p className="cell-sub">
          Expected hub <code>{expectedNode}</code> is not on the returned planned
          route list.
        </p>
      ) : null}
      {actualNode && !displayStops.includes(actualNode) ? (
        <p className="cell-sub">
          Actual hub <code>{actualNode}</code> is not on the returned planned route
          list (recovery pickup may be off-route).
        </p>
      ) : null}
    </div>
  );
}
