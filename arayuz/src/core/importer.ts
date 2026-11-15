import { INDICATORS, isValid, type IndicatorId } from './catalog'
import type { CrewId } from './crew'
import type { Engine } from './engine'
import type { ImportDoc, MeasurementDoc } from './model'
import { newId } from './store'

/*
 * Dış veri içe aktarma katmanı (VM-08, VM-09, VM-10). NASA'nın 13 Kasım'da vereceği CSV ya da JSON dosyaları buradan
 * sisteme girer: sütunlar katalogdaki göstergelere eşlenir, birimler çevrilir, her kayda veri setinin adı yazılır.
 * İçe aktarılan seri, kapsadığı zaman aralığında simülasyonun yerine geçer (engine.series).
 */

export interface ImportRequest {
  astronaut: CrewId
  indicator: IndicatorId
  format: 'csv' | 'json'
  /** Dosyanın içeriği */
  text: string
  /** Zaman ve değer sütunlarının adları */
  timeColumn: string
  valueColumn: string
  value2Column?: string
  /** Kaynak birim (katalog biriminden farklıysa çevrilir) */
  unit?: 'F' | 'C' | 'mmol/L' | 'mg/dL' | 'min' | 'h'
  dataset: string
  /** Verinin kaynağı (kurum ya da sayfa adı); Kaynaklar ekranında görünür (VM-10) */
  provider?: string
  url?: string
  /** Kim yükledi (rol); veri setinin kaydına yazılır */
  by?: 'astronaut' | 'surgeon'
}

export interface ImportResult {
  ok: boolean
  imported: number
  skipped: number
  error?: string
}

/** VM-09: birim çevirileri (belgelenmiş) */
export function convert(indicator: IndicatorId, v: number, unit?: ImportRequest['unit']): number {
  if (indicator === 'temp' && unit === 'F') return ((v - 32) * 5) / 9
  // Glikoz: 1 mmol/L = 18 mg/dL
  if (indicator === 'glucose' && unit === 'mmol/L') return v * 18
  if (indicator === 'sleep' && unit === 'min') return v / 60
  return v
}

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, '').trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const sep = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ','
  const cols = lines[0].split(sep).map((c) => c.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).map((line) => Object.fromEntries(line.split(sep).map((v, i) => [cols[i], v.trim().replace(/^"|"$/g, '')])))
}

export function parseTime(v: unknown): number | null {
  if (typeof v === 'number') return v > 1e12 ? v : v * 1000
  if (typeof v !== 'string' || !v.trim()) return null
  const t = Date.parse(v)
  return Number.isFinite(t) ? t : null
}

/** Bağlantı yalnızca http(s) ise saklanır (Kaynaklar ekranında tıklanır) */
function safeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : undefined
  } catch {
    return undefined
  }
}

/** Dosyayı satırlara ayırır; okunamazsa null (JSON bir nesne listesi olmalı) */
export function parseRows(format: ImportRequest['format'], text: string): Record<string, unknown>[] | null {
  try {
    const rows = format === 'json' ? (JSON.parse(text) as unknown) : parseCsv(text)
    return Array.isArray(rows) ? (rows.filter((r) => r && typeof r === 'object') as Record<string, unknown>[]) : null
  } catch {
    return null
  }
}

export interface RowCheck {
  /** Dosyadaki satır numarası (CSV'de başlık satırı 1'dir) */
  line: number
  t: number | null
  raw: unknown
  v: number
  v2?: number
  ok: boolean
  /** Atlanma nedeni */
  reason?: 'time' | 'value'
}

/** Bir satırı içe aktarma kurallarıyla denetler: önizleme ve içe aktarma aynı kuralı kullanır */
export function checkRow(req: Pick<ImportRequest, 'indicator' | 'timeColumn' | 'valueColumn' | 'value2Column' | 'unit' | 'format'>, row: Record<string, unknown>, index: number): RowCheck {
  const t = parseTime(row[req.timeColumn])
  const raw = row[req.valueColumn]
  const v = convert(req.indicator, Number(raw), req.unit)
  const v2 = req.value2Column ? Number(row[req.value2Column]) : undefined
  const line = req.format === 'csv' ? index + 2 : index + 1
  if (t === null) return { line, t, raw, v, v2, ok: false, reason: 'time' }
  if (!isValid(req.indicator, v, v2)) return { line, t, raw, v, v2, ok: false, reason: 'value' }
  return { line, t, raw, v, v2, ok: true }
}

export function importData(engine: Engine, req: ImportRequest): ImportResult {
  if (!INDICATORS[req.indicator]) return { ok: false, imported: 0, skipped: 0, error: 'indicator' }
  const rows = parseRows(req.format, req.text)
  if (!rows) return { ok: false, imported: 0, skipped: 0, error: 'format' }
  const dataset = req.dataset.trim().slice(0, 80) || 'dataset'
  let imported = 0
  let skipped = 0
  let from = Infinity
  let to = -Infinity
  rows.slice(0, 50_000).forEach((row, i) => {
    const c = checkRow(req, row, i)
    if (!c.ok || c.t === null) {
      skipped++
      return
    }
    engine.store.put<MeasurementDoc>('measurements', { id: newId('i'), astronaut: req.astronaut, ts: c.t, indicator: req.indicator, v: c.v, v2: c.v2, source: `import:${dataset}` })
    imported++
    from = Math.min(from, c.t)
    to = Math.max(to, c.t)
  })
  if (imported) {
    const by = req.by === 'surgeon' || req.by === 'astronaut' ? req.by : undefined
    engine.store.put<ImportDoc>('imports', { id: newId('imp'), astronaut: req.astronaut, ts: engine.now(), dataset, provider: req.provider?.trim().slice(0, 120) || undefined, url: safeUrl(req.url), indicator: req.indicator, count: imported, from, to, by })
  }
  return { ok: imported > 0, imported, skipped, error: imported ? undefined : 'empty' }
}
