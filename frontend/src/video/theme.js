/**
 * Constantes del vídeo promocional (composición Remotion `AgropelinkPromo`).
 *
 * TIEMPOS: cada escena declara su inicio y duración en frames (30 fps). Para sincronizar con la locución
 * (`/public/agropelink-voice.mp3`), ajusta aquí `from`/`duration` de cada escena según los segundos del audio:
 * frame = segundos × 30. El resto de animaciones se calculan en relación con el inicio de su escena.
 */

export const PROMO = {
  id: 'AgropelinkPromo',
  width: 1920,
  height: 1080,
  fps: 30,
}

// Guion del pitch comercial (2:30). Cada escena dura hasta el inicio de la siguiente + FADE (fundido cruzado).
export const SCENES = {
  chaos: { from: 0, duration: 615 }, // 0:00 – 0:20  El caos y la solución (API Core)
  ingest: { from: 600, duration: 765 }, // 0:20 – 0:45  Ingesta de datos
  mbse: { from: 1350, duration: 915 }, // 0:45 – 1:15  Cerebro MBSE y protocolos
  economy: { from: 2250, duration: 765 }, // 1:15 – 1:40  Optimización y economía
  blockchain: { from: 3000, duration: 615 }, // 1:40 – 2:00  Blockchain
  global: { from: 3600, duration: 900 }, // 2:00 – 2:30  Red global, partners y cierre
}

export const DURATION_IN_FRAMES = 4500 // 150 s × 30 fps

// Escenas solapadas 15 frames: el fundido de salida de una cubre la entrada de la siguiente.
export const FADE = 15

export const AUDIO_SRC = '/agropelink-voice.mp3'

// Paleta corporativa: fondo casi negro con matiz verde, cristal oscuro y acentos esmeralda neón.
export const C = {
  bg: '#070b0a',
  bg2: '#0d1512',
  glass: 'rgba(15, 23, 20, 0.72)',
  glassBorder: 'rgba(255, 255, 255, 0.10)',
  emerald: '#34d399',
  emeraldSoft: 'rgba(52, 211, 153, 0.35)',
  teal: '#5eead4',
  lime: '#a3e635',
  text: '#f1f5f2',
  muted: '#93a59b',
  danger: '#f97366',
  amber: '#fbbf24',
}

export const FONT = "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif"
export const MONO = "'JetBrains Mono', 'Cascadia Code', ui-monospace, monospace"

/** Tarjeta de cristal oscuro reutilizable (estilos en línea: funciona igual en el Player y al renderizar). */
export const glassCard = (extra = {}) => ({
  background: C.glass,
  border: `1px solid ${C.glassBorder}`,
  borderRadius: 28,
  boxShadow: '0 30px 80px -30px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)',
  backdropFilter: 'blur(14px)',
  ...extra,
})
