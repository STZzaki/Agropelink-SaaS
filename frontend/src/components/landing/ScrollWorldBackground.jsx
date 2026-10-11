import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ScrollTrigger, gsap, prefersReducedMotion } from '../../lib/gsap.js'

/**
 * "Scroll World": campo de cultivo en líneas topográficas 3D (surcos sobre un relieve suave) con partículas
 * de polen, y un recorrido de cámara cinemático ligado al scroll con GSAP ScrollTrigger.
 *
 * Presupuesto de rendimiento (no negociable):
 * - `frameloop="demand"`: solo se dibuja un frame cuando cambia el scroll (ScrollTrigger → `invalidate()`).
 *   Con la página quieta la GPU no trabaja: 0 frames por segundo.
 * - Malla sólida semitransparente (PlaneGeometry) con un ShaderMaterial propio, sin luces: el degradado
 *   (valle verde hoja oscuro → cresta verde azulado) se calcula en el shader según la altura de cada vértice.
 *   Mezcla aditiva + niebla manual: se funde con el fondo y desaparece el efecto sierra de las líneas finas.
 * - Las ondas se mueven con el scroll (fase ligada al progreso), no con un reloj: en reposo, 0 frames.
 * - Antialias + DPR hasta 2: nítido en retina. Con `demand` el coste extra solo existe al hacer scroll.
 * - Todo local: three.js no descarga nada de terceros.
 */

// Paleta corporativa (verde azulado en las crestas) sobre fondo casi negro.
const PALETTE = { teal: new THREE.Color('#2db59a'), fog: '#020617' }
const FIELD_WIDTH = 48

// Relieve suave determinista (suma de senos): colinas, una vaguada y ondulación de surcos.
function height(x, z) {
  return (
    Math.sin(x * 0.18) * Math.cos(z * 0.11) * 1.6 +
    Math.sin((x + z) * 0.07) * 1.2 +
    Math.cos(z * 0.23 + x * 0.05) * 0.45 -
    Math.exp(-((x * 0.12) ** 2)) * 1.1 // vaguada central: el "camino" por el que vuela la cámara
  )
}

const FIELD_DEPTH = 100
const FIELD_Z = 12 - FIELD_DEPTH / 2 // centro del plano: cubre el recorrido de la cámara (z de +12 a −88)

// Mismo relieve que `height()`, en GLSL, con una fase que avanza con el scroll (ondas vivas sin bucle continuo).
const vertexShader = /* glsl */ `
  uniform float uPhase;
  varying float vHeight;
  varying float vDepth;

  float waveHeight(vec2 p) {
    float t = uPhase;
    return sin(p.x * 0.18 + t * 0.9) * cos(p.y * 0.11 - t * 0.6) * 1.6
         + sin((p.x + p.y) * 0.07 + t * 0.5) * 1.2
         + cos(p.y * 0.23 + p.x * 0.05 - t * 1.3) * 0.45
         - exp(-pow(p.x * 0.12, 2.0)) * 1.1; // vaguada central: el "camino" de la cámara
  }

  void main() {
    // El plano llega en XY: se tumba sobre XZ (y = altura) y se centra en el recorrido.
    vec3 world = vec3(position.x, 0.0, -position.y + ${FIELD_Z.toFixed(1)});
    world.y = waveHeight(world.xz);
    vHeight = world.y;
    vec4 mvPosition = modelViewMatrix * vec4(world, 1.0);
    vDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uValley;
  uniform vec3 uCrest;
  uniform float uOpacity;
  uniform float uFogNear;
  uniform float uFogFar;
  varying float vHeight;
  varying float vDepth;

  void main() {
    // Degradado por altura: valles verde hoja oscuro → crestas verde azulado, algo más luminosas.
    float t = smoothstep(-2.2, 2.6, vHeight);
    vec3 color = mix(uValley, uCrest, t) * (0.65 + 0.55 * t);
    // Niebla manual: con mezcla aditiva, "fundir con el fondo" = apagar el color con la distancia.
    float fade = 1.0 - smoothstep(uFogNear, uFogFar, vDepth);
    gl_FragColor = vec4(color * fade, uOpacity * fade);
    #include <colorspace_fragment>
  }
`

function Waves({ segments, progress }) {
  const material = useRef(null)
  const uniforms = useMemo(
    () => ({
      uPhase: { value: 0 },
      uValley: { value: new THREE.Color('#2f7a33') }, // verde hoja (en el shader se oscurece en los valles)
      uCrest: { value: PALETTE.teal.clone() }, // verde azulado de la marca
      uOpacity: { value: 0.5 },
      uFogNear: { value: 14 },
      uFogFar: { value: 70 },
    }),
    [],
  )

  // La fase de las ondas sigue al scroll: se mueven al desplazarse y quedan quietas (sin coste) en reposo.
  useFrame(() => {
    uniforms.uPhase.value = progress.current * 6.0
  })

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[FIELD_WIDTH + 16, FIELD_DEPTH, segments, Math.round(segments * 1.5)]} />
      <shaderMaterial
        ref={material}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

function pollenSprite() {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function Pollen({ count, progress }) {
  const ref = useRef(null)
  const { geometry, sprite } = useMemo(() => {
    const positions = new Float32Array(count * 3)
    let seed = 7
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < count; i += 1) {
      const x = (rand() - 0.5) * 44
      const z = 12 - rand() * 88
      positions.set([x, height(x, z) + 0.4 + rand() * 6, z], i * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return { geometry: g, sprite: pollenSprite() }
  }, [count])

  useEffect(
    () => () => {
      geometry.dispose()
      sprite.dispose()
    },
    [geometry, sprite],
  )

  // Sin animación continua: el polen "flota" en función del progreso del scroll (cero coste en reposo).
  useFrame(() => {
    if (!ref.current) return
    ref.current.position.y = Math.sin(progress.current * Math.PI * 2) * 0.6
    ref.current.rotation.y = progress.current * 0.12
  })

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial map={sprite} color="#a7f3d0" size={0.16} sizeAttenuation transparent opacity={0.7} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  )
}

// Recorrido de cámara: posición, punto de mira y focal en cada tramo del scroll.
const SHOTS = [
  { pos: [0, 6.5, 14], look: [0, 0, -12], fov: 55 }, // plano general de entrada
  { pos: [-9, 3.2, -4], look: [3, 0, -22], fov: 50 }, // paneo lateral a ras de cultivo
  { pos: [7, 10, -20], look: [-4, -0.5, -36], fov: 58 }, // grúa: sube y gira
  { pos: [0, 1.6, -38], look: [0, 0.6, -56], fov: 46 }, // vuelo bajo por la vaguada (zoom in)
  { pos: [0, 16, -44], look: [0, -1, -64], fov: 40 }, // cenital final (zoom out)
]

function CameraRig({ progress }) {
  const { camera, invalidate } = useThree()
  const rig = useRef({ x: SHOTS[0].pos[0], y: SHOTS[0].pos[1], z: SHOTS[0].pos[2], lx: SHOTS[0].look[0], ly: SHOTS[0].look[1], lz: SHOTS[0].look[2], fov: SHOTS[0].fov })
  const target = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    if (prefersReducedMotion()) return undefined // movimiento reducido: plano fijo
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { ease: 'sine.inOut', duration: 1 },
        scrollTrigger: {
          trigger: document.documentElement,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 1.2, // inercia cinematográfica
          onUpdate: (self) => {
            progress.current = self.progress
          },
        },
        onUpdate: invalidate, // un frame por cambio: nada más
      })
      SHOTS.slice(1).forEach((shot) => {
        tl.to(rig.current, { x: shot.pos[0], y: shot.pos[1], z: shot.pos[2], lx: shot.look[0], ly: shot.look[1], lz: shot.look[2], fov: shot.fov })
      })
    })
    // Las secciones cargan imágenes/vídeos y cambian la altura de la página: recalcular el recorrido.
    const refresh = () => ScrollTrigger.refresh()
    window.addEventListener('load', refresh, { once: true })
    return () => {
      window.removeEventListener('load', refresh)
      ctx.revert()
    }
  }, [invalidate, progress])

  useFrame(() => {
    const r = rig.current
    camera.position.set(r.x, r.y, r.z)
    if (camera.fov !== r.fov) {
      camera.fov = r.fov
      camera.updateProjectionMatrix()
    }
    camera.lookAt(target.set(r.lx, r.ly, r.lz))
  })
  return null
}

export default function ScrollWorldBackground({ onReady }) {
  const progress = useRef(0)
  const small = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches

  return (
    <div className="pointer-events-none fixed inset-0 z-[-1]" aria-hidden="true">
      <Canvas
        frameloop="demand"
        camera={{ position: SHOTS[0].pos, fov: SHOTS[0].fov, near: 0.1, far: 140 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, powerPreference: 'default', stencil: false, depth: true }}
        onCreated={({ gl }) => {
          gl.setClearColor(PALETTE.fog)
          onReady?.()
        }}
      >
        <fog attach="fog" args={[PALETTE.fog, 14, 70]} />
        <Waves segments={small ? 64 : 120} progress={progress} />
        <Pollen count={small ? 300 : 700} progress={progress} />
        <CameraRig progress={progress} />
      </Canvas>
      {/* Viñeta estática para fundir el 3D con el contenido (degradado, sin filtros). */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgb(2_6_23/0.75)_100%)]" />
    </div>
  )
}
