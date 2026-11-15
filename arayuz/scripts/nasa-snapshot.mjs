/*
 * NASA verilerinin uygulamaya gömülü anlık görüntüsünü üretir: public/data/nasa/*.json
 * Uygulama sunucusu canlı veriyi çeker; internet yoksa ya da sunucu kapalıysa bu dosyalar kullanılır.
 *
 *   node scripts/nasa-snapshot.mjs
 *
 * Kaynaklar (src/core/sources.ts):
 * - DONKI (NASA CCMC): güneş parçacık olayları (SEP), güneş patlamaları (FLR), jeomanyetik fırtınalar (GST)
 * - EPIC (NASA DSCOVR): Dünya'nın son tam disk fotoğrafları
 * - OSDR OSD-569 / OSD-575: Inspiration4 mürettebatının kan tahlilleri (CBC, CMP) ve referans aralıkları
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'nasa')
const DONKI = 'https://ccmc.gsfc.nasa.gov/DONKI/WS/get'
const day = 86_400_000
const iso = (t) => new Date(t).toISOString().slice(0, 10)

async function json(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(40_000) })
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  const text = await r.text()
  return text ? JSON.parse(text) : []
}

/** DONKI tek istekte en fazla 60 gün verir; uzun aralık parçalara bölünür */
async function donkiRange(type, from, to) {
  const out = []
  for (let a = from; a < to; a += 59 * day) {
    const b = Math.min(to, a + 59 * day)
    out.push(...(await json(`${DONKI}/${type}?startDate=${iso(a)}&endDate=${iso(b)}`)))
  }
  // Parçalar sınır gününde çakışır ve DONKI aynı olayı iki kez döndürebilir: olay kimliğine göre tekilleştirilir
  const key = (e) => e.sepID ?? e.flrID ?? e.gstID ?? JSON.stringify(e)
  return [...new Map(out.map((e) => [key(e), e])).values()]
}

async function donki() {
  const now = Date.now()
  const sep = await donkiRange('SEP', now - 365 * day, now)
  const flr = await donkiRange('FLR', now - 60 * day, now)
  const gst = await donkiRange('GST', now - 60 * day, now)
  return {
    retrieved: new Date(now).toISOString(),
    source: 'NASA CCMC DONKI',
    url: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/',
    sep: sep.map((e) => ({ id: e.sepID, time: e.eventTime, instruments: (e.instruments ?? []).map((i) => i.displayName), link: e.link })),
    flr: flr.map((e) => ({ id: e.flrID, time: e.peakTime ?? e.beginTime, classType: e.classType, region: e.activeRegionNum, link: e.link })),
    gst: gst.map((e) => ({ id: e.gstID, time: e.startTime, kp: Math.max(...(e.allKpIndex ?? []).map((k) => k.kpIndex), 0), link: e.link })),
  }
}

async function epic() {
  const list = await json('https://epic.gsfc.nasa.gov/api/natural')
  return {
    retrieved: new Date().toISOString(),
    source: 'NASA EPIC (DSCOVR)',
    url: 'https://epic.gsfc.nasa.gov/about/api',
    images: list.map((e) => {
      const [d] = e.date.split(' ')
      const [y, m, dd] = d.split('-')
      return {
        image: e.image,
        date: e.date,
        caption: e.caption,
        lat: e.centroid_coordinates.lat,
        lon: e.centroid_coordinates.lon,
        url: `https://epic.gsfc.nasa.gov/archive/natural/${y}/${m}/${dd}/jpg/${e.image}.jpg`,
        thumb: `https://epic.gsfc.nasa.gov/archive/natural/${y}/${m}/${dd}/thumbs/${e.image}.jpg`,
      }
    }),
  }
}

function parseCsv(text) {
  const [head, ...rows] = text.trim().split(/\r?\n/)
  const cols = head.split(',')
  return rows.map((r) => Object.fromEntries(r.split(',').map((v, i) => [cols[i], v])))
}

async function osdr() {
  const file = async (study, name) => {
    const r = await fetch(`https://osdr.nasa.gov/geode-py/ws/studies/${study}/download?source=datamanager&file=${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(60_000) })
    if (!r.ok) throw new Error(`${r.status} ${study}`)
    return parseCsv(await r.text())
  }
  const cbc = await file('OSD-569', 'LSDS-7_Complete_Blood_Count_CBC.upload_SUBMITTED.csv')
  const cmp = await file('OSD-575', 'LSDS-8_Comprehensive_Metabolic_Panel_CMP.upload_SUBMITTED.csv')
  const rows = [
    ...cbc.map((r) => ({ ...r, panel: 'CBC', timepoint: r.TEST_DATE })),
    ...cmp.map((r) => ({ ...r, panel: 'CMP', timepoint: r.timepoint })),
  ].filter((r) => r.VALUE && r.VALUE !== 'NA' && Number.isFinite(Number(r.VALUE)))
  const analytes = {}
  for (const r of rows) {
    const key = r.ANALYTE
    analytes[key] ??= { name: key, panel: r.panel, unit: r.UNITS, ranges: {}, values: {} }
    const a = analytes[key]
    const lo = Number(r.RANGE_MIN)
    const hi = Number(r.RANGE_MAX)
    a.ranges[r.SEX] = [Number.isFinite(lo) ? lo : null, Number.isFinite(hi) ? hi : null]
    a.values[r.SUBJECT_ID] ??= {}
    a.values[r.SUBJECT_ID][r.timepoint.trim()] = Number(r.VALUE)
  }
  return {
    retrieved: new Date().toISOString(),
    mission: 'SpaceX Inspiration4 (16-18 Sep 2021)',
    studies: [
      { id: 'OSD-569', title: 'Whole Blood Measurements from the SpaceX Inspiration4 Mission (CBC)', url: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-569' },
      { id: 'OSD-575', title: 'SpaceX Inspiration4 Blood Serum Metabolic Panel (CMP)', url: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-575' },
    ],
    timepoints: ['L-92', 'L-44', 'L-3', 'R+1', 'R+45', 'R+82', 'R+194'],
    subjects: ['C001', 'C002', 'C003', 'C004'],
    analytes: Object.values(analytes),
  }
}

/**
 * EPIC fotoğrafları da indirilir ki internet yokken de görünsün (G-11). Küçük resim ~6 KB, tam boy ~230 KB.
 * Her fotoğrafa yerel yolları (local, localThumb) eklenir; arayüz canlı veri yokken bunları kullanır.
 */
async function saveEpicImages(data) {
  const dir = join(OUT, 'epic')
  await mkdir(join(dir, 'thumbs'), { recursive: true })
  for (const im of data.images) {
    for (const [remote, rel] of [[im.thumb, `epic/thumbs/${im.image}.jpg`], [im.url, `epic/${im.image}.jpg`]]) {
      const r = await fetch(remote, { signal: AbortSignal.timeout(40_000) })
      if (!r.ok) throw new Error(`${r.status} ${remote}`)
      await writeFile(join(OUT, rel), Buffer.from(await r.arrayBuffer()))
    }
    im.localThumb = `/data/nasa/epic/thumbs/${im.image}.jpg`
    im.local = `/data/nasa/epic/${im.image}.jpg`
  }
}

await mkdir(OUT, { recursive: true })
for (const [name, fn] of [
  ['donki', donki],
  ['epic', epic],
  ['osdr-blood', osdr],
]) {
  try {
    const data = await fn()
    if (name === 'epic') await saveEpicImages(data)
    await writeFile(join(OUT, `${name}.json`), JSON.stringify(data))
    console.log(`yazıldı: ${name}.json`)
  } catch (e) {
    console.error(`atlandı: ${name} (${e.message})`)
  }
}
