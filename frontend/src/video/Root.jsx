import { Composition } from 'remotion'
import AgropelinkPromo from './AgropelinkPromo.jsx'
import { DURATION_IN_FRAMES, PROMO } from './theme.js'

/**
 * Registro de composiciones para Remotion Studio / renderizado a MP4 con la CLI (`@remotion/cli`, no instalada:
 * la web solo usa el <Player>). No se importa desde la app.
 */
export function RemotionRoot() {
  return (
    <Composition
      id={PROMO.id}
      component={AgropelinkPromo}
      durationInFrames={DURATION_IN_FRAMES}
      fps={PROMO.fps}
      width={PROMO.width}
      height={PROMO.height}
      defaultProps={{ withAudio: true }}
    />
  )
}
