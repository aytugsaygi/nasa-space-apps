import { afterEach, describe, expect, it, vi } from 'vitest'
import { layersFor } from '../data/anatomy'
import { regionsFor } from '../data/regions'
import type { Vital } from '../data/types'
import { askAssistant, offlineSources, type AssistantContext, type StructureQuestion } from './assistant'

const VITALS: Vital[] = [
  { id: 'nabiz', label: 'Nabız', value: '72', unit: 'bpm', hint: '', status: 'normal' },
  { id: 'uyku', label: 'Uyku', value: '5 sa 40', unit: 'dk', hint: '', status: 'dikkat' },
]
const TR: AssistantContext = { selectedRegion: null, vitals: VITALS, lang: 'tr' }
const EN: AssistantContext = { ...TR, lang: 'en' }

const MUSCLE: StructureQuestion = { name: 'Sol pazı kası (biseps)', layer: 'muscles', region: 'ustKol', symptom: null }

/** Akışlı cevabı bekleme sürelerini atlayarak toplar */
async function chunks(question: string, ctx: AssistantContext) {
  vi.useFakeTimers()
  const parts: string[] = []
  const run = (async () => {
    for await (const p of askAssistant(question, ctx)) parts.push(p)
  })()
  await vi.runAllTimersAsync()
  await run
  return parts
}
const answer = async (question: string, ctx: AssistantContext) => (await chunks(question, ctx)).join('')

afterEach(() => {
  vi.useRealTimers()
})

describe('askAssistant', () => {
  it('cevabı parça parça (akışlı) verir', async () => {
    const parts = await chunks('Merhaba', TR)
    expect(parts.length).toBeGreaterThan(3)
    expect(parts.join('')).toMatch(/^Merhaba, buradayım\./)
  })

  it('kriz cümlesinde her şeyden önce bir insana yönlendirir', async () => {
    expect(await answer('Artık dayanamıyorum', TR)).toContain('uçuş psikoloğuna')
    expect(await answer('I want to die', EN)).toContain('flight psychologist')
    // Hologramdan gelen soru olsa da kriz önce gelir
    expect(await answer('intihar etmeyi düşünüyorum', { ...TR, structure: { ...MUSCLE, symptom: 'pain' } })).toContain('uçuş psikoloğuna')
  })

  it('kanamada ilk yardım adımlarını verir', async () => {
    const tr = await answer('Elim kanıyor, ne yapabilirim?', TR)
    expect(tr).toContain('10 dakika')
    expect(tr).toContain('uçuş hekimine')
    expect(await answer('My hand is bleeding', EN)).toContain('10 minutes')
  })

  it('uyku sorusunda son gecenin uyku değerini kullanır', async () => {
    expect(await answer('Uyuyamıyorum', TR)).toContain('Dün gece 5 sa 40 dk uyumuşsun')
  })

  it('bölge adıyla ya da seçili bölgeyle o bölgenin özetini ve önerisini verir', async () => {
    const regions = regionsFor('tr')
    const byName = await answer(`${regions.bas.name}?`, TR)
    expect(byName).toContain(regions.bas.summary)
    expect(byName).toContain(`Önerim: ${regions.bas.advice}`)

    const bySelection = await answer('Bu bölge için ne önerirsin?', { ...TR, selectedRegion: 'eller' })
    expect(bySelection).toContain(regions.eller.summary)
  })

  it('bilmediği konuda güvenilir cevap veremeyeceğini söyler', async () => {
    expect(await answer('Marsa ne zaman varırız?', TR)).toContain('güvenilir bir cevap veremem')
    expect(await answer('What is the capital of France?', EN)).toContain('cannot give you a reliable answer')
  })
})

describe('hologramdan gelen sorular', () => {
  it('belirti yokken yapının bölgesini ve katman notunu anlatır', async () => {
    const tr = await answer('bilgi', { ...TR, structure: MUSCLE })
    expect(tr).toContain(`${MUSCLE.name}, ${regionsFor('tr').ustKol.name.toLocaleLowerCase('tr-TR')} bölgesinde.`)
    expect(tr).toContain(layersFor('tr').muscles.note)

    const en = await answer('info', { ...EN, structure: { ...MUSCLE, name: 'Left biceps brachii' } })
    expect(en).toContain('Left biceps brachii is in the')
  })

  it('her belirti için ayrı, uçuş hekimine ne zaman başvurulacağını söyleyen bir cevap verir', async () => {
    const seen = new Set<string>()
    for (const symptom of ['pain', 'cramp', 'tight', 'numb', 'weak'] as const) {
      const tr = await answer('soru', { ...TR, structure: { ...MUSCLE, symptom } })
      const en = await answer('question', { ...EN, structure: { ...MUSCLE, symptom } })
      expect(tr).toContain(MUSCLE.name)
      expect(tr).toMatch(/uçuş hekimine/)
      expect(en).toMatch(/flight surgeon/)
      seen.add(tr)
    }
    expect(seen.size).toBe(5)
  })

  it('ağrıda dinlenme ve izleme adımlarını verir', async () => {
    const tr = await answer('soru', { ...TR, structure: { ...MUSCLE, symptom: 'pain' } })
    expect(tr).toContain(`${MUSCLE.name} için ağrı bildirdin.`)
    expect(tr).toContain('48 saatte')
  })
})

describe('birden çok kas seçildiğinde', () => {
  const pick = (muscles: [string, StructureQuestion['region']][], symptom: StructureQuestion['symptom'] = 'pain'): StructureQuestion => ({
    name: muscles.map(([n]) => n).join('; '),
    layer: 'muscles',
    region: muscles[0][1],
    symptom,
    muscles: muscles.map(([name, region]) => ({ name, region })),
  })
  const LEGS: [string, 'bacaklar'][] = [
    ['Sağ iç geniş kas', 'bacaklar'],
    ['Sol düz uyluk kası', 'bacaklar'],
  ]
  const SHOULDER: [string, 'ustKol'] = ['Sağ deltoid kası, orta bölüm', 'ustKol']

  it('aynı bölgedeki kaslar o bölgeye göre tek bir değerlendirmeyle cevaplanır', async () => {
    const tr = await answer('soru', { ...TR, structure: pick(LEGS) })
    const legs = regionsFor('tr').bacaklar
    expect(tr).toMatch(/^Bacaklar bölgesinde 2 kasta ağrı bildirdin\./)
    expect(tr).toContain('Seçtiğin kaslar: Sağ iç geniş kas; Sol düz uyluk kası.')
    expect(tr).toContain('Uzayda bacak kasları yük taşımadığı için en hızlı zayıflayan kaslardır')
    expect(tr).toContain(`Bu bölgenin son kaydı: ${legs.summary}`)
    // Belirti tavsiyesi çoğul, bölgeye özel öneri tavsiyelerin arasında
    expect(tr).toContain('bu kasları zorlayan')
    expect(tr).toContain('• Bugün koşu bandı süresini kısalt')
    expect(tr).toContain('48 saatte')
    expect(tr).not.toContain('ayrı bölgede')
  })

  it('farklı bölgelerdeki kaslar için her bölgeye ayrı rapor verir (baştan ayağa sırayla)', async () => {
    const tr = await answer('soru', { ...TR, structure: pick([...LEGS, SHOULDER]) })
    expect(tr).toMatch(/^2 ayrı bölgede ağrı bildirdin; her bölgeyi ayrı değerlendiriyorum\./)
    const arms = tr.indexOf('1. Üst kollar (1 kas): Sağ deltoid kası, orta bölüm')
    const legs = tr.indexOf('2. Bacaklar (2 kas): Sağ iç geniş kas; Sol düz uyluk kası')
    expect(arms).toBeGreaterThan(0)
    expect(legs).toBeGreaterThan(arms)
    expect(tr).toContain('Bu bölge için: Tutamaklarla hareket ederken')
    expect(tr).toContain('Bu bölge için: Bugün koşu bandı süresini kısalt')
    expect(tr).toContain(`Bu bölgenin son kaydı: ${regionsFor('tr').ustKol.summary}`)
    // Ortak tavsiyeler sonda bir kez, birden çok bölgeye göre
    expect(tr).toContain('Hepsi için:')
    expect(tr).toContain('• Bölgelere 15 dakika ılık kompres uygula')
    expect(tr.match(/48 saatte/g)).toHaveLength(1)
  })

  it('İngilizce cevap verir', async () => {
    const en = await answer('question', {
      ...EN,
      structure: pick(
        [
          ['Vastus medialis muscle (right)', 'bacaklar'],
          ['Deltoid muscle (right)', 'ustKol'],
        ],
        'numb',
      ),
    })
    expect(en).toMatch(/^You reported numbness in 2 different regions; here is a separate report for each\./)
    expect(en).toContain('1. Upper arms (1 muscle): Deltoid muscle (right)')
    expect(en).toContain('2. Legs (1 muscle): Vastus medialis muscle (right)')
    expect(en).toContain('For all of them:')
    expect(en).toContain('• Move these areas gently')
  })

  it('belirti yoksa seçimi bölgelere göre anlatır ve belirti seçmeyi önerir', async () => {
    const tr = await answer('soru', { ...TR, structure: pick(LEGS, null) })
    expect(tr).toMatch(/^Bacaklar bölgesinde 2 kas seçtin\./)
    expect(tr).toContain('Karttan ne hissettiğini seçip bana yeniden sor.')
  })

  it('tek kas seçiliyse eski tek kas cevabı verilir', async () => {
    const tr = await answer('soru', { ...TR, structure: { ...pick([SHOULDER]), name: SHOULDER[0] } })
    expect(tr).toMatch(/^Sağ deltoid kası, orta bölüm için ağrı bildirdin\./)
  })

  it('kriz cümlesi çoklu seçimden de önce gelir', async () => {
    expect(await answer('ölmek istiyorum', { ...TR, structure: pick([...LEGS, SHOULDER]) })).toContain('uçuş psikoloğuna')
  })
})

describe('kemik bildirimi', () => {
  const BONE: StructureQuestion = { name: 'Sol uyluk kemiği', layer: 'bones', region: 'bacaklar', symptom: 'fracture', note: 'Tutamağa çarptım' }

  it('kırık şüphesinde ilk yardım adımları, anlatılan durum ve hekime bildirme söylenir; kaynak MedlinePlus', async () => {
    const ctx = { ...TR, structure: BONE }
    const text = await answer('soru', ctx)
    expect(text).toContain('Sol uyluk kemiği için kırık şüphesi bildirdin.')
    expect(text).toContain('Anlattığın: "Tutamağa çarptım"')
    expect(text).toContain('Kırığı ancak uçuş hekimi doğrulayabilir')
    expect(text).toContain('düzeltmeye ya da oynayıp oynamadığını denemeye çalışma')
    expect(text).toContain('Kırık şüphesini hemen uçuş hekimine bildir')
    expect(offlineSources('soru', ctx).map((s) => s.url)).toContain('https://medlineplus.gov/ency/article/000001.htm')
  })

  it('birden çok kemik ve İngilizce cevap', async () => {
    const many: StructureQuestion = { ...BONE, symptom: 'swelling', note: undefined, bones: [{ name: 'Femur (left)', region: 'bacaklar' }, { name: 'Tibia (left)', region: 'bacaklar' }] }
    const text = await answer('q', { ...EN, structure: many })
    expect(text).toContain('You reported swelling in 2 bones: Femur (left); Tibia (left).')
    expect(text).toContain('Tell the flight surgeon if you cannot move or put weight on the area')
    expect(text).not.toContain('What you described')
  })
})
