import { useEffect, useMemo, useRef } from 'react'
import ForceGraph3D from '3d-force-graph'
import {
  CanvasTexture,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
} from 'three'
import { colorForType } from '@/lib/graphColors'
import { cn } from '@/lib/utils'

function shortLabel(name, id) {
  const raw = String(name || id || '')
  if (raw.length <= 20) return raw
  return `${raw.slice(0, 18)}…`
}

function makeLabelSprite(text, { emphasize = false } = {}) {
  const padX = 10
  const padY = 6
  const fontSize = emphasize ? 26 : 20
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  ctx.font = `700 ${fontSize}px Outfit, system-ui, sans-serif`
  const metrics = ctx.measureText(text)
  const w = Math.max(32, Math.ceil(metrics.width + padX * 2))
  const h = Math.max(24, Math.ceil(fontSize + padY * 2))
  canvas.width = w
  canvas.height = h
  ctx.font = `700 ${fontSize}px Outfit, system-ui, sans-serif`
  ctx.fillStyle = emphasize ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.88)'
  ctx.strokeStyle = '#0f172a'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(0.5, 0.5, w - 1, h - 1, 4)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#0f172a'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, padX, h / 2)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  const material = new SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  })
  const sprite = new Sprite(material)
  const scale = emphasize ? 14 : 10
  sprite.scale.set((w / h) * scale, scale, 1)
  sprite.position.set(0, emphasize ? 12 : 9, 0)
  return sprite
}

function scaleVal(degree, minDeg, maxDeg) {
  const lo = 5
  const hi = 18
  if (maxDeg <= minDeg) return 10
  return lo + ((degree - minDeg) / (maxDeg - minDeg)) * (hi - lo)
}

/**
 * Imperative 3D force graph — avoids react-force-graph-3d blank-canvas
 * issues under React 19 Strict Mode.
 */
export default function NetworkGraph({
  nodes = [],
  edges = [],
  centerId = null,
  onNodeClick,
  className,
}) {
  const hostRef = useRef(null)
  const graphRef = useRef(null)
  const onNodeClickRef = useRef(onNodeClick)
  onNodeClickRef.current = onNodeClick

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
    // Clone so the engine can mutate freely without touching React memo data.
    return {
      nodes: gNodes.map((n) => ({ ...n })),
      links: links.map((l) => ({ ...l })),
    }
  }, [nodes, edges, centerId, minDeg, maxDeg])

  const egoKey = useMemo(
    () =>
      `${centerId || ''}::${graphData.nodes
        .map((n) => n.id)
        .sort()
        .join('|')}::${graphData.links.length}`,
    [centerId, graphData],
  )

  // Create once; resize / update data in separate effects.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined

    // Clear any leftover canvas from Strict Mode remount races.
    host.innerHTML = ''

    const width = Math.max(1, host.clientWidth)
    const height = Math.max(1, host.clientHeight)

    const fg = new ForceGraph3D(host, { controlType: 'orbit' })
      .width(width)
      .height(height)
      .backgroundColor('#e8eefc')
      .showNavInfo(false)
      .nodeId('id')
      .nodeLabel((n) => `${n.name || n.id}\n${n.type || 'node'} · degree ${n.degree}`)
      .nodeVal((n) => n.val || 8)
      .nodeColor((n) => n.color || '#475569')
      .nodeOpacity(1)
      .nodeResolution(16)
      .nodeThreeObject((node) => {
        try {
          return makeLabelSprite(shortLabel(node.name, node.id), {
            emphasize: Boolean(node.isCenter),
          })
        } catch {
          return null
        }
      })
      .nodeThreeObjectExtend(true)
      .linkColor(() => '#0f172a')
      .linkOpacity(0.7)
      .linkWidth(1.6)
      .linkDirectionalArrowLength(6)
      .linkDirectionalArrowRelPos(1)
      .linkLabel((l) =>
        l.distance != null && Number.isFinite(Number(l.distance))
          ? `${Number(l.distance).toFixed(0)} km`
          : '',
      )
      .cooldownTicks(120)
      .d3AlphaDecay(0.04)
      .d3VelocityDecay(0.35)
      .onNodeClick((node) => {
        if (!node?.id) return
        onNodeClickRef.current?.(node.id)
        const dist = 120 + Math.min(160, (node.val || 8) * 6)
        fg.cameraPosition(
          {
            x: node.x + dist * 0.6,
            y: node.y + dist * 0.4,
            z: node.z + dist,
          },
          node,
          700,
        )
      })

    graphRef.current = fg

    const ro = new ResizeObserver(() => {
      if (!hostRef.current || !graphRef.current) return
      graphRef.current
        .width(Math.max(1, hostRef.current.clientWidth))
        .height(Math.max(1, hostRef.current.clientHeight))
    })
    ro.observe(host)

    return () => {
      ro.disconnect()
      try {
        fg._destructor?.()
      } catch {
        // ignore
      }
      graphRef.current = null
      host.innerHTML = ''
    }
  }, [])

  // Push data + frame camera whenever the ego neighborhood changes.
  useEffect(() => {
    const fg = graphRef.current
    if (!fg || !graphData.nodes.length) return undefined

    fg.graphData({
      nodes: graphData.nodes.map((n) => ({ ...n })),
      links: graphData.links.map((l) => ({ ...l })),
    })

    const charge = fg.d3Force('charge')
    if (charge) charge.strength(-280).distanceMax(600)

    const link = fg.d3Force('link')
    if (link) {
      link.distance((l) => {
        const km = Number(l.distance)
        if (Number.isFinite(km) && km > 0) return Math.min(140, 50 + km * 0.2)
        return 80
      })
      link.strength(0.4)
    }

    let cancelled = false
    const frame = () => {
      if (cancelled || !graphRef.current) return
      try {
        graphRef.current.zoomToFit(700, 90)
      } catch {
        // ignore
      }
      if (!centerId) return
      window.setTimeout(() => {
        if (cancelled || !graphRef.current) return
        const live = graphRef.current
          .graphData()
          ?.nodes?.find((n) => n.id === centerId)
        if (!live || live.x == null) return
        const dist = 140 + Math.min(180, (live.val || 8) * 8)
        graphRef.current.cameraPosition(
          {
            x: live.x + dist * 0.6,
            y: live.y + dist * 0.4,
            z: live.z + dist,
          },
          live,
          650,
        )
      }, 750)
    }

    const t1 = window.setTimeout(frame, 600)
    const t2 = window.setTimeout(frame, 1600)

    return () => {
      cancelled = true
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [egoKey, graphData, centerId])

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

  return (
    <div
      className={cn(
        'relative h-full min-h-[360px] w-full overflow-hidden',
        className,
      )}
    >
      <div ref={hostRef} className="absolute inset-0" />
      <p className="pointer-events-none absolute bottom-2 left-3 z-10 rounded-base bg-secondary-background/90 px-2 py-1 text-[0.65rem] text-muted-foreground">
        Drag to orbit · scroll to zoom · click a node to refocus
      </p>
    </div>
  )
}
