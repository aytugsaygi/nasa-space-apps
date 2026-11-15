import * as THREE from 'three'

/*
 * Hologram antrenörün iskeleti: Quaternius "Universal Base Characters" modeli (CC0). Model sanatçının kurduğu iskelet ve
 * deri ağırlıklarıyla gelir; burada yalnızca hareket kodunun kullandığı kemikler adlandırılır, eklemlerin dinlenme
 * konumları okunur ve her köşeye parlama için bir vücut bölgesi atanır.
 *
 * Model dosyası (public/models/trainer-*.glb) asıl paketten sadeleştirilmiştir: yalnızca gövde, iskelet ve ağırlıklar
 * (doku, göz, kaş yok); hologram malzemesi kodda verilir. Model T-pozdadır; kollar her karede hareket koduyla konur.
 *
 * Koordinatlar (figür uzayı): Y yukarı, figür +Z yönüne bakar, modelin solu +X, birim metre, ayaklar y = 0'da.
 */

export const REGIONS = ['bas', 'gogus', 'sirt', 'ustKol', 'onKol', 'eller', 'bacaklar', 'ayaklar'] as const
export type Region = (typeof REGIONS)[number]

export type BoneName =
  | 'pelvis'
  | 'spine'
  | 'chest'
  | 'neck'
  | 'head'
  | `${'clavicle' | 'upperarm' | 'forearm' | 'hand' | 'thigh' | 'shin' | 'foot'}.${'L' | 'R'}`

export interface Rig {
  /** Figürün kökü: yerel uzayı figür uzayıdır */
  mesh: THREE.Object3D
  skinned: THREE.SkinnedMesh
  bones: Record<BoneName, THREE.Bone>
  /** Uç kemiklerin yönünü veren çocuklar (ayak ucu, el ortası) */
  ends: Record<'hand.L' | 'hand.R' | 'foot.L' | 'foot.R', THREE.Object3D>
  /** Dinlenme pozundaki eklem konumları (figür uzayı) */
  rest: Record<string, THREE.Vector3>
  /** Bütün kemiklerin dinlenme dönüşleri (her karede poz buradan başlar) */
  restPose: [THREE.Bone, THREE.Quaternion][]
  restRoot: THREE.Vector3
  /** Parmak eklemleri ve her birinin avuca doğru kıvrılma ekseni (kemiğin kendi uzayında) */
  fingers: { bone: THREE.Bone; axis: THREE.Vector3; thumb: boolean }[]
  /** Avuç içinin yönü, el kemiğinin kendi uzayında (bar tutuşunda avucu doğru yöne çevirmek için) */
  palm: Record<'L' | 'R', THREE.Vector3>
  /** Figür uzayındaki bir kaymayı kalça kemiğinin üst kemiğinin yerel uzayına çevirir */
  pelvisSpace: THREE.Matrix3
  height: number
}

/** Quaternius (Unreal mankeniyle aynı adlar) → hareket kodundaki adlar */
const BONE_MAP: Record<BoneName, string> = {
  pelvis: 'pelvis',
  spine: 'spine_01',
  chest: 'spine_03',
  neck: 'neck_01',
  head: 'Head',
  'clavicle.L': 'clavicle_l',
  'upperarm.L': 'upperarm_l',
  'forearm.L': 'lowerarm_l',
  'hand.L': 'hand_l',
  'thigh.L': 'thigh_l',
  'shin.L': 'calf_l',
  'foot.L': 'foot_l',
  'clavicle.R': 'clavicle_r',
  'upperarm.R': 'upperarm_r',
  'forearm.R': 'lowerarm_r',
  'hand.R': 'hand_r',
  'thigh.R': 'thigh_r',
  'shin.R': 'calf_r',
  'foot.R': 'foot_r',
}

/** Bir kemik adının parlama bölgesi; gövde kemikleri önde göğüs, arkada sırt olur */
function regionOf(bone: string, front: boolean): Region {
  if (/^(Head|neck)/.test(bone)) return 'bas'
  if (/^upperarm/.test(bone)) return 'ustKol'
  if (/^lowerarm/.test(bone)) return 'onKol'
  if (/^(hand|index|middle|ring|pinky|thumb)/.test(bone)) return 'eller'
  if (/^(thigh|calf)/.test(bone)) return 'bacaklar'
  if (/^(foot|ball)/.test(bone)) return 'ayaklar'
  return front ? 'gogus' : 'sirt'
}

/** Yüklenmiş (kopyalanmış) model sahnesinden iskelet kurar ve gövdeye malzemeyi verir */
export function buildRig(scene: THREE.Object3D, material: THREE.Material): Rig {
  let skinned: THREE.SkinnedMesh | null = null
  scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh && !skinned) skinned = o as THREE.SkinnedMesh
  })
  if (!skinned) throw new Error('trainer model has no skinned mesh')
  const body = skinned as THREE.SkinnedMesh
  body.material = material
  body.frustumCulled = false

  const byName = new Map<string, THREE.Bone>()
  for (const b of body.skeleton.bones) byName.set(b.name, b)
  const get = (n: string) => {
    const b = byName.get(n)
    if (!b) throw new Error(`trainer bone missing: ${n}`)
    return b
  }
  const bones = Object.fromEntries(Object.entries(BONE_MAP).map(([k, n]) => [k, get(n)])) as Record<BoneName, THREE.Bone>
  const ends = { 'hand.L': get('middle_01_l'), 'hand.R': get('middle_01_r'), 'foot.L': get('ball_l'), 'foot.R': get('ball_r') }

  /*
   * Dinlenme pozu: kollar T-pozdan gövdenin yanına indirilir (avuçlar içe bakar). Hareket kodu her karede bu pozdan
   * başlar; kol T-pozdan en kısa yoldan döndürülünce avuç kolun yönüne göre içe, aşağı ya da dışa dönüyordu.
   */
  scene.updateMatrixWorld(true)
  for (const [s, sign] of [
    ['L', 1],
    ['R', -1],
  ] as const) {
    const up = bones[`upperarm.${s}`]
    const from = bones[`forearm.${s}`].getWorldPosition(new THREE.Vector3()).sub(up.getWorldPosition(new THREE.Vector3())).normalize()
    const to = new THREE.Vector3(0.17 * sign, -1, 0.03).normalize()
    const delta = new THREE.Quaternion().setFromUnitVectors(from, to)
    const parent = up.parent!.getWorldQuaternion(new THREE.Quaternion())
    up.quaternion.copy(parent.clone().invert().multiply(delta.multiply(up.getWorldQuaternion(new THREE.Quaternion()))))
    up.updateMatrixWorld(true)
  }
  scene.updateMatrixWorld(true)
  const inv = scene.matrixWorld.clone().invert()
  const at = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv)

  const box = new THREE.Box3().setFromBufferAttribute(body.geometry.getAttribute('position') as THREE.BufferAttribute)
  const H = box.max.y

  const rest: Record<string, THREE.Vector3> = {
    pelvis: at(bones.pelvis),
    spine: at(bones.spine),
    chest: at(bones.chest),
    neck: at(bones.neck),
    head: at(bones.head),
  }
  rest.headTop = new THREE.Vector3(rest.head.x, H, rest.head.z)
  for (const s of ['L', 'R'] as const) {
    Object.assign(rest, {
      [`hip.${s}`]: at(bones[`thigh.${s}`]),
      [`knee.${s}`]: at(bones[`shin.${s}`]),
      [`ankle.${s}`]: at(bones[`foot.${s}`]),
      [`toe.${s}`]: at(ends[`foot.${s}`]),
      [`shoulder.${s}`]: at(bones[`upperarm.${s}`]),
      [`elbow.${s}`]: at(bones[`forearm.${s}`]),
      [`wrist.${s}`]: at(bones[`hand.${s}`]),
      [`handEnd.${s}`]: at(ends[`hand.${s}`]),
    })
  }

  // Kalçanın kayması figür uzayında verilir; kalça kemiğinin üst kemiği (kök) Z-yukarı bir uzaydadır
  const parentToFigure = new THREE.Matrix4().multiplyMatrices(inv, bones.pelvis.parent!.matrixWorld)
  const pelvisSpace = new THREE.Matrix3().setFromMatrix4(parentToFigure).invert()

  // Bölge özniteliği: her köşe en çok etkilendiği kemiğin bölgesini alır
  const g = body.geometry
  const idx = g.getAttribute('skinIndex') as THREE.BufferAttribute
  const wgt = g.getAttribute('skinWeight') as THREE.BufferAttribute
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute
  const region = new Float32Array(pos.count)
  const names = body.skeleton.bones.map((b) => b.name)
  for (let v = 0; v < pos.count; v++) {
    let best = 0
    let bw = -1
    for (let k = 0; k < 4; k++) {
      const w = wgt.getComponent(v, k)
      if (w > bw) {
        bw = w
        best = idx.getComponent(v, k)
      }
    }
    region[v] = REGIONS.indexOf(regionOf(names[best], nrm.getZ(v) >= 0))
  }
  g.setAttribute('aRegion', new THREE.BufferAttribute(region, 1))

  /*
   * Parmak kıvırma: model T-pozda, avuçlar aşağı bakar. Her elde parmak yönü (bilekten orta parmağa) ve başparmak
   * yanı bulunur; avuç normali bunlardan çıkar (sağ elde ayna). Bir parmak avuca doğru, parmak yönü × avuç ekseni
   * etrafında döner. Eksen, kemiğin dinlenmedeki dünya dönüşüyle kemiğin kendi uzayına çevrilir.
   */
  const fingers: Rig['fingers'] = []
  const palmLocal = {} as Rig['palm']
  for (const s of ['l', 'r'] as const) {
    const wrist = get(`hand_${s}`).getWorldPosition(new THREE.Vector3())
    const dir = get(`middle_01_${s}`).getWorldPosition(new THREE.Vector3()).sub(wrist).normalize()
    const side = get(`thumb_01_${s}`).getWorldPosition(new THREE.Vector3()).sub(wrist)
    side.addScaledVector(dir, -side.dot(dir)).normalize()
    const palm = s === 'l' ? dir.clone().cross(side) : side.clone().cross(dir)
    const axisWorld = dir.clone().cross(palm).normalize()
    palmLocal[s === 'l' ? 'L' : 'R'] = palm.clone().normalize().applyQuaternion(get(`hand_${s}`).getWorldQuaternion(new THREE.Quaternion()).invert())
    for (const f of ['index', 'middle', 'ring', 'pinky', 'thumb'])
      for (const k of ['01', '02', '03']) {
        const bone = byName.get(`${f}_${k}_${s}`)
        if (!bone) continue
        const q = bone.getWorldQuaternion(new THREE.Quaternion()).invert()
        fingers.push({ bone, axis: axisWorld.clone().applyQuaternion(q).normalize(), thumb: f === 'thumb' })
      }
  }

  const restPose = body.skeleton.bones.map((b) => [b, b.quaternion.clone()] as [THREE.Bone, THREE.Quaternion])
  return { mesh: scene, skinned: body, bones, ends, rest, restPose, restRoot: bones.pelvis.position.clone(), fingers, palm: palmLocal, pelvisSpace, height: H }
}
