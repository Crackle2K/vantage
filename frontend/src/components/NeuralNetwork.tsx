import { useEffect, useRef } from "react"

/* â”€â”€ Color palette â€” Deep Green / Bright Green / Neon Green â”€â”€ */
type RGB = [number, number, number]
const PERIWINKLE: RGB = [74, 222, 128]    // Neon Green
const SOFT_PERI: RGB = [34, 197, 94]      // Bright Green
const SHADOW: RGB = [5, 46, 22]           // Deep Forest
const COBALT: RGB = [22, 163, 74]         // Vivid Green

function rgba(c: RGB, a: number) {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`
}

/* â”€â”€ Easing helpers â”€â”€ */
function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3) }
function easeOutBack(t: number) {
  const c = 1.4
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
}
function easeOutElastic(t: number) {
  if (t === 0 || t === 1) return t
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1
}

/* â”€â”€ Types â”€â”€ */
type NodeIcon = 'person' | 'business'

interface NetNode {
  x: number
  y: number
  ox: number          // final resting x
  oy: number          // final resting y
  sx: number          // start x (center)
  sy: number          // start y (center)
  r: number
  depth: number
  phase: number
  spawnDelay: number  // seconds before this node begins appearing
  growDur: number     // seconds the grow-in takes
  progress: number    // 0â†’1 overall animation progress
  alive: number       // 0â†’1 opacity/scale
  color: RGB
  edges: number[]
  icon: NodeIcon
  distFromCenter: number
}

interface FlowDot {
  from: number
  to: number
  t: number
  speed: number
}

interface RippleWave {
  radius: number
  maxRadius: number
  opacity: number
  speed: number
}

/* â”€â”€ Golden angle for organic spiral placement â”€â”€ */
const GA = 2.39996323

/* â”€â”€ Build the full network graph â”€â”€ */
function buildNetwork(w: number, h: number): NetNode[] {
  const cx = w / 2
  const cy = h / 2
  const span = Math.min(w, h) * 0.46
  const nodes: NetNode[] = []

  let iconIdx = 0
  const add = (x: number, y: number, r: number, depth: number, color: RGB, icon?: NodeIcon) => {
    const dist = Math.hypot(x - cx, y - cy)
    const normalizedDist = dist / (span * 1.1)
    // Stagger spawn by distance â€” center first, outer later
    const spawnDelay = normalizedDist * 1.8 + Math.random() * 0.15
    const growDur = 0.6 + Math.random() * 0.3
    nodes.push({
      x: cx, y: cy,
      ox: x, oy: y,
      sx: cx, sy: cy,
      r,
      depth: Math.max(0.3, Math.min(1, depth)),
      phase: Math.random() * 6.283,
      spawnDelay,
      growDur,
      progress: 0,
      alive: 0,
      color,
      edges: [],
      icon: icon ?? (iconIdx++ % 3 === 0 ? 'business' : 'person'),
      distFromCenter: dist,
    })
  }

  // Central hub node
  add(cx, cy, 14, 1, PERIWINKLE, 'business')
  nodes[0].spawnDelay = 0
  nodes[0].growDur = 0.8

  // Rings of nodes
  const rings: [number, number, number, number][] = [
    [6,  0.18, 7.0, 0.95],
    [8,  0.36, 5.5, 0.82],
    [10, 0.56, 4.0, 0.65],
    [12, 0.78, 3.0, 0.45],
    [8,  0.94, 2.2, 0.33],
  ]

  let idx = 1
  for (const [count, distPct, nodeR, depthBase] of rings) {
    for (let i = 0; i < count; i++) {
      const a = idx * GA + (Math.random() - 0.5) * 0.45
      const dist = distPct * span + (Math.random() - 0.5) * span * 0.06
      const color: RGB =
        i % 7 === 0 ? COBALT :
        i % 5 === 0 ? SHADOW :
        i % 3 === 0 ? SOFT_PERI : PERIWINKLE
      add(
        cx + Math.cos(a) * dist,
        cy + Math.sin(a) * dist,
        nodeR,
        depthBase + (Math.random() - 0.5) * 0.08,
        color,
      )
      idx++
    }
  }

  /* â”€â”€ Build fully connected network â”€â”€ */
  const connect = (a: number, b: number) => {
    if (a === b) return
    if (!nodes[a].edges.includes(b)) { nodes[a].edges.push(b); nodes[b].edges.push(a) }
  }

  const threshold = span * 0.48
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[i].ox - nodes[j].ox, nodes[i].oy - nodes[j].oy)
      if (d < threshold) connect(i, j)
    }
  }

  const ring3End = 1 + 6 + 8 + 10
  for (let i = 1; i < Math.min(ring3End, nodes.length); i++) connect(0, i)

  return nodes
}

/* â”€â”€ Exported Canvas Component â”€â”€ */
export function NeuralNetwork({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const stateRef = useRef<{
    nodes: NetNode[]
    dots: FlowDot[]
    ripples: RippleWave[]
    t0: number
    built: boolean
    introComplete: boolean
  }>({ nodes: [], dots: [], ripples: [], t0: 0, built: false, introComplete: false })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    /* Handle resize */
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const s = stateRef.current
      const fresh = buildNetwork(rect.width, rect.height)
      if (s.built) {
        // On resize after initial build, skip intro
        fresh.forEach((n) => { n.alive = 1; n.progress = 1; n.x = n.ox; n.y = n.oy })
        s.introComplete = true
      }
      s.nodes = fresh
      if (!s.built) {
        s.t0 = performance.now()
        s.built = true
        // Launch initial ripple waves
        const span = Math.min(rect.width, rect.height) * 0.46
        s.ripples = [
          { radius: 0, maxRadius: span * 1.3, opacity: 0.4, speed: span * 0.7 },
          { radius: 0, maxRadius: span * 1.3, opacity: 0.25, speed: span * 0.5 },
        ]
      }
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const isDark = () => document.documentElement.classList.contains("dark")

    /* â”€â”€ Main animation loop â”€â”€ */
    const tick = (now: number) => {
      const s = stateRef.current
      if (!s.nodes.length) { rafRef.current = requestAnimationFrame(tick); return }
      const elapsed = (now - s.t0) / 1000
      const rect = canvas.getBoundingClientRect()
      const w = rect.width, h = rect.height
      if (w === 0 || h === 0) { rafRef.current = requestAnimationFrame(tick); return }
      const dark = isDark()
      const cx = w / 2, cy = h / 2
      ctx.clearRect(0, 0, w, h)

      const dt = 1 / 60

      /* â”€â”€ Update ripples â”€â”€ */
      for (const rip of s.ripples) {
        rip.radius += rip.speed * dt
        if (rip.radius > rip.maxRadius) rip.opacity -= 0.6 * dt
      }
      s.ripples = s.ripples.filter(r => r.opacity > 0)

      /* â”€â”€ Draw expanding ripple rings â”€â”€ */
      for (const rip of s.ripples) {
        ctx.beginPath()
        ctx.arc(cx, cy, rip.radius, 0, 6.283)
        ctx.strokeStyle = dark
          ? rgba(PERIWINKLE, rip.opacity * 0.35)
          : rgba(COBALT, rip.opacity * 0.3)
        ctx.lineWidth = 2
        ctx.stroke()
        if (rip.radius > 5) {
          const rg = ctx.createRadialGradient(cx, cy, Math.max(0, rip.radius - 15), cx, cy, rip.radius + 10)
          rg.addColorStop(0, rgba(dark ? PERIWINKLE : COBALT, 0))
          rg.addColorStop(0.5, rgba(dark ? PERIWINKLE : COBALT, rip.opacity * 0.06))
          rg.addColorStop(1, rgba(dark ? PERIWINKLE : COBALT, 0))
          ctx.fillStyle = rg
          ctx.beginPath()
          ctx.arc(cx, cy, rip.radius + 10, 0, 6.283)
          ctx.fill()
        }
      }

      /* â”€â”€ Update node positions and alive state â”€â”€ */
      let allDone = true
      for (const n of s.nodes) {
        if (n.progress >= 1 && n.alive >= 1) continue
        allDone = false

        if (elapsed < n.spawnDelay) continue

        const age = elapsed - n.spawnDelay
        const rawProgress = Math.min(1, age / n.growDur)
        n.progress = rawProgress

        // Position â€” slingshot outward with overshoot
        const posEase = easeOutBack(rawProgress)
        n.x = n.sx + (n.ox - n.sx) * posEase
        n.y = n.sy + (n.oy - n.sy) * posEase

        // Opacity/scale with elastic bounce
        n.alive = easeOutElastic(Math.min(1, rawProgress * 1.3))
      }

      // Once all nodes finished intro, switch to float mode
      if (allDone && !s.introComplete) s.introComplete = true
      if (s.introComplete) {
        for (const n of s.nodes) {
          n.phase += 0.006 + n.depth * 0.004
          n.x = n.ox + Math.sin(n.phase) * 4 * n.depth
          n.y = n.oy + Math.cos(n.phase * 0.73 + 1) * 3 * n.depth
        }
      }

      /* â”€â”€ Spawn flow particles (after intro starts) â”€â”€ */
      if (elapsed > 1.5 && Math.random() < 0.06) {
        const alive = s.nodes.filter((n) => n.alive > 0.8)
        if (alive.length > 1) {
          const src = alive[Math.floor(Math.random() * alive.length)]
          const si = s.nodes.indexOf(src)
          const targets = src.edges.filter((e) => s.nodes[e].alive > 0.5)
          if (targets.length) {
            const ti = targets[Math.floor(Math.random() * targets.length)]
            s.dots.push({ from: si, to: ti, t: 0, speed: 0.004 + Math.random() * 0.008 })
          }
        }
      }
      if (s.dots.length > 22) s.dots.splice(0, s.dots.length - 22)
      s.dots = s.dots.filter((d) => { d.t += d.speed; return d.t < 1 })

      /* â”€â”€ Draw connections (edges grow outward like tendrils) â”€â”€ */
      const drawn = new Set<string>()
      for (let ni = 0; ni < s.nodes.length; ni++) {
        const n = s.nodes[ni]
        if (n.alive <= 0) continue
        for (const ei of n.edges) {
          const key = ni < ei ? `${ni}-${ei}` : `${ei}-${ni}`
          if (drawn.has(key)) continue
          drawn.add(key)
          const m = s.nodes[ei]
          if (m.alive <= 0) continue

          const edgeAlive = Math.min(n.alive, m.alive)
          // During intro, edges animate their draw length
          const edgeDraw = s.introComplete ? 1 : easeOutCubic(Math.min(1, Math.min(n.progress, m.progress)))

          const a = edgeAlive * 0.14 * (n.depth + m.depth) / 2

          // Partial draw: line stretches from n toward m
          const ex = n.x + (m.x - n.x) * edgeDraw
          const ey = n.y + (m.y - n.y) * edgeDraw

          ctx.beginPath()
          ctx.moveTo(n.x, n.y)
          ctx.lineTo(ex, ey)
          ctx.strokeStyle = dark ? rgba(PERIWINKLE, a * 2.2 * edgeAlive) : rgba(COBALT, a * 2.5 * edgeAlive)
          ctx.lineWidth = ni === 0 || ei === 0 ? 1.6 : 0.6
          ctx.stroke()
        }
      }

      /* â”€â”€ Draw flow particles â”€â”€ */
      for (const d of s.dots) {
        const a = s.nodes[d.from], b = s.nodes[d.to]
        const x = a.x + (b.x - a.x) * d.t
        const y = a.y + (b.y - a.y) * d.t
        const fade = d.t < 0.15 ? d.t / 0.15 : d.t > 0.85 ? (1 - d.t) / 0.15 : 1

        ctx.beginPath()
        ctx.arc(x, y, 2.2, 0, 6.283)
        ctx.fillStyle = dark ? rgba(PERIWINKLE, fade * 0.7) : rgba(COBALT, fade * 0.8)
        ctx.fill()

        const g = ctx.createRadialGradient(x, y, 0, x, y, 9)
        g.addColorStop(0, dark ? rgba(PERIWINKLE, fade * 0.18) : rgba(COBALT, fade * 0.22))
        g.addColorStop(1, rgba(PERIWINKLE, 0))
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, 9, 0, 6.283)
        ctx.fill()
      }

      /* â”€â”€ Draw person icon â”€â”€ */
      const drawPerson = (px: number, py: number, r: number, fillColor: string, strokeColor: string, lw: number) => {
        const s2 = r * 1.1
        const headR = s2 * 0.38
        const headY = py - s2 * 0.38
        ctx.beginPath()
        ctx.arc(px, headY, headR, 0, 6.283)
        ctx.fillStyle = fillColor
        ctx.fill()
        if (lw > 0) { ctx.strokeStyle = strokeColor; ctx.lineWidth = lw; ctx.stroke() }
        const torsoTop = headY + headR * 1.1
        const torsoBot = py + s2 * 0.7
        const torsoW = s2 * 0.65
        ctx.beginPath()
        ctx.moveTo(px - torsoW, torsoBot)
        ctx.quadraticCurveTo(px - torsoW, torsoTop, px, torsoTop)
        ctx.quadraticCurveTo(px + torsoW, torsoTop, px + torsoW, torsoBot)
        ctx.closePath()
        ctx.fillStyle = fillColor
        ctx.fill()
        if (lw > 0) { ctx.strokeStyle = strokeColor; ctx.lineWidth = lw; ctx.stroke() }
      }

      /* â”€â”€ Draw business/storefront icon â”€â”€ */
      const drawBusiness = (bx: number, by: number, r: number, fillColor: string, strokeColor: string, lw: number) => {
        const s2 = r * 1.1
        const bw = s2 * 0.9
        const bh = s2 * 0.7
        const roofH = s2 * 0.5
        const baseY = by + s2 * 0.4
        ctx.beginPath()
        ctx.rect(bx - bw, baseY - bh, bw * 2, bh)
        ctx.fillStyle = fillColor
        ctx.fill()
        if (lw > 0) { ctx.strokeStyle = strokeColor; ctx.lineWidth = lw; ctx.stroke() }
        ctx.beginPath()
        ctx.moveTo(bx - bw * 1.25, baseY - bh)
        ctx.lineTo(bx, baseY - bh - roofH)
        ctx.lineTo(bx + bw * 1.25, baseY - bh)
        ctx.closePath()
        ctx.fillStyle = fillColor
        ctx.fill()
        if (lw > 0) { ctx.strokeStyle = strokeColor; ctx.lineWidth = lw; ctx.stroke() }
        if (r >= 4) {
          const dw = bw * 0.3
          const dh = bh * 0.5
          ctx.beginPath()
          ctx.rect(bx - dw, baseY - dh, dw * 2, dh)
          ctx.fillStyle = strokeColor || fillColor
          ctx.globalAlpha = 0.35
          ctx.fill()
          ctx.globalAlpha = 1
        }
      }

      /* â”€â”€ Draw nodes â”€â”€ */
      for (let ni = 0; ni < s.nodes.length; ni++) {
        const n = s.nodes[ni]
        if (n.alive <= 0) continue

        const pulse = s.introComplete ? (1 + Math.sin(elapsed * 1.6 + n.phase) * 0.07) : 1
        // During intro, scale up from tiny
        const scaleIn = s.introComplete ? 1 : easeOutElastic(Math.min(1, n.progress * 1.2))
        const r = n.r * pulse * scaleIn
        const a = n.alive * n.depth
        const isCenter = ni === 0

        if (r < 0.3) continue

        // Glow halo
        if (n.r >= 4 && r > 1) {
          const gr = r * (isCenter ? 5 : 3.5)
          const gg = ctx.createRadialGradient(n.x, n.y, r * 0.4, n.x, n.y, gr)
          gg.addColorStop(0, rgba(n.color, a * (isCenter ? 0.28 : 0.1)))
          gg.addColorStop(1, rgba(n.color, 0))
          ctx.fillStyle = gg
          ctx.beginPath()
          ctx.arc(n.x, n.y, gr, 0, 6.283)
          ctx.fill()
        }

        // Pop flash on spawn
        if (!s.introComplete && n.progress > 0 && n.progress < 0.3) {
          const flashAlpha = (1 - n.progress / 0.3) * 0.5
          const flashR = r * 3
          const fg = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, flashR)
          fg.addColorStop(0, rgba(dark ? PERIWINKLE : COBALT, flashAlpha))
          fg.addColorStop(1, rgba(dark ? PERIWINKLE : COBALT, 0))
          ctx.fillStyle = fg
          ctx.beginPath()
          ctx.arc(n.x, n.y, flashR, 0, 6.283)
          ctx.fill()
        }

        const fillC = isCenter
          ? (dark ? rgba(PERIWINKLE, a * 0.88) : rgba(PERIWINKLE, a * 0.95))
          : (dark ? rgba(n.color, a * 0.65) : rgba(n.color, a * 0.75))
        const strokeC = isCenter
          ? (dark ? rgba(PERIWINKLE, a * 0.45) : rgba(COBALT, a * 0.65))
          : (dark ? rgba(n.color, a * 0.22) : rgba(n.color, a * 0.35))
        const lw = isCenter ? 2.5 : (n.r >= 4 ? 1 : 0)

        if (n.icon === 'person') {
          drawPerson(n.x, n.y, r, fillC, strokeC, lw)
        } else {
          drawBusiness(n.x, n.y, r, fillC, strokeC, lw)
        }

        // Secondary glow ring for center
        if (isCenter && r > 2) {
          ctx.beginPath()
          ctx.arc(n.x, n.y, r * 1.8, 0, 6.283)
          ctx.strokeStyle = dark
            ? rgba(PERIWINKLE, a * 0.12 * (1 + Math.sin(elapsed * 2) * 0.3))
            : rgba(PERIWINKLE, a * 0.18 * (1 + Math.sin(elapsed * 2) * 0.3))
          ctx.lineWidth = 1
          ctx.stroke()
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} className={`block w-full h-full ${className}`} />
}
