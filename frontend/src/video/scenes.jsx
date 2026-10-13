import { Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { AbsoluteFill, Caption, NeonPill, clamp } from './primitives.jsx'
import { C, FONT, MONO, glassCard } from './theme.js'

/*
 * Escenas del pitch comercial (2:30). Todos los tiempos son frames LOCALES de cada <Sequence> (30 fps).
 * Solo se animan transform/opacity y atributos SVG; nada depende del reloj real, así que cada frame es
 * determinista (igual en el <Player> que al renderizar a MP4).
 */

const CENTER = { x: 960, y: 560 }
const lerp = (a, b, t) => a + (b - a) * t

/* =================================================================================================
 * Núcleo «API Core» (compartido por varias escenas)
 * ================================================================================================= */

function Hexagon({ size, glow = 1 }) {
  const w = size
  const h = size * 0.88
  const inset = w * 0.22
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="core-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(16,185,129,0.35)" />
          <stop offset="100%" stopColor="rgba(6,40,30,0.95)" />
        </linearGradient>
      </defs>
      <polygon
        points={`${inset},0 ${w - inset},0 ${w},${h / 2} ${w - inset},${h} ${inset},${h} 0,${h / 2}`}
        fill="url(#core-fill)"
        stroke={C.emerald}
        strokeWidth={3}
        style={{ filter: `drop-shadow(0 0 ${28 * glow}px rgba(52,211,153,0.55))` }}
      />
    </svg>
  )
}

/** Núcleo con anillos de energía. `appear` 0→1 controla su aparición; `scale` permite el «zoom out» final. */
function CoreNode({ appear = 1, scale = 1, x = CENTER.x, y = CENTER.y, label = true }) {
  const frame = useCurrentFrame()
  const size = 300
  return (
    <div style={{ position: 'absolute', left: x - size / 2, top: y - (size * 0.88) / 2, width: size, height: size * 0.88, transform: `scale(${appear * scale})`, opacity: Math.min(1, appear * 1.4) }}>
      {[0, 1, 2].map((i) => {
        const t = ((frame + i * 30) % 90) / 90 // anillos que se expanden y se apagan en bucle
        const d = size * (1 + t * 1.2)
        return (
          <div
            key={i}
            style={{ position: 'absolute', left: '50%', top: '50%', width: d, height: d, marginLeft: -d / 2, marginTop: -d / 2, borderRadius: '50%', border: `2px solid ${C.emerald}`, opacity: (1 - t) * 0.35 * appear }}
          />
        )
      })}
      <Hexagon size={size} glow={0.8 + 0.4 * Math.abs(Math.sin(frame / 20))} />
      {label && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
          <div style={{ color: C.text, fontSize: 40, fontWeight: 700, letterSpacing: -0.5 }}>API Core</div>
          <div style={{ marginTop: 6, color: C.muted, fontSize: 18, fontFamily: MONO }}>validar · orquestar</div>
        </div>
      )}
    </div>
  )
}

/* =================================================================================================
 * 1 · [0 s – 20 s] El caos y la solución
 * ================================================================================================= */

const CHAOS = [
  { x: 210, y: 300, w: 380, h: 230, r: -9, kind: 'Hoja de cálculo', title: 'Riego_v3_FINAL(2).xlsx' },
  { x: 700, y: 250, w: 320, h: 170, r: 6, kind: 'Error', title: 'Sensor sin señal · Sector 4' },
  { x: 1180, y: 290, w: 360, h: 210, r: -4, kind: 'Mensaje', title: '¿Quién lleva la cuba hoy?' },
  { x: 1520, y: 520, w: 300, h: 190, r: 11, kind: 'Error', title: 'Factura gasóleo sin cuadrar' },
  { x: 330, y: 650, w: 330, h: 200, r: 7, kind: 'Nota', title: 'Tratamiento ¿martes o jueves?' },
  { x: 820, y: 640, w: 380, h: 220, r: -7, kind: 'Hoja de cálculo', title: 'Costes 2026 — copia.xlsx' },
  { x: 1260, y: 700, w: 300, h: 170, r: 5, kind: 'Aviso', title: 'Lonja: precio ↓ 12 %' },
]

const COLLAPSE = [270, 345] // las piezas rotas se absorben hacia el centro
const CORE_IN = 300

function ChaosCard({ card, index }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = spring({ frame: frame - index * 5, fps, config: { damping: 14, mass: 0.7 } })
  const collapse = interpolate(frame, COLLAPSE, [0, 1], { ...clamp, easing: (t) => t * t })
  // Temblor nervioso y «glitch» horizontal ocasional (UI rota).
  const glitch = Math.floor(frame / 6 + index * 3) % 11 === 0 ? 22 : 0
  const jx = Math.sin(frame / 3.1 + index * 1.7) * 5 + glitch
  const jy = Math.cos(frame / 2.7 + index) * 4
  const cx = card.x + card.w / 2
  const cy = card.y + card.h / 2
  const dx = lerp(0, CENTER.x - cx, collapse)
  const dy = lerp(0, CENTER.y - cy, collapse)
  return (
    <div
      style={{
        position: 'absolute',
        left: card.x,
        top: card.y,
        width: card.w,
        height: card.h,
        transform: `translate(${jx + dx}px, ${jy + dy + (1 - enter) * 80}px) rotate(${card.r * (1 - collapse) + (1 - enter) * 12}deg) scale(${(0.85 + enter * 0.15) * (1 - collapse * 0.85)})`,
        opacity: enter * (1 - collapse),
        ...glassCard({ borderRadius: 20, background: 'rgba(40, 14, 14, 0.82)', border: '1px solid rgba(249,115,102,0.45)', boxShadow: '0 0 30px rgba(249,115,102,0.18), 0 30px 80px -30px rgba(0,0,0,0.85)' }),
        padding: 22,
        fontFamily: FONT,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: C.danger, fontSize: 18, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
        <span style={{ width: 10, height: 10, borderRadius: 99, background: C.danger, opacity: 0.4 + 0.6 * Math.abs(Math.sin(frame / 5 + index)) }} />
        {card.kind}
      </div>
      <div style={{ marginTop: 12, color: '#fde2df', fontSize: 24, fontWeight: 600, lineHeight: 1.25 }}>{card.title}</div>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ marginTop: 12, height: 10, width: `${85 - i * 22}%`, borderRadius: 6, background: 'rgba(249,115,102,0.14)' }} />
      ))}
    </div>
  )
}

export function ChaosScene() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const redWash = interpolate(frame, [0, 40, 250, 330], [0, 0.18, 0.18, 0], clamp)
  const appear = spring({ frame: frame - CORE_IN, fps, config: { damping: 12, mass: 0.9 } })
  const flash = interpolate(frame, [CORE_IN - 5, CORE_IN + 10, CORE_IN + 50], [0, 0.6, 0], clamp)
  return (
    <AbsoluteFill>
      {/* Tinte rojo del caos que se apaga al llegar la solución */}
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 50%, rgba(249,115,102,${redWash}), transparent 70%)` }} />
      {CHAOS.map((card, i) => (
        <ChaosCard key={card.title} card={card} index={i} />
      ))}
      <AbsoluteFill style={{ background: `radial-gradient(circle at ${CENTER.x}px ${CENTER.y}px, rgba(52,211,153,${flash}), transparent 45%)` }} />
      {frame >= CORE_IN - 5 && <CoreNode appear={appear} />}
      <Caption eyebrow="Hoy en tu explotación" title="Datos dispersos. Decisiones a ciegas." y={90} delay={20} until={280} />
      <Caption eyebrow="La solución" title="Un núcleo que lo unifica todo" y={90} delay={340} />
      <div style={{ position: 'absolute', top: 900, width: '100%', textAlign: 'center', opacity: interpolate(frame, [400, 420], [0, 1], clamp) }}>
        <NeonPill>Farm OS agnóstico de hardware</NeonPill>
      </div>
    </AbsoluteFill>
  )
}

/* =================================================================================================
 * 2 · [20 s – 45 s] Ingesta de datos
 * ================================================================================================= */

const INPUTS = [
  { label: 'Sensores', sub: 'IoT · cualquier marca', x: 280, y: 320 },
  { label: 'BBDD', sub: 'Hojas · ERP · cuadernos', x: 280, y: 800 },
  { label: 'APIs', sub: 'Clima · lonjas · labs', x: 1640, y: 560 },
]

/** Punto de una curva cuadrática entre el nodo `a` y el núcleo (para mover partículas por la línea). */
function along(a, t) {
  const cx = (a.x + CENTER.x) / 2
  const cy = a.y
  return {
    x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * cx + t ** 2 * CENTER.x,
    y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * cy + t ** 2 * CENTER.y,
  }
}

export function IngestScene() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const zoom = interpolate(frame, [0, 765], [1, 1.06], clamp) // leve acercamiento de cámara
  const records = Math.floor(interpolate(frame, [60, 700], [0, 128450], clamp))
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
          {INPUTS.map((n, i) => {
            const grow = interpolate(frame, [15 + i * 10, 50 + i * 10], [0, 1], clamp)
            const d = `M${n.x} ${n.y} Q${(n.x + CENTER.x) / 2} ${n.y} ${CENTER.x} ${CENTER.y}`
            return (
              <g key={n.label}>
                <path d={d} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={3} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - grow} />
                {grow >= 1 &&
                  [0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
                    const t = ((frame - 50 + k * 9 + i * 7) % 72) / 72
                    if (t < 0) return null
                    const p = along(n, t)
                    return <circle key={k} cx={p.x} cy={p.y} r={7} fill={C.teal} opacity={Math.sin(t * Math.PI)} style={{ filter: `drop-shadow(0 0 10px ${C.teal})` }} />
                  })}
              </g>
            )
          })}
        </svg>

        <CoreNode appear={1} />

        {INPUTS.map((n, i) => {
          const s = spring({ frame: frame - i * 10, fps, config: { damping: 13 } })
          return (
            <div
              key={n.label}
              style={{ position: 'absolute', left: n.x - 170, top: n.y - 62, width: 340, transform: `scale(${s})`, opacity: s, ...glassCard({ borderRadius: 22, border: '1px solid rgba(94,234,212,0.35)' }), padding: '22px 26px', fontFamily: FONT }}
            >
              <div style={{ color: C.text, fontSize: 34, fontWeight: 650 }}>{n.label}</div>
              <div style={{ marginTop: 4, color: C.teal, fontSize: 20, fontFamily: MONO }}>{n.sub}</div>
            </div>
          )
        })}
      </AbsoluteFill>

      <Caption eyebrow="Ingesta de datos" title="Cualquier fuente, un solo flujo" y={60} delay={20} />
      <div style={{ position: 'absolute', top: 930, width: '100%', textAlign: 'center', fontFamily: MONO, opacity: interpolate(frame, [60, 80], [0, 1], clamp) }}>
        <span style={{ color: C.muted, fontSize: 24 }}>registros normalizados </span>
        <span style={{ color: C.emerald, fontSize: 34, fontWeight: 700 }}>{records.toLocaleString('es-ES')}</span>
      </div>
    </AbsoluteFill>
  )
}

/* =================================================================================================
 * 3 · [45 s – 75 s] Cerebro MBSE y protocolos: engranajes + red neuronal → calendario inteligente
 * ================================================================================================= */

/** Silueta de engranaje (dientes trapezoidales) centrada en 0,0. */
function gearPath(teeth, rOuter, rInner) {
  const pts = []
  const step = (Math.PI * 2) / teeth
  for (let i = 0; i < teeth; i += 1) {
    const a = i * step
    pts.push([Math.cos(a - step * 0.28) * rInner, Math.sin(a - step * 0.28) * rInner])
    pts.push([Math.cos(a - step * 0.16) * rOuter, Math.sin(a - step * 0.16) * rOuter])
    pts.push([Math.cos(a + step * 0.16) * rOuter, Math.sin(a + step * 0.16) * rOuter])
    pts.push([Math.cos(a + step * 0.28) * rInner, Math.sin(a + step * 0.28) * rInner])
  }
  return `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')} Z`
}

const GEAR_A = gearPath(14, 150, 126)
const GEAR_B = gearPath(10, 104, 84)

function Gears({ frame }) {
  const rot = frame * 0.6
  return (
    <svg width={760} height={760} style={{ position: 'absolute', left: 40, top: 200, opacity: 0.28 }}>
      <g transform={`translate(260 300) rotate(${rot})`}>
        <path d={GEAR_A} fill="none" stroke={C.emerald} strokeWidth={4} />
        <circle r={46} fill="none" stroke={C.emerald} strokeWidth={4} />
      </g>
      {/* Engranaje conducido: gira en sentido contrario y más rápido (relación de dientes 14:10) */}
      <g transform={`translate(${260 + 236} ${300 + 92}) rotate(${-rot * 1.4 + 9})`}>
        <path d={GEAR_B} fill="none" stroke={C.teal} strokeWidth={4} />
        <circle r={32} fill="none" stroke={C.teal} strokeWidth={4} />
      </g>
    </svg>
  )
}

// Red neuronal: 3 capas (entradas · ocultas · protocolos)
const LAYERS = [
  [{ y: 360 }, { y: 480 }, { y: 600 }, { y: 720 }],
  [{ y: 330 }, { y: 440 }, { y: 550 }, { y: 660 }, { y: 770 }],
  [{ y: 420 }, { y: 560 }, { y: 700 }],
]
const LAYER_X = [170, 420, 670]

function NeuralNet({ frame }) {
  const nodes = LAYERS.map((layer, li) => layer.map((n) => ({ x: LAYER_X[li], y: n.y })))
  const edges = []
  for (let l = 0; l < nodes.length - 1; l += 1) {
    nodes[l].forEach((a, i) => nodes[l + 1].forEach((b, j) => edges.push({ a, b, k: i * 7 + j * 3 + l * 11 })))
  }
  // Una «onda de activación» recorre la red de izquierda a derecha en bucle.
  const wave = (frame % 75) / 75
  return (
    <svg width={900} height={1080} style={{ position: 'absolute', left: 0, top: 0 }}>
      {edges.map(({ a, b, k }) => {
        const mid = (a.x + b.x) / 2 / 900
        const lit = Math.max(0, 1 - Math.abs(wave - mid) * 6)
        return <line key={`${a.x}${a.y}${b.x}${b.y}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={lit > 0.1 ? C.emerald : 'rgba(255,255,255,0.10)'} strokeOpacity={0.2 + lit * 0.7} strokeWidth={lit > 0.1 ? 2.5 : 1.5} data-k={k} />
      })}
      {nodes.flat().map((n) => {
        const lit = Math.max(0, 1 - Math.abs(wave - n.x / 900) * 5)
        return <circle key={`${n.x}-${n.y}`} cx={n.x} cy={n.y} r={16} fill={lit > 0.2 ? C.emerald : 'rgba(10,16,14,0.95)'} stroke={C.emerald} strokeWidth={2.5} style={{ filter: lit > 0.2 ? `drop-shadow(0 0 14px ${C.emerald})` : 'none' }} />
      })}
    </svg>
  )
}

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const SLOTS = ['Mañana', 'Tarde']
// Tareas que la red asigna automáticamente: [día, franja, título, cuadrilla]
const TASKS = [
  [0, 0, 'Riego S2', 'Equipo A'],
  [1, 0, 'Trat. mosca', 'Equipo B'],
  [1, 1, 'Mant. cuba 1000L', 'Taller'],
  [2, 0, 'Abonado S1', 'Equipo A'],
  [3, 1, 'Poda olivar', 'Equipo C'],
  [4, 0, 'Cosecha tomate', 'Equipo B'],
  [5, 0, 'Revisión sondas', 'Técnico'],
  [6, 1, 'Informe semanal', 'Agente IA'],
]

const CAL = { x: 900, y: 300, w: 940, h: 560 }
const COL_W = (CAL.w - 180) / 7
const ROW_H = 190

function SmartCalendar({ frame }) {
  const { fps } = useVideoConfig()
  const enter = spring({ frame: frame - 40, fps, config: { damping: 15 } })
  return (
    <div style={{ position: 'absolute', left: CAL.x, top: CAL.y, width: CAL.w, height: CAL.h, transform: `translateX(${(1 - enter) * 120}px)`, opacity: enter, ...glassCard({ border: '1px solid rgba(52,211,153,0.25)' }), fontFamily: FONT }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 30px 10px' }}>
        <div style={{ color: C.text, fontSize: 28, fontWeight: 650 }}>Calendario inteligente</div>
        <NeonPill style={{ fontSize: 16, padding: '6px 14px' }}>Asignación automática</NeonPill>
      </div>
      <div style={{ position: 'relative', margin: '10px 30px', height: 450 }}>
        {DAYS.map((d, i) => (
          <div key={d} style={{ position: 'absolute', left: 120 + i * COL_W, top: 0, width: COL_W, textAlign: 'center', color: C.muted, fontSize: 18, fontWeight: 600 }}>{d}</div>
        ))}
        {SLOTS.map((s, r) => (
          <div key={s} style={{ position: 'absolute', left: 0, top: 40 + r * ROW_H, width: 110, height: ROW_H - 10, display: 'flex', alignItems: 'center', color: C.muted, fontSize: 18 }}>{s}</div>
        ))}
        {/* Rejilla */}
        {SLOTS.map((_, r) =>
          DAYS.map((__, c) => (
            <div key={`${r}-${c}`} style={{ position: 'absolute', left: 120 + c * COL_W + 4, top: 40 + r * ROW_H, width: COL_W - 8, height: ROW_H - 10, borderRadius: 14, border: '1px dashed rgba(255,255,255,0.08)' }} />
          )),
        )}
        {/* Tareas que «caen» en su hueco una tras otra */}
        {TASKS.map(([c, r, title, crew], i) => {
          const s = spring({ frame: frame - 150 - i * 50, fps, config: { damping: 12, mass: 0.8 } })
          if (s <= 0.001) return null
          return (
            <div
              key={title}
              style={{
                position: 'absolute',
                left: 120 + c * COL_W + 4,
                top: 40 + r * ROW_H,
                width: COL_W - 8,
                height: ROW_H - 10,
                transform: `translate(${(1 - s) * -380}px, ${(1 - s) * 60}px) scale(${0.6 + s * 0.4})`,
                opacity: s,
                borderRadius: 14,
                background: 'linear-gradient(180deg, rgba(52,211,153,0.22), rgba(52,211,153,0.07))',
                border: '1px solid rgba(52,211,153,0.5)',
                boxShadow: '0 0 18px rgba(16,185,129,0.25)',
                padding: 9,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ color: C.text, fontSize: 15, fontWeight: 650, lineHeight: 1.2, overflowWrap: 'anywhere' }}>{title}</div>
              <div style={{ color: '#6ee7b7', fontSize: 12, fontFamily: MONO, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{crew}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function MbseScene() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const netIn = spring({ frame: frame - 10, fps, config: { damping: 16 } })
  const factory = interpolate(frame, [560, 590], [0, 1], clamp)
  return (
    <AbsoluteFill>
      <Gears frame={frame} />
      <div style={{ position: 'absolute', inset: 0, opacity: netIn, transform: `translateX(${(1 - netIn) * -60}px)` }}>
        <NeuralNet frame={frame} />
        {/* Rótulos de las capas */}
        {['Datos crudos', 'Modelo MBSE', 'Protocolos'].map((t, i) => (
          <div key={t} style={{ position: 'absolute', left: LAYER_X[i] - 100, top: 850, width: 200, textAlign: 'center', color: i === 1 ? C.emerald : C.muted, fontSize: 20, fontWeight: 600, fontFamily: FONT }}>{t}</div>
        ))}
      </div>
      {/* Flecha de la red al calendario */}
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <path d="M700 560 C800 560 820 560 930 560" fill="none" stroke={C.emerald} strokeWidth={3} strokeDasharray="10 12" strokeDashoffset={-frame * 1.5} opacity={interpolate(frame, [100, 130], [0, 0.8], clamp)} />
      </svg>
      <SmartCalendar frame={frame} />
      <Caption eyebrow="Cerebro MBSE" title="De datos crudos a metodología de trabajo" y={70} delay={20} until={575} />
      <Caption eyebrow="Cerebro MBSE" title="Tu campo, gestionado como una fábrica" y={70} delay={590} />
      <div style={{ position: 'absolute', top: 920, width: '100%', textAlign: 'center', opacity: factory }}>
        <NeonPill>Protocolos estandarizados · tareas asignadas sin colisiones</NeonPill>
      </div>
    </AbsoluteFill>
  )
}

/* =================================================================================================
 * 4 · [75 s – 100 s] Optimización y economía
 * ================================================================================================= */

const CROPS = [
  { label: 'Tomate', cost: 0.58, market: 1.06 },
  { label: 'Pimiento', cost: 0.82, market: 1.24 },
  { label: 'Pepino', cost: 0.41, market: 0.74 },
  { label: 'Berenjena', cost: 0.49, market: 0.81 },
]
const MAX_PRICE = 1.3

function KpiTile({ x, label, value, unit, delta, frame, delay }) {
  const { fps } = useVideoConfig()
  const s = spring({ frame: frame - delay, fps, config: { damping: 14 } })
  return (
    <div style={{ position: 'absolute', left: x, top: 260, width: 400, height: 170, transform: `translateY(${(1 - s) * 40}px)`, opacity: s, ...glassCard({ borderRadius: 22 }), padding: '24px 28px', fontFamily: FONT }}>
      <div style={{ color: C.muted, fontSize: 18, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ marginTop: 10, color: C.text, fontSize: 52, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {value}
        <span style={{ fontSize: 26, color: C.muted, marginLeft: 6 }}>{unit}</span>
      </div>
      <div style={{ color: C.emerald, fontSize: 20, fontWeight: 600 }}>{delta}</div>
    </div>
  )
}

export function EconomyScene() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const margin = interpolate(frame, [60, 240], [0, 38.4], clamp)
  const water = interpolate(frame, [120, 300], [0, 22], clamp)
  const inputs = interpolate(frame, [180, 360], [0, 14], clamp)
  const chartIn = spring({ frame: frame - 70, fps, config: { damping: 15 } })
  const draw = interpolate(frame, [200, 380], [0, 1], clamp)
  const fmt = (n) => n.toFixed(1).replace('.', ',')
  return (
    <AbsoluteFill>
      <KpiTile x={150} label="Margen real vs. lonja" value={fmt(margin)} unit="%" delta="▲ por encima del precio de coste" frame={frame} delay={20} />
      <KpiTile x={760} label="Agua optimizada" value={`−${fmt(water)}`} unit="%" delta="riego según humedad real" frame={frame} delay={60} />
      <KpiTile x={1370} label="Insumos optimizados" value={`−${fmt(inputs)}`} unit="%" delta="dosis y compras ajustadas" frame={frame} delay={100} />

      {/* Panel de márgenes por cultivo: coste (ámbar) frente a precio en origen (esmeralda neón) */}
      <div style={{ position: 'absolute', left: 150, top: 470, width: 1000, height: 470, opacity: chartIn, transform: `translateY(${(1 - chartIn) * 40}px)`, ...glassCard({ border: '1px solid rgba(52,211,153,0.25)', boxShadow: '0 0 40px rgba(16,185,129,0.15), 0 30px 80px -30px rgba(0,0,0,0.85)' }), padding: '28px 36px', fontFamily: FONT }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ color: C.text, fontSize: 28, fontWeight: 650 }}>Coste de producción vs. lonja (€/kg)</div>
          <div style={{ color: C.muted, fontSize: 16, fontFamily: MONO }}>datos de ejemplo</div>
        </div>
        <div style={{ position: 'absolute', left: 36, right: 36, bottom: 70, height: 280, display: 'flex', alignItems: 'flex-end', gap: 50 }}>
          {CROPS.map((c, i) => {
            const g = spring({ frame: frame - 100 - i * 12, fps, config: { damping: 16 } })
            return (
              <div key={c.label} style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                <div style={{ flex: 1, height: `${(c.cost / MAX_PRICE) * 100 * g}%`, borderRadius: '10px 10px 4px 4px', background: 'linear-gradient(180deg, rgba(251,191,36,0.85), rgba(251,191,36,0.3))' }} />
                <div style={{ flex: 1, height: `${(c.market / MAX_PRICE) * 100 * g}%`, borderRadius: '10px 10px 4px 4px', background: `linear-gradient(180deg, ${C.lime}, ${C.emerald})`, boxShadow: '0 0 20px rgba(52,211,153,0.35)' }} />
              </div>
            )
          })}
        </div>
        <div style={{ position: 'absolute', left: 36, right: 36, bottom: 28, display: 'flex', gap: 50 }}>
          {CROPS.map((c) => (
            <div key={c.label} style={{ flex: 1, textAlign: 'center', color: C.muted, fontSize: 20 }}>{c.label}</div>
          ))}
        </div>
      </div>

      {/* Consumo de agua: la curva baja mientras se dibuja */}
      <div style={{ position: 'absolute', left: 1190, top: 470, width: 580, height: 470, opacity: chartIn, ...glassCard(), padding: '28px 32px', fontFamily: FONT }}>
        <div style={{ color: C.text, fontSize: 28, fontWeight: 650 }}>Consumo de agua (m³/ha)</div>
        <svg width={516} height={330} style={{ position: 'absolute', left: 32, bottom: 30 }}>
          <path d="M0 60 C80 70 120 90 170 120 S280 190 330 210 S440 250 516 262" fill="none" stroke={C.teal} strokeWidth={5} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} style={{ filter: `drop-shadow(0 0 10px ${C.teal})` }} />
          <path d="M0 60 C80 70 120 90 170 120 S280 190 330 210 S440 250 516 262 V330 H0 Z" fill="rgba(94,234,212,0.08)" opacity={draw} />
        </svg>
      </div>

      <Caption eyebrow="Optimización y economía" title="Márgenes reales, en tiempo real" y={90} delay={10} />
    </AbsoluteFill>
  )
}

/* =================================================================================================
 * 5 · [100 s – 120 s] Blockchain: escudo holográfico de Polygon L2 anclando los datos
 * ================================================================================================= */

const BLOCKS = 6

export function BlockchainScene() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = spring({ frame: frame - 20, fps, config: { damping: 11, mass: 0.9 } })
  const scan = ((frame % 90) / 90) * 340 // línea de escaneo holográfica
  const check = interpolate(frame, [330, 370], [0, 1], clamp)
  const hue = Math.sin(frame / 18) * 0.15
  return (
    <AbsoluteFill>
      {/* Bloques de datos entrando por la izquierda y saliendo encadenados (y sellados) por la derecha */}
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        {Array.from({ length: BLOCKS }, (_, i) => {
          const t = interpolate(frame - 60 - i * 35, [0, 70], [0, 1], clamp)
          const x = lerp(150, 760, t)
          return t > 0 && t < 1 ? <rect key={`in${i}`} x={x} y={530} width={44} height={44} rx={8} fill="rgba(94,234,212,0.25)" stroke={C.teal} strokeWidth={2} opacity={1 - t * 0.6} /> : null
        })}
        {Array.from({ length: BLOCKS }, (_, i) => {
          const s = spring({ frame: frame - 140 - i * 35, fps, config: { damping: 14 } })
          const x = 1240 + i * 100
          return (
            <g key={`out${i}`} opacity={s} transform={`translate(${(1 - s) * -80} 0)`}>
              {i > 0 && <line x1={x - 56} y1={552} x2={x} y2={552} stroke={C.emerald} strokeWidth={3} />}
              <rect x={x} y={530} width={44} height={44} rx={8} fill="rgba(6,40,30,0.95)" stroke={C.emerald} strokeWidth={2.5} style={{ filter: `drop-shadow(0 0 8px ${C.emerald})` }} />
              {/* candado */}
              <rect x={x + 14} y={549} width={16} height={12} rx={2} fill={C.emerald} />
              <path d={`M${x + 17} ${549} v-5 a5 5 0 0 1 10 0 v5`} fill="none" stroke={C.emerald} strokeWidth={2.5} />
            </g>
          )
        })}
      </svg>

      {/* Escudo holográfico */}
      <div style={{ position: 'absolute', left: CENTER.x - 170, top: 330, width: 340, height: 400, transform: `scale(${enter})`, opacity: Math.min(1, enter * 1.3) }}>
        {/* anillo hexagonal que gira detrás (guiño a Polygon) */}
        <svg width={480} height={480} viewBox="-240 -240 480 480" style={{ position: 'absolute', left: -70, top: -40, transform: `rotate(${frame * 0.5}deg)`, opacity: 0.55 }}>
          <polygon points={Array.from({ length: 6 }, (_, k) => `${Math.cos((k * Math.PI) / 3) * 220},${Math.sin((k * Math.PI) / 3) * 220}`).join(' ')} fill="none" stroke={C.teal} strokeWidth={3} strokeDasharray="18 14" />
        </svg>
        <svg width={340} height={400} viewBox="0 0 120 140" style={{ position: 'relative', filter: `drop-shadow(0 0 ${30 + hue * 60}px rgba(52,211,153,0.7))` }}>
          <defs>
            <linearGradient id="holo" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="rgba(52,211,153,0.45)" />
              <stop offset="50%" stopColor="rgba(94,234,212,0.22)" />
              <stop offset="100%" stopColor="rgba(6,40,30,0.9)" />
            </linearGradient>
            <clipPath id="shield-clip">
              <path d="M60 4 L112 24 V64 C112 98 90 120 60 136 C30 120 8 98 8 64 V24 Z" />
            </clipPath>
          </defs>
          <path d="M60 4 L112 24 V64 C112 98 90 120 60 136 C30 120 8 98 8 64 V24 Z" fill="url(#holo)" stroke={C.emerald} strokeWidth="3" strokeLinejoin="round" />
          <g clipPath="url(#shield-clip)">
            <rect x="0" y={(scan / 340) * 140 - 6} width="120" height="6" fill="rgba(167,243,208,0.55)" />
          </g>
          <path d="M36 70 L54 88 L86 52" fill="none" stroke="#d1fae5" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - check} />
        </svg>
      </div>

      <div style={{ position: 'absolute', top: 790, width: '100%', textAlign: 'center', fontFamily: FONT, opacity: interpolate(frame, [200, 230], [0, 1], clamp) }}>
        <div style={{ color: C.text, fontSize: 40, fontWeight: 700 }}>Polygon L2 · Anclaje inmutable</div>
        <div style={{ marginTop: 10, color: C.muted, fontSize: 22, fontFamily: MONO }}>SHA-256 · bloque sellado · trazabilidad verificable</div>
      </div>
      <Caption eyebrow="Blockchain" title="Cada dato, cifrado y anclado" y={90} delay={15} />
    </AbsoluteFill>
  )
}

/* =================================================================================================
 * 6 · [120 s – 150 s] Red global, partners y cierre majestuoso
 * ================================================================================================= */

// Fincas conectadas (posiciones del «mapa» estilizado) — no son clientes reales.
const FARMS = [
  [380, 330], [520, 250], [640, 420], [470, 560], [760, 300], [820, 640], [1080, 250], [1220, 400],
  [1360, 280], [1500, 470], [1150, 650], [1420, 690], [600, 760], [300, 650], [1640, 330], [980, 780],
]

export function GlobalScene() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  // 0–150: el núcleo se aleja (zoom out) y aparece el mapa.
  const zoomOut = interpolate(frame, [0, 150], [1, 0.32], { ...clamp, easing: (t) => 1 - (1 - t) ** 3 })
  const mapIn = interpolate(frame, [40, 160], [0, 1], clamp)
  // 360–600: los flujos convergen y se eleva un haz de luz (alianzas).
  const converge = interpolate(frame, [360, 470], [0, 1], clamp)
  const beam = interpolate(frame, [430, 560], [0, 1], { ...clamp, easing: (t) => t * t })
  // 600–900: cierre de marca.
  const sceneOut = interpolate(frame, [590, 650], [1, 0], clamp)
  const logo = spring({ frame: frame - 620, fps, config: { damping: 15, mass: 1.2 } })
  const slogan = interpolate(frame, [680, 710], [0, 1], clamp)
  const pill = interpolate(frame, [740, 770], [0, 1], clamp)

  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', inset: 0, opacity: sceneOut }}>
        {/* Mapa oscuro: retícula de puntos con máscara de «continente» */}
        <AbsoluteFill
          style={{
            opacity: mapIn * 0.9,
            backgroundImage: 'radial-gradient(rgba(148,163,155,0.35) 1.6px, transparent 1.8px)',
            backgroundSize: '22px 22px',
            maskImage: 'radial-gradient(ellipse 48% 38% at 46% 48%, black 55%, transparent 100%), radial-gradient(ellipse 22% 20% at 78% 40%, black 50%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 48% 38% at 46% 48%, black 55%, transparent 100%), radial-gradient(ellipse 22% 20% at 78% 40%, black 50%, transparent 100%)',
          }}
        />
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
          {FARMS.map(([x, y], i) => {
            const s = spring({ frame: frame - 90 - i * 8, fps, config: { damping: 12 } })
            // Arcos finca → núcleo; con `converge` los pulsos se aceleran hacia el centro.
            const mx = (x + CENTER.x) / 2
            const my = Math.min(y, CENTER.y) - 120
            const d = `M${x} ${y} Q${mx} ${my} ${CENTER.x} ${CENTER.y}`
            const t = ((frame * (1 + converge * 2) + i * 13) % 80) / 80
            return (
              <g key={i} opacity={s}>
                <path d={d} fill="none" stroke="rgba(52,211,153,0.18)" strokeWidth={2} />
                <path d={d} fill="none" stroke={C.emerald} strokeWidth={3} pathLength={1} strokeDasharray="0.08 0.92" strokeDashoffset={1 - t} strokeLinecap="round" />
                <circle cx={x} cy={y} r={9 + Math.abs(Math.sin(frame / 12 + i)) * 3} fill={C.emerald} style={{ filter: `drop-shadow(0 0 10px ${C.emerald})` }} />
              </g>
            )
          })}
        </svg>

        {/* Haz de luz ascendente desde el núcleo */}
        <div
          style={{
            position: 'absolute',
            left: CENTER.x - 60 * beam,
            top: 0,
            width: 120 * beam,
            height: CENTER.y,
            background: 'linear-gradient(0deg, rgba(167,243,208,0.95), rgba(52,211,153,0.35) 60%, transparent)',
            filter: 'blur(6px)',
            opacity: beam,
          }}
        />
        <div style={{ position: 'absolute', left: CENTER.x - 3, top: 0, width: 6, height: CENTER.y, background: '#ecfdf5', opacity: beam, boxShadow: '0 0 40px 12px rgba(52,211,153,0.6)' }} />

        <CoreNode appear={1} scale={zoomOut + converge * 0.15} label={zoomOut > 0.6} />

        <Caption eyebrow="Red global" title="Cada finca conectada, una red que aprende" y={70} delay={160} until={430} />
        <Caption eyebrow="Ecosistema" title="Alianzas que multiplican el valor del dato" y={70} delay={450} until={600} />
      </div>

      {/* Cierre: logo majestuoso con destello */}
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontFamily: FONT, opacity: interpolate(frame, [610, 640], [0, 1], clamp) }}>
        <div style={{ position: 'absolute', left: CENTER.x - 600, top: 540 - 600, width: 1200, height: 1200, background: 'radial-gradient(closest-side, rgba(52,211,153,0.22), transparent)', transform: `scale(${0.6 + logo * 0.4})` }} />
        <Img src="/brand/logo-white.png" style={{ position: 'relative', height: 170, objectFit: 'contain', transform: `scale(${0.85 + logo * 0.15})`, opacity: logo }} />
        <div style={{ position: 'relative', marginTop: 50, color: C.text, fontSize: 68, fontWeight: 650, letterSpacing: -1.5, opacity: slogan }}>El Empleado Perfecto que nunca duerme.</div>
        <div style={{ position: 'relative', marginTop: 18, fontSize: 42, fontWeight: 600, opacity: slogan, background: `linear-gradient(90deg, ${C.emerald}, ${C.teal})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
          Tu explotación, unificada por IA.
        </div>
        <div style={{ position: 'relative', marginTop: 56, opacity: pill }}>
          <NeonPill>agropelink.es</NeonPill>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
