import { Player } from '@remotion/player'
import { useEffect, useRef, useState } from 'react'
import AgropelinkPromo from './AgropelinkPromo.jsx'
import { AUDIO_SRC, DURATION_IN_FRAMES, PROMO } from './theme.js'

/** ¿Existe la locución? (un HEAD a nuestro propio servidor; sin terceros). Si falta, el vídeo se reproduce mudo. */
async function audioAvailable(signal) {
  try {
    const res = await fetch(AUDIO_SRC, { method: 'HEAD', signal })
    return res.ok && String(res.headers.get('content-type') ?? '').startsWith('audio/')
  } catch {
    return false
  }
}

/**
 * Reproductor de la composición `AgropelinkPromo`. Se carga bajo demanda (al pulsar Play en la landing), así que
 * Remotion no pesa en la carga inicial de la página.
 */
export default function PromoPlayer() {
  const playerRef = useRef(null)
  const [withAudio, setWithAudio] = useState(null) // null = comprobando

  useEffect(() => {
    const controller = new AbortController()
    audioAvailable(controller.signal).then(setWithAudio)
    return () => controller.abort()
  }, [])

  // El usuario ya pulsó Play en el póster: arrancar en cuanto el reproductor esté listo.
  useEffect(() => {
    if (withAudio !== null) playerRef.current?.play()
  }, [withAudio])

  if (withAudio === null) return <div className="h-full w-full bg-black/40" aria-hidden="true" />

  return (
    <Player
      ref={playerRef}
      component={AgropelinkPromo}
      inputProps={{ withAudio }}
      durationInFrames={DURATION_IN_FRAMES}
      compositionWidth={PROMO.width}
      compositionHeight={PROMO.height}
      fps={PROMO.fps}
      controls
      clickToPlay
      doubleClickToFullscreen
      allowFullscreen
      acknowledgeRemotionLicense
      style={{ width: '100%', height: '100%' }}
    />
  )
}
