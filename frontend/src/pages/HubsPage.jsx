import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { MapPinned } from 'lucide-react'
import HubPanel from '../components/HubPanel'
import { PageHeader } from '@/components/ops/PageHeader'
import { EmptyState } from '@/components/ops/EmptyState'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export default function HubsPage() {
  const ctx = useOutletContext()
  const hubs = useMemo(() => {
    const list = [...(ctx.hubs || [])]
    list.sort((a, b) =>
      String(a.name || a.code || a.id).localeCompare(
        String(b.name || b.code || b.id),
        undefined,
        { sensitivity: 'base' },
      ),
    )
    return list
  }, [ctx.hubs])

  const [selectedId, setSelectedId] = useState(null)
  const selectedHub =
    hubs.find((h) => h.id === selectedId) ||
    hubs.find((h) => h.graphNodeKey === ctx.focusNodeId) ||
    null

  function selectHub(hub) {
    setSelectedId(hub.id)
    if (hub.graphNodeKey) ctx.setFocusNodeId?.(hub.graphNodeKey)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        kicker="Network directory"
        title="Hubs"
        description="Operational locations and Telangana graph bindings"
        actions={
          <Badge variant="neutral" className="font-mono tabular-nums">
            {hubs.length} hubs
          </Badge>
        }
      />

      <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[minmax(280px,360px)_1fr]">
        <aside
          className="flex min-h-0 flex-col overflow-hidden border-b-2 border-border bg-secondary-background lg:border-r-2 lg:border-b-0"
          aria-label="Hubs list"
        >
          <div className="flex shrink-0 items-center justify-between border-b-2 border-border px-4 py-3">
            <h2 className="text-sm font-heading tracking-tight">All hubs</h2>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {hubs.length}
            </span>
          </div>
          {ctx.listsError ? (
            <p className="shrink-0 border-b-2 border-border px-4 py-2 text-xs text-status-misplaced">
              {ctx.listsError}
            </p>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto scrollbar">
            {!hubs.length ? (
              <EmptyState
                icon={<MapPinned className="size-5" />}
                title="No hubs"
                description="No location data loaded from the API."
                className="py-12"
              />
            ) : (
              <ul className="flex flex-col gap-1 p-2">
                {hubs.map((h) => {
                  const isSelected = selectedHub?.id === h.id
                  return (
                    <li key={h.id}>
                      <button
                        type="button"
                        className={cn(
                          'flex w-full items-center gap-3 rounded-base border-2 px-3 py-2.5 text-left transition-all duration-200',
                          isSelected
                            ? 'border-border bg-main shadow-shadow'
                            : 'border-transparent hover:border-border hover:bg-background',
                        )}
                        onClick={() => selectHub(h)}
                        aria-current={isSelected ? 'true' : undefined}
                      >
                        <span
                          className="flex size-8 shrink-0 items-center justify-center rounded-base border-2 border-border bg-secondary-background"
                          aria-hidden
                        >
                          <MapPinned className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">
                            {h.name || h.code || h.id}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {[h.city, h.code].filter(Boolean).join(' · ') ||
                              h.graphNodeKey ||
                              'Unbound'}
                          </span>
                        </span>
                        {h.type ? (
                          <Badge
                            variant="neutral"
                            className="max-w-20 truncate px-1.5 py-0 text-[0.65rem] uppercase"
                          >
                            {h.type}
                          </Badge>
                        ) : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </aside>

        <main className="min-h-0 overflow-y-auto bg-background/40 p-4 sm:p-5">
          <HubPanel hub={selectedHub} />
        </main>
      </div>
    </div>
  )
}
