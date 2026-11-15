import { OrbitControls, useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { EXERCISES, type ExerciseId } from '../core/coach'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { applyPose, CAMERA_Y, CAMERA_Z, CYCLE_SECONDS, poseFor, REGION_INDEX, relaxedWrists, type PoseSpec } from './poses'
import { buildRig, type Rig } from './rig'
import { Equipment } from './Equipment'

/*
 * Hologram antrenörün 3D sahnesi. İskeletli insan modeli (Quaternius, CC0) seçilen hareketi yapar; astronotun
 * cinsiyetine göre kadın ya da erkek beden. Hareket sırasında çalışan bölgeler parlar. Fareyle sürükleyerek açı
 * değiştirilir, tekerlekle yakınlaşılır.
 */

export type TrainerBody = 'f' | 'm'
const MODEL_URL: Record<TrainerBody, string> = { f: '/models/trainer-female.glb', m: '/models/trainer-male.glb' }
/** Kameranın başlangıç yeri: hologram odanın içinde, kenarlara değmeden durur (yakınlaştırmayla öne gelinebilir) */
const CAMERA_START: [number, number, number] = [1.18, 1.37, 3.8]

/** İskelet animasyonuna uyumlu hologram malzemesi: kenar parlaması, yüzeye sabit ızgara ve bölge parlaması */
function createTrainerMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uGlow: { value: new Array(8).fill(0) },
      uColor: { value: new THREE.Color('#7fd4f5') },
      uHot: { value: new THREE.Color('#ffb547') },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <skinning_pars_vertex>
      attribute float aRegion;
      flat varying int vRegion;
      varying vec3 vRest;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        #include <skinbase_vertex>
        #include <begin_vertex>
        #include <beginnormal_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
        #include <skinning_vertex>
        vRegion = int(aRegion + 0.5);
        vRest = position;
        vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
        vNormal = normalize(transformedNormal);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uGlow[8];
      uniform vec3 uColor;
      uniform vec3 uHot;
      flat varying int vRegion;
      varying vec3 vRest;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      float gridLine(float c, float spacing) {
        float x = c / spacing;
        float w = fwidth(x);
        float d = abs(fract(x - 0.5) - 0.5) / max(w, 1e-4);
        return (1.0 - clamp(d, 0.0, 1.0)) * (1.0 - smoothstep(0.25, 0.5, w));
      }
      void main() {
        vec3 n = normalize(vNormal);
        float facing = abs(dot(n, normalize(vViewDir)));
        float fres = pow(1.0 - facing, 2.0);
        float grid = max(gridLine(vRest.y, 0.045), gridLine(atan(vRest.z, vRest.x) * 0.25, 0.06)) * 0.35;
        float scan = smoothstep(0.0, 0.02, fract(vRest.y * 2.0 - uTime * 0.35)) * (1.0 - smoothstep(0.02, 0.07, fract(vRest.y * 2.0 - uTime * 0.35)));
        // Arka yüzler soluk çizilir: figürün önü ve arkası birbirine karışmaz (derinlik algısı)
        float front = gl_FrontFacing ? 1.0 : 0.28;
        float glow = uGlow[vRegion] * (gl_FrontFacing ? 1.0 : 0.15);
        vec3 col = mix(uColor, uHot, glow * 0.85);
        float alpha = (0.05 + fres * 0.7 + grid * 0.45 + scan * 0.2) * front + glow * (0.22 + 0.1 * fres);
        gl_FragColor = vec4(col * (0.45 + fres * 1.1 + grid + glow * 0.45), clamp(alpha, 0.0, 0.92));
      }
    `,
  })
}

function Figure({ body, exercise, playing, reducedMotion }: { body: TrainerBody; exercise: ExerciseId | null; playing: boolean; reducedMotion: boolean }) {
  // Modeller Draco ile sıkıştırılmamıştır; false verilmezse drei çözücüyü dış sunucudan (gstatic) indirmeye çalışır
  const gltf = useGLTF(MODEL_URL[body], false)
  const group = useRef<THREE.Group>(null)
  const material = useMemo(createTrainerMaterial, [])
  // Önbellekteki sahne değiştirilmez: iskeletiyle birlikte kopyalanır (bölge özniteliği kopyanın geometrisine eklenir)
  const rig = useMemo<Rig>(() => {
    const scene = cloneSkinned(gltf.scene)
    scene.traverse((o) => {
      const m = o as THREE.SkinnedMesh
      if (m.isSkinnedMesh) m.geometry = m.geometry.clone()
    })
    return buildRig(scene, material)
  }, [gltf, material])
  useEffect(() => () => rig.skinned.geometry.dispose(), [rig])

  const clock = useRef(0)
  const props = useRef<PoseSpec['prop']>('none')

  useEffect(() => () => material.dispose(), [material])
  // Hareket değişince döngü baştan başlar
  useEffect(() => {
    clock.current = 0
  }, [exercise])

  useFrame((state, dt) => {
    const u = material.uniforms
    u.uTime.value = state.clock.elapsedTime
    // Döngü durup yeniden başlayınca ilk kare büyük bir adım getirebilir: hareket sıçramasın
    if (playing && !reducedMotion) clock.current += Math.min(dt, 0.1)
    const id = exercise
    const g = group.current
    if (!g) return
    if (!id) {
      // Bekleme: hafif nefes
      const breathe = reducedMotion ? 0 : Math.sin(state.clock.elapsedTime * 1.4) * 0.004
      applyPose(rig, { ...poseFor('coreBrace', 0, rig.rest), wrist: relaxedWrists(rig.rest), pelvis: new THREE.Vector3(0, breathe, 0), elbowPole: new THREE.Vector3(0, -0.3, -1), elbowOut: 0.5 })
      g.rotation.set(0, 0, 0)
      g.position.y = 0
      g.position.z = 0
      u.uGlow.value.fill(0)
      props.current = 'none'
    } else {
      // Testler için sabit bir an seçilebilir (window.__trainerT, 0-1)
      const fixed = (window as unknown as { __trainerT?: number }).__trainerT
      const t = typeof fixed === 'number' ? fixed : reducedMotion ? 0.5 : (clock.current / CYCLE_SECONDS[id]) % 1
      const spec = poseFor(id, t, rig.rest)
      g.rotation.copy(spec.root?.rot ?? new THREE.Euler())
      g.position.y = spec.root?.lift ?? 0
      g.position.z = spec.root?.shift ?? 0
      g.updateMatrixWorld(true)
      applyPose(rig, spec)
      // Çalışan bölgeler hareketin efor anıyla birlikte parlar
      const effort = reducedMotion ? 0.8 : 0.55 + 0.45 * (0.5 - 0.5 * Math.cos(t * Math.PI * 2))
      const glow = new Array(8).fill(0)
      for (const r of EXERCISES[id].targets) glow[REGION_INDEX[r]] = effort
      u.uGlow.value = glow
      props.current = spec.prop
    }
  })

  return (
    <group>
      <group ref={group}>
        <primitive object={rig.mesh} />
      </group>
      {/* Cihazlar figürden sonra çizilir: kemik konumları o karenin pozundan okunur */}
      <Equipment exercise={exercise} moving={playing && !reducedMotion} rig={rig} prop={props} />
    </group>
  )
}

/**
 * Harekete göre kameranın uzaklığı: varsayılan, başlangıç yerinin hedefe uzaklığıdır (hologram odada geriden görünür);
 * yatarak yapılan bench press'te figür uzun olduğu için kamera biraz daha geri çekilir.
 */
const DEFAULT_DISTANCE = Math.hypot(CAMERA_START[0], CAMERA_START[1] - 0.95, CAMERA_START[2])
const CAMERA_DISTANCE: Partial<Record<ExerciseId, number>> = { aredBench: 4.8 }

/** Hareketin dönme merkezi: figürle aletin ortası (yükseklik CAMERA_Y, öne kayma CAMERA_Z) */
const cameraTarget = (exercise: ExerciseId | null) => new THREE.Vector3(0, (exercise && CAMERA_Y[exercise]) ?? 0.95, (exercise && CAMERA_Z[exercise]) ?? 0)
const START_TARGET = cameraTarget(null).toArray()

/**
 * Hareket değişince dönme merkezi o hareketin ortasına, kamera da o hareketin uzaklığına yumuşakça gider (bakış açısı
 * korunur: kamera merkezle birlikte kayar); hedefe varınca bırakır, kullanıcının yakınlaştırmasına karışmaz.
 */
function CameraFit({ exercise, reducedMotion }: { exercise: ExerciseId | null; reducedMotion: boolean }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3 } | null
  const goal = useRef<{ distance: number; target: THREE.Vector3 } | null>(null)
  useEffect(() => {
    goal.current = { distance: (exercise && CAMERA_DISTANCE[exercise]) ?? DEFAULT_DISTANCE, target: cameraTarget(exercise) }
  }, [exercise])
  useFrame((_, dt) => {
    const g = goal.current
    if (g === null || !controls) return
    const off = camera.position.clone().sub(controls.target)
    const k = reducedMotion ? 1 : 1 - Math.exp(-4 * Math.min(dt, 0.1))
    controls.target.lerp(g.target, k)
    const next = THREE.MathUtils.lerp(off.length(), g.distance, k)
    camera.position.copy(controls.target).add(off.setLength(next))
    if (Math.abs(next - g.distance) < 0.005 && controls.target.distanceTo(g.target) < 0.005) {
      controls.target.copy(g.target)
      goal.current = null
    }
  })
  return null
}

export default function TrainerScene({
  body = 'm',
  exercise,
  playing,
  active,
  reducedMotion,
  label,
}: {
  body?: TrainerBody
  exercise: ExerciseId | null
  playing: boolean
  active: boolean
  reducedMotion: boolean
  label: string
}) {
  const targetY = (exercise && CAMERA_Y[exercise]) ?? 0.95
  // Arkada sabit bir oda görseli var: kamera yukarı/aşağı eğilirse figür odadan kopuk görünür. Bu yüzden eğim
  // başlangıçtaki açıya kilitlenir; yalnızca dikey eksen etrafında dönülür ve yakınlaşılır.
  const [cx, cy, cz] = CAMERA_START
  const polar = Math.atan2(Math.hypot(cx, cz), cy - targetY)
  return (
    <Canvas
      frameloop={active ? 'always' : 'never'}
      camera={{ position: CAMERA_START, fov: 38, near: 0.05, far: 30 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true }}
      aria-label={label}
      role="img"
    >
      <Figure body={body} exercise={exercise} playing={playing} reducedMotion={reducedMotion} />
      <OrbitControls makeDefault target={START_TARGET} enablePan={false} minDistance={1.4} maxDistance={6} minPolarAngle={polar} maxPolarAngle={polar} enableDamping />
      <CameraFit exercise={exercise} reducedMotion={reducedMotion} />
    </Canvas>
  )
}

useGLTF.preload(MODEL_URL.m, false)
useGLTF.preload(MODEL_URL.f, false)
