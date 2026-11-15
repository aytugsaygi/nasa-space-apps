import { useGLTF } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'
import { REGION_ORDER } from '../data/regions'
import type { RegionId } from '../data/types'
import { createBodyMaterial } from '../hologram/holoMaterial'

/*
 * Spor koçundaki ısı haritası: ana sayfadaki anatomi hologramının (Z-Anatomy, CC BY-SA 4.0) dış yüzeyi küçük boyutta,
 * önden ve arkadan yan yana. Her bölge bugün ne kadar çalıştıysa o kadar ısınır: hiç çalışmayan soluk ve renksiz,
 * orta çalışan sarı, çok çalışan kırmızı. Sahne yalnızca ısı değişince çizilir (sürekli animasyon yok).
 */

const MODEL_URL = '/models/anatomy.glb'
const DRACO_PATH = '/draco/'

/** Çalışmayan bölge: ısı rengi yok, ana sayfadaki hologramın soluk mavisi (figür hep görünür kalır) */
const COLD = new THREE.Color('#4fa9cf')
const WARM = new THREE.Color('#f7c35c')
const HOT = new THREE.Color('#ff4d4d')

/** 0: renksiz, 0,5 civarı sarı, 1: kırmızı */
function heatColor(h: number) {
  if (h <= 0) return COLD.clone()
  if (h < 0.5) return COLD.clone().lerp(WARM, 0.45 + 1.1 * h)
  return WARM.clone().lerp(HOT, (h - 0.5) * 2)
}

/** Modelden yalnızca bölgelere ayrılmış dış yüzey (skin_<bölge>) alınır; kas ve kemik katmanları kullanılmaz */
function skinParts(scene: THREE.Object3D) {
  scene.updateMatrixWorld(true)
  const parts: { geometry: THREE.BufferGeometry; region: RegionId }[] = []
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    const m = mesh.isMesh ? mesh.name.match(/^skin_([a-zA-Z]+)/) : null
    if (!m) return
    const ri = REGION_ORDER.indexOf(m[1] as RegionId)
    if (ri < 0) return
    const g = mesh.geometry.clone()
    g.applyMatrix4(mesh.matrixWorld)
    if (!g.getAttribute('normal')) g.computeVertexNormals()
    g.setAttribute('aRegion', new THREE.BufferAttribute(new Uint8Array(g.getAttribute('position').count).fill(ri), 1))
    parts.push({ geometry: g, region: REGION_ORDER[ri] })
  })
  const box = new THREE.Box3()
  for (const p of parts) {
    p.geometry.computeBoundingBox()
    box.union(p.geometry.boundingBox!)
  }
  return { parts, box }
}

function Bodies({ heat }: { heat: Partial<Record<RegionId, number>> }) {
  const gltf = useGLTF(MODEL_URL, DRACO_PATH)
  const { parts, box } = useMemo(() => skinParts(gltf.scene), [gltf.scene])
  useEffect(() => () => parts.forEach((p) => p.geometry.dispose()), [parts])
  const material = useMemo(() => {
    const m = createBodyMaterial({ fill: 0.07, light: 0.5, rim: 1.0, grid: 0.22 })
    m.uniforms.uTime.value = 0
    return m
  }, [])
  useEffect(() => () => material.dispose(), [material])

  const { camera, size, invalidate } = useThree()
  const center = box.getCenter(new THREE.Vector3())
  const dim = box.getSize(new THREE.Vector3())

  // Isıya göre bölge rengi; sıcak bölgeler ayrıca parlar (vurgu kanalı)
  useLayoutEffect(() => {
    REGION_ORDER.forEach((r, i) => {
      const h = heat[r] ?? 0
      material.uniforms.uRegionColor.value[i].copy(heatColor(h))
      material.uniforms.uHover.value[i] = h > 0 ? 0.5 + 0.8 * h : 0
    })
    invalidate()
  }, [heat, material, invalidate])

  /*
   * İki figür alanın dörtte bir ve dörtte üç noktalarına oturur (altındaki Ön / Arka yazıları da bu noktalarda); figür
   * yüksekliğe sığar, gerekirse genişliğe göre küçülür
   */
  const zoom = Math.min(size.height / (dim.y * 1.04), size.width / 2 / (dim.x * 1.15))
  const half = size.width / zoom / 4
  useLayoutEffect(() => {
    const cam = camera as THREE.OrthographicCamera
    cam.zoom = zoom
    cam.position.set(0, center.y, 10)
    cam.lookAt(0, center.y, 0)
    cam.updateProjectionMatrix()
    invalidate()
  }, [camera, zoom, center, invalidate])

  const figure = (x: number, back: boolean) => (
    <group position={[x, 0, 0]}>
      <group rotation={[0, back ? Math.PI : 0, 0]}>
        <group position={[-center.x, 0, -center.z]}>
          {parts.map((p) => (
            <mesh key={p.region} geometry={p.geometry} material={material} />
          ))}
        </group>
      </group>
    </group>
  )
  return (
    <>
      {figure(-half, false)}
      {figure(half, true)}
    </>
  )
}

export default function BodyHeatmap({ heat, label }: { heat: Partial<Record<RegionId, number>>; label: string }) {
  return (
    <Canvas orthographic frameloop="demand" dpr={[1, 2]} gl={{ antialias: true, alpha: true }} camera={{ near: 0.1, far: 50 }} role="img" aria-label={label}>
      <Suspense fallback={null}>
        <Bodies heat={heat} />
      </Suspense>
    </Canvas>
  )
}
