import { interpolate, useCurrentFrame } from 'remotion'
import { C, FADE, FONT } from './theme.js'

export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }

/**
 * Capa a pantalla completa (equivalente a <AbsoluteFill> de Remotion). Propia porque la de Remotion 4 avisa en
 * desarrollo con React 18 («ref is not a prop»); visualmente es idéntica.
 */
export function AbsoluteFill({ style, children }) {
  return <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', ...style }}>{children}</div>
}

/** Fundido de entrada y salida de una escena (frames locales de su <Sequence>; `duration` = la de la escena). */
export function SceneFade({ duration, fadeIn = true, children }) {
  const frame = useCurrentFrame()
  const opacity = interpolate(frame, [0, FADE, duration - FADE, duration], [fadeIn ? 0 : 1, 1, 1, 0], clamp)
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>
}

/** Fondo común: degradado oscuro, retícula técnica y dos focos de luz esmeralda que derivan despacio. */
export function Backdrop() {
  const frame = useCurrentFrame()
  const drift = Math.sin(frame / 90) * 60
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 90% at 50% 0%, ${C.bg2} 0%, ${C.bg} 60%)` }}>
      <AbsoluteFill
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 78%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 78%)',
        }}
      />
      <div style={{ position: 'absolute', left: 260 + drift, top: 120, width: 900, height: 700, background: 'radial-gradient(closest-side, rgba(16,185,129,0.16), transparent)' }} />
      <div style={{ position: 'absolute', right: 180 - drift, bottom: 40, width: 900, height: 700, background: 'radial-gradient(closest-side, rgba(45,181,154,0.13), transparent)' }} />
    </AbsoluteFill>
  )
}

/** Rótulo de escena: antetítulo esmeralda + titular grande, con entrada suave (y salida en `until`, si se indica). */
export function Caption({ eyebrow, title, y = 120, delay = 0, until, sub }) {
  const frame = useCurrentFrame()
  const t = interpolate(frame - delay, [0, 18], [0, 1], clamp)
  const out = until === undefined ? 1 : interpolate(frame, [until - 18, until], [1, 0], clamp)
  return (
    <div style={{ position: 'absolute', top: y, width: '100%', textAlign: 'center', fontFamily: FONT, opacity: t * out, transform: `translateY(${(1 - t) * 24 - (1 - out) * 16}px)` }}>
      {eyebrow && (
        <div style={{ color: C.emerald, fontSize: 24, fontWeight: 600, letterSpacing: 6, textTransform: 'uppercase' }}>{eyebrow}</div>
      )}
      <div style={{ marginTop: 14, color: C.text, fontSize: 64, fontWeight: 650, letterSpacing: -1.5 }}>{title}</div>
      {sub && <div style={{ marginTop: 14, color: C.muted, fontSize: 28 }}>{sub}</div>}
    </div>
  )
}

/** Píldora de estado con punto que late (equivalente a `pill-neon` de la web). */
export function NeonPill({ children, style }) {
  const frame = useCurrentFrame()
  const pulse = 0.55 + 0.45 * Math.abs(Math.sin(frame / 10))
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 20px',
        borderRadius: 999,
        border: '1px solid rgba(16,185,129,0.3)',
        background: 'rgba(0,0,0,0.6)',
        color: '#6ee7b7',
        fontFamily: FONT,
        fontSize: 22,
        fontWeight: 600,
        letterSpacing: 2,
        textTransform: 'uppercase',
        ...style,
      }}
    >
      <span style={{ width: 12, height: 12, borderRadius: 99, background: C.emerald, opacity: pulse, boxShadow: `0 0 14px ${C.emerald}` }} />
      {children}
    </div>
  )
}
