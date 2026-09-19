import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { GitBranch, MapPinned } from 'lucide-react'
import NetworkGraph, { colorForType } from '../components/NetworkGraph'
import {
  computeDegrees,
  extractEgoSubgraph,
  highestDegreeNodeId,
} from '../lib/egoSubgraph'
import { PageHeader } from '@/components/ops/PageHeader'
import { EmptyState } from '@/components/ops/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Legend matches telangana_nodes.hub_type values */
const LEGEND_TYPES = [
  { key: 'Hub', label: 'Hub' },
  { key: 'Distribution Center', label: 'DC' },
  { key: 'Intermediate', label: 'Intermediate' },
  { key: 'Delivery', label: 'Delivery' },
  { key: 'Collection', label: 'Collection' },
  { key: 'Unknown', label: 'Unknown' },
]

export default function GraphNodesPage() {
  const ctx = useOutletContext()
  // 1 hop by default — 2 hops around a major hub becomes a hairball
  const [hops, setHops] = useState(1)

  // Open on the most connected hub when nothing is focused yet
  useEffect(() => {
    if (ctx.focusNodeId || !ctx.graph?.nodes?.length) return
    const id = highestDegreeNodeId(computeDegrees(ctx.graph))
    if (id) ctx.setFocusNodeId?.(id)
  }, [ctx.graph, ctx.focusNodeId, ctx.setFocusNodeId])

  const ego = useMemo(
    () => extractEgoSubgraph(ctx.graph, ctx.focusNodeId, hops),
    [ctx.graph, ctx.focusNodeId, hops],
  )

  const centerNode = useMemo(() => {
    if (!ego.centerId) return null
    return ego.nodes.find((n) => n.id === ego.centerId) || null
  }, [ego])

  function selectNode(nodeId) {
    ctx.setFocusNodeId?.(nodeId)
  }

  const loading = ctx.graphLoading
  const error = ctx.graphError
  const hasGraph = Boolean(ctx.graph?.nodes?.length)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        kicker="Network topology"
        title="Graph nodes"
        description="3D ego view of directed legs from build_graph — camera opens on the most connected hub"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex items-center gap-1 rounded-base border-2 border-border bg-secondary-background p-1"
              role="group"
              aria-label="Hop distance"
            >
              {[1, 2].map((h) => (
                <Button
                  key={h}
                  type="button"
                  size="sm"
                  variant={hops === h ? 'default' : 'neutral'}
                  className={cn(
                    'h-8 min-w-10 shadow-none',
                    hops !== h && 'border-transparent',
                  )}
                  onClick={() => setHops(h)}
                >
                  {h} hop{h > 1 ? 's' : ''}
                </Button>
              ))}
            </div>
            <Badge variant="neutral" className="font-mono tabular-nums">
              {ego.nodes.length}n · {ego.edges.length}e
            </Badge>
          </div>
        }
      />

      {loading ? (
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          Loading network graph…
        </div>
      ) : error ? (
        <EmptyState
          icon={<GitBranch className="size-5" />}
          title="Graph unavailable"
          description={error}
          className="m-6"
        />
      ) : !hasGraph ? (
        <EmptyState
          icon={<GitBranch className="size-5" />}
          title="No graph data"
          description="No nodes returned from /api/graph."
          className="m-6"
        />
      ) : (
        <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[1fr_minmax(260px,320px)]">
          <section
            className="relative flex min-h-0 flex-col border-b-2 border-border bg-background lg:border-r-2 lg:border-b-0"
            aria-label="Ego neighborhood graph"
          >
            <div className="flex shrink-0 flex-wrap items-center gap-3 border-b-2 border-border bg-secondary-background px-4 py-2">
              {LEGEND_TYPES.map((t) => (
                <span
                  key={t.key}
                  className="inline-flex items-center gap-1.5 text-xs font-medium"
                >
                  <span
                    className="size-2.5 rounded-[1px] border-2 border-border"
                    style={{ background: colorForType(t.key) }}
                    aria-hidden
                  />
                  {t.label}
                </span>
              ))}
              <span className="text-xs text-muted-foreground">
                Size = degree · drag to orbit
              </span>
            </div>
            <div className="min-h-0 flex-1 p-2" style={{ minHeight: 360 }}>
              <NetworkGraph
                nodes={ego.nodes}
                edges={ego.edges}
                centerId={ego.centerId}
                onNodeClick={selectNode}
                className="h-full min-h-[360px] rounded-base border-2 border-border bg-secondary-background"
              />
            </div>
          </section>

          <aside
            className="flex min-h-0 flex-col overflow-hidden bg-secondary-background"
            aria-label="Focused hub"
          >
            <div className="shrink-0 border-b-2 border-border px-4 py-3">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Focus
              </p>
              {centerNode ? (
                <div className="mt-2 space-y-2">
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-1 size-3 shrink-0 rounded-[1px] border-2 border-border"
                      style={{ background: colorForType(centerNode.type) }}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-heading tracking-tight">
                        {centerNode.name || centerNode.id}
                      </h2>
                      <p className="font-mono text-xs text-muted-foreground">
                        {centerNode.id}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {centerNode.type ? (
                      <Badge variant="neutral" className="uppercase tracking-[0.06em]">
                        {centerNode.type}
                      </Badge>
                    ) : null}
                    <Badge variant="neutral" className="font-mono tabular-nums">
                      deg {centerNode.degree}
                    </Badge>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No focus node</p>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-between border-b-2 border-border px-4 py-2">
              <h3 className="text-sm font-heading tracking-tight">Neighbors</h3>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {ego.neighbors.length}
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto scrollbar">
              {!ego.neighbors.length ? (
                <EmptyState
                  icon={<MapPinned className="size-5" />}
                  title="No direct neighbors"
                  description="Try increasing hops or pick another hub."
                  className="py-10"
                />
              ) : (
                <ul className="flex flex-col gap-1 p-2">
                  {ego.neighbors.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => selectNode(n.id)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-base border-2 border-transparent px-2.5 py-2 text-left text-sm transition-all duration-200',
                          'hover:border-border hover:bg-background',
                        )}
                      >
                        <span
                          className="size-2.5 shrink-0 rounded-[1px] border-2 border-border"
                          style={{ background: colorForType(n.type) }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {n.name || n.id}
                        </span>
                        <span className="font-mono text-[0.65rem] tabular-nums text-muted-foreground">
                          {n.degree}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
