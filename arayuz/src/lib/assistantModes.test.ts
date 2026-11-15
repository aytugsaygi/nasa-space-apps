import { describe, expect, it } from 'vitest'
import type { ComplaintDoc } from '../core/model'
import { buildPrompt, parseComplaint, planAnswer, type RichContext } from './assistantModes'

const ctx = (over: Partial<RichContext> = {}): RichContext => ({ selectedRegion: null, vitals: [], lang: 'tr', ...over })

const yesterday: ComplaintDoc = {
  id: 'c1',
  astronaut: 'yildiz',
  ts: Date.now() - 86_400_000,
  region: 'eller',
  side: 'right',
  muscles: [],
  symptom: 'pain',
  severity: 6,
  note: '',
  status: 'active',
  updates: [],
  origin: 'assistant',
}

describe('metinden şikayet çıkarma', () => {
  it('bölge, taraf, belirti ve şiddeti Türkçe cümleden çıkarır', () => {
    expect(parseComplaint('Sağ elim ağrıyor, 6/10', 'tr')).toMatchObject({ region: 'eller', side: 'right', symptom: 'pain', severity: 6 })
    expect(parseComplaint('Sol bacağımda kramp var', 'tr')).toMatchObject({ region: 'bacaklar', side: 'left', symptom: 'cramp', severity: 5 })
    expect(parseComplaint('Belim çok ağrıyor', 'tr')).toMatchObject({ region: 'sirt', side: 'both', severity: 7 })
  })

  it('ek alıp yumuşayan bölge adlarını da tanır (bacağım, ayağım, omzum, boynum, göğsüm)', () => {
    expect(parseComplaint('Ayağım sızlıyor', 'tr')?.region).toBe('ayaklar')
    expect(parseComplaint('Omzum tutuldu', 'tr')?.region).toBe('ustKol')
    expect(parseComplaint('Boynum ağrıyor', 'tr')?.region).toBe('bas')
    expect(parseComplaint('Göğsümde ağrı var', 'tr')?.region).toBe('gogus')
  })

  it('İngilizce cümleden de çıkarır', () => {
    expect(parseComplaint('My left knee hurts a bit', 'en')).toMatchObject({ region: 'bacaklar', side: 'left', symptom: 'pain', severity: 3 })
    expect(parseComplaint('Tingling in my right hand, 4 out of 10', 'en')).toMatchObject({ region: 'eller', side: 'right', symptom: 'numb', severity: 4 })
  })

  it('belirti ya da bölge yoksa şikayet sayılmaz', () => {
    expect(parseComplaint('Bugün çok iyiyim', 'tr')).toBeNull()
    expect(parseComplaint('Ağrım var', 'tr')).toBeNull()
  })

  it('şiddet 0-10 arasına sıkıştırılır', () => {
    expect(parseComplaint('Sırtım ağrıyor 15/10', 'tr')!.severity).toBe(10)
  })
})

describe('tek asistanın rol seçimi', () => {
  it('şikayet cümlesinde kaydetme eylemi önerir (kayıt izni varsa)', () => {
    const r = planAnswer('Sağ elim ağrıyor, 6/10', ctx(), true)
    expect(r.actions.find((a) => a.kind === 'saveComplaint')?.complaint).toMatchObject({ region: 'eller', side: 'right', severity: 6 })
    const readOnly = planAnswer('Sağ elim ağrıyor, 6/10', ctx(), false)
    expect(readOnly.actions.some((a) => a.kind === 'saveComplaint')).toBe(false)
  })

  it('kanama ya da kesikte şikayet kaydı yerine ilk yardım cevabı verilir', () => {
    const r = planAnswer('Elim kesildi kanıyor', ctx(), true)
    expect(r.actions.some((a) => a.kind === 'saveComplaint')).toBe(false)
  })

  it('kriz cümlesinde her zaman önce destek cevabı gelir', () => {
    const r = planAnswer('Artık dayanamıyorum', ctx(), true)
    expect(r.mode).toBe('psych')
    expect(r.actions).toEqual([])
  })

  it('konuya göre rol: spor koçu, dinleyen, arkadaş', () => {
    expect(planAnswer('Bugünkü antrenman programım ne?', ctx(), true).mode).toBe('coach')
    expect(planAnswer('Kendimi çok yalnız hissediyorum', ctx(), true).mode).toBe('psych')
    expect(planAnswer('Selam, nasılsın?', ctx(), true).mode).toBe('friend')
    expect(planAnswer('I feel stressed', ctx({ lang: 'en' }), true).mode).toBe('psych')
  })

  it('kullanıcının seçtiği rol konunun önüne geçer', () => {
    expect(planAnswer('Selam', ctx({ forcedMode: 'coach' }), true).mode).toBe('coach')
  })

  it('belirsiz soruda açık sayfa rolü belirler', () => {
    expect(planAnswer('Ne yapmalıyım?', ctx({ page: 2 }), true).mode).toBe('coach')
    expect(planAnswer('Ne yapmalıyım?', ctx({ page: 1 }), true).mode).toBe('psych')
  })

  it('koç dünkü şikayeti sorar ve üç cevap düğmesi sunar', () => {
    const r = planAnswer('Bugünkü programım', ctx({ checkin: yesterday }), true)
    expect(r.mode).toBe('coach')
    expect(r.actions.map((a) => a.answer)).toEqual(['same', 'better', 'gone'])
    expect(r.actions.every((a) => a.complaintId === 'c1')).toBe(true)
  })
})

describe('dil modeli istemi', () => {
  it('rolü, dili, sınırları ve açık şikayetleri içerir', () => {
    const p = buildPrompt(ctx({ lang: 'en', complaints: [yesterday] }), 'coach')
    expect(p).toMatch(/sport coach/)
    expect(p).toMatch(/Answer in English/)
    expect(p).toMatch(/Never diagnose/)
    expect(p).toMatch(/pain .*6\/10/)
  })
})

describe('cevapların kaynakları (P-04)', () => {
  const urls = (q: string, c = ctx()) => (planAnswer(q, c, true).sources ?? []).map((s) => s.url)

  it('ilk yardım cevabı doğrulanmış MedlinePlus sayfalarına dayanır', () => {
    expect(urls('Elim kanıyor, ne yapabilirim?')).toEqual(['https://medlineplus.gov/ency/article/000045.htm', 'https://medlineplus.gov/ency/article/000043.htm'])
  })

  it('kriz ve moral cevabı NASA davranışsal sağlık özetine, uyku cevabı uyku çalışmasına dayanır', () => {
    expect(urls('Artık dayanamıyorum')[0]).toMatch(/ochmo-tb-016/)
    expect(urls('Kendimi yalnız hissediyorum')[0]).toMatch(/ochmo-tb-016/)
    expect(urls('Uyuyamıyorum')).toContain('https://www.sciencedaily.com/releases/2014/08/140807215803.htm')
  })

  it('koç cevabı bulunulan ortamın egzersiz kaynaklarını gösterir', () => {
    expect(urls('Bugünkü antrenman programım ne?')).toEqual(['https://www.nasa.gov/missions/station/iss-research/astronaut-exercise'])
  })

  it('gündelik sohbette kaynak gösterilmez', () => {
    expect(urls('Selam, nasılsın?')).toEqual([])
  })

  it('her kaynağın kısa adı ve https bağlantısı var', () => {
    for (const s of planAnswer('Başım ağrıyor', ctx(), true).sources ?? []) {
      expect(s.label.length).toBeGreaterThan(3)
      expect(s.url).toMatch(/^https:\/\//)
    }
  })
})
