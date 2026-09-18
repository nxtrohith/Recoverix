import { firstPresent } from './recoveryStatus';

function Field({ label, value }) {
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd>{value == null || value === '' ? '—' : String(value)}</dd>
    </div>
  );
}

/**
 * Compact shipment identity + route endpoints for the recovery incident header.
 */
export default function ShipmentSummary({ shipment }) {
  if (!shipment) return null;

  const origin = firstPresent(shipment.origin, shipment.originNode);
  const destination = firstPresent(shipment.destination, shipment.destinationNode);
  const actual = firstPresent(
    shipment.actualLocation,
    shipment.currentLocation,
    shipment.actualNode,
    shipment.currentNode,
  );
  const expected = firstPresent(shipment.expectedLocation, shipment.expectedNode);

  return (
    <div className="recovery-section shipment-summary">
      <div className="panel-header-row">
        <h2>Shipment / Incident</h2>
        <div className="status-flags">
          {shipment.trackingNumber ? (
            <span className="flag">{shipment.trackingNumber}</span>
          ) : null}
          {shipment.status ? (
            <span className="flag">{String(shipment.status).toUpperCase()}</span>
          ) : null}
          {shipment.priority ? (
            <span className="flag flag-warn">{String(shipment.priority).toUpperCase()}</span>
          ) : null}
        </div>
      </div>

      <dl className="detail-grid">
        <Field label="Shipment ID" value={shipment.id} />
        <Field label="Tracking" value={shipment.trackingNumber} />
        <Field label="Status" value={shipment.status} />
        <Field label="Priority" value={shipment.priority} />
        <Field label="Origin" value={origin} />
        <Field label="Destination" value={destination} />
        <Field label="Expected location" value={expected} />
        <Field label="Current / actual location" value={actual} />
      </dl>
    </div>
  );
}
