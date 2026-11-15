import { Bvh, useGLTF, useTexture } from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { Suspense, useEffect, useMemo, useRef, type MutableRefObject, type RefObject } from 'react'
import * as THREE from 'three'
import { LAYER_ORDER, structureColor, useAnatomyNames, type LayerId, type StructureLayer, type StructureRef } from '../data/anatomy'
import { REGION_ORDER } from '../data/regions'
import type { RegionId, Status } from '../data/types'
import { createBodyMaterial, createDiscMaterial, createFadeMaterial, createRealMaterial, SELECT_MASK_SIZE, type BodyLayerOptions } from './holoMaterial'
import { BACK_GAP, BACK_STEP, BACK_Z, CAMERA_FOV, cameraDistance, LAYER_X, LOOK_AT_Y, visibleWidth, type CameraMode, type ViewTarget } from './layout'
import { useScenePaused } from '../lib/dragState'

export interface HologramSceneProps {
  selected: RegionId | null
  hovered: RegionId | null
  statuses: Record<RegionId, Status>
  /** Katmanlara ayrılmış görünüm (kas ve iskelet); false: bölgelere ayrılmış hologram */
  exploded: boolean
  /** Katmanlara ayrılmış görünümde tek başına gösterilen katman (null: ikisi yan yana); diğeri kaybolur */
  focusLayer: LayerId | null
  /** Sürükleyerek döndürmenin hedef açısı (radyan) */
  rotation: MutableRefObject<{ target: number }>
  /** Yakınlaştırma ve kaydırmanın hedefi (kamera yumuşakça izler) */
  view: MutableRefObject<ViewTarget>
  /** Figürü yana kaydırır (alan genişliğinin oranı; artı değer figürü sola alır), ör. yandaki kart figürü örtmesin diye */
  frameShift: MutableRefObject<number>
  cameraMode: CameraMode
  reducedMotion: boolean
  angleRef: RefObject<HTMLSpanElement | null>
  hoveredStructure: StructureRef | null
  selectedStructure: StructureRef | null
  onSelect: (id: RegionId) => void
  onHover: (id: RegionId | null) => void
  onStructureHover: (ref: StructureRef | null) => void
  onStructureSelect: (ref: StructureRef) => void
  /** Ekran okuyucu için sahne etiketi (dile bağlı) */
  canvasLabel: string
  /** true: gerçek doku ve ışıkla çizim (katmanlara ayrılmış görünüm), false: hologram */
  realistic: boolean
  /** Sahnenin bulunduğu sayfa ekranda değilse çizim durur */
  suspended?: boolean
  /** Birlikte seçilen yapılar (rahatsızlık bildirirken aynı katmandan birden çok kas ya da kemik seçilebilir) */
  picked?: { layer: StructureLayer; ids: readonly number[] } | null
}

const STATUS_HEX: Record<Status, string> = { normal: '#5fd3ff', dikkat: '#f7c35c', kritik: '#ff6b6b' }

/**
 * Anatomi modeli: Z-Anatomy (CC BY-SA 4.0) ve BodyParts3D (CC BY-SA 2.1 JP) kaynaklıdır.
 * scripts/export-zanatomy.py ile üretilir.
 */
const MODEL_URL = '/models/anatomy.glb'
const DRACO_PATH = '/draco/'

/** Hologram görünümünde katman renkleri */
const LAYER_STYLE: Record<StructureLayer, { color: string; opts: BodyLayerOptions }> = {
  muscles: { color: '#5cc6ff', opts: { fill: 0.015, light: 0.75, rim: 0.5, grid: 0 } },
  bones: { color: '#d2f0ff', opts: { fill: 0.03, light: 0.6, rim: 0.5, grid: 0 } },
}
/** Gerçekçi görünümde yüzey pürüzlülüğü */
const REAL_ROUGHNESS: Record<StructureLayer, number> = { muscles: 0.55, bones: 0.72 }
/** Seçilen yapının rengi: katmanın kendi renginden belirgin biçimde ayrılır (kırmızı kasta ve fildişi kemikte camgöbeği) */
const PICK: Record<StructureLayer, string> = { muscles: '#33e6ff', bones: '#33e6ff' }

const SKIN_OPTS: BodyLayerOptions = { fill: 0.02, light: 0.05, rim: 0.85, grid: 0.14 }

/** Bir tıklamanın sürükleme sayılmaması için en fazla fare kayması (piksel) */
const CLICK_SLOP = 6

type Vec3 = [number, number, number]
const PAIRED: RegionId[] = ['ustKol', 'onKol', 'eller', 'bacaklar', 'ayaklar']

/* ---------- Modeli hazırlama ---------- */

function prepareAnatomy(scene: THREE.Object3D) {
  scene.updateMatrixWorld(true)
  const skin: { geometry: THREE.BufferGeometry; region: RegionId }[] = []
  const layers = {} as Record<StructureLayer, { geometry: THREE.BufferGeometry; ids: Float32Array }>

  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const g = mesh.geometry.clone()
    g.applyMatrix4(mesh.matrixWorld)
    if (!g.getAttribute('normal')) g.computeVertexNormals()
    const count = g.getAttribute('position').count

    const skinMatch = mesh.name.match(/^skin_([a-zA-Z]+)/)
    if (skinMatch) {
      const ri = REGION_ORDER.indexOf(skinMatch[1] as RegionId)
      if (ri < 0) return
      g.setAttribute('aRegion', new THREE.BufferAttribute(new Uint8Array(count).fill(ri), 1))
      g.computeBoundingSphere()
      skin.push({ geometry: g, region: REGION_ORDER[ri] })
      return
    }

    const layer = LAYER_ORDER.find((l) => mesh.name.startsWith(l))
    if (!layer) return
    // Yapı numarası köşe renginde saklanır: R*255 + G*255*256
    const col = g.getAttribute('color')
    const ids = new Float32Array(count)
    if (col) for (let i = 0; i < count; i++) ids[i] = Math.round(col.getX(i) * 255) + Math.round(col.getY(i) * 255) * 256
    g.deleteAttribute('color')
    g.setAttribute('aStruct', new THREE.BufferAttribute(ids, 1))
    g.setAttribute('aRegion', new THREE.BufferAttribute(new Uint8Array(count), 1))
    g.computeBoundingSphere()
    layers[layer] = { geometry: g, ids }
  })

  // Durum işaretleri için her bölgenin görünen yüzündeki bir nokta
  const anchors = {} as Record<RegionId, Vec3>
  for (const part of skin) {
    const pos = part.geometry.getAttribute('position')
    const dir = part.region === 'sirt' ? -1 : 1
    const side = PAIRED.includes(part.region)
    let cx = 0
    let cy = 0
    let n = 0
    for (let i = 0; i < pos.count; i++) {
      if (side && pos.getX(i) < 0) continue
      cx += pos.getX(i)
      cy += pos.getY(i)
      n++
    }
    cx /= n || 1
    cy /= n || 1
    let best = -Infinity
    let pick: Vec3 = [cx, cy, 0]
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      if ((side && x < 0) || Math.abs(y - cy) > 0.05 || Math.abs(x - cx) > 0.06) continue
      if (pos.getZ(i) * dir > best) {
        best = pos.getZ(i) * dir
        pick = [x, y, pos.getZ(i) + dir * 0.012]
      }
    }
    anchors[part.region] = pick
  }
  return { skin, layers, anchors }
}

/* ---------- Katman yerleşimi ve dönüş ---------- */

/** Katmanın hedef konumu: hologram (iç içe), yan yana ya da odak (öndeki tek katman; diğeri geriye çekilerek kaybolur) */
function layerTarget(layer: LayerId, exploded: boolean, focus: LayerId | null) {
  if (!exploded) return { x: 0, z: 0 }
  if (!focus) return { x: LAYER_X[layer], z: 0 }
  if (focus === layer) return { x: 0, z: 0 }
  // Kaybolan katman ortayı boş bırakır: odaktakinin solundaysa sola, sağındaysa sağa çekilir
  const i = LAYER_ORDER.indexOf(layer)
  const fi = LAYER_ORDER.indexOf(focus)
  const rank = Math.abs(i - fi) - 1
  return { x: Math.sign(i - fi) * (BACK_GAP + rank * BACK_STEP), z: BACK_Z }
}

/** Tek katman gösterilirken diğeri gizlenir (görünmez ve tıklanamaz) */
function isHidden(layer: LayerId, exploded: boolean, focus: LayerId | null) {
  return exploded && focus !== null && focus !== layer
}

/** Katmanı hedef konumuna kaydırır ve ortak açıyla döndürür */
function useLayerMotion(layer: LayerId, props: HologramSceneProps, angle: MutableRefObject<number>) {
  const { exploded, focusLayer, reducedMotion } = props
  const outer = useRef<THREE.Group>(null)
  const inner = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    const goal = layerTarget(layer, exploded, focusLayer)
    const k = reducedMotion ? 30 : 5
    if (outer.current) {
      outer.current.position.x = THREE.MathUtils.damp(outer.current.position.x, goal.x, k, dt)
      outer.current.position.z = THREE.MathUtils.damp(outer.current.position.z, goal.z, k, dt)
    }
    if (inner.current) inner.current.rotation.y = angle.current
  })
  return { outer, inner }
}

/** Hologram malzemelerinin saydamlığını (0–1) yumuşakça değiştirir */
function useFade(materials: THREE.ShaderMaterial[], target: number) {
  useFrame((_, dt) => {
    for (const m of materials) {
      m.uniforms.uAlpha.value = THREE.MathUtils.damp(m.uniforms.uAlpha.value, target, 6, dt)
    }
  })
}

/** Saydamlıkla aynı hızda söner; tamamen kapanınca katmanı çizimden çıkarır */
function useVisibility(group: RefObject<THREE.Object3D | null>, target: number) {
  const level = useRef(target)
  useFrame((_, dt) => {
    level.current = THREE.MathUtils.damp(level.current, target, 6, dt)
    if (group.current) group.current.visible = level.current > 0.01
  })
}

/** Gerçekçi malzemelerin saydamlığı: tam opakken sıralama sorunları olmasın diye saydamlık kapatılır */
function useRealFade(materials: THREE.MeshStandardMaterial[], target: number) {
  useFrame((_, dt) => {
    for (const m of materials) {
      m.opacity = THREE.MathUtils.damp(m.opacity, target, 6, dt)
      const transparent = m.opacity < 0.995
      if (m.transparent !== transparent) {
        m.transparent = transparent
        m.needsUpdate = true
      }
      m.depthWrite = m.opacity > 0.6
    }
  })
}

function MiniPlatform({ show }: { show: boolean }) {
  const disc = useMemo(() => createDiscMaterial('#7fd4f5'), [])
  const ref = useRef<THREE.Group>(null)
  useFrame((s, dt) => {
    disc.uniforms.uTime.value = s.clock.elapsedTime
    if (ref.current) {
      const k = THREE.MathUtils.damp(ref.current.scale.x, show ? 1 : 0.001, 6, dt)
      ref.current.scale.setScalar(k)
      ref.current.visible = k > 0.01
    }
  })
  return (
    <group ref={ref} scale={0.001}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} material={disc} raycast={() => null}>
        <planeGeometry args={[0.95, 0.95]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} raycast={() => null}>
        <ringGeometry args={[0.36, 0.368, 96]} />
        <meshBasicMaterial color="#7fd4f5" transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  )
}

/* ---------- Dış yüzey (hologram görünümündeki bölgeler) ---------- */

/** Bölgelere ayrılmış dış yüzey: yalnızca hologram görünümünde görünür; katmanlara ayrılınca kaybolur */
function RegionLayer({
  parts,
  anchors,
  props,
  angle,
}: {
  parts: { geometry: THREE.BufferGeometry; region: RegionId }[]
  anchors: Record<RegionId, Vec3>
  props: HologramSceneProps
  angle: MutableRefObject<number>
}) {
  const { selected, hovered, statuses, exploded, onHover, onSelect } = props
  const outer = useRef<THREE.Group>(null)
  const inner = useRef<THREE.Group>(null)
  const hidden = exploded
  useVisibility(outer, hidden ? 0 : 1)
  const material = useMemo(() => {
    const m = createBodyMaterial(SKIN_OPTS)
    // Yalnızca kameraya bakan yüzler: arkadaki bölgelerin rengi öne sızmaz
    m.side = THREE.FrontSide
    return m
  }, [])
  useFade([material], hidden ? 0 : 1)

  useEffect(() => {
    REGION_ORDER.forEach((r, i) => material.uniforms.uRegionColor.value[i].set(STATUS_HEX[statuses[r]]))
  }, [material, statuses])

  useFrame((state, dt) => {
    const u = material.uniforms
    u.uTime.value = state.clock.elapsedTime
    REGION_ORDER.forEach((r, i) => {
      u.uHover.value[i] = THREE.MathUtils.damp(u.uHover.value[i], hovered === r && !hidden ? 1 : 0, 12, dt)
      u.uSelect.value[i] = THREE.MathUtils.damp(u.uSelect.value[i], selected === r ? 1 : 0, 8, dt)
    })
    // Bir bölge seçiliyken diğerleri sönükleşir (seçilen bölge öne çıkar)
    u.uAnySel.value = THREE.MathUtils.damp(u.uAnySel.value, selected && !hidden ? 1 : 0, 6, dt)
    if (inner.current) inner.current.rotation.y = angle.current
  })

  const regionHandlers = (region: RegionId) => ({
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      if (region !== hovered) onHover(region)
    },
    onPointerOut: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      onHover(null)
    },
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      if (e.delta <= CLICK_SLOP) onSelect(region)
    },
  })

  return (
    <group ref={outer}>
      <group ref={inner}>
        {parts.map((p) => (
          <mesh key={p.region} geometry={p.geometry} material={material} renderOrder={2} {...(hidden ? {} : regionHandlers(p.region))} />
        ))}
        {!hidden &&
          REGION_ORDER.filter((r) => statuses[r] !== 'normal' && anchors[r]).map((r) => <StatusMarker key={r} position={anchors[r]} status={statuses[r]} />)}
      </group>
    </group>
  )
}

/* ---------- Kas ve iskelet katmanları ---------- */

function StructureLayerMesh({
  layer,
  data,
  props,
  angle,
  normalAlpha,
}: {
  layer: StructureLayer
  data: { geometry: THREE.BufferGeometry; ids: Float32Array }
  props: HologramSceneProps
  angle: MutableRefObject<number>
  /** Hologram görünümündeki saydamlık; 0 ise gizli */
  normalAlpha: number
}) {
  const { exploded, focusLayer, hoveredStructure, selectedStructure, onStructureHover, onStructureSelect, picked } = props
  const { outer, inner } = useLayerMotion(layer, props, angle)
  const hidden = isHidden(layer, exploded, focusLayer)
  const style = LAYER_STYLE[layer]
  const material = useMemo(() => {
    const m = createBodyMaterial(style.opts)
    m.side = THREE.DoubleSide
    m.uniforms.uRegionColor.value.forEach((c: THREE.Color) => c.set(style.color))
    return m
  }, [style])
  const depthMat = useMemo(() => new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }), [])
  const realMat = useMemo(() => createRealMaterial(REAL_ROUGHNESS[layer], PICK[layer]), [layer])
  const alphaTarget = !exploded ? normalAlpha : hidden ? 0 : 1
  /* Görünmeyen katman (hologram görünümünde iskelet, tek katman görünümünde diğeri) tıklanamaz */
  const interactive = alphaTarget > 0
  useFade([material], alphaTarget)
  useRealFade([realMat], alphaTarget)
  useVisibility(outer, alphaTarget)
  const names = useAnatomyNames()

  /* Gerçekçi renkler: her yapının rengi adından belirlenir ve köşe rengine yazılır */
  useEffect(() => {
    if (!names) return
    const rows = names[layer]
    const table = new Float32Array((rows.length + 1) * 3)
    const c = new THREE.Color()
    rows.forEach((row, i) => {
      c.set(structureColor(layer, row[0], i + 1))
      table.set([c.r, c.g, c.b], (i + 1) * 3)
    })
    const count = data.ids.length
    const colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const id = data.ids[i]
      colors[i * 3] = table[id * 3]
      colors[i * 3 + 1] = table[id * 3 + 1]
      colors[i * 3 + 2] = table[id * 3 + 2]
    }
    data.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  }, [names, layer, data])

  /* Birlikte seçilen yapılar (gerçekçi malzemedeki maske dokusu) */
  useEffect(() => {
    const mask: Uint8Array = realMat.userData.selectMask
    mask.fill(0)
    if (picked?.layer === layer) for (const id of picked.ids) if (id > 0 && id < SELECT_MASK_SIZE) mask[id] = 255
    realMat.userData.uniforms.uSelectMask.value.needsUpdate = true
  }, [picked, layer, realMat])

  useFrame((s) => {
    material.uniforms.uTime.value = s.clock.elapsedTime
    material.uniforms.uHoverStruct.value = hoveredStructure?.layer === layer && !hidden ? hoveredStructure.id : -1
    material.uniforms.uSelectStruct.value = selectedStructure?.layer === layer ? selectedStructure.id : -1
    const ru = realMat.userData.uniforms
    ru.uHoverStruct.value = material.uniforms.uHoverStruct.value
    ru.uSelectStruct.value = material.uniforms.uSelectStruct.value
    ru.uTime.value = s.clock.elapsedTime
  })

  const idAt = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.face ? data.ids[e.face.a] : 0)
  const structureHandlers = {
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      // Hologram görünümünde kaslar etkileşime girmez; tıklama dış yüzeye (bölgeye) gider
      if (!exploded) return
      e.stopPropagation()
      const id = idAt(e)
      if (id > 0 && (hoveredStructure?.layer !== layer || hoveredStructure.id !== id)) onStructureHover({ layer, id })
    },
    onPointerOut: (e: ThreeEvent<PointerEvent>) => {
      if (!exploded) return
      e.stopPropagation()
      onStructureHover(null)
    },
    onClick: (e: ThreeEvent<MouseEvent>) => {
      if (!exploded) return
      e.stopPropagation()
      const id = idAt(e)
      if (id > 0 && e.delta <= CLICK_SLOP) onStructureSelect({ layer, id })
    },
  }

  return (
    <group ref={outer}>
      <group ref={inner}>
        <mesh geometry={data.geometry} material={depthMat} renderOrder={0} raycast={() => null} />
        <mesh geometry={data.geometry} material={props.realistic ? realMat : material} renderOrder={1} {...(interactive ? structureHandlers : {})} />
      </group>
      <MiniPlatform show={exploded && !hidden} />
    </group>
  )
}

/** Normal olmayan bölgelerde atan küçük durum işareti */
function StatusMarker({ position, status }: { position: Vec3; status: Status }) {
  const ref = useRef<THREE.Mesh>(null)
  const halo = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * (status === 'kritik' ? 4 : 2.2)
    ref.current?.scale.setScalar(1 + Math.sin(t) * 0.25)
    if (halo.current) {
      const p = (t / (Math.PI * 2)) % 1
      halo.current.scale.setScalar(1 + p * 2.5)
      ;(halo.current.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.5
    }
  })
  const color = STATUS_HEX[status]
  return (
    <group position={position}>
      <mesh ref={ref} raycast={() => null} renderOrder={3}>
        <sphereGeometry args={[0.014, 16, 12]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh ref={halo} raycast={() => null} renderOrder={3}>
        <sphereGeometry args={[0.018, 16, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
    </group>
  )
}

function Anatomy(props: HologramSceneProps & { angle: MutableRefObject<number> }) {
  const gltf = useGLTF(MODEL_URL, DRACO_PATH)
  const { skin, layers, anchors } = useMemo(() => prepareAnatomy(gltf.scene), [gltf.scene])
  return (
    <Bvh firstHitOnly>
      {layers.muscles && <StructureLayerMesh layer="muscles" data={layers.muscles} props={props} angle={props.angle} normalAlpha={0.6} />}
      {layers.bones && <StructureLayerMesh layer="bones" data={layers.bones} props={props} angle={props.angle} normalAlpha={0} />}
      <RegionLayer parts={skin} anchors={anchors} props={props} angle={props.angle} />
    </Bvh>
  )
}

useGLTF.preload(MODEL_URL, DRACO_PATH)

/** Sürükleme açısını yumuşatır ve açı göstergesini günceller */
function Figure(props: HologramSceneProps) {
  const angle = useRef(0)
  useFrame((_, dt) => {
    angle.current = THREE.MathUtils.damp(angle.current, props.rotation.current.target, props.reducedMotion ? 40 : 12, dt)
    if (props.angleRef.current) {
      const deg = ((THREE.MathUtils.radToDeg(angle.current) % 360) + 360) % 360
      props.angleRef.current.textContent = String(Math.round(deg) % 360).padStart(3, '0') + '°'
    }
  })
  return (
    <Suspense fallback={null}>
      <Anatomy {...props} angle={angle} />
    </Suspense>
  )
}

/**
 * Kamera: görünüm değişince (iki katman yan yana / tek figür) yavaşça ileri geri gider;
 * yakınlaştırma ve kaydırma hedefini daha hızlı izler. Kamera her zaman düz bakar (eğilmez).
 */
function CameraRig({
  mode,
  view,
  frameShift,
  reducedMotion,
}: {
  mode: CameraMode
  view: MutableRefObject<ViewTarget>
  frameShift: MutableRefObject<number>
  reducedMotion: boolean
}) {
  const { camera, size } = useThree()
  const cur = useRef<{ base: number | null; zoom: number; panX: number; panY: number; shift: number }>({ base: null, zoom: 1, panX: 0, panY: 0, shift: 0 })
  useFrame((_, dt) => {
    const c = cur.current
    const aspect = size.width / Math.max(size.height, 1)
    // Yanda kart açıkken figürler kartın solunda kalan genişliğe sığar (kayma, kartın kapladığı genişliğin yarısıdır)
    const goal = cameraDistance(mode, aspect, 1 - 2 * frameShift.current)
    c.base = c.base === null ? goal : THREE.MathUtils.damp(c.base, goal, reducedMotion ? 30 : 4, dt)
    const k = reducedMotion ? 40 : 12
    const v = view.current
    c.zoom = THREE.MathUtils.damp(c.zoom, v.zoom, k, dt)
    c.panX = THREE.MathUtils.damp(c.panX, v.panX, k, dt)
    c.panY = THREE.MathUtils.damp(c.panY, v.panY, k, dt)
    c.shift = THREE.MathUtils.damp(c.shift, frameShift.current, reducedMotion ? 30 : 5, dt)
    // Kaydırma yakınlaştırmadan bağımsızdır (varsayılan çerçeveye göre); imlece yakınlaştırma hesabını bozmaz
    const x = c.panX + c.shift * visibleWidth(c.base, aspect)
    // Kamera geri çekildikçe bakış noktası da yükselir: zemin ekranda aynı yerde kalır, figürler yere basar (layout.lookAtY)
    const y = (LOOK_AT_Y * c.base) / cameraDistance(mode, aspect, 1) + c.panY
    camera.position.set(x, y, c.base / c.zoom)
    camera.lookAt(x, y, 0)
  })
  return null
}

function Platform({ show }: { show: boolean }) {
  const disc = useMemo(() => createDiscMaterial('#7fd4f5'), [])
  const cone = useMemo(() => createFadeMaterial('#7fd4f5', 0.07), [])
  const ticks = useRef<THREE.Group>(null)
  const root = useRef<THREE.Group>(null)
  useFrame((state, dt) => {
    disc.uniforms.uTime.value = state.clock.elapsedTime
    if (ticks.current) ticks.current.rotation.y -= dt * 0.15
    if (root.current) {
      const k = THREE.MathUtils.damp(root.current.scale.x, show ? 1 : 0.001, 6, dt)
      root.current.scale.set(k, 1, k)
      root.current.visible = k > 0.01
    }
  })
  return (
    <group ref={root}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} material={disc} raycast={() => null}>
        <planeGeometry args={[1.9, 1.9]} />
      </mesh>
      {[0.6, 0.78].map((r, i) => (
        <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} raycast={() => null}>
          <ringGeometry args={[r, r + (i === 0 ? 0.012 : 0.004), 128]} />
          <meshBasicMaterial color="#7fd4f5" transparent opacity={i === 0 ? 0.55 : 0.3} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}
      <group ref={ticks}>
        {Array.from({ length: 36 }, (_, i) => {
          const a = (i / 36) * Math.PI * 2
          const long = i % 3 === 0
          return (
            <mesh key={i} position={[Math.cos(a) * 0.69, 0.003, Math.sin(a) * 0.69]} rotation={[-Math.PI / 2, 0, -a]} raycast={() => null}>
              <planeGeometry args={[long ? 0.05 : 0.025, 0.006]} />
              <meshBasicMaterial color="#b5e8fb" transparent opacity={long ? 0.7 : 0.35} blending={THREE.AdditiveBlending} depthWrite={false} />
            </mesh>
          )
        })}
      </group>
      <mesh position={[0, 1.05, 0]} material={cone} raycast={() => null}>
        <cylinderGeometry args={[0.42, 0.6, 2.1, 64, 1, true]} />
      </mesh>
    </group>
  )
}

/** Figürün çevresinde yavaşça yükselen ışık tozları */
function Dust({ count = 220 }: { count?: number }) {
  const { geometry, material } = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const seed = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const r = 0.25 + Math.random() * 0.55
      const a = Math.random() * Math.PI * 2
      pos[i * 3] = Math.cos(a) * r
      pos[i * 3 + 1] = Math.random() * 2.1
      pos[i * 3 + 2] = Math.sin(a) * r
      seed[i] = Math.random()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    const m = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uPixel;
        attribute float aSeed;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          p.y = mod(p.y + uTime * (0.04 + aSeed * 0.08), 2.1);
          vAlpha = smoothstep(0.0, 0.3, p.y) * smoothstep(2.1, 1.4, p.y) * (0.35 + aSeed * 0.65);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (1.2 + aSeed * 2.2) * uPixel * (3.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * vAlpha;
          gl_FragColor = vec4(vec3(0.6, 0.86, 1.0) * a, a);
        }
      `,
      uniforms: { uTime: { value: 0 }, uPixel: { value: Math.min(window.devicePixelRatio, 2) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    return { geometry: g, material: m }
  }, [count])
  useFrame((s) => {
    material.uniforms.uTime.value = s.clock.elapsedTime
  })
  return <points geometry={geometry} material={material} raycast={() => null} />
}

/**
 * Bir bölüm sürüklenirken ya da hologramın sayfası ekranda değilken sahne çizimi duraklar; son kare ekranda kalır.
 * R3F döngü değişiminde sahne saatini sıfırladığı için saat elle korunur, devam edince animasyonlar sıçramaz.
 */
function DragPause({ suspended }: { suspended: boolean }) {
  const dragging = useScenePaused()
  const paused = dragging || suspended
  const get = useThree((s) => s.get)
  const saved = useRef(0)
  useEffect(() => {
    const state = get()
    if (paused) {
      saved.current = state.clock.elapsedTime
      state.setFrameloop('demand')
    } else if (state.frameloop === 'demand') {
      state.setFrameloop('always')
      get().clock.elapsedTime = saved.current
    }
  }, [paused, get])
  return null
}

/**
 * Hologramın arkasındaki görsel (Gemini ile üretildi, görselde "GENERATED BY GEMINI" filigranı var; SI listelerinde).
 * Sahnenin arka planına "cover" gibi yerleşir: tuval oranı değişince görsel bozulmadan ortadan kırpılır.
 * Önceki kodla çizilen uzay (Space.tsx) bunun yerine kullanılmıyor.
 */
const BACKDROP_URL = '/textures/hologram-bg.jpg'
function Backdrop() {
  const texture = useTexture(BACKDROP_URL)
  const scene = useThree((s) => s.scene)
  const size = useThree((s) => s.size)
  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace
    const img = texture.image as { width: number; height: number }
    const canvas = size.width / Math.max(1, size.height)
    const image = img.width / img.height
    // cover: geniş tuvalde üst/alt, dar tuvalde sağ/sol kırpılır
    if (canvas > image) texture.repeat.set(1, image / canvas)
    else texture.repeat.set(canvas / image, 1)
    texture.offset.set((1 - texture.repeat.x) / 2, (1 - texture.repeat.y) / 2)
    texture.needsUpdate = true
    const previous = scene.background
    scene.background = texture
    return () => {
      scene.background = previous
    }
  }, [texture, scene, size.width, size.height])
  return null
}
useTexture.preload(BACKDROP_URL)

export default function HologramScene(props: HologramSceneProps) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, LOOK_AT_Y, 4.0], fov: CAMERA_FOV, near: 0.1, far: 200 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      // Etiket, 3D alanın kabına (div) yazılır; rolü olmayan div'in etiketi ekran okuyucuda okunmaz
      role="img"
      aria-label={props.canvasLabel}
    >
      <color attach="background" args={['#03050a']} />
      <DragPause suspended={!!props.suspended} />
      <Backdrop />
      <CameraRig mode={props.cameraMode} view={props.view} frameShift={props.frameShift} reducedMotion={props.reducedMotion} />
      <Figure {...props} />
      <Platform show={!props.exploded} />
      {!props.reducedMotion && !props.exploded && <Dust />}
      {/* Gerçekçi görünüm için ışık düzeni: ana ışık, dolgu ve arkadan kenar ışığı (hologram malzemelerini etkilemez) */}
      <hemisphereLight args={['#dfe9ff', '#2b1d18', 0.85]} />
      <directionalLight position={[2.5, 4, 5]} intensity={2.3} />
      <directionalLight position={[-3, 1.5, 3]} intensity={0.55} />
      <directionalLight position={[-3, 2.5, -4]} intensity={1.5} color="#9ec9ff" />
      <EffectComposer key={props.realistic ? 'real' : 'holo'} multisampling={0}>
        <Bloom intensity={props.realistic ? 0.25 : 0.7} luminanceThreshold={props.realistic ? 0.92 : 0.24} luminanceSmoothing={0.35} mipmapBlur />
        <Vignette offset={0.3} darkness={0.6} />
      </EffectComposer>
    </Canvas>
  )
}
