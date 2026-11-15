/**
 * anatomy.glb içinden adı verilen katmanı (mesh) çıkarır; diğer katmanların Draco ile sıkıştırılmış verisi bayt bayt korunur
 * (yeniden sıkıştırma yapılmaz, yapı numaraları değişmez).
 *
 * Çalıştırma: node scripts/strip-glb-layer.mjs <girdi.glb> <çıktı.glb> <katman adı>
 * Örnek:      node scripts/strip-glb-layer.mjs public/models/anatomy.glb public/models/anatomy.glb vessels
 */
import { readFileSync, writeFileSync } from 'node:fs'

const [input, output, layer] = process.argv.slice(2)
if (!input || !output || !layer) {
  console.error('Kullanım: node scripts/strip-glb-layer.mjs <girdi.glb> <çıktı.glb> <katman adı>')
  process.exit(1)
}

const glb = readFileSync(input)
const jsonLen = glb.readUInt32LE(12)
const gltf = JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8'))
const binStart = 20 + jsonLen + 8
const bin = glb.subarray(binStart, binStart + glb.readUInt32LE(20 + jsonLen))

const meshIndex = gltf.meshes.findIndex((m) => m.name === layer)
if (meshIndex < 0) {
  console.error(`"${layer}" adlı katman yok. Katmanlar: ${gltf.meshes.map((m) => m.name).join(', ')}`)
  process.exit(1)
}

/* Çıkarılacak erişimciler ve veri blokları */
const dropAccessors = new Set()
const dropViews = new Set()
for (const p of gltf.meshes[meshIndex].primitives) {
  for (const a of Object.values(p.attributes)) dropAccessors.add(a)
  if (p.indices !== undefined) dropAccessors.add(p.indices)
  const draco = p.extensions?.KHR_draco_mesh_compression
  if (draco) dropViews.add(draco.bufferView)
}
for (const a of dropAccessors) if (gltf.accessors[a].bufferView !== undefined) dropViews.add(gltf.accessors[a].bufferView)

/** Eski sıra → yeni sıra */
const remap = (length, drop) => {
  const map = new Map()
  for (let i = 0, n = 0; i < length; i++) if (!drop.has(i)) map.set(i, n++)
  return map
}
const accMap = remap(gltf.accessors.length, dropAccessors)
const viewMap = remap(gltf.bufferViews.length, dropViews)
const meshMap = remap(gltf.meshes.length, new Set([meshIndex]))

/* Veri bloklarını yeni ikili alana kopyala (4 bayt hizalı) */
const chunks = []
let offset = 0
const views = []
gltf.bufferViews.forEach((v, i) => {
  if (dropViews.has(i)) return
  const data = bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength)
  const pad = (4 - (offset % 4)) % 4
  if (pad) chunks.push(Buffer.alloc(pad))
  offset += pad
  views.push({ ...v, byteOffset: offset })
  chunks.push(data)
  offset += data.byteLength
})
const pad = (4 - (offset % 4)) % 4
if (pad) chunks.push(Buffer.alloc(pad))
const newBin = Buffer.concat(chunks)

gltf.bufferViews = views
gltf.buffers = [{ byteLength: newBin.byteLength }]
gltf.accessors = gltf.accessors
  .filter((_, i) => !dropAccessors.has(i))
  .map((a) => (a.bufferView !== undefined ? { ...a, bufferView: viewMap.get(a.bufferView) } : a))
gltf.meshes = gltf.meshes
  .filter((_, i) => i !== meshIndex)
  .map((m) => ({
    ...m,
    primitives: m.primitives.map((p) => {
      const out = { ...p, attributes: Object.fromEntries(Object.entries(p.attributes).map(([k, a]) => [k, accMap.get(a)])) }
      if (p.indices !== undefined) out.indices = accMap.get(p.indices)
      const draco = p.extensions?.KHR_draco_mesh_compression
      if (draco) out.extensions = { ...p.extensions, KHR_draco_mesh_compression: { ...draco, bufferView: viewMap.get(draco.bufferView) } }
      return out
    }),
  }))

/* Katmanı taşıyan düğümleri çıkar */
const dropNodes = new Set(gltf.nodes.map((n, i) => (n.mesh === meshIndex ? i : -1)).filter((i) => i >= 0))
const nodeMap = remap(gltf.nodes.length, dropNodes)
gltf.nodes = gltf.nodes
  .filter((_, i) => !dropNodes.has(i))
  .map((n) => {
    const out = { ...n }
    if (n.mesh !== undefined) out.mesh = meshMap.get(n.mesh)
    if (n.children) out.children = n.children.filter((c) => !dropNodes.has(c)).map((c) => nodeMap.get(c))
    return out
  })
for (const s of gltf.scenes) s.nodes = s.nodes.filter((n) => !dropNodes.has(n)).map((n) => nodeMap.get(n))

/* GLB'yi yeniden yaz */
let json = Buffer.from(JSON.stringify(gltf), 'utf8')
const jsonPad = (4 - (json.byteLength % 4)) % 4
if (jsonPad) json = Buffer.concat([json, Buffer.alloc(jsonPad, 0x20)])
const header = Buffer.alloc(12)
header.writeUInt32LE(0x46546c67, 0)
header.writeUInt32LE(2, 4)
header.writeUInt32LE(12 + 8 + json.byteLength + 8 + newBin.byteLength, 8)
const jsonHead = Buffer.alloc(8)
jsonHead.writeUInt32LE(json.byteLength, 0)
jsonHead.writeUInt32LE(0x4e4f534a, 4)
const binHead = Buffer.alloc(8)
binHead.writeUInt32LE(newBin.byteLength, 0)
binHead.writeUInt32LE(0x004e4942, 4)
writeFileSync(output, Buffer.concat([header, jsonHead, json, binHead, newBin]))
console.log(`"${layer}" çıkarıldı: ${glb.byteLength} → ${12 + 16 + json.byteLength + newBin.byteLength} bayt. Katmanlar: ${gltf.meshes.map((m) => m.name).join(', ')}`)
