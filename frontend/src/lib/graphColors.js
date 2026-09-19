/** Distinct hex colors for telangana hub_type values (Three.js needs real hex). */
const TYPE_COLORS = {
  delivery: '#2563eb',
  intermediate: '#ea580c',
  'distribution center': '#059669',
  distribution: '#059669',
  dc: '#059669',
  collection: '#ca8a04',
  hub: '#dc2626',
  warehouse: '#db2777',
  origin: '#0d9488',
  destination: '#7c3aed',
  unknown: '#64748b',
  default: '#475569',
}

export function colorForType(type) {
  const key = String(type || '')
    .trim()
    .toLowerCase()
  if (!key) return TYPE_COLORS.default
  if (TYPE_COLORS[key]) return TYPE_COLORS[key]
  if (key.includes('distribut')) return TYPE_COLORS.dc
  if (key.includes('intermed')) return TYPE_COLORS.intermediate
  if (key.includes('collect')) return TYPE_COLORS.collection
  if (key.includes('deliver')) return TYPE_COLORS.delivery
  if (key.includes('ware')) return TYPE_COLORS.warehouse
  if (key.includes('origin')) return TYPE_COLORS.origin
  if (key.includes('dest')) return TYPE_COLORS.destination
  if (key.includes('hub')) return TYPE_COLORS.hub
  if (key.includes('unknown')) return TYPE_COLORS.unknown
  return TYPE_COLORS.default
}

export const GRAPH_TYPE_LEGEND = [
  { key: 'Hub', label: 'Hub' },
  { key: 'Distribution Center', label: 'DC' },
  { key: 'Intermediate', label: 'Intermediate' },
  { key: 'Delivery', label: 'Delivery' },
  { key: 'Collection', label: 'Collection' },
  { key: 'Unknown', label: 'Unknown' },
]
