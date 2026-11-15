import { useEffect, useMemo, useState } from 'react'
import { resolve, tx, useI18n, type Lang } from '../i18n'
import { boneNameTr } from './boneNames'
import { muscleNameTr } from './muscleNames'
import { REGION_ORDER } from './regions'
import type { RegionId } from './types'

/**
 * Katmanlara ayrılmış görünümdeki katmanlar (soldan sağa).
 * Hologram görünümü bunlardan ayrıdır: bölgelere ayrılmış dış yüzeyi kullanır.
 */
export type LayerId = 'muscles' | 'bones'
/** Tıklanabilir yapıları olan katman (kas ya da kemik) */
export type StructureLayer = LayerId

export interface StructureRef {
  layer: StructureLayer
  /** 1'den başlayan yapı numarası (anatomy-names.json içindeki sıra + 1) */
  id: number
}

export interface StructureInfo {
  name: string
  latin: string
  region: RegionId
}

const HRP = { label: 'NASA Human Research Roadmap', url: 'https://humanresearchroadmap.nasa.gov/' }

/** Katmanların adları ve uzay uçuşuyla ilgili kısa notlar */
const LAYERS_RAW = {
  muscles: {
    name: tx('Kas sistemi', 'Muscular system'),
    short: tx('Kaslar', 'Muscles'),
    note: tx(
      'Mikro yerçekiminde kaslar yük taşımadığı için zayıflar; en çok bacak ve sırt kasları etkilenir. Günlük direnç ve koşu egzersizi bu kaybı yavaşlatır.',
      'In microgravity, muscles carry no load and weaken; leg and back muscles are affected most. Daily resistance and treadmill exercise slow this loss.',
    ),
    source: HRP,
  },
  bones: {
    name: tx('İskelet sistemi', 'Skeletal system'),
    short: tx('Kemikler', 'Bones'),
    note: tx(
      'Yük taşıyan kemikler (kalça, omurga, bacaklar) uzayda ayda yaklaşık %1–1,5 mineral kaybedebilir. Egzersiz ve beslenme bu kaybı azaltır.',
      'Weight-bearing bones (hips, spine, legs) can lose about 1–1.5% of their mineral per month in space. Exercise and nutrition reduce this loss.',
    ),
    source: HRP,
  },
}

export type LayerMeta = { name: string; short: string; note: string; source: { label: string; url: string } }

export function layersFor(lang: Lang): Record<LayerId, LayerMeta> {
  return resolve(LAYERS_RAW, lang) as Record<LayerId, LayerMeta>
}

export function useLayers() {
  const { lang } = useI18n()
  return useMemo(() => layersFor(lang), [lang])
}

export const LAYER_ORDER: LayerId[] = ['muscles', 'bones']

/* ---------- Gerçekçi görünüm renkleri ---------- */

/** Yapı numarasına göre küçük ton farkı: komşu kaslar ve kemikler birbirinden ayırt edilir */
function vary(hex: string, id: number, amount: number) {
  const h = Math.sin(id * 12.9898) * 43758.5453
  const k = 1 + ((h - Math.floor(h)) * 2 - 1) * amount
  const n = parseInt(hex.slice(1), 16)
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)))
  return '#' + ((c((n >> 16) & 255) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, '0')
}

/**
 * Gerçekçi görünümde bir yapının rengi (adına göre). Atlaslardaki renk alışkanlığı izlenir:
 * kas kırmızı, tendon açık, kemik fildişi, kıkırdak mavimsi beyaz, sinir sarı, organlar kendi renginde.
 */
export function structureColor(layer: StructureLayer, name: string, id: number): string {
  const n = name.toLowerCase()
  switch (layer) {
    case 'muscles':
      if (/tendon|aponeuros|\bfascia\b|retinacul|tract|ligament|sheath|septum|raphe|galea|linea/.test(n)) return vary('#e4d8c4', id, 0.04)
      // Komşu kaslar birbirinden ayırt edilsin diye her kasın tonu biraz farklıdır
      return vary('#a3302a', id, 0.18)
    case 'bones':
      if (/cartilage|disc|meniscus|labrum/.test(n)) return '#cfe0e3'
      if (/incisor|canine|premolar|molar|tooth|teeth/.test(n)) return '#f6f2e8'
      return vary('#e4d6b5', id, 0.05)
  }
}

/* ---------- Yapı adları ---------- */

type NameFile = Record<StructureLayer, [string, string, number][]>
let cache: NameFile | null = null

/** Yapı adlarını (Z-Anatomy, İngilizce + Latince) bir kez yükler */
export function useAnatomyNames() {
  const [names, setNames] = useState<NameFile | null>(cache)
  useEffect(() => {
    if (cache) return
    fetch('/models/anatomy-names.json')
      .then((r) => r.json())
      .then((data: NameFile) => {
        cache = data
        setNames(data)
      })
      .catch(() => {})
  }, [])
  return names
}

/** Dosyadaki taraf etiketleri Türkçedir; İngilizce arayüzde çevrilir */
function localizeSide(name: string, lang: Lang) {
  return lang === 'tr' ? name : name.replace('(sol)', '(left)').replace('(sağ)', '(right)')
}

export function structureInfo(names: NameFile | null, ref: StructureRef | null, lang: Lang): StructureInfo | null {
  if (!names || !ref) return null
  const row = names[ref.layer]?.[ref.id - 1]
  if (!row) return null
  // Kaynak dosyada adı bozuk kaydedilmiş birkaç yapı var. Kas ve kemiklerin Türkçe adı sözlükten gelir.
  const tr = lang === 'tr' ? (ref.layer === 'muscles' ? muscleNameTr(row[0]) : boneNameTr(row[0])) : null
  const name = row[0].includes('?') ? (lang === 'tr' ? 'Adsız yapı' : 'Unnamed structure') : (tr ?? localizeSide(row[0], lang))
  return { name, latin: row[1], region: REGION_ORDER[row[2]] ?? 'gogus' }
}
