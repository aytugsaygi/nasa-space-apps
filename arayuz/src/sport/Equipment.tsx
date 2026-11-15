import { useGLTF } from '@react-three/drei'
import { useFrame, type ThreeElements } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import type { ExerciseId } from '../core/coach'
import { BENCH_SHIFT, CAMERA_Z, type PoseSpec } from './poses'
import type { Rig } from './rig'

/*
 * Hologram antrenörün cihazları. Halter barı, egzersiz bisikleti, bench (ağırlık setinden) ve koşu bandı açık lisanslı
 * hazır modellerdir (public/models/equipment, lisanslar EQUIPMENT-LICENSE.txt'de). Malzemeleri hologram diline çevrilir:
 * yarı saydam yüzey ve parlayan kenar çizgileri. Bar iki avucun arasına yerleşir; bisikletin pedal kolları ayakların
 * konumundan hesaplanan açıyla döner, volan pedal çevrildikçe döner. Koşu bandının kayan bandı ve askı sisteminin
 * lastik ipleri kodla çizilir. Koordinatlar metredir; figürün ayakları y=0'da, yüzü +z'ye (kameraya) bakar.
 */

const COLOR = '#7fd4f5'
const URL = {
  barbell: '/models/equipment/barbell.glb',
  bike: '/models/equipment/bike.glb',
  bench: '/models/equipment/bench-set.glb',
  treadmill: '/models/equipment/treadmill.glb',
}

type Mats = { fill: THREE.MeshBasicMaterial; edge: THREE.LineBasicMaterial; bright: THREE.MeshBasicMaterial }

function useMats(): Mats {
  const mats = useMemo<Mats>(
    () => ({
      fill: new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }),
      edge: new THREE.LineBasicMaterial({ color: '#a8e6fb', transparent: true, opacity: 0.7, depthWrite: false }),
      bright: new THREE.MeshBasicMaterial({ color: '#c6efff', transparent: true, opacity: 0.85, depthWrite: false }),
    }),
    [],
  )
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])
  return mats
}

/**
 * Modeli kopyalar ve hologram malzemesine çevirir: her parçanın yüzeyi yarı saydam olur, keskin kenarları çizgiyle
 * çizilir (yumuşak yüzeylerin iç kenarları çizilmez). skip: gösterilmeyecek parçalar.
 */
function useHoloModel(url: string, mats: Mats, skip: (name: string) => boolean = () => false) {
  const gltf = useGLTF(url, false)
  const model = useMemo(() => {
    const root = gltf.scene.clone(true)
    const edges: THREE.BufferGeometry[] = []
    const drop: THREE.Object3D[] = []
    root.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      if (skip(m.name)) return void drop.push(m)
      m.material = mats.fill
      const e = new THREE.EdgesGeometry(m.geometry, 35)
      edges.push(e)
      m.add(new THREE.LineSegments(e, mats.edge))
    })
    drop.forEach((o) => o.removeFromParent())
    root.updateMatrixWorld(true)
    return { root, edges }
  }, [gltf, mats]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => model.edges.forEach((e) => e.dispose()), [model])
  return model.root
}

/** Modelin bazı parçalarını, verilen noktada dönen yeni bir gruba taşır (dünya konumları korunur) */
function pivot(root: THREE.Object3D, at: THREE.Vector3, names: string[]) {
  const p = new THREE.Group()
  p.position.copy(at)
  root.add(p)
  root.updateMatrixWorld(true)
  const parts: THREE.Object3D[] = []
  root.traverse((o) => {
    if (names.includes(o.name)) parts.push(o)
  })
  parts.forEach((o) => p.attach(o))
  return p
}

const Y = new THREE.Vector3(0, 1, 0)
const X = new THREE.Vector3(1, 0, 0)

/** Yüksekliği 1 olan (y ekseninde) bir parçayı a ile b arasına yerleştirir */
function between(o: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  const d = b.clone().sub(a)
  const len = d.length() || 1e-4
  o.position.copy(a).add(b).multiplyScalar(0.5)
  o.quaternion.setFromUnitVectors(Y, d.divideScalar(len))
  o.scale.set(1, len, 1)
}

/** Bir parça: yarı saydam yüzey ve parlayan kenarlar */
function Piece({ geometry, mats, solid, ...props }: { geometry: THREE.BufferGeometry; mats: Mats; solid?: boolean } & ThreeElements['group']) {
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry, 30), [geometry])
  useEffect(() => () => edges.dispose(), [edges])
  return (
    <group {...props}>
      <mesh geometry={geometry} material={solid ? mats.bright : mats.fill} />
      <lineSegments geometry={edges} material={mats.edge} />
    </group>
  )
}

/* ---------- Modeller ---------- */

/** Halter barı: modelin ekseni x; 4,79 birim boyu 1,5 m'ye ölçeklenir (plaka çapı ~26 cm) */
const BAR_SCALE = 1.5 / 4.79
const BAR_CENTER = new THREE.Vector3(0, 0.44, 0)

function Barbell({ mats, barRef }: { mats: Mats; barRef: RefObject<THREE.Group | null> }) {
  const root = useHoloModel(URL.barbell, mats)
  return (
    <group ref={barRef} visible={false}>
      <group scale={BAR_SCALE}>
        <primitive object={root} position={BAR_CENTER.clone().negate()} />
      </group>
    </group>
  )
}

/*
 * Egzersiz bisikleti: model inç cinsindendir ve önü +x'tir. Pedal yarıçapı (6,9 inç) pozdaki pedal dairesine (0,15 m)
 * göre ölçeklenir; aynakol göbeği pozdaki pedal dairesinin merkezine (0; 0,245; 0,40) oturur. Pedal kolları ve volan
 * kendi eksenlerinde döner.
 */
const BIKE_SCALE = 0.15 / 6.9
const BIKE_HUB = new THREE.Vector3(12.93, 10.72, -8.94)
const BIKE_FLY = new THREE.Vector3(35.48, 11.49, -8.94)
const POSE_HUB = new THREE.Vector3(0, 0.245, 0.4)
const CRANK_PARTS = ['Mesh3_Model', 'Mesh5_Model', 'Mesh6_Model_1', 'Mesh6_Model_1_1', 'Mesh7_Model_1', 'Mesh7_Model_1_1', 'Mesh8_Model', 'Mesh9_Model']

function Bike({ mats, rig, moving }: { mats: Mats; rig: Rig; moving: boolean }) {
  const root = useHoloModel(URL.bike, mats)
  const { crank, fly } = useMemo(() => ({ crank: pivot(root, BIKE_HUB, CRANK_PARTS), fly: pivot(root, BIKE_FLY, ['Mesh1_Group1_Model']) }), [root])
  // Model koordinatından dünyaya: y ekseninde -90° (önü +z olur), ölçek ve göbek pozdaki merkeze
  const position = useMemo(() => {
    const s = BIKE_HUB.clone().multiplyScalar(BIKE_SCALE)
    return new THREE.Vector3(POSE_HUB.x + s.z, POSE_HUB.y - s.y, POSE_HUB.z - s.x)
  }, [])
  useFrame((_, dt) => {
    // Sol pedalın açısı: dünyada (0, -sin a, cos a) yönünde; model ekseninde ters yönde döner
    const ankle = rig.bones['foot.L'].getWorldPosition(new THREE.Vector3())
    const a = Math.atan2(-(ankle.y - 0.075 - POSE_HUB.y), ankle.z + 0.04 - POSE_HUB.z)
    crank.rotation.z = -a
    if (moving) fly.rotation.z -= Math.min(dt, 0.1) * 9
  })
  return (
    <group position={position} rotation={[0, -Math.PI / 2, 0]} scale={BIKE_SCALE}>
      <primitive object={root} />
    </group>
  )
}

/*
 * Bench: ağırlık setinden (bench, sehpa, dambıllar); yerdeki bar gösterilmez. Set metre cinsindendir, uzun kenarı x'tir;
 * yastık sırtüstü yatan figürün gövdesinin altına, sehpa baş tarafına gelir (figürle birlikte BENCH_SHIFT kadar öne kayar).
 */
function Bench({ mats }: { mats: Mats }) {
  const root = useHoloModel(URL.bench, mats, (n) => n.startsWith('mesh2021887595'))
  return (
    <group position={[-0.1, 0.23, -1.04 + BENCH_SHIFT]} rotation={[0, -Math.PI / 2, 0]}>
      <primitive object={root} />
    </group>
  )
}

/** Koşu bandı: 1,2 kat büyütülür, konsolu koşucunun önüne (+z) döner; bant yüzeyi y=0'a iner */
const TREAD_SCALE = 1.2
function Treadmill({ mats }: { mats: Mats }) {
  const root = useHoloModel(URL.treadmill, mats)
  // Bandın yüzeyi: ortadaki köşe noktalarının en yükseği (konsol ve kollar hariç)
  const deck = useMemo(() => {
    let top = 0
    root.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const pos = m.geometry.getAttribute('position')
      const v = new THREE.Vector3()
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld)
        if (Math.abs(v.x) < 0.2 && Math.abs(v.z) < 0.3 && v.y < 0.3) top = Math.max(top, v.y)
      }
    })
    return top
  }, [root])
  return (
    <group position={[0, -deck * TREAD_SCALE + 0.002, -0.04]} rotation={[0, Math.PI, 0]} scale={TREAD_SCALE}>
      <primitive object={root} />
    </group>
  )
}

/* ---------- Sahne ---------- */

export function Equipment({
  exercise,
  moving,
  rig,
  prop,
}: {
  exercise: ExerciseId | null
  moving: boolean
  rig: Rig
  prop: RefObject<PoseSpec['prop']>
}) {
  const mats = useMats()
  const geos = useMemo(
    () => ({
      platform: new THREE.BoxGeometry(1.0, 0.03, 0.64),
      belt: new THREE.PlaneGeometry(0.46, 1.3),
      cord: new THREE.CylinderGeometry(0.007, 0.007, 1, 8),
    }),
    [],
  )
  useEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos])

  // Koşu bandının kayan çizgileri
  const stripes = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 16
    c.height = 64
    const ctx = c.getContext('2d')!
    ctx.fillStyle = 'rgba(127,212,245,0.12)'
    ctx.fillRect(0, 0, 16, 64)
    ctx.fillStyle = 'rgba(127,212,245,0.55)'
    ctx.fillRect(0, 0, 16, 4)
    const tex = new THREE.CanvasTexture(c)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(1, 8)
    return tex
  }, [])
  useEffect(() => () => stripes.dispose(), [stripes])
  const belt = useRef<THREE.Mesh>(null)
  const bar = useRef<THREE.Group>(null)
  const cords = useRef<Record<'L' | 'R', THREE.Group | null>>({ L: null, R: null })

  useFrame((_, dt) => {
    const m = belt.current?.material as THREE.MeshBasicMaterial | undefined
    if (moving && m?.map) m.map.offset.y -= Math.min(dt, 0.1) * 1.4

    const p = prop.current
    const B = rig.bones
    const wp = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3())

    // Bar iki avucun ortasından geçer (avuç: bilek ile orta parmak kökü arası)
    const b = bar.current
    if (b) {
      b.visible = p === 'bar' || p === 'bench' || p === 'barHang'
      if (b.visible) {
        const palm = (s: 'L' | 'R') => wp(B[`hand.${s}`]).lerp(wp(rig.ends[`hand.${s}`]), 0.6)
        const wl = palm('L')
        const wr = palm('R')
        b.position.copy(wl).add(wr).multiplyScalar(0.5)
        b.quaternion.setFromUnitVectors(X, wl.sub(wr).normalize())
      }
    }

    // T2 askı sistemi: kalçanın iki yanından bandın kenarına inen lastik ipler (koşucuyu banda bastırır)
    if (p === 'treadmill') {
      for (const [s, side] of [
        ['L', 1],
        ['R', -1],
      ] as const) {
        const cord = cords.current[s]
        if (!cord) continue
        const hip = wp(B[`thigh.${s}`]).add(new THREE.Vector3(0.07 * side, 0.04, 0))
        between(cord, hip, new THREE.Vector3(0.36 * side, 0.08, hip.z))
      }
    }
  })

  const ared = exercise !== null && exercise.startsWith('ared') && exercise !== 'aredBench'
  return (
    <group>
      {/* Zemin halkası */}
      {/* Zemin halkası: dönme merkezinin altında (bisiklette figürle aletin ortası) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, (exercise && CAMERA_Z[exercise]) ?? 0]}>
        <ringGeometry args={[0.42, 0.44, 64]} />
        <meshBasicMaterial color={COLOR} transparent opacity={0.35} />
      </mesh>

      {/* Modeller ayrı ayrı yüklenir: biri gelmeden figür ve diğerleri beklemez */}
      <Suspense fallback={null}>
        <Barbell mats={mats} barRef={bar} />
      </Suspense>

      {/* ARED platformu (squat, deadlift, topuk kaldırma, row) */}
      {ared && <Piece geometry={geos.platform} mats={mats} position={[0, -0.016, -0.02]} />}

      {exercise === 'aredBench' && (
        <Suspense fallback={null}>
          <Bench mats={mats} />
        </Suspense>
      )}

      {exercise === 't2Run' && (
        <group>
          <Suspense fallback={null}>
            <Treadmill mats={mats} />
          </Suspense>
          <mesh ref={belt} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0.02]} geometry={geos.belt}>
            <meshBasicMaterial map={stripes} transparent depthWrite={false} />
          </mesh>
          {(['L', 'R'] as const).map((s) => (
            <Piece
              key={s}
              ref={(o: THREE.Group | null) => {
                cords.current[s] = o
              }}
              geometry={geos.cord}
              mats={mats}
              solid
            />
          ))}
        </group>
      )}

      {exercise === 'cevisCycle' && (
        <Suspense fallback={null}>
          <Bike mats={mats} rig={rig} moving={moving} />
        </Suspense>
      )}
    </group>
  )
}

useGLTF.preload(URL.barbell, false)
useGLTF.preload(URL.bike, false)
useGLTF.preload(URL.bench, false)
useGLTF.preload(URL.treadmill, false)
