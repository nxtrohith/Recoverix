import { firstPresent, formatTimestamp } from './recoveryStatus';

function MetaField({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd>{String(value)}</dd>
    </div>
  );
}

/**
 * Incident metadata — only fields present on the API payload.
 */
export default function IncidentMetadata({ incident, shipment, hideTitle = false }) {
  if (!incident) {
    return (
      <div className="recovery-section incident-metadata">
        {hideTitle ? null : <h3>Incident Metadata</h3>}
        <p className="muted">No incident record for this shipment.</p>
      </div>
    );
  }

  const incidentId = firstPresent(incident.incidentId, incident.id);
  const created = formatTimestamp(incident.createdAt);
  const updated = formatTimestamp(
    incident.updatedAt || incident.assignedAt || incident.pickupConfirmedAt,
  );
  const recoveryRequired =
    incident.status === 'RECOVERY_REQUIRED' ||
    incident.status === 'OPEN' ||
    shipment?.needsRecovery === true
      ? 'Yes'
      : shipment?.needsRecovery === false
        ? 'No'
        : null;
  const misplaced =
    shipment?.isMisplaced === true
      ? 'Yes'
      : shipment?.isMisplaced === false
        ? 'No'
        : null;
  const pickupNode = firstPresent(incident.pickupNode);

  const hasAny =
    incidentId ||
    incident.incidentType ||
    created ||
    updated ||
    recoveryRequired ||
    misplaced ||
    pickupNode;

  if (!hasAny) {
    return (
      <div className="recovery-section incident-metadata">
        {hideTitle ? null : <h3>Incident Metadata</h3>}
        <p className="muted">Incident metadata fields not available.</p>
      </div>
    );
  }

  return (
    <div className="recovery-section incident-metadata">
      {hideTitle ? null : <h3>Incident Metadata</h3>}
      <dl className="detail-grid">
        <MetaField label="Incident ID" value={incidentId} />
        <MetaField label="Incident type" value={incident.incidentType} />
        <MetaField label="Created" value={created} />
        <MetaField label="Last update" value={updated} />
        <MetaField label="Recovery required" value={recoveryRequired} />
        <MetaField label="Misplaced" value={misplaced} />
        <MetaField label="Recovery / pickup node" value={pickupNode} />
        <MetaField label="Incident status" value={incident.status} />
      </dl>
    </div>
  );
}
