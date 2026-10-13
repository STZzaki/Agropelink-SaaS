import { Audio, Sequence } from 'remotion'
import { AbsoluteFill, Backdrop, SceneFade } from './primitives.jsx'
import { BlockchainScene, ChaosScene, EconomyScene, GlobalScene, IngestScene, MbseScene } from './scenes.jsx'
import { AUDIO_SRC, SCENES } from './theme.js'

// Guion del pitch (2:30): [clave de tiempos, escena, nombre visible en Remotion Studio]
const STORY = [
  ['chaos', ChaosScene, '0:00 · El caos y la solución'],
  ['ingest', IngestScene, '0:20 · Ingesta de datos'],
  ['mbse', MbseScene, '0:45 · Cerebro MBSE y protocolos'],
  ['economy', EconomyScene, '1:15 · Optimización y economía'],
  ['blockchain', BlockchainScene, '1:40 · Blockchain'],
  ['global', GlobalScene, '2:00 · Red global y partners'],
]

/**
 * Composición `AgropelinkPromo` (1920×1080, 30 fps, 150 s = 4500 frames). Cada escena va en su <Sequence> con los tiempos de
 * `theme.js`; la locución se añade con <Audio> cuando `withAudio` es true (el archivo existe en /public).
 */
export default function AgropelinkPromo({ withAudio = false }) {
  return (
    <AbsoluteFill style={{ backgroundColor: '#070b0a' }}>
      <Backdrop />
      {STORY.map(([key, Scene, name], i) => (
        // layout="none": cada escena ya es una capa a pantalla completa (SceneFade).
        <Sequence key={key} name={name} from={SCENES[key].from} durationInFrames={SCENES[key].duration} layout="none">
          <SceneFade duration={SCENES[key].duration} fadeIn={i > 0}>
            <Scene />
          </SceneFade>
        </Sequence>
      ))}
      {withAudio && <Audio src={AUDIO_SRC} />}
    </AbsoluteFill>
  )
}
