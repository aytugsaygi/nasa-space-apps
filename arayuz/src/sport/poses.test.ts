import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { poseFor } from './poses'

/* Hologram antrenör hareketleri (2026-11-13 düzeltmeleri): ısınmada kalça hareket eder, kollar ayna simetriktir */
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const rest: Record<string, THREE.Vector3> = {}
for (const [s, k] of [
  ['L', 1],
  ['R', -1],
] as const) {
  Object.assign(rest, {
    [`hip.${s}`]: v(0.09 * k, 0.93, 0),
    [`knee.${s}`]: v(0.09 * k, 0.5, 0.01),
    [`ankle.${s}`]: v(0.09 * k, 0.08, -0.02),
    [`toe.${s}`]: v(0.09 * k, 0.025, 0.12),
    [`shoulder.${s}`]: v(0.18 * k, 1.42, -0.03),
    [`elbow.${s}`]: v(0.24 * k, 1.13, -0.04),
    [`wrist.${s}`]: v(0.3 * k, 0.86, 0.02),
  })
}

describe('antrenör hareketleri', () => {
  it('omuz ve kalça ısınması: ilk yarı kol çevirme, ikinci yarı kalça çemberi (kalça yatayda daire çizer)', () => {
    const arms = poseFor('warmup', 0.1, rest)
    expect(arms.pelvis.length()).toBe(0)
    const hips = [0.5, 0.625, 0.75, 0.875].map((t) => poseFor('warmup', t, rest).pelvis)
    const xs = hips.map((p) => p.x)
    const zs = hips.map((p) => p.z)
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.15)
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0.15)
    // Gövde ayakların üstünde kalsın diye kalçanın tersine yana eğilir
    expect(poseFor('warmup', 0.625, rest).lean).not.toBe(0)
  })

  it('eller belde: iki bilek ve dirsek ayna simetrik', () => {
    for (const id of ['coreBrace', 'warmup'] as const) {
      const p = poseFor(id, id === 'warmup' ? 0.75 : 0.5, rest)
      expect(p.wrist.L.x).toBeCloseTo(-p.wrist.R.x, 5)
      expect(p.wrist.L.y).toBeCloseTo(p.wrist.R.y, 5)
      expect(p.elbowOut).toBeGreaterThan(0.5)
    }
  })

  it('omurga esnetme: ayaklar kaldırılmış kalçanın hemen altında ve önünde (dizler göğse çekilir)', () => {
    const p = poseFor('spineStretch', 0.5, rest)
    const hip = rest['hip.L'].clone().add(p.pelvis)
    expect(hip.y - p.ankle.L.y).toBeLessThan(0.3)
    expect(p.ankle.L.z - hip.z).toBeGreaterThan(0.1)
  })

  it('koşu: basan ayak yerde geriye kayar, öbürü havada; kollar bacaklara ters sallanır, dirsekler bükülü', () => {
    // t = 0,15: sol ayak yerde (basış), sağ ayak havada
    const a = poseFor('t2Run', 0.15, rest)
    const b = poseFor('t2Run', 0.3, rest)
    expect(a.ankle.L.y).toBeCloseTo(rest['ankle.L'].y, 2)
    expect(b.ankle.L.z).toBeLessThan(a.ankle.L.z)
    expect(a.ankle.R.y - rest['ankle.R'].y).toBeGreaterThan(0.1)
    // Sol bacak öndeyken (basışın başı) sol kol arkada, sağ kol önde
    const land = poseFor('t2Run', 0.0, rest)
    expect(land.armSwing!.L).toBeLessThan(land.armSwing!.R)
    expect(land.armSwing!.elbow!.L).toBeGreaterThan(1.2)
  })

  it('kol çevirme: kollar omuzdan döner (hedefe uzanmaz), tur sonunda başa döner', () => {
    const angles = [0, 0.125, 0.25, 0.375, 0.4999].map((t) => poseFor('warmup', t, rest).armSwing!.L)
    expect(angles[0]).toBeCloseTo(0, 5)
    expect(angles[2]).toBeCloseTo(Math.PI, 5)
    expect(angles[4]).toBeCloseTo(Math.PI * 2, 2)
    for (let i = 1; i < angles.length; i++) expect(angles[i]).toBeGreaterThan(angles[i - 1])
  })
})
