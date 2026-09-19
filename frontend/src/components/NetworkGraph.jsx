import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph3D from 'react-force-graph-3d'
import {
  CanvasTexture,
  Sprite,
  SpriteMaterial,
} from 'three'
import { cn } from '@/lib/utils'

/**
 * Distinct hex colors for real telangana hub_type values.
 * CSS vars don't work inside Three.js materials.
 */
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

function shortLabel(name, id) {
  const raw = String(name || id || '')
  if (raw.length <= 22) return raw
  return `${raw.slice(0, 20)}…`
}

/** Canvas sprite label — avoids three-spritetext resolve issues under Vite. */
function makeLabelSprite(text, { emphasize = false } = {}) {
  const padX = 10
  const padY = 6
  const fontSize = emphasize ? 28 : 22
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  ctx.font = `700 ${fontSize}px Outfit, system-ui, sans-serif`
  const metrics = ctx.measureText(text)
  const w = Math.max(24, Math.ceil(metrics.width + padX * 2))
  const h = Math.max(20, Math.ceil(fontSize + padY * 2))
  canvas.width = w
  canvas.height = h
  ctx.font = `700 ${fontSize}px Outfit, system-ui, sans-serif`
  ctx.fillStyle = emphasize ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.82)'
  ctx.strokeStyle = '#111111'
  ctx.lineWidth = 2
  const r = 4
  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.arcTo(w, 0, w, h, r)
  ctx.arcTo(w, h, 0, h, r)
  ctx.arcTo(0, h, 0, 0, r)
  ctx.arcTo(0, 0, w, 0, r)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#111111'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, padX, h / 2)

  const texture = new CanvasTexture(canvas)
  texture.needsUpdate = true
  const material = new SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  })
  const sprite = new Sprite(material)
  const scale = emphasize ? 16 : 12
  sprite.scale.set((w / h) * scale, scale, 1)
  sprite.center.set(0.5, 1.25)
  return sprite
}

function scaleVal(degree, minDeg, maxDeg) {
  const lo = 4
  const hi = 16
  if (maxDeg <= minDeg) return 8
  return lo + ((degree - minDeg) / (maxDeg - minDeg)) * (hi - lo)
}

/**
 * 3D force-directed ego graph. Camera opens framed on the neighborhood.
 */
export default function NetworkGraph({
  nodes = [],
  edges = [],
  centerId = null,
  onNodeClick,
  className,
}) {
  const containerRef = useRef(null)
  const fgRef = useRef(null)
  const pendingFitKey = useRef('')
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined

    const apply = () => {
      const width = Math.max(1, Math.floor(el.clientWidth))
      const height = Math.max(1, Math.floor(el.clientHeight))
      setSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      )
    }

    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { minDeg, maxDeg } = useMemo(() => {
    const degs = nodes.map((n) => n.degree || 0)
    return {
      minDeg: degs.length ? Math.min(...degs) : 0,
      maxDeg: degs.length ? Math.max(...degs) : 0,
    }
  }, [nodes])

  const graphData = useMemo(() => {
    const gNodes = nodes.map((n) => ({
      id: n.id,
      name: n.name || n.id,
      type: n.type || '',
      degree: n.degree || 0,
      val: scaleVal(n.degree || 0, minDeg, maxDeg),
      color: colorForType(n.type),
      isCenter: n.id === centerId,
    }))
    const ids = new Set(gNodes.map((n) => n.id))
    const links = edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({
        source: e.source,
        target: e.target,
        distance: e.distance,
      }))
    return { nodes: gNodes, links }
  }, [nodes, edges, centerId, minDeg, maxDeg])

  const egoKey = useMemo(
    () =>
      `${centerId || ''}::${graphData.nodes
        .map((n) => n.id)
        .sort()
        .join('|')}::${graphData.links.length}`,
    [centerId, graphData],
  )

  const fitView = useCallback((ms = 700) => {
    const fg = fgRef.current
    if (!fg) return
    // Padding keeps labels inside the frame; delay lets positions settle.
    try {
      fg.zoomToFit(ms, 80)
    } catch {
      // ignore if engine not ready
    }
  }, [])

  const focusNode = useCallback((nodeId, ms = 800) => {
    const fg = fgRef.current
    if (!fg || !nodeId) return
    const live = fg.graphData()?.nodes?.find((n) => n.id === nodeId)
    if (!live || live.x == null) {
      fitView(ms)
      return
    }
    const dist = 160 + Math.min(200, Math.max(40, (live.degree || 1) * 6))
    fg.cameraPosition(
      { x: live.x + dist * 0.55, y: live.y + dist * 0.35, z: live.z + dist },
      { x: live.x, y: live.y, z: live.z },
      ms,
    )
  }, [fitView])

  // Spread forces whenever the ego set changes; request a fit after settle.
  useEffect(() => {
    const fg = fgRef.current
    if (!fg || !graphData.nodes.length || size.width < 2) return undefined

    pendingFitKey.current = egoKey

    const charge = fg.d3Force('charge')
    if (charge) charge.strength(-320).distanceMax(800)

    const link = fg.d3Force('link')
    if (link) {
      link.distance((l) => {
        const km = Number(l.distance)
        if (Number.isFinite(km) && km > 0) return Math.min(180, 60 + km * 0.25)
        return 90
      })
      link.strength(0.35)
    }

    fg.d3ReheatSimulation()

    // Fallback fit if engine never fully stops (continuous drag etc.)
    const t = window.setTimeout(() => {
      if (pendingFitKey.current === egoKey) {
        fitView(900)
        // Then nudge toward the hub so it reads as the focus
        window.setTimeout(() => focusNode(centerId, 600), 950)
      }
    }, 700)

    return () => window.clearTimeout(t)
  }, [egoKey, centerId, graphData.nodes.length, size.width, size.height, fitView, focusNode])

  const nodeThreeObject = useCallback((node) => {
    return makeLabelSprite(shortLabel(node.name, node.id), {
      emphasize: Boolean(node.isCenter),
    })
  }, [])

  if (!nodes.length) {
    return (
      <div
        className={cn(
          'relative flex h-full min-h-[360px] w-full items-center justify-center text-sm text-muted-foreground',
          className,
        )}
      >
        No neighborhood to display.
      </div>
    )
  }

  const ready = size.width > 1 && size.height > 1

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative h-full min-h-[360px] w-full overflow-hidden',
        className,
      )}
    >
      {ready ? (
        <ForceGraph3D
          ref={fgRef}
          width={size.width}
          height={size.height}
          graphData={graphData}
          backgroundColor="#eef2ff"
          showNavInfo={false}
          nodeId="id"
          nodeLabel={(n) =>
            `${n.name || n.id}\n${n.type || 'node'} · degree ${n.degree}`
          }
          nodeVal="val"
          nodeColor={(n) => n.color}
          nodeOpacity={1}
          nodeResolution={18}
          nodeThreeObject={nodeThreeObject}
          nodeThreeObjectExtend
          linkColor={() => '#1e293b'}
          linkOpacity={0.65}
          linkWidth={1.4}
          linkDirectionalArrowLength={5.5}
          linkDirectionalArrowRelPos={1}
          linkDirectionalParticles={0}
          linkLabel={(l) =>
            l.distance != null && Number.isFinite(Number(l.distance))
              ? `${Number(l.distance).toFixed(0)} km`
              : ''
          }
          cooldownTicks={100}
          warmupTicks={30}
          d3AlphaDecay={0.03}
          d3VelocityDecay={0.35}
          onEngineStop={() => {
            if (pendingFitKey.current === egoKey) {
              pendingFitKey.current = ''
              fitView(500)
              window.setTimeout(() => focusNode(centerId, 500), 550)
            }
          }}
          onNodeClick={(node) => {
            if (node?.id) {
              onNodeClick?.(node.id)
              focusNode(node.id, 700)
            }
          }}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Preparing 3D view…
        </div>
      )}
      <p className="pointer-events-none absolute bottom-2 left-3 z-10 rounded-base bg-secondary-background/80 px-2 py-1 text-[0.65rem] text-muted-foreground">
        Drag to orbit · scroll to zoom · click a node to refocus
      </p>
    </div>
  )
}
