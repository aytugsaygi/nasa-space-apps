import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LAYER_ORDER, layersFor, structureInfo } from './anatomy'
import { boneNameTr } from './boneNames'
import { muscleNameTr } from './muscleNames'
import { REGION_ORDER } from './regions'

type NameFile = Record<'muscles' | 'bones', [string, string, number][]>
const names = JSON.parse(readFileSync(resolve(process.cwd(), 'public/models/anatomy-names.json'), 'utf8')) as NameFile

describe('anatomi adları dosyası', () => {
  it('kas ve kemik katmanlarını ve her yapının bölgesini içerir (kalp ve damar katmanı çıkarıldı)', () => {
    expect(Object.keys(names).sort()).toEqual(['bones', 'muscles'])
    for (const layer of ['muscles', 'bones'] as const) {
      expect(names[layer].length).toBeGreaterThan(100)
      for (const [name, , region] of names[layer]) {
        expect(name).toBeTruthy()
        expect(REGION_ORDER[region]).toBeDefined()
      }
    }
  })

  it('kas katmanında karın duvarı ve kalça kasları bulunur', () => {
    const muscles = names.muscles.map(([n]) => n)
    for (const m of ['External abdominal oblique', 'Internal abdominal oblique', 'Transversus abdominis', 'Rectus abdominis', 'Psoas major', 'Iliacus']) {
      expect(muscles.some((n) => n.startsWith(m)), m).toBe(true)
    }
  })
})

describe('muscleNameTr', () => {
  it('her kasın Türkçe adı vardır', () => {
    const missing = names.muscles.map(([n]) => n).filter((n) => !n.includes('?') && !muscleNameTr(n))
    expect(missing).toEqual([])
  })

  it('tarafı başa alır, özel adların büyük harfini korur', () => {
    expect(muscleNameTr('External abdominal oblique muscle (sol)')).toBe('Sol dış eğik karın kası')
    expect(muscleNameTr('Biceps brachii muscle (sağ)')).toMatch(/^Sağ pazı kası \(biseps\)/)
    expect(muscleNameTr('Calcaneal tendon (sol)')).toBe('Sol Aşil tendonu')
  })

  it('bilinmeyen adda null döner', () => {
    expect(muscleNameTr('Not a real structure')).toBeNull()
  })
})

describe('boneNameTr', () => {
  it('her kemiğin Türkçe adı vardır', () => {
    const missing = names.bones.map(([n]) => n).filter((n) => !n.includes('?') && !boneNameTr(n))
    expect(missing).toEqual([])
  })

  it('tarafı başa alır; sıralı adları kalıpla çevirir', () => {
    expect(boneNameTr('Femur (sol)')).toBe('Sol uyluk kemiği')
    expect(boneNameTr('Fifth rib (sağ)')).toBe('Sağ 5. kaburga')
    expect(boneNameTr('Vertebra L3')).toBe('Bel omuru (L3)')
    expect(boneNameTr('Distal phalanx of first finger of hand (sol)')).toBe('Sol el 1. parmak uç kemiği')
    expect(boneNameTr('Upper first molar tooth (sağ)')).toBe('Sağ üst 1. büyük azı dişi')
    expect(boneNameTr('Not a bone')).toBeNull()
  })
})

describe('structureInfo', () => {
  const firstMuscle = names.muscles[0]

  it('Türkçede kasın Türkçe adını, İngilizcede İngilizce adını ve İngilizce tarafı verir', () => {
    const ref = { layer: 'muscles' as const, id: 1 }
    const tr = structureInfo(names, ref, 'tr')!
    const en = structureInfo(names, ref, 'en')!
    expect(tr.name).toBe(muscleNameTr(firstMuscle[0]))
    expect(en.name).not.toMatch(/\((sol|sağ)\)/)
    expect(en.name).toMatch(/\((left|right)\)$/)
    expect(tr.latin).toBe(firstMuscle[1])
    expect(tr.region).toBe(REGION_ORDER[firstMuscle[2]])
  })

  it('olmayan yapı ya da yüklenmemiş dosyada null döner', () => {
    expect(structureInfo(null, { layer: 'muscles', id: 1 }, 'tr')).toBeNull()
    expect(structureInfo(names, null, 'tr')).toBeNull()
    expect(structureInfo(names, { layer: 'bones', id: 999999 }, 'tr')).toBeNull()
  })

  it('kemiklerin de Türkçe adı gelir', () => {
    const i = names.bones.findIndex(([n]) => n === 'Femur (sol)')
    expect(structureInfo(names, { layer: 'bones', id: i + 1 }, 'tr')!.name).toBe('Sol uyluk kemiği')
    expect(structureInfo(names, { layer: 'bones', id: i + 1 }, 'en')!.name).toBe('Femur (left)')
  })
})

describe('katmanlar', () => {
  it('iki katman soldan sağa kas ve kemik sırasındadır ve iki dilde adı vardır', () => {
    expect(LAYER_ORDER).toEqual(['muscles', 'bones'])
    for (const l of LAYER_ORDER) {
      expect(layersFor('tr')[l].name).not.toBe(layersFor('en')[l].name)
      expect(layersFor('tr')[l].note).toBeTruthy()
    }
  })
})
