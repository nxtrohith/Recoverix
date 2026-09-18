import { candidateTypeLabel } from './candidateUtils';

/**
 * Badge for at_node / pass_through / detour.
 */
export default function CandidateTypeBadge({ pickupCase }) {
  if (!pickupCase) return <span className="badge">—</span>;

  let variant = 'badge-type-default';
  if (pickupCase === 'at_node') variant = 'badge-type-at-node';
  else if (pickupCase === 'pass_through') variant = 'badge-type-pass';
  else if (pickupCase === 'detour') variant = 'badge-type-detour';

  return (
    <span className={`badge ${variant}`}>{candidateTypeLabel(pickupCase)}</span>
  );
}
