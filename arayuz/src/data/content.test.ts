import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SOURCE_LIST } from '../core/sources'
import { PAGE_COUNT } from '../lib/layout'
import { tourFor } from './content'
import { REGION_ORDER, regionsFor } from './regions'

/** Arayüz kaynaklarının tamamı (alt klasörler dahil, testler hariç): tur hedeflerinin hâlâ var olduğunu denetlemek için */
const SRC = resolve(process.cwd(), 'src')
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return f === 'test' ? [] : walk(p)
    return /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : []
  })
const source = walk(SRC)
  .map((p) => readFileSync(p, 'utf8'))
  .join('\n')

/** Sayfada id'si olmayan, tur sırasında üretilen ya da başka öğeye eşlenen hedefler (App.tsx → startTour) */
const VIRTUAL = ['#tour-vitals', '#tour-pin', '#tour-remove']

describe('rehber tur', () => {
  it('iki dilde aynı adımlardan oluşur ve dört sayfayı da gezer', () => {
    const tr = tourFor('tr')
    const en = tourFor('en')
    expect(tr.length).toBeGreaterThanOrEqual(20)
    expect(en.map((s) => s.element)).toEqual(tr.map((s) => s.element))
    expect(en.map((s) => s.page)).toEqual(tr.map((s) => s.page))
    for (const [i, s] of tr.entries()) {
      expect(s.title).not.toBe(en[i].title)
      expect(s.description.length).toBeGreaterThan(20)
    }
    const pages = new Set(tr.map((s) => s.page ?? 0))
    expect([...pages].sort()).toEqual(Array.from({ length: PAGE_COUNT }, (_, i) => i))
    // Sayfalar sırayla gezilir; geri dönüş yok
    const order = tr.map((s) => s.page ?? 0)
    expect(order).toEqual([...order].sort((x, y) => x - y))
  })

  it('her adımın hedefi arayüzde vardır (id yeniden adlandırılırsa tur bozulur)', () => {
    for (const { element } of tourFor('tr')) {
      if (VIRTUAL.includes(element)) {
        expect(source).toContain(`'${element}'`)
        continue
      }
      // id="tour-panel" ya da koşullu id={... ? 'page-next' : ...}
      const id = element.slice(1)
      expect(source.includes(`id="${id}"`) || source.includes(`'${id}'`), element).toBe(true)
    }
  })
})

describe('kaynaklar', () => {
  it('doğrulanmış her kaynağın başlığı, kurumu, iki dilde kullanım yeri ve https bağlantısı vardır', () => {
    expect(SOURCE_LIST.length).toBeGreaterThan(10)
    for (const src of SOURCE_LIST) {
      expect(src.url, src.id).toMatch(/^https:\/\//)
      expect(src.title && src.org && src.use.tr && src.use.en, src.id).toBeTruthy()
    }
    expect(new Set(SOURCE_LIST.map((s) => s.url)).size).toBe(SOURCE_LIST.length)
  })
})

describe('bölgeler', () => {
  it('sekiz bölgenin iki dilde verisi, 7 günlük eğilimi ve kaynağı vardır', () => {
    for (const lang of ['tr', 'en'] as const) {
      const regions = regionsFor(lang)
      expect(Object.keys(regions).sort()).toEqual([...REGION_ORDER].sort())
      for (const id of REGION_ORDER) {
        const r = regions[id]
        expect(r.id).toBe(id)
        expect(r.trend.values).toHaveLength(7)
        expect(r.trend.range[0]).toBeLessThan(r.trend.range[1])
        expect(r.metrics.length).toBeGreaterThan(0)
        expect(r.source.url).toMatch(/^https:\/\//)
      }
    }
    expect(regionsFor('tr').gogus.name).not.toBe(regionsFor('en').gogus.name)
  })
})
