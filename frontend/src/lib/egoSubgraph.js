/**
 * Client-side ego-neighborhood helpers over GET /api/graph payloads.
 * Topology stays as-is (directed edges). Degree is for visual weight only.
 */

/**
 * @param {{ nodes?: Array<{ id: string }>, edges?: Array<{ source: string, target: string }> } | null | undefined} graph
 * @returns {Map<string, number>}
 */
export function computeDegrees(graph) {
  const degrees = new Map()
  for (const n of graph?.nodes || []) {
    degrees.set(n.id, 0)
  }
  for (const e of graph?.edges || []) {
    if (!e?.source || !e?.target) continue
    degrees.set(e.source, (degrees.get(e.source) || 0) + 1)
    degrees.set(e.target, (degrees.get(e.target) || 0) + 1)
  }
  return degrees
}

/**
 * @param {Map<string, number>} degrees
 * @returns {string | null}
 */
export function highestDegreeNodeId(degrees) {
  let bestId = null
  let bestDeg = -1
  for (const [id, deg] of degrees) {
    if (deg > bestDeg) {
      bestDeg = deg
      bestId = id
    }
  }
  return bestId
}

/**
 * Undirected adjacency for BFS neighborhood membership.
 * @param {Array<{ source: string, target: string }>} edges
 * @returns {Map<string, Set<string>>}
 */
function buildUndirectedAdj(edges) {
  const adj = new Map()
  const add = (a, b) => {
    if (!adj.has(a)) adj.set(a, new Set())
    adj.get(a).add(b)
  }
  for (const e of edges) {
    if (!e?.source || !e?.target) continue
    add(e.source, e.target)
    add(e.target, e.source)
  }
  return adj
}

/**
 * Extract directed ego subgraph around centerId within `hops` undirected hops.
 *
 * @param {{ nodes?: Array<object>, edges?: Array<object> } | null | undefined} graph
 * @param {string | null | undefined} centerId
 * @param {number} hops
 * @returns {{
 *   centerId: string | null,
 *   nodes: Array<object & { degree: number }>,
 *   edges: Array<object>,
 *   degrees: Map<string, number>,
 *   neighbors: Array<object & { degree: number }>,
 * }}
 */
export function extractEgoSubgraph(graph, centerId, hops = 2) {
  const allNodes = graph?.nodes || []
  const allEdges = graph?.edges || []
  const degrees = computeDegrees(graph)

  let center = centerId && degrees.has(centerId) ? centerId : null
  if (!center) {
    center = highestDegreeNodeId(degrees)
  }

  if (!center || !allNodes.length) {
    return {
      centerId: null,
      nodes: [],
      edges: [],
      degrees,
      neighbors: [],
    }
  }

  const adj = buildUndirectedAdj(allEdges)
  const included = new Set([center])
  let frontier = [center]

  const maxHops = Math.max(0, Math.min(Number(hops) || 0, 4))
  for (let d = 0; d < maxHops; d++) {
    const next = []
    for (const id of frontier) {
      for (const nb of adj.get(id) || []) {
        if (included.has(nb)) continue
        included.add(nb)
        next.push(nb)
      }
    }
    frontier = next
    if (!frontier.length) break
  }

  const nodeById = new Map(allNodes.map((n) => [n.id, n]))
  const nodes = [...included]
    .map((id) => {
      const base = nodeById.get(id)
      if (!base) return null
      return { ...base, degree: degrees.get(id) || 0 }
    })
    .filter(Boolean)

  const edges = allEdges.filter(
    (e) => included.has(e.source) && included.has(e.target),
  )

  const neighborIds = adj.get(center) || new Set()
  const neighbors = [...neighborIds]
    .map((id) => {
      const base = nodeById.get(id)
      if (!base) return null
      return { ...base, degree: degrees.get(id) || 0 }
    })
    .filter(Boolean)
    .sort((a, b) => b.degree - a.degree || String(a.name || a.id).localeCompare(String(b.name || b.id)))

  return {
    centerId: center,
    nodes,
    edges,
    degrees,
    neighbors,
  }
}
