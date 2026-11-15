import * as THREE from 'three'
import type { ExerciseId } from '../core/coach'
import type { Rig } from './rig'

/*
 * Egzersiz hareketleri: her hareket, zamanın (0-1 arası döngü) bir fonksiyonu olarak birkaç hedef verir:
 * kalçanın yeri, gövdenin öne eğilmesi, bilek ve ayak bileği hedefleri, dirsek ve diz yönleri.
 * Kollar ve bacaklar iki kemikli ters kinematikle (IK) bu hedeflere uzanır; böylece ayaklar yerde sabit kalır,
 * eller bara tutunur. Hareketler istasyondaki gerçek cihazlara göredir (ARED, T2, CEVIS).
 */

export interface PoseSpec {
  /** Kalçanın dinlenme konumuna göre kayması (m) */
  pelvis: THREE.Vector3
  /** Kalçadan öne eğilme (radyan) ve sırtın bükülmesi */
  hinge: number
  bend: number
  /** Yana eğilme (radyan, figürün soluna doğru artı); kalça çevirmede gövdeyi ayakların üstünde tutar */
  lean?: number
  /**
   * Bilek hedefleri: 'world' dünya konumu; 'torso' omuza göre ve gövdeyle birlikte döner (bar sırtta);
   * 'shoulder' omuzdan başlar ama yönü dünyaya göre sabittir (sarkan kollar, aşağıdaki bara uzanan eller)
   */
  wrist: { L: THREE.Vector3; R: THREE.Vector3; space: 'world' | 'torso' | 'shoulder' }
  /** Ayak bileği ve parmak ucu hedefleri (dünya) */
  ankle: { L: THREE.Vector3; R: THREE.Vector3 }
  toe?: { L: THREE.Vector3; R: THREE.Vector3 }
  /** Dirsek ve diz için bükülme yönü */
  elbowPole: THREE.Vector3
  /** Dirseklerin dışa açılma payı (her kolda kendi yanına, ayna simetrik); verilmezse 0,5 */
  elbowOut?: number
  kneePole: THREE.Vector3
  /** Dizlerin dışa açılma payı (ayna simetrik); verilmezse 0,15 */
  kneeOut?: number
  /**
   * Kollar hedefe uzanmak (IK) yerine omuzdan döndürülür (FK): kol çevirme ve koşu gibi sallanan kollar için.
   * L/R: kolun omuz ekseni (yan eksen) etrafında öne açısı (radyan; 0 aşağı, π/2 öne, π yukarı); abduct: yana açılma;
   * elbow: dirseğin öne bükülmesi; inward: ön kolun gövdenin ortasına doğru dönmesi. Kol hep bu eksende döndüğü için avuç içe bakmaya devam eder (dönüp durmaz).
   */
  armSwing?: { L: number; R: number; abduct?: number; elbow?: { L: number; R: number }; inward?: number }
  /** Gövdenin dikey eksende dönüşü (radyan): kalça bir yöne, göğüs ters yöne (koşuda) */
  twist?: number
  /**
   * Avuç içinin bakacağı yön (figür uzayında; yatarak yapılanlarda figürle birlikte döner). Ön kol kendi ekseninde
   * döndürülerek avuç bu yöne çevrilir: bar avucun içine oturur, parmaklar barın etrafına kapanır.
   */
  palm?: THREE.Vector3
  /** Elin kapanması: 0 açık ve rahat, 1 yumruk (bar ve gidon tutuşu); verilmezse 0,2 */
  grip?: number
  /** Bütün figürün dönüşü (yatarak yapılan hareketler) ve yükseltilmesi */
  /** shift: figürün z ekseninde kaydırılması (yatarak yapılan harekette gövde sahnenin ortasına gelsin, kamera ortasında dönsün) */
  root?: { rot: THREE.Euler; lift: number; shift?: number }
  /** Cihaz çizimi için */
  prop: 'bar' | 'barHang' | 'treadmill' | 'cycle' | 'bench' | 'none'
}

const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)

/** Bench press'te sırtüstü yatan figürün öne kaydırılması (m): bench de aynı kadar kayar (Equipment.tsx) */
export const BENCH_SHIFT = 0.85
const ease = (t: number) => (1 - Math.cos(t * Math.PI * 2)) / 2
const smooth01 = (x: number) => {
  const k = Math.min(1, Math.max(0, x))
  return k * k * (3 - 2 * k)
}

/** Koşuda ayağın havadaki yolu (dinlenmedeki ayak bileğine göre z, y): topuk kalçaya kalkar, diz öne sürülür, ayak iner */
const SWING_PATH: [number, number, number][] = [
  // [u, z, y]
  [0, -0.25, 0.07],
  [0.22, -0.36, 0.27],
  [0.5, -0.08, 0.38],
  [0.78, 0.2, 0.15],
  [1, 0.15, 0],
]

/** Noktalardan geçen yumuşak eğri (Catmull-Rom); u 0-1 */
function spline(u: number, pts: [number, number, number][]): [number, number] {
  let i = 0
  while (i < pts.length - 2 && u > pts[i + 1][0]) i++
  const p0 = pts[Math.max(0, i - 1)]
  const p1 = pts[i]
  const p2 = pts[i + 1]
  const p3 = pts[Math.min(pts.length - 1, i + 2)]
  const k = (u - p1[0]) / (p2[0] - p1[0])
  const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * k + (2 * a - 5 * b + 4 * c - d) * k * k + (-a + 3 * b - 3 * c + d) * k * k * k)
  return [cr(p0[1], p1[1], p2[1], p3[1]), cr(p0[2], p1[2], p2[2], p3[2])]
}

type Rest = Rig['rest']

/** Hareketin bir döngüsü kaç saniye */
export const CYCLE_SECONDS: Record<ExerciseId, number> = {
  // İlk yarı kol çevirme, ikinci yarı kalça çevirme
  warmup: 7,
  aredSquat: 3.6,
  aredDeadlift: 3.8,
  aredHeelRaise: 2.4,
  aredBench: 3,
  aredRow: 2.8,
  t2Run: 0.76,
  cevisCycle: 1.1,
  coreBrace: 4,
  spineStretch: 5,
  flySquat: 3.6,
  flyDeadlift: 3.8,
  flyBentRow: 2.8,
  flyHeelRaise: 2.4,
  flyRowing: 2.2,
}

/** Uçan tekerlek hareketleri istasyondaki eşleriyle aynı formdadır; hologram aynı pozu oynatır */
const SAME_FORM: Partial<Record<ExerciseId, ExerciseId>> = {
  flySquat: 'aredSquat',
  flyDeadlift: 'aredDeadlift',
  flyBentRow: 'aredRow',
  flyHeelRaise: 'aredHeelRaise',
  flyRowing: 'aredRow',
}

/** Kamera hedefinin yüksekliği (yatarak yapılanlarda figür aşağıda) */
export const CAMERA_Y: Partial<Record<ExerciseId, number>> = { aredBench: 0.7, cevisCycle: 0.8, spineStretch: 0.55 }

/**
 * Kamera hedefinin öne kayması (z, metre): figür ve aleti birlikte öne uzanan hareketlerde dönme merkezi ortaya alınır.
 * Bisiklet (bike.glb) sahnede z≈0,12 ile z≈1,06 arasında; merkezi z≈0,59. Figür selede, bu aralığın içinde kalır.
 */
export const CAMERA_Z: Partial<Record<ExerciseId, number>> = { cevisCycle: 0.59 }

/** Kollar gövdenin yanında, rahat sarkık (model T-pozda gelir; dinlenme konumu kullanılmaz) */
export function relaxedWrists(r: Rest): PoseSpec['wrist'] {
  const armLen = r['shoulder.L'].distanceTo(r['elbow.L']) + r['elbow.L'].distanceTo(r['wrist.L'])
  return { L: v(0.035, -armLen * 0.97, 0.02), R: v(-0.035, -armLen * 0.97, 0.02), space: 'shoulder' }
}

export function poseFor(exercise: ExerciseId, t: number, r: Rest): PoseSpec {
  const id = SAME_FORM[exercise] ?? exercise
  const restAnkle = { L: r['ankle.L'].clone(), R: r['ankle.R'].clone() }
  const armLen = r['shoulder.L'].distanceTo(r['elbow.L']) + r['elbow.L'].distanceTo(r['wrist.L'])
  const base: PoseSpec = {
    pelvis: v(),
    hinge: 0,
    bend: 0,
    wrist: relaxedWrists(r),
    ankle: restAnkle,
    elbowPole: v(0, -0.3, -1),
    kneePole: v(0, 0, 1),
    prop: 'none',
  }
  // Bar sırtın üstünde, boynun arkasında (squat, topuk kaldırma): eller omuzların dışında ve arkasında, dirsekler aşağıda
  const barOnShoulders = (): Pick<PoseSpec, 'wrist' | 'elbowPole' | 'elbowOut' | 'grip' | 'palm'> => ({
    wrist: { L: v(0.19, 0.03, -0.15), R: v(-0.19, 0.03, -0.15), space: 'torso' },
    elbowPole: v(0, -1, -0.35),
    elbowOut: 0.25,
    grip: 1,
    palm: v(0, 0, 1),
  })
  const s = ease(t)
  // Eller belde: bilekler kalçanın iki yanında (omzun biraz içinde ve altında), dirsekler dışa açık
  const handsOnHips = (): PoseSpec['wrist'] => ({ L: v(0.005, -0.37, 0.01), R: v(-0.005, -0.37, 0.01), space: 'torso' })

  switch (id) {
    case 'warmup': {
      if (t < 0.5) {
        // 1) Kol çevirme: düz kollar omuzdan öne, yukarı, arkaya ve aşağı geniş bir daire çizer (bir tur); kollar yanda
        // biraz açık kalır ki aşağıdan geçerken kalçaya değmesin. Başta ve sonda yavaşlar (yumuşak başlangıç).
        const u = t / 0.5
        const a = (u - Math.sin(u * Math.PI * 2) / (Math.PI * 2)) * Math.PI * 2
        const out = 0.12 + 0.1 * Math.sin(a / 2)
        return { ...base, armSwing: { L: a, R: a, abduct: out, elbow: { L: 0.08, R: 0.08 } }, grip: 0.25 }
      }
      // 2) Kalça çevirme: eller belde, kalça yatay bir daire çizer; ayaklar yerde, gövde ayakların üstünde kalır
      const a = ((t - 0.5) / 0.5) * Math.PI * 2
      const R = 0.09
      const px = Math.sin(a) * R
      const pz = Math.cos(a) * R
      return {
        ...base,
        pelvis: v(px, -0.02, pz - R * 0.2),
        hinge: -pz * 2.2,
        lean: px * 2.6,
        wrist: handsOnHips(),
        elbowPole: v(0, 0, -0.4),
        elbowOut: 1.2,
        grip: 0.1,
      }
    }
    case 'aredSquat':
      // Dizler ayak uçlarının yönünde (hafif dışa) açılır, içe kapanmaz
      return { ...base, pelvis: v(0, -0.34 * s, -0.12 * s), hinge: 0.4 * s, bend: 0.1 * s, ...barOnShoulders(), kneeOut: 0.35, prop: 'bar' }
    case 'aredDeadlift': {
      const hang = (side: 'L' | 'R') => v(side === 'L' ? 0.02 : -0.02, -armLen * 0.97, 0.03 + 0.05 * s)
      return { ...base, pelvis: v(0, -0.14 * s, -0.16 * s), hinge: 1.05 * s, bend: 0.12 * s, wrist: { L: hang('L'), R: hang('R'), space: 'shoulder' }, grip: 1, palm: v(0, 0, -1), prop: 'barHang' }
    }
    case 'aredHeelRaise':
      return {
        ...base,
        pelvis: v(0, 0.065 * s, 0),
        ankle: { L: restAnkle.L.clone().add(v(0, 0.065 * s, -0.01 * s)), R: restAnkle.R.clone().add(v(0, 0.065 * s, -0.01 * s)) },
        toe: { L: r['toe.L'].clone(), R: r['toe.R'].clone() },
        ...barOnShoulders(),
        prop: 'bar',
      }
    case 'aredBench': {
      // Sırtüstü yatarak: kollar göğüsten yukarı (gövdenin önüne) itilir
      const ext = 0.12 + 0.36 * (1 - s)
      return {
        ...base,
        wrist: { L: v(0.2, -0.05, ext), R: v(-0.2, -0.05, ext), space: 'torso' },
        elbowPole: v(0, -0.4, -1),
        grip: 1,
        palm: v(0, -1, 0),
        // Ayaklar z=0'da, baş z≈-1,75'te kalıyordu; figür ortası sahnenin ortasına kaydırılır
        root: { rot: new THREE.Euler(-Math.PI / 2, 0, 0), lift: 0.55, shift: BENCH_SHIFT },
        prop: 'bench',
      }
    }
    case 'aredRow': {
      // Öne eğilerek kürek çekme: eller sarkık halden göbeğe doğru çekilir
      const pull = s
      // Sarkık halden (omzun altında) göbeğe doğru: göbek, öne eğilmiş gövdede omzun altında ve arkasında kalır
      const hang = (side: 'L' | 'R') => v(side === 'L' ? 0.03 : -0.03, -armLen * 0.95 + (armLen * 0.95 - 0.27) * pull, 0.04 - 0.16 * pull)
      return { ...base, pelvis: v(0, -0.1, -0.12), hinge: 0.85, bend: 0.1, wrist: { L: hang('L'), R: hang('R'), space: 'shoulder' }, elbowPole: v(0, 1, -0.8), elbowOut: 0.05, grip: 1, palm: v(0, 0, -1), prop: 'barHang' }
    }
    case 't2Run': {
      /*
       * Koşu döngüsü (bir adım çifti). Her bacak: yer temasında ayak bant hızıyla geriye kayar (fazın %38'i), sonra
       * topuk kalçaya doğru kalkar, diz öne sürülür ve ayak gövdenin biraz önüne iner. Parmak ucu itişte aşağı bakar.
       * Kalça her basışta alçalır, havadayken yükselir; gövde hafif öne eğik, kalça ve göğüs ters yönlere döner.
       * Kollar dirsekten ~85 derece bükülü, omuzdan bacaklara ters sallanır (sol bacak öndeyken sol kol arkada).
       */
      const STANCE = 0.38
      const leg = (p: number) => {
        p = ((p % 1) + 1) % 1
        if (p < STANCE) {
          const k = p / STANCE
          const lift = smooth01((k - 0.7) / 0.3)
          return { z: 0.15 - 0.4 * k, y: 0.07 * lift, pitch: 0.5 * lift }
        }
        const u = (p - STANCE) / (1 - STANCE)
        const [z, y] = spline(u, SWING_PATH)
        const pitch = u < 0.5 ? 0.5 - 0.5 * u : 0.25 - 0.6 * (u - 0.5)
        return { z, y, pitch: u > 0.92 ? pitch * (1 - (u - 0.92) / 0.08) : pitch }
      }
      const footVec = (side: 'L' | 'R') => r[`toe.${side}`].clone().sub(r[`ankle.${side}`])
      const ankle = (side: 'L' | 'R', p: number) => {
        const g = leg(p)
        return restAnkle[side].clone().add(v(-restAnkle[side].x * 0.12, g.y, g.z))
      }
      const toe = (side: 'L' | 'R', p: number) => ankle(side, p).add(footVec(side).applyAxisAngle(v(1, 0, 0), leg(p).pitch))
      const pL = t
      const pR = t + 0.5
      // Kalça en alçakta basışın ortasında (her bacak için bir kez), en yüksekte havadayken
      const bob = Math.cos(Math.PI * 4 * (t - STANCE / 2))
      // Sol ayak öndeyken (z büyük) kalçanın sol yanı öndedir; göğüs ters döner
      const fwdL = leg(pL).z - leg(pR).z
      const arm = (p: number) => 0.5 * Math.cos(2 * Math.PI * (p - 0.42)) - 0.05
      return {
        ...base,
        pelvis: v(0, -0.045 - 0.022 * bob, 0.02),
        hinge: 0.17,
        bend: 0.05,
        twist: -0.22 * fwdL,
        ankle: { L: ankle('L', pL), R: ankle('R', pR) },
        toe: { L: toe('L', pL), R: toe('R', pR) },
        armSwing: { L: arm(pL), R: arm(pR), abduct: -0.04, inward: 0.38, elbow: { L: 1.5 + 0.12 * arm(pL), R: 1.5 + 0.12 * arm(pR) } },
        kneeOut: 0.03,
        grip: 0.8,
        prop: 'treadmill',
      }
    }
    case 'cevisCycle': {
      // Oturarak pedal çevirme: ayak bilekleri pedal dairesi çizer, eller gidonda
      const a = t * Math.PI * 2
      const center = (side: 'L' | 'R') => v(r[`hip.${side}`].x * 0.9, 0.32, 0.36)
      // İleri pedal: ayak önden aşağı, alttan arkaya, arkadan yukarı ve tepeden öne döner
      const pedal = (ph: number) => v(0, -Math.sin(ph) * 0.15, Math.cos(ph) * 0.15)
      /*
       * Kalça, gerçek bisiklet modelinin (Equipment.tsx, bike.glb) selesinin üstünde; gövde öne eğik, eller gidonda.
       * Bisiklet pedal yarıçapı bu dairenin yarıçapına (0,15 m) göre ölçeklenir: sele üstü y≈0,72, z≈0,26; gidon
       * borusu y≈0,68, z≈0,83-0,86 (iki yanda x≈±0,17). Eğim, kadın ve erkek modelde avuçlar gidona oturacak kadardır.
       */
      return {
        ...base,
        pelvis: v(0, -0.13, 0.29),
        hinge: 1.0,
        ankle: { L: center('L').add(pedal(a)), R: center('R').add(pedal(a + Math.PI)) },
        wrist: { L: v(0.17, 0.68, 0.86), R: v(-0.17, 0.68, 0.86), space: 'world' },
        elbowPole: v(0, -0.6, -1),
        kneePole: v(0, 0.3, 1),
        kneeOut: 0.03,
        grip: 0.9,
        palm: v(0, -1, 0),
        prop: 'cycle',
      }
    }
    case 'coreBrace': {
      // Ayakta gövde sabitleme: eller belde, karın kasları sıkılıp gevşer
      const b = Math.sin(t * Math.PI * 2) * 0.5 + 0.5
      return {
        ...base,
        pelvis: v(0, -0.02 * b, -0.015 * b),
        hinge: -0.04 * b,
        wrist: handsOnHips(),
        elbowPole: v(0, 0, -0.4),
        elbowOut: 1.2,
        grip: 0.1,
      }
    }
    case 'spineStretch': {
      // Ağırlıksız ortamda dizleri göğse çekme; nefesle birlikte
      // Dizler göğse çekilir (topak), kollar baldırları sarar; nefes verirken sıkılaşır, alırken biraz açılır
      const b = ease(t)
      // Ayaklar zemine basar (dinlenmedeki ayak bileği yüksekliği); kalça ayakların hemen üstüne iner ve nefesle
      // birlikte biraz kalkıp iner. Önceden ayaklar zeminin 8-16 cm üstünde kalıyor, figür havada duruyordu.
      const drop = 0.2 + 0.08 * (1 - b)
      const pelvis = v(0, r['ankle.L'].y + drop - r['hip.L'].y, -0.05)
      const ankle = (side: 'L' | 'R') => r[`hip.${side}`].clone().add(pelvis).add(v(side === 'L' ? 0.03 : -0.03, -drop, 0.16 + 0.04 * (1 - b)))
      return {
        ...base,
        pelvis,
        hinge: 0.3 + 0.12 * b,
        bend: 0.35 + 0.1 * b,
        ankle: { L: ankle('L'), R: ankle('R') },
        kneePole: v(0, 1, 0.7),
        kneeOut: 0.06,
        wrist: { L: v(-0.07, -0.22, 0.4), R: v(0.07, -0.22, 0.4), space: 'torso' },
        elbowPole: v(0, -0.4, -0.3),
        elbowOut: 0.9,
        grip: 0.6,
        root: { rot: new THREE.Euler(0.1, 0, 0), lift: 0 },
      }
    }
    // Uçan tekerlek hareketleri yukarıda eşlerine çevrildi (SAME_FORM); buraya düşen olmaz
    default:
      return base
  }
}

/* ---------- Uygulama (IK) ---------- */

const tmpA = new THREE.Vector3()
const tmpB = new THREE.Vector3()
const tmpQ = new THREE.Quaternion()
const tmpQ2 = new THREE.Quaternion()

function worldPos(o: THREE.Object3D, out: THREE.Vector3) {
  return o.getWorldPosition(out)
}

/** Bir kemiği, çocuğu dünya uzayında verilen yöne bakacak şekilde döndürür */
function aim(bone: THREE.Bone, child: THREE.Object3D, dir: THREE.Vector3) {
  bone.updateWorldMatrix(true, false)
  const from = worldPos(bone, tmpA)
  const to = worldPos(child, tmpB).sub(from).normalize()
  const delta = tmpQ.setFromUnitVectors(to, dir.clone().normalize())
  const world = bone.getWorldQuaternion(tmpQ2)
  const next = delta.multiply(world)
  const parentWorld = bone.parent ? bone.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion()
  bone.quaternion.copy(parentWorld.invert().multiply(next))
  bone.updateMatrixWorld(true)
}

/** Bir kemiği dünya ekseni etrafında, kendi başı merkezli döndürür */
function rotateWorld(bone: THREE.Bone, axis: THREE.Vector3, angle: number) {
  if (!angle) return
  bone.updateWorldMatrix(true, false)
  const delta = new THREE.Quaternion().setFromAxisAngle(axis, angle)
  const world = bone.getWorldQuaternion(new THREE.Quaternion())
  const parentWorld = bone.parent ? bone.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion()
  bone.quaternion.copy(parentWorld.invert().multiply(delta.multiply(world)))
  bone.updateMatrixWorld(true)
}

/** İki kemikli ters kinematik: üst kemik + alt kemik, uç hedefe ve bükülme yönüne göre */
function twoBone(upper: THREE.Bone, lower: THREE.Bone, end: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3) {
  upper.updateWorldMatrix(true, true)
  const root = worldPos(upper, new THREE.Vector3())
  const mid = worldPos(lower, new THREE.Vector3())
  const tip = worldPos(end, new THREE.Vector3())
  const a = root.distanceTo(mid)
  const b = mid.distanceTo(tip)
  const toT = target.clone().sub(root)
  const d = Math.min(Math.max(toT.length(), Math.abs(a - b) + 1e-3), a + b - 1e-3)
  const dir = toT.normalize()
  const cosA = (a * a + d * d - b * b) / (2 * a * d)
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA))
  const perp = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir)))
  if (perp.lengthSq() < 1e-8) perp.set(0, 0, 1)
  perp.normalize()
  const midTarget = root.clone().addScaledVector(dir, cosA * a).addScaledVector(perp, sinA * a)
  aim(upper, lower, midTarget.clone().sub(root))
  const midNow = worldPos(lower, new THREE.Vector3())
  aim(lower, end, root.clone().addScaledVector(dir, d).sub(midNow))
}

const X = new THREE.Vector3(1, 0, 0)
const Y = new THREE.Vector3(0, 1, 0)
const Z = new THREE.Vector3(0, 0, 1)

/** Pozu iskelete uygular. Figür grubunun dünya dönüşü (yatarak yapılanlar) dışarıda verilir. */
export function applyPose(rig: Rig, spec: PoseSpec) {
  const B = rig.bones
  // Dinlenme pozuna dön
  for (const [bone, q] of rig.restPose) bone.quaternion.copy(q)
  B.pelvis.position.copy(rig.restRoot).add(spec.pelvis.clone().applyMatrix3(rig.pelvisSpace))
  rig.mesh.updateMatrixWorld(true)

  // Gövde: kalçadan menteşe ve sırtın bükülmesi (öne eğilme +X ekseni etrafında; figür +Z'ye bakar)
  const toWorld = (local: THREE.Vector3) => local.clone().applyQuaternion(rig.mesh.getWorldQuaternion(new THREE.Quaternion()))
  const axis = toWorld(X).normalize()
  rotateWorld(B.pelvis, axis, spec.hinge * 0.6)
  rotateWorld(B.spine, axis, spec.hinge * 0.25 + spec.bend * 0.5)
  rotateWorld(B.chest, axis, spec.hinge * 0.15 + spec.bend * 0.5)
  // Yana eğilme: kalça bir yana, gövde ters yana (omuzlar ayakların üstünde kalır)
  if (spec.lean) {
    const fwd = toWorld(Z).normalize()
    rotateWorld(B.pelvis, fwd, spec.lean)
    rotateWorld(B.spine, fwd, -spec.lean * 0.6)
    rotateWorld(B.chest, fwd, -spec.lean * 0.5)
  }
  // Parmaklar: her eklem avuca doğru kıvrılır; başparmak daha az
  const grip = spec.grip ?? 0.2
  for (const f of rig.fingers) f.bone.quaternion.multiply(tmpQ.setFromAxisAngle(f.axis, f.thumb ? 0.1 + grip * 0.45 : 0.12 + grip * 1.2))
  // Dikey eksende dönüş: kalça bir yana, göğüs ters yana (omuzlar kalçaya karşı döner)
  if (spec.twist) {
    const up = toWorld(Y).normalize()
    rotateWorld(B.pelvis, up, spec.twist)
    rotateWorld(B.chest, up, -spec.twist * 1.8)
    rotateWorld(B.neck, up, spec.twist * 0.8)
  }
  // Baş ileri bakmaya devam eder
  rotateWorld(B.neck, axis, -(spec.hinge * 0.6 + spec.bend) * 0.5)

  const meshToWorld = (p: THREE.Vector3) => rig.mesh.localToWorld(p.clone())
  // Bacaklar (ayaklar hedefte)
  for (const s of ['L', 'R'] as const) {
    const ankleT = meshToWorld(spec.ankle[s])
    twoBone(B[`thigh.${s}`], B[`shin.${s}`], B[`foot.${s}`], ankleT, toWorld(spec.kneePole.clone().add(new THREE.Vector3((s === 'L' ? 1 : -1) * (spec.kneeOut ?? 0.15), 0, 0))))
    const toe = spec.toe ? meshToWorld(spec.toe[s]) : null
    const footEnd = rig.ends[`foot.${s}`]
    if (toe) aim(B[`foot.${s}`], footEnd, toe.sub(worldPos(B[`foot.${s}`], new THREE.Vector3())))
    else aim(B[`foot.${s}`], footEnd, toWorld(rig.rest[`toe.${s}`].clone().sub(rig.rest[`ankle.${s}`])))
  }
  // Kollar
  for (const s of ['L', 'R'] as const) {
    if (spec.armSwing) {
      // Omuzdan döndürme: önce yana açılma, sonra yan eksende öne/yukarı; dirsek aynı eksende bükülür
      const sw = spec.armSwing
      const sign = s === 'L' ? 1 : -1
      const lateral = toWorld(X).normalize()
      const angle = sw[s]
      const height = -Math.cos(angle)
      if (height > 0) rotateWorld(B[`clavicle.${s}`], toWorld(Z).normalize(), sign * Math.asin(height) * 0.22)
      rotateWorld(B[`upperarm.${s}`], toWorld(Z).normalize(), sign * (sw.abduct ?? 0))
      rotateWorld(B[`upperarm.${s}`], lateral, -angle)
      if (sw.elbow) rotateWorld(B[`forearm.${s}`], lateral, -sw.elbow[s])
      if (sw.inward) rotateWorld(B[`forearm.${s}`], toWorld(Y).normalize(), -sign * sw.inward)
      continue
    }
    let target: THREE.Vector3
    if (spec.wrist.space === 'torso') {
      // Omuza göre, gövdenin (göğüs kemiğinin) dönüşüyle birlikte
      const chestQ = B.chest.getWorldQuaternion(new THREE.Quaternion())
      const restChestQ = rig.mesh.getWorldQuaternion(new THREE.Quaternion())
      const rel = chestQ.multiply(restChestQ.invert())
      const shoulder = worldPos(B[`upperarm.${s}`], new THREE.Vector3())
      target = shoulder.add(toWorld(spec.wrist[s]).applyQuaternion(rel))
    } else if (spec.wrist.space === 'shoulder') {
      target = worldPos(B[`upperarm.${s}`], new THREE.Vector3()).add(toWorld(spec.wrist[s]))
    } else target = meshToWorld(spec.wrist[s])
    const handBone = B[`hand.${s}`]
    // Kol omuz hizasının üstüne kalkınca köprücük kemiği de biraz kalkar (gerçek omuzda olduğu gibi); bütün dönüş
    // tek eklemde olunca omuz başı ezilir ve koltuk altı esner
    const shoulderW = worldPos(B[`upperarm.${s}`], new THREE.Vector3())
    const elev = Math.asin(Math.min(1, Math.max(-1, target.clone().sub(shoulderW).normalize().dot(toWorld(Y).normalize()))))
    if (elev > 0) rotateWorld(B[`clavicle.${s}`], toWorld(Z).normalize(), (s === 'L' ? 1 : -1) * elev * 0.22)
    twoBone(B[`upperarm.${s}`], B[`forearm.${s}`], handBone, target, toWorld(spec.elbowPole.clone().add(new THREE.Vector3((s === 'L' ? 1 : -1) * (spec.elbowOut ?? 0.5), 0, 0))))
    if (spec.palm) turnPalm(rig, s, toWorld(spec.palm).normalize())
  }
}

/**
 * Avucu istenen yöne çevirir: ön kol ve el kendi ekseni (dirsekten bileğe) etrafında döner; dönüşün çoğu ön kolda,
 * kalanı bilekte (gerçekte de ön kol kemikleri döner; tek eklemde olunca bilek burulurdu). El yeri değişmez.
 */
function turnPalm(rig: Rig, s: 'L' | 'R', want: THREE.Vector3) {
  const B = rig.bones
  const fore = B[`forearm.${s}`]
  const hand = B[`hand.${s}`]
  const axis = worldPos(hand, new THREE.Vector3()).sub(worldPos(fore, new THREE.Vector3())).normalize()
  const now = rig.palm[s].clone().applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()))
  const flat = (p: THREE.Vector3) => p.clone().addScaledVector(axis, -p.dot(axis))
  const a = flat(now)
  const b = flat(want)
  if (a.lengthSq() < 1e-6 || b.lengthSq() < 1e-6) return
  a.normalize()
  b.normalize()
  const angle = Math.atan2(a.clone().cross(b).dot(axis), a.dot(b))
  rotateWorld(fore, axis, angle * 0.65)
  rotateWorld(hand, axis, angle * 0.35)
}

/** Hareket sırasında parlayan bölgeler (hologram bölge numaraları: 0 baş ... 7 ayaklar) */
export const REGION_INDEX = { bas: 0, gogus: 1, sirt: 2, ustKol: 3, onKol: 4, eller: 5, bacaklar: 6, ayaklar: 7 } as const
