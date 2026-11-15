import { INDICATORS, type IndicatorId } from '../core/catalog'
import type { CheckinWindowView } from '../core/checkins'
import { EXERCISES, type ExerciseId, type ProgramDoc } from '../core/coach'
import { MISSION, type CrewId } from '../core/crew'
import type { SeriesResult } from '../core/engine'
import { ANALYTES, type LabDraw } from '../core/labs'
import type { AssistantMode, ComplaintDoc, Snapshot } from '../core/model'
import { SOURCES, sourceShort, type SourceId } from '../core/sources'
import { num } from '../core/tx'
import { bodyPart } from '../core/coach'
import type { Lang } from '../i18n'
import type { Dict } from '../i18n/tr'
import { delayText, missionTime } from '../mind/checkinFormat'
import type { AnswerSource } from './assistant'
import { fold, parseDate, type DateQuery } from './assistantDates'
import type { AppCommand } from './appCommands'
import type { AssistantAction, AssistantReply } from './assistantModes'

/*
 * Sağlık Asistanı'nın yönlendiricisi: tamamen çevrimdışı ve kural tabanlı (dil modeli yok, uydurma yok).
 *
 * 1. Site içi yönlendirme: "şikayet oluşturmak istiyorum", "PDF rapor nasıl alınır", "Cupola'yı aç"… Cevap adım adım
 *    anlatır; altındaki düğme o şeyi doğrudan açar (lib/appCommands). Adımlardaki düğme adları sözlükten gelir, ekrandakiyle aynıdır.
 * 2. Veri soruları: "12 Kasım'daki kan tahlilim", "dünkü nabzım", "bu haftaki uykum", "şikayetlerim", "check-in yaptım mı",
 *    "bugünkü programım", "radyasyon dozum"… Cevap uygulamanın kendi verisinden hesaplanır.
 * 3. Eşleşme yoksa null döner; sohbet, koçluk, kriz ve ilk yardım için mevcut kurallar (assistantModes) çalışır. Onlar da
 *    cevap bulamazsa fallbackReply önerilerle yardımcı olur.
 *
 * Eşleştirme Türkçe eklere dayanıklıdır: metin sadeleştirilir (fold) ve kelime kökleri aranır ("tahlilimi" → "tahlil").
 */

export interface RouterData {
  labs: () => Promise<LabDraw[] | null>
  series: (id: IndicatorId, from: number, to: number) => Promise<SeriesResult | null>
  checkinDay: () => Promise<CheckinWindowView[] | null>
}

export interface RouterContext {
  lang: Lang
  t: Dict
  locale: string
  snapshot: Snapshot | null | undefined
  astronaut: CrewId | null
  /** Astronot görünümü (hekim görünümünde kayıt yapılamaz) */
  canEdit: boolean
  sex: 'f' | 'm'
  complaints: ComplaintDoc[]
  program: ProgramDoc | null | undefined
  data: RouterData
}

type Ctx = RouterContext & { q: string; raw: string; en: boolean; L: (tr: string, en: string) => string }

const lines = (...l: (string | false | null | undefined)[]) => l.filter((x) => x !== false && x !== null && x !== undefined).join('\n')
const steps = (list: string[]) => list.map((s, i) => `${i + 1}. ${s}`).join('\n')
const bullets = (list: string[]) => list.map((s) => `• ${s}`).join('\n')
const run = (label: string, command: AppCommand): AssistantAction => ({ kind: 'run', label, command })
const ask = (label: string, question = label): AssistantAction => ({ kind: 'ask', label, question })
const src = (...ids: SourceId[]): AnswerSource[] => [...new Set(ids)].map((id) => ({ label: sourceShort(id), url: SOURCES[id].url }))
const reply = (text: string, actions: AssistantAction[] = [], mode: AssistantMode = 'general', sources: AnswerSource[] = []): AssistantReply => ({ text, actions, mode, sources })

/* ---------- Ortak kelime grupları ---------- */

const HOW = /\b(nasil|nerede|nereden|nereye|neresi|ne yapmaliyim|yardim et|ogret|anlat|how|where|show me|help me|teach|explain)\b/
const WANT = /(istiyorum|isterim|istiyom|lazim|gerek|yapacagim|yapcam|yapabilir miyim|olur mu|i want|i d like|i would like|i need|can i|let me|could i)/
const OPEN = /\b(ac|acar misin|acsana|baslat|goster|gotur|git|gec|open|start|show|take me|go to|launch)\b/
const CREATE = /(olustur|ekle|bildir|kaydet|gir|yaz|yap|create|add|report|log|file|record|enter|make|write)/
const ADVICE = /(ne yapmali|ne yapayim|ne yapmam|tavsiye|oneri|onerin|what should|advice|recommend)/

/* ---------- Gösterge adları ---------- */

const INDICATOR_WORDS: [IndicatorId, RegExp][] = [
  ['bp', /(tansiyon|kan basinc|blood pressure|\bbp\b)/],
  ['hr', /(nabiz|nabz|kalp hiz|heart rate|pulse|\bhr\b)/],
  ['spo2', /(oksijen|spo2|satur|oxygen)/],
  ['temp', /(vucut isi|ates|sicaklik|temperature|fever|body temp)/],
  ['resp', /(solunum|nefes sayi|breathing rate|respiration)/],
  ['glucose', /(kan seker|seker|blood sugar|glucose)/],
  ['sleep', /(uyku|uyudu|uyuya|sleep|slept)/],
  ['mood', /(ruh hal|mood)/],
  ['reaction', /(tepki sure|reaction time)/],
  ['exercise', /(egzersiz sure|ne kadar egzersiz|exercise time|how much exercise|kac dakika egzersiz|egzersiz yaptim)/],
  ['radiation', /(radyasyon|\bdoz|radiation|\bdose)/],
  ['co2', /(co2|karbondioksit|carbon dioxide)/],
]

function indicatorIn(q: string, raw = ''): IndicatorId | null {
  const hit = INDICATOR_WORDS.find(([, re]) => re.test(q))?.[0]
  if (hit) return hit
  // Su: "şu an" sadeleşince "su an" olur; bu yüzden ş harfi korunmuş ham metinde aranır
  const r = raw.toLocaleLowerCase('tr-TR')
  return /(^|\s)(su|suyu|suyum)(\s|$|\?)|su iç|\bwater\b/.test(r) ? 'water' : null
}

/* ---------- Kan tahlili ---------- */

const LAB_WORDS = /(kan tahlil|tahlil|kan kontrol|kan analiz|kan sonuc|kan deger|kan test|kan ornegi|kan orneg|laboratuvar|\blab\b|labs|blood test|blood work|bloodwork|blood result|blood sample|hemogram|tam kan)/
const ANALYTE_WORDS: [string, RegExp][] = [
  ['HEMOGLOBIN', /(hemoglobin|\bhgb\b)/],
  ['HEMATOCRIT', /(hematokrit|hematocrit|\bhct\b)/],
  ['WHITE BLOOD CELL COUNT', /(lokosit|beyaz kan|white blood|\bwbc\b|akyuvar)/],
  ['PLATELET COUNT', /(trombosit|platelet|\bplt\b)/],
  ['GLUCOSE', /(glikoz|glucose)/],
  ['CALCIUM', /(kalsiyum|calcium)/],
  ['CREATININE', /(kreatinin|creatinine|bobrek|kidney)/],
  ['SODIUM', /(sodyum|sodium)/],
  ['POTASSIUM', /(potasyum|potassium)/],
  ['ALBUMIN', /(albumin)/],
  ['ALT', /(\balt\b|karaciger|liver)/],
  ['AST', /(\bast\b|karaciger|liver)/],
]

async function labsReply(c: Ctx): Promise<AssistantReply> {
  const { t, L, lang, locale } = c
  if (/(nasa|inspiration|gercek kan|real blood)/.test(c.q)) {
    return reply(
      lines(
        L(
          'Kan tahlilleri bölümündeki "NASA verisi: Inspiration4" sekmesinde SpaceX Inspiration4 (2021) mürettebatının gerçek, kimliksiz kan değerleri var: uçuştan önce ve sonra alınan örnekler.',
          'The "NASA data: Inspiration4" tab in Blood tests holds the real, de-identified blood values of the SpaceX Inspiration4 (2021) crew, from samples taken before and after flight.',
        ),
        L('Bir tahlil seçince dört mürettebatın değerleri grafikte görünür.', 'Pick a test to see the four crew members\' values on a chart.'),
      ),
      [run(L('NASA verisini aç', 'Open the NASA data'), { type: 'openLabs', view: 'nasa' })],
      'medical',
      src('osd569', 'osd575'),
    )
  }
  const draws = await c.data.labs()
  if (!draws?.length) return reply(L('Henüz alınmış bir kan örneğin yok.', 'No blood samples have been taken yet.'), [run(L('Kan tahlillerini aç', 'Open blood tests'), { type: 'openLabs' })], 'medical')

  const now = c.snapshot?.now ?? Date.now()
  const when = parseDate(c.raw, now, { labs: true })
  const fmtDate = (ts: number) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(ts)
  const analyzed = draws.filter((d) => d.analyzed)
  const lastAnalyzed = analyzed[analyzed.length - 1]
  let pick: LabDraw | undefined
  let note: string | null = null

  const nearestBefore = (ts: number) => [...draws].reverse().find((d) => d.ts <= ts) ?? draws[0]
  if (!when || when.kind === 'last') pick = draws[draws.length - 1]
  else if (when.kind === 'first') pick = draws[0]
  else if (when.kind === 'preflight') pick = draws.find((d) => d.day < 0) ?? draws[0]
  else if (when.kind === 'missionDay') {
    pick = draws.find((d) => d.day === when.day)
    if (!pick) {
      pick = [...draws].reverse().find((d) => d.day <= when.day) ?? draws[0]
      note = L(`Görevin ${when.day}. gününde örnek alınmamış; en yakın önceki örnek ${t.doctor.draw(pick.day)}.`, `No sample was taken on mission day ${when.day}; the nearest earlier sample is ${t.doctor.draw(pick.day).toLowerCase()}.`)
    }
  } else {
    pick = draws.find((d) => d.ts >= when.from && d.ts < when.to)
    if (!pick) {
      pick = nearestBefore(when.to)
      const inFlight = draws.filter((d) => d.day > 0).map((d) => d.day)
      const list = new Intl.ListFormat(locale, { type: 'conjunction' }).format(inFlight.map(String))
      note = L(
        `O tarihte kan örneği alınmamış. Örnekler uçuştan önce ve görevin ${list}. günlerinde alınır; en yakın önceki örnek ${fmtDate(pick.ts)} (${t.doctor.draw(pick.day)}).`,
        `No blood sample was taken on that date. Samples are taken before flight and on mission days ${list}; the nearest earlier one is from ${fmtDate(pick.ts)} (${t.doctor.draw(pick.day).toLowerCase()}).`,
      )
    }
  }
  if (!pick) pick = draws[draws.length - 1]

  const head = L(`${fmtDate(pick.ts)} · ${t.doctor.draw(pick.day)} kan örneğin:`, `Your blood sample from ${fmtDate(pick.ts)} · ${t.doctor.draw(pick.day).toLowerCase()}:`)
  let shown = pick
  let pending: string | null = null
  if (!pick.analyzed) {
    pending = L(
      `Bu örnek henüz analiz edilmedi: istasyonda alınan örnekler dondurulup sonradan incelenir.${lastAnalyzed ? ` Analiz edilmiş son örnek ${fmtDate(lastAnalyzed.ts)} (${t.doctor.draw(lastAnalyzed.day)}); onun sonuçları:` : ''}`,
      `This sample has not been analysed yet: samples taken on the station are frozen and analysed later.${lastAnalyzed ? ` The latest analysed sample is from ${fmtDate(lastAnalyzed.ts)} (${t.doctor.draw(lastAnalyzed.day).toLowerCase()}); its results:` : ''}`,
    )
    if (!lastAnalyzed) return reply(lines(note, head, pending), [run(L('Kan tahlillerini aç', 'Open blood tests'), { type: 'openLabs', day: pick.day })], 'medical', src('nasaBloodBlog'))
    shown = lastAnalyzed
  }

  const wanted = [...new Set(ANALYTE_WORDS.filter(([, re]) => re.test(c.q)).map(([k]) => k))]
  const meta = (key: string) => ANALYTES.find((a) => a.key === key)!
  const fmt = (key: string, v: number) => `${num(v, lang, meta(key).digits)} ${meta(key).unit}`
  const range = (key: string) => {
    const [lo, hi] = meta(key).range[c.sex]
    return `${num(lo, lang, meta(key).digits)}–${num(hi, lang, meta(key).digits)}`
  }
  const flagged = shown.results.filter((r) => r.flag !== 'normal')
  let body: string
  if (wanted.length) {
    body = bullets(
      wanted.map((key) => {
        const r = shown.results.find((x) => x.key === key)
        if (!r) return resolveName(meta(key).name, lang)
        // Uçuş öncesinden bu yana değişim (analiz edilmiş ilk örnekle)
        const first = analyzed.find((d) => d.results.some((x) => x.key === key))?.results.find((x) => x.key === key)
        const change = first && first !== r ? L(` · ilk örnekte ${fmt(key, first.value)}`, ` · first sample ${fmt(key, first.value)}`) : ''
        return `${resolveName(meta(key).name, lang)}: ${fmt(key, r.value)} (${L('referans', 'reference')} ${range(key)}) · ${t.doctor.flag[r.flag]}${change}`
      }),
    )
  } else {
    const normal = shown.results.filter((r) => r.flag === 'normal')
    body = lines(
      L(`${shown.results.length} tahlilin ${normal.length} tanesi referans aralığında.`, `${normal.length} of ${shown.results.length} tests are within the reference range.`),
      flagged.length ? bullets(flagged.map((r) => `${resolveName(meta(r.key).name, lang)}: ${fmt(r.key, r.value)} · ${t.doctor.flag[r.flag]} (${L('referans', 'reference')} ${range(r.key)})`)) : null,
      normal.length ? `${L('Normal olanlar', 'Normal')}: ${normal.map((r) => `${resolveName(meta(r.key).name, lang)} ${fmt(r.key, r.value)}`).join('; ')}.` : null,
    )
  }
  const doctorNote = flagged.length ? L('Ben tanı koymam; referans dışı bir değer için uçuş hekimine danış.', 'I do not diagnose; ask the flight surgeon about any value outside the reference range.') : null
  return reply(
    // Not tarihi ve örneği zaten söyler; başlık yalnızca not yokken yazılır
    lines(note ?? head, pending, '', body, '', L('Mürettebatın değerleri kurgusaldır; referans aralıkları NASA OSDR verisinden gelir.', "The crew's values are fictional; reference ranges come from NASA OSDR data."), doctorNote),
    [
      run(L('Bu örneği Kan tahlillerinde aç', 'Open this sample in Blood tests'), { type: 'openLabs', day: shown.day, view: 'single' }),
      run(L('Bütün tahlilleri karşılaştır', 'Compare all tests'), { type: 'openLabs', view: 'history' }),
      ...(flagged.length && c.canEdit ? [run(L('Uçuş hekimine yaz', 'Write to the flight surgeon'), { type: 'openDoctorContact' } as AppCommand)] : []),
    ],
    'medical',
    src('osd569', 'osd575', 'nasaBloodBlog'),
  )
}

function resolveName(n: { tr: string; en: string }, lang: Lang) {
  return lang === 'en' ? n.en : n.tr
}

/* ---------- Gösterge değerleri ---------- */

async function indicatorReply(c: Ctx, id: IndicatorId, when: DateQuery | null): Promise<AssistantReply> {
  const { t, L, lang, locale } = c
  const ind = INDICATORS[id]
  const name = resolveName(ind.name, lang)
  const unit = resolveName(ind.unit, lang)
  const s = c.snapshot
  const actions = [run(L(`${name} grafiğini aç`, `Open the ${name.toLowerCase()} chart`), { type: 'openExplorer', id }), run(L(`${name} ayrıntısı`, `${name} details`), { type: 'openIndicator', id })]
  const sources = src(ind.rangeSource)

  // Bugünün suyu, egzersizi, dozu ve CO₂'si anlık durumdan gelir (hedef ve beklenen değerle birlikte)
  const s0 = c.snapshot
  if (when?.kind === 'day' && s0 && when.from <= s0.now && when.to >= s0.now && (id === 'water' || id === 'exercise' || id === 'radiation' || id === 'co2')) when = null
  if (when && when.kind !== 'missionDay' && when.kind !== 'preflight' && when.kind !== 'first' && when.kind !== 'last') {
    const res = await c.data.series(id, when.from, when.to)
    const fmtD = (ts: number) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(ts)
    const span = when.kind === 'day' ? fmtD(when.from) : `${fmtD(when.from)}–${fmtD(when.to - 1)}`
    if (!res?.stats || !res.stats.count) return reply(L(`${span} için ${name.toLowerCase()} kaydı yok.`, `There is no ${name.toLowerCase()} data for ${span}.`), actions, 'medical', sources)
    const d = ind.digits
    const st = res.stats
    const daily = ind.cadence === 'daily' || ind.cadence === 'weekly'
    const one = daily && when.kind === 'day'
    const text = one
      ? L(`${span} için ${name.toLocaleLowerCase('tr-TR')}: ${num(st.avg, lang, d)} ${unit}.`, `${name} on ${span}: ${num(st.avg, lang, d)} ${unit}.`)
      : lines(
          L(`${span} için ${name.toLocaleLowerCase('tr-TR')} değerlerin:`, `${name}, ${span}:`),
          bullets([
            `${L('Ortalama', 'Average')} ${num(st.avg, lang, d)} ${unit}`,
            `${L('En düşük', 'Lowest')} ${num(st.min, lang, d)} · ${L('en yüksek', 'highest')} ${num(st.max, lang, d)} ${unit}`,
            L(`${st.count} ölçüm`, `${st.count} readings`),
          ]),
          id === 'bp' ? L('Tansiyonda değerler büyük tansiyondur.', 'Blood pressure figures are systolic.') : null,
        )
    return reply(lines(text, '', `${L('Referans', 'Reference')}: ${resolveName(ind.range, lang)}`), actions, 'medical', sources)
  }

  if (!s) return reply(L('Veriler yükleniyor, birazdan tekrar sor.', 'Data is loading; ask again in a moment.'), actions)
  if (id === 'radiation')
    return reply(
      lines(
        L(`Toplam radyasyon dozun ${num(s.dose.totalMsv, lang, 0)} mSv: 600 mSv kariyer sınırının %${num(s.dose.percent, lang, 1)}'i.`, `Your total radiation dose is ${num(s.dose.totalMsv, lang, 0)} mSv: ${num(s.dose.percent, lang, 1)}% of the 600 mSv career limit.`),
        L(`Bugünkü doz ${num(s.dose.todayMsv, lang, 2)} mSv.`, `Today's dose is ${num(s.dose.todayMsv, lang, 2)} mSv.`),
        '',
        resolveName(ind.space, lang),
      ),
      [run(L('Ortam ve radyasyonu aç', 'Open environment and radiation'), { type: 'page', page: 3 }), ...actions],
      'medical',
      src('tb020'),
    )
  if (id === 'water')
    return reply(
      lines(
        L(`Bugün ${num(s.water.todayMl / 1000, lang, 2)} L su içtin; günlük hedef ${num(s.water.targetMl / 1000, lang, 1)} L.`, `You have had ${num(s.water.todayMl / 1000, lang, 2)} L of water today; the daily target is ${num(s.water.targetMl / 1000, lang, 1)} L.`),
        s.water.todayMl < s.water.expectedMl ? L(`Bu saatte yaklaşık ${num(s.water.expectedMl / 1000, lang, 2)} L beklenir; biraz geridesin.`, `About ${num(s.water.expectedMl / 1000, lang, 2)} L is expected by now; you are a little behind.`) : L('Bu saate göre yolundasın.', 'You are on track for this time of day.'),
      ),
      c.canEdit ? [{ kind: 'addWater', label: L('Bir bardak ekle (250 mL)', 'Log a glass (250 mL)') }, ...actions] : actions,
      'medical',
      src('tb027'),
    )
  if (id === 'exercise')
    return reply(
      L(`Bugün ${s.exercise.todayMin} dakika egzersiz yaptın; programda ${s.exercise.plannedMin} dakika var, günlük hedef yaklaşık ${s.exercise.targetMin} dakika.`, `You have exercised ${s.exercise.todayMin} minutes today; your program has ${s.exercise.plannedMin} minutes and the daily target is about ${s.exercise.targetMin} minutes.`),
      [run(L('Spor sayfasını aç', 'Open the sport page'), { type: 'page', page: 2 }), ...actions],
      'medical',
      src('nasaExercise'),
    )
  if (id === 'co2')
    return reply(
      lines(L(`Kabin CO₂: son ${num(s.co2.latest, lang, 1)} mmHg, 7 günlük ortalama ${num(s.co2.avg7, lang, 1)} mmHg.`, `Cabin CO₂: latest ${num(s.co2.latest, lang, 1)} mmHg, 7-day average ${num(s.co2.avg7, lang, 1)} mmHg.`), `${L('Sınır', 'Limit')}: ${resolveName(ind.range, lang)}`),
      [run(L('Ortam ve radyasyonu aç', 'Open environment and radiation'), { type: 'page', page: 3 }), ...actions],
      'medical',
      src('tb004'),
    )
  const state = s.indicators[id]
  if (!state || state.value === null) return reply(L(`${name} için şu an değer yok.`, `There is no ${name.toLowerCase()} value right now.`), actions, 'medical', sources)
  const d = ind.digits
  const value = state.value2 !== undefined ? `${num(state.value, lang, d)}/${num(state.value2, lang, d)}` : num(state.value, lang, d)
  return reply(
    lines(
      L(`${name}: şu an ${value} ${unit} · ${t.status[state.status]}.`, `${name}: ${value} ${unit} right now · ${t.status[state.status]}.`),
      `${L('Referans', 'Reference')}: ${resolveName(ind.range, lang)}`,
      '',
      resolveName(ind.space, lang),
      when ? L('Belirli bir gün ya da aralık için "dünkü", "12 Kasım" ya da "bu hafta" diye sorabilirsin.', 'For a day or range, ask with "yesterday", "12 November" or "this week".') : null,
    ),
    actions,
    'medical',
    sources,
  )
}

/* ---------- Şikayetler ---------- */

function complaintsReply(c: Ctx): AssistantReply {
  const { t, L, lang, locale } = c
  const list = c.complaints
  const active = list.filter((x) => x.status !== 'resolved')
  const date = (ts: number) => new Date(ts).toLocaleString(locale, { day: 'numeric', month: 'short' })
  const row = (x: ComplaintDoc) => `${t.hologram.symptoms[x.symptom]} · ${resolveName(bodyPart(x.region, x.side), lang)}: ${x.severity}/10, ${t.complaintSave.status[x.status].toLocaleLowerCase(locale)} (${date(x.ts)})`
  const actions = [run(L('Şikayet geçmişini aç', 'Open complaint history'), { type: 'openHistory' }), ...(c.canEdit ? [run(t.hologram.complaint, { type: 'startComplaint' })] : [])]
  if (!list.length) return reply(L('Kayıtlı bir şikayetin yok.', 'You have no recorded complaints.'), actions)
  return reply(
    lines(
      L(`${list.length} kayıtlı şikayetin var; ${active.length} tanesi sürüyor.`, `You have ${list.length} recorded complaint${list.length === 1 ? '' : 's'}; ${active.length} ${active.length === 1 ? 'is' : 'are'} ongoing.`),
      bullets(list.slice(0, 5).map(row)),
      list.length > 5 ? L(`…ve ${list.length - 5} şikayet daha.`, `…and ${list.length - 5} more.`) : null,
      active.length ? L('Bir şikayet azaldıysa ya da geçtiyse Şikayet ve uyarı geçmişinden güncelleyebilirsin; programın buna göre ayarlanır.', 'If a complaint has eased or gone, update it in Complaint and alert history; your program adjusts.') : null,
    ),
    actions,
  )
}

/* ---------- Check-in durumu ---------- */

async function checkinStatusReply(c: Ctx): Promise<AssistantReply> {
  const { t, L, locale } = c
  const day = await c.data.checkinDay()
  if (!c.canEdit) return reply(L("Check-in'ler yalnızca astronot görünümünde gösterilir.", 'Check-ins are only shown in the astronaut view.'))
  if (!day?.length) return reply(L("Bugünün check-in pencereleri yüklenemedi.", "Today's check-in windows could not be loaded."), [run(L("Check-in'leri aç", 'Open check-ins'), { type: 'page', page: 1 })])
  const at = (ms: number) => missionTime(ms, locale)
  const open = day.find((v) => v.acceptsSubmission && v.outcome !== 'expired')
  return reply(
    lines(
      L("Bugünün check-in'leri (görev saati, UTC):", "Today's check-ins (mission time, UTC):"),
      bullets(day.map((v) => `${t.mindPage.windowName(v.window)} ${at(v.opensAt)}–${at(v.closesAt)}: ${t.mindPage.outcome[v.outcome]}`)),
      '',
      open ? L(`${t.mindPage.windowName(open.window)} penceresi açık; yaklaşık 1 dakika sürer ve isteğe bağlıdır.`, `The ${t.mindPage.windowName(open.window).toLowerCase()} window is open; it takes about 1 minute and is optional.`) : L('Şu an açık bir pencere yok.', 'No window is open right now.'),
    ),
    [...(open ? [run(t.mindPage.start, { type: 'openCheckin' } as AppCommand)] : []), run(t.mindPage.records, { type: 'openRecords' })],
  )
}

/* ---------- Program ve hareketler ---------- */

const EXERCISE_WORDS: [ExerciseId, RegExp][] = [
  ['aredSquat', /(squat|comelme|comel)/],
  ['aredDeadlift', /(deadlift|olu kaldirma)/],
  ['aredBench', /(bench|gogus pres|bench press)/],
  ['aredHeelRaise', /(topuk|heel raise|calf raise|baldir kaldir)/],
  ['aredRow', /(\brow\b|kurek cek)/],
  ['t2Run', /(kosu band|treadmill|\bt2\b|kosu)/],
  ['cevisCycle', /(bisiklet|cevis|cycle|bike)/],
  ['coreBrace', /(govde sabit|core|plank)/],
  ['spineStretch', /(omurga esnet|spine stretch|esneme|stretch)/],
  ['warmup', /(isinma|warm ?up)/],
]

function programReply(c: Ctx): AssistantReply {
  const { L, lang } = c
  const p = c.program
  if (!p?.items.length) return reply(L('Bugün için bir program yok.', 'There is no program for today.'), [run(L('Spor sayfasını aç', 'Open the sport page'), { type: 'page', page: 2 })], 'coach')
  const done = p.items.filter((i) => i.done).length
  const next = p.items.find((i) => !i.done)
  const total = p.items.reduce((sum, i) => sum + i.minutes, 0)
  return reply(
    lines(
      L(`Bugünkü programın (${total} dk, ${done}/${p.items.length} hareket yapıldı):`, `Today's program (${total} min, ${done}/${p.items.length} moves done):`),
      bullets(p.items.map((i) => `${i.done ? '✓ ' : ''}${resolveName(EXERCISES[i.exercise].name, lang)} · ${i.sets && i.reps ? `${i.sets} × ${i.reps} · ` : ''}${i.minutes} ${L('dk', 'min')}`)),
      p.adaptedFor.length ? L('Program kayıtlı şikayetlerine göre ayarlandı.', 'The program is adjusted to your recorded complaints.') : null,
    ),
    [
      ...(next ? [run(L(`Hologramda göster: ${resolveName(EXERCISES[next.exercise].name, lang)}`, `Show on the hologram: ${resolveName(EXERCISES[next.exercise].name, lang)}`), { type: 'showExercise', exercise: next.exercise })] : []),
      run(L('Spor sayfasını aç', 'Open the sport page'), { type: 'page', page: 2 }),
    ],
    'coach',
    src('nasaExercise'),
  )
}

function exerciseReply(c: Ctx, id: ExerciseId): AssistantReply {
  const { L, lang } = c
  const ex = EXERCISES[id]
  const name = resolveName(ex.name, lang)
  return reply(
    lines(
      `${name}: ${resolveName(ex.about, lang)}`,
      '',
      L('Doğru form:', 'Good form:'),
      bullets(ex.cues.map((x) => resolveName(x, lang))),
      '',
      L('Hologram antrenör hareketi senin bedenine göre gösterir; sürükleyerek etrafında dönebilirsin.', 'The hologram trainer shows the move in a body like yours; drag to walk around it.'),
    ),
    [run(L(`Hologramda göster: ${name}`, `Show on the hologram: ${name}`), { type: 'showExercise', exercise: id })],
    'coach',
    src('nasaExercise'),
  )
}

/* ---------- Genel durum ---------- */

function statusReply(c: Ctx): AssistantReply {
  const { t, L, lang } = c
  const s = c.snapshot
  if (!s) return reply(L('Veriler yükleniyor, birazdan tekrar sor.', 'Data is loading; ask again in a moment.'))
  const findings = s.findings
  return reply(
    lines(
      L(`Genel durumun: ${t.status[s.overall]}. Görevin ${s.missionDay}. günü.`, `Your overall status: ${t.status[s.overall]}. Mission day ${s.missionDay}.`),
      findings.length ? L('Şu anki uyarılar:', 'Current alerts:') : L('Şu an etkin bir uyarı yok.', 'There are no active alerts right now.'),
      findings.length ? bullets(findings.slice(0, 5).map((f) => resolveName(f.title, lang))) : null,
      findings.length > 5 ? L(`…ve ${findings.length - 5} uyarı daha.`, `…and ${findings.length - 5} more.`) : null,
      '',
      L(`Göreve uygunluk: ${t.crew.fitness[s.fitness.state]}. ${resolveName(s.fitness.reason, lang)}`, `Fitness for duty: ${t.crew.fitness[s.fitness.state]}. ${resolveName(s.fitness.reason, lang)}`),
    ),
    [run(L('Ana sayfayı aç', 'Open the home page'), { type: 'page', page: 0 }), run(L('Şikayet ve uyarı geçmişi', 'Complaint and alert history'), { type: 'openHistory' })],
    'medical',
  )
}

/* ---------- Site içi yönlendirmeler (adım adım + doğrudan açan düğme) ---------- */

interface Guide {
  id: string
  /** Bu kalıplardan biri (fold edilmiş metinde) eşleşmeli */
  match: RegExp
  /** İsteğe bağlı ek koşul (ör. "nasıl" ya da "aç" da geçmeli) */
  also?: RegExp
  answer: (c: Ctx) => AssistantReply
}

const SAY = (c: Ctx, tr: string, en: string) => c.L(tr, en)
const editOnly = (c: Ctx) => (c.canEdit ? null : c.L('Not: bu işlem yalnızca astronot görünümünde yapılabilir; şu an hekim görünümündesin.', 'Note: only the astronaut view can do this; you are in the flight surgeon view.'))

const GUIDES: Guide[] = [
  {
    id: 'complaint-update',
    match: /(sikayet|rahatsizlik|complaint)/,
    also: /(gecti|azaldi|kapat|guncelle|sil|bitti|iyilesti|resolve|update|close|gone|better|delete)/,
    answer: (c) =>
      reply(
        lines(
          SAY(c, 'Bir şikayeti güncellemek için:', 'To update a complaint:'),
          steps([
            SAY(c, 'Sağlık kayıtları sayfasındaki "Şikayet ve uyarı geçmişi" bölümünü aç.', 'Open "Complaint and alert history" on the health records page.'),
            SAY(c, `Şikayetin satırında "${c.t.complaintSave.markImproving}" ya da "${c.t.complaintSave.status.resolved}" düğmesine bas.`, `Press "${c.t.complaintSave.markImproving}" or "${c.t.complaintSave.status.resolved}" on the complaint's row.`),
            SAY(c, 'Spor programın bu duruma göre kendiliğinden ayarlanır.', 'Your sport program adjusts itself.'),
          ]),
          editOnly(c),
        ),
        [run(SAY(c, 'Şikayet geçmişini aç', 'Open complaint history'), { type: 'openHistory' })],
      ),
  },
  {
    id: 'complaint-create',
    match: /(sikayet|rahatsizlik|agri bildir|complaint|discomfort|report pain)/,
    also: new RegExp(`${CREATE.source}|${WANT.source}|${HOW.source}|${OPEN.source}`),
    answer: (c) =>
      reply(
        lines(
          SAY(c, 'Şikayeti iki yoldan oluşturabilirsin.', 'You can create a complaint in two ways.'),
          '',
          SAY(c, 'Hologramdan (en ayrıntılısı):', 'From the hologram (most detailed):'),
          steps([
            SAY(c, `Ana sayfadaki vücut haritasının altında "${c.t.hologram.complaint}" düğmesine bas.`, `Press "${c.t.hologram.complaint}" under the body map on the home page.`),
            SAY(c, 'Kaslarda mı, kemiklerde mi olduğunu seç (figürlerden birine de tıklayabilirsin).', 'Choose muscles or bones (or click one of the figures).'),
            SAY(c, 'Rahatsız olan yerlere tıkla; birden fazla kas ya da kemik seçebilirsin.', 'Click where it hurts; you can pick several muscles or bones.'),
            SAY(c, 'Ne hissettiğini ve şiddetini (1–10) seç, istersen not ekle.', 'Choose what you feel and its severity (1–10); add a note if you like.'),
            SAY(c, `"${c.t.complaintSave.saveAsk}" ile kaydet; spor programın buna göre ayarlanır.`, `Save with "${c.t.complaintSave.saveAsk}"; your sport program adjusts.`),
          ]),
          '',
          SAY(c, 'Ya da bana yaz: örneğin "sol dizim ağrıyor, şiddeti 6". Kaydetmeni önerir, tek düğmeyle kaydederim.', 'Or write to me, e.g. "my left knee hurts, severity 6". I will offer to save it with one button.'),
          editOnly(c),
        ),
        c.canEdit ? [run(c.t.hologram.complaint, { type: 'startComplaint' })] : [],
      ),
  },
  {
    id: 'checkin',
    match: /(check[ -]?in|cekin|chekin)/,
    also: new RegExp(`${HOW.source}|${WANT.source}|${OPEN.source}|${CREATE.source}`),
    answer: (c) =>
      reply(
        lines(
          SAY(c, "Check-in, görev gününün sabah, öğle ve akşam pencerelerinde yapılan kısa (yaklaşık 1 dakika) ve isteğe bağlı bir formdur.", 'A check-in is a short (about 1 minute), optional form for the morning, midday and evening windows of the mission day.'),
          steps([
            SAY(c, 'Zihinsel sağlık sayfasını aç.', 'Open the Wellbeing page.'),
            SAY(c, `Açık penceredeki "${c.t.mindPage.start}" düğmesine bas.`, `Press "${c.t.mindPage.start}" in the open window.`),
            SAY(c, 'Soruları cevapla (hepsi isteğe bağlı) ve kaydet; kapattıktan sonra aynı pencerede düzenleyebilirsin.', 'Answer the questions (all optional) and save; you can edit them in the same window afterwards.'),
          ]),
          SAY(c, `Geçmiş check-in'lerin "${c.t.mindPage.records}" içinde durur.`, `Your past check-ins are in "${c.t.mindPage.records}".`),
          editOnly(c),
        ),
        [run(c.t.mindPage.start, { type: 'openCheckin' }), run(c.t.mindPage.records, { type: 'openRecords' })],
      ),
  },
  {
    id: 'records',
    match: /(kayitlarim|kayitlar|gecmis check|eski check|gunluk not|journal entr|my records|past check|journal history)/,
    answer: (c) =>
      reply(
        lines(
          SAY(c, `"${c.t.mindPage.records}" check-in geçmişini ve günlük notlarını bir arada gösterir; türüne göre süzebilirsin.`, `"${c.t.mindPage.records}" shows your check-in history and journal notes together; you can filter by type.`),
          SAY(c, 'Zihinsel sağlık sayfasında başlığın sağında durur. Kayıtların hekim görünümünde gösterilmez.', 'It sits next to the title on the Wellbeing page. Your records are not shown in the flight surgeon view.'),
        ),
        [run(c.t.mindPage.records, { type: 'openRecords' })],
      ),
  },
  {
    id: 'journal',
    match: /(gunluk|journal|diary|not yaz|note)/,
    also: new RegExp(`${CREATE.source}|${WANT.source}|${HOW.source}|${OPEN.source}`),
    answer: (c) =>
      reply(
        lines(
          SAY(c, 'Günlüğe yazmak için:', 'To write in your journal:'),
          steps([
            SAY(c, `Zihinsel sağlık sayfasındaki destek kütüphanesinde "${c.t.mindPage.library.journal.title}" kutusunda "${c.t.mindPage.library.openShort}"a bas.`, `On the Wellbeing page, press "${c.t.mindPage.library.openShort}" on "${c.t.mindPage.library.journal.title}" in the support library.`),
            SAY(c, 'Aklındakini yaz ve kaydet.', 'Write what is on your mind and save.'),
          ]),
          SAY(c, `Notların "${c.t.mindPage.records}" içinde durur, analiz edilmez ve hekim görünümünde gösterilmez.`, `Your notes stay in "${c.t.mindPage.records}"; they are not analysed and not shown in the flight surgeon view.`),
          editOnly(c),
        ),
        [run(c.t.mindPage.library.journal.title, { type: 'openJournal' })],
      ),
  },
  {
    id: 'reaction',
    match: /(tepki test|reaction test|tepki olc|reflex)/,
    answer: (c) =>
      reply(
        lines(
          c.t.reaction.intro,
          SAY(c, 'Yorgunluğu fark etmeye yarar; haftalık kontrol takviminde de yer alır.', 'It helps you notice fatigue; it is also on the weekly check-up calendar.'),
          SAY(c, `Zihinsel sağlık sayfasındaki "${c.t.mindPage.actions.title}" bölümünde "${c.t.reaction.title}" kutusundan başlatılır.`, `Start it from "${c.t.reaction.title}" in "${c.t.mindPage.actions.title}" on the Wellbeing page.`),
          editOnly(c),
        ),
        c.canEdit ? [run(c.t.reaction.title, { type: 'openReaction' })] : [],
      ),
  },
  {
    id: 'mindgames',
    match: /(zihin egzersiz|zeka oyun|beyin oyun|hafiza oyun|bellek|cognition|mind training|brain game|memory game)/,
    answer: (c) =>
      reply(
        lines(
          SAY(c, "Zihin egzersizleri, NASA'nın astronotlar için geliştirdiği Cognition testlerinden uyarlanan üç kısa oyundur: sembol eşleme, çizgi yönü ve 2-geri bellek.", "Mind training is three short games adapted from NASA's Cognition tests for astronauts: symbol match, line angle and 2-back memory."),
          SAY(c, `Zihinsel sağlık sayfasındaki "${c.t.mindPage.actions.title}" bölümünden başlatılır; tam ekran açılır, "${c.t.mindPage.library.back}" ile dönersin.`, `Start it from "${c.t.mindPage.actions.title}" on the Wellbeing page; it opens full screen and "${c.t.mindPage.library.back}" brings you back.`),
        ),
        [run(c.t.mindPage.library.mindGames.title, { type: 'openMindGames' })],
      ),
  },
  {
    id: 'soon-tests',
    match: /(goru[sş] test|goz test|vision test|eye test|tutarlilik test|consistency test)/,
    answer: (c) =>
      reply(
        SAY(c, `${c.t.mindPage.actions.vision} ve ${c.t.mindPage.actions.consistency.toLocaleLowerCase('tr-TR')} henüz yok; sonraki sürümde eklenecek. Şimdilik zihin egzersizlerini ve tepki testini kullanabilirsin.`, `The ${c.t.mindPage.actions.vision.toLowerCase()} and the ${c.t.mindPage.actions.consistency.toLowerCase()} are not available yet; they are coming in a later version. For now you can use mind training and the reaction test.`),
        [run(c.t.mindPage.library.mindGames.title, { type: 'openMindGames' }), ...(c.canEdit ? [run(c.t.reaction.title, { type: 'openReaction' } as AppCommand)] : [])],
      ),
  },
  {
    id: 'cupola',
    match: /(cupola|kupola|dunya ya bak|dunyaya bak|pencereden|look at earth|earth view)/,
    answer: (c) =>
      reply(
        lines(
          SAY(c, "Cupola'da istasyonun penceresinden Dünya'yı izlersin: manzarayı (gün doğumu, Sahra ve Nil, Hint Okyanusu, gece ışıkları) ve sesi seçebilir, görüntüyü tam ekrana alabilirsin.", 'In the Cupola you watch Earth from the station window: choose the view (sunrise, Sahara and Nile, Indian Ocean, city lights) and the sound, and go full screen.'),
          SAY(c, 'Videolar SI ile üretildi ve sol üstte "AI GENERATED" filigranı taşır; gerçek ya da canlı ISS görüntüsü değildir.', 'The videos were generated with SI and carry an "AI GENERATED" watermark at the top left; they are not real or live ISS footage.'),
        ),
        [run('Cupola', { type: 'openLibrary', item: 'cupola' })],
      ),
  },
  {
    id: 'breathing',
    match: /(nefes egzersiz|nefes molasi|nefes al|breathing exercise|breathing break|breathe)/,
    also: new RegExp(`${OPEN.source}|${HOW.source}|${WANT.source}|nefes egzersiz|breathing exercise`),
    answer: (c) =>
      reply(
        lines(
          SAY(c, 'Nefes egzersizi kısa ve yönlendirmelidir: 5 saniye nefes al, 5 saniye ver; 1, 3 ya da 5 dakika. Nefes tutma yok; sen başlatmadan hiçbir şey başlamaz.', 'The breathing exercise is short and guided: breathe in for 5 seconds, out for 5; 1, 3 or 5 minutes. No breath-holding; nothing starts until you start it.'),
        ),
        [run(c.t.mindPage.library.breathing.title, { type: 'openLibrary', item: 'breathing' })],
      ),
  },
  {
    id: 'gallery',
    match: /(dunya galeri|galeri|fotograf|foto ekle|epic|earth gallery|gallery|photo)/,
    answer: (c) =>
      reply(
        lines(
          SAY(c, "Dünya galerisinde NASA EPIC uydusunun Dünya fotoğrafları ve istersen kendi fotoğrafların var.", "The Earth gallery holds Earth photos from NASA's EPIC satellite, and your own photos if you add them."),
          SAY(c, 'Kendi fotoğrafını eklemek için galeride "Benim fotoğraflarım" kategorisini seçip fotoğraf yükle; fotoğraflar yalnızca bu cihazda saklanır.', 'To add your own, choose your photos category in the gallery and upload; photos stay on this device only.'),
        ),
        [run(c.t.mindPage.library.gallery.title, { type: 'openLibrary', item: 'gallery' })],
        'general',
        src('epic'),
      ),
  },
  {
    id: 'emergency',
    match: /(acil durum|acil yardim|acil destek|imdat|emergency|urgent help)/,
    answer: (c) =>
      reply(
        lines(
          SAY(c, `Üst çubuktaki kırmızı "${c.t.emergencyButton.label}" düğmesi her sayfadadır. İki yol açar:`, `The red "${c.t.emergencyButton.label}" button in the top bar is on every page. It opens two paths:`),
          bullets([
            SAY(c, `"${c.t.mindPage.emergency.doctor}": uçuş hekimine mesaj yazarsın, istersen sağlık verisi eklersin.`, `"${c.t.mindPage.emergency.doctor}": write to the flight surgeon and attach health data if you like.`),
            SAY(c, `"${c.t.mindPage.emergency.crew}": mürettebattan acil yardım isteği ekranı; ekranı açmak kimseye bildirim göndermez.`, `"${c.t.mindPage.emergency.crew}": the screen for asking the crew for urgent help; opening it notifies no one.`),
          ]),
          SAY(c, 'Şu an hayati bir tehlike varsa beklemeden mürettebattan birine haber ver.', 'If there is a life-threatening danger right now, tell a crewmate without waiting.'),
        ),
        [run(c.t.emergencyButton.label, { type: 'openEmergency' }), ...(c.canEdit ? [run(c.t.mindPage.emergency.crew, { type: 'openCrewAssist' } as AppCommand)] : [])],
      ),
  },
  {
    id: 'report',
    match: /(rapor|report|pdf)/,
    answer: (c) =>
      reply(
        lines(
          SAY(c, 'Sağlık raporu, Sağlık kayıtları sayfasındaki "Rapor ve uçuş hekimi" bölümündedir.', 'The health report is in "Report and flight surgeon" on the health records page.'),
          steps([
            SAY(c, 'Dönemi seç (7 ya da 30 gün).', 'Choose the period (7 or 30 days).'),
            SAY(c, `"${c.t.doctor.viewAstronaut}" ile "${c.t.doctor.viewDoctor}" arasında geçebilirsin.`, `Switch between "${c.t.doctor.viewAstronaut}" and "${c.t.doctor.viewDoctor}".`),
            SAY(c, `"${c.t.doctor.print}" raporu PDF olarak indirir; "${c.t.doctor.send}" iletişim gecikmesiyle hekime gönderir.`, `"${c.t.doctor.print}" saves it as PDF; "${c.t.doctor.send}" sends it to the flight surgeon with the communication delay.`),
          ]),
          SAY(c, 'Raporda her göstergenin son değeri, ortalaması, aralığı ve eğilimi; şikayetler ve etkin uyarılar var.', 'The report lists each indicator\'s latest value, average, range and trend, plus complaints and active alerts.'),
        ),
        [run(SAY(c, 'Raporu aç', 'Open the report'), { type: 'openReport' })],
      ),
  },
  {
    id: 'doctor-message',
    match: /(hekim|doktor|ucus hekim|flight surgeon|doctor|physician)/,
    also: /(mesaj|yaz|ulas|iletisim|konus|haber ver|message|write|contact|talk|reach|send)/,
    answer: (c) => {
      const s = c.snapshot
      const delay = s ? (s.comm.blackout ? c.L('İletişim şu an kesik: mesajın kuyrukta bekler, bağlantı gelince iletilir.', 'Communication is down right now: your message waits in a queue and goes out when the link returns.') : c.L(`Mesajlar görev ortamının gecikmesiyle ulaşır: şu an tek yönlü yaklaşık ${delayText(s.comm.delayMs, c.locale)}.`, `Messages arrive with the mission's delay: one way, about ${delayText(s.comm.delayMs, c.locale)} right now.`)) : null
      return reply(
        lines(
          SAY(c, 'Uçuş hekimine iki yoldan yazabilirsin:', 'You can write to the flight surgeon in two ways:'),
          bullets([
            SAY(c, `Üst çubuktaki "${c.t.emergencyButton.label}" → "${c.t.mindPage.emergency.doctor}": belirti seçip istersen sağlık verisi ekleyerek mesaj yazarsın.`, `"${c.t.emergencyButton.label}" in the top bar → "${c.t.mindPage.emergency.doctor}": pick symptoms and attach health data if you like.`),
            SAY(c, 'Sağlık kayıtları sayfasındaki "Rapor ve uçuş hekimi" bölümünün "Mesajlar" sekmesi: önceki mesajlar ve hekimin cevapları.', 'The "Messages" tab of "Report and flight surgeon" on the health records page: earlier messages and replies.'),
          ]),
          delay,
          editOnly(c),
        ),
        [...(c.canEdit ? [run(c.t.mindPage.emergency.doctor, { type: 'openDoctorContact' } as AppCommand)] : []), run(SAY(c, 'Mesajları aç', 'Open messages'), { type: 'openMessages' })],
        'general',
        src('podcastDistance'),
      )
    },
  },
  {
    id: 'import',
    match: /(ice aktar|veri yukle|dosya yukle|csv|json|import|upload data|sensor data)/,
    answer: (c) =>
      reply(
        lines(
          SAY(c, `Gerçek bir sensör ya da cihaz verisini "${c.t.importer.open}" ile yükleyebilirsin:`, `You can load real sensor or device data with "${c.t.importer.open}":`),
          steps([
            SAY(c, 'Göstergeyi ve CSV ya da JSON dosyanı seç (en fazla 2 MB).', 'Choose the indicator and your CSV or JSON file (up to 2 MB).'),
            SAY(c, 'Sütunları eşle; birimler çevrilir (°F→°C, mg/dL→mmol/L, dakika→saat), hatalı satırlar nedeniyle gösterilip atlanır.', 'Map the columns; units are converted (°F→°C, mg/dL→mmol/L, minutes→hours) and bad rows are shown with the reason and skipped.'),
            SAY(c, 'Önizlemeden sonra içe aktar; veri o zaman aralığında simülasyonun yerine geçer ve grafik oraya gider.', 'Import after the preview; the data replaces the simulation in that time range and the chart jumps there.'),
          ]),
        ),
        [run(c.t.importer.open, { type: 'openImport' })],
      ),
  },
  {
    id: 'measure',
    match: /(sabah olcum|olcum ekle|olcum gir|deger gir|elle gir|manuel|measurement|add a reading|manual reading|log a reading)/,
    answer: (c) =>
      reply(
        lines(
          SAY(c, 'Ölçüm iki yoldan girilir:', 'There are two ways to enter a reading:'),
          bullets([
            SAY(c, `Sabah ölçümü: Yapılacaklar'daki "${c.t.todo.measure}" ile tansiyon ve açlık kan şekeri (kahvaltıdan önce, 5 dakika dinlendikten sonra).`, `Morning measurement: "${c.t.todo.measure}" in the to-do list for blood pressure and fasting blood sugar (before breakfast, after 5 minutes of rest).`),
            SAY(c, 'Herhangi bir gösterge: gösterge kartına tıkla, açılan ayrıntıda "Ölçüm ekle" bölümünü kullan (radyasyonda elle ölçüm yok).', 'Any indicator: click its card and use "Add reading" in the details (radiation has no manual reading).'),
          ]),
          editOnly(c),
        ),
        c.canEdit ? [run(c.t.measure.title, { type: 'openMeasure' })] : [],
      ),
  },
  {
    id: 'task',
    match: /(gorev ekle|yapilacak|to do|todo|task|hatirlatici|reminder)/,
    answer: (c) =>
      reply(
        lines(
          SAY(c, `Ana sayfadaki "${c.t.todo.title}" bölümünde günün rutinleri ve kendi görevlerin durur.`, `"${c.t.todo.title}" on the home page holds today's routines and your own tasks.`),
          steps([
            SAY(c, `Alttaki "${c.t.todo.addPlaceholder}" kutusuna yaz ve + ile ekle.`, `Type in "${c.t.todo.addPlaceholder}" at the bottom and press +.`),
            SAY(c, 'Yaptığın görevi kutucuğundan işaretle; zamanı geçen görev "Gecikti" olarak görünür.', 'Tick a task when done; a task past its time shows as overdue.'),
            SAY(c, 'Sağ üstteki takvim geçen haftanın, bugünün ve önümüzdeki iki haftanın kontrollerini gösterir.', 'The calendar at the top right shows check-ups for last week, today and the next two weeks.'),
          ]),
        ),
        [run(SAY(c, 'Ana sayfayı aç', 'Open the home page'), { type: 'page', page: 0 }), run(c.t.schedule.title, { type: 'openSchedule' })],
      ),
  },
  {
    id: 'schedule',
    match: /(takvim|kontrol takvim|kontrol ne zaman|sonraki kontrol|calendar|check-?up|schedule)/,
    answer: (c) =>
      reply(
        lines(SAY(c, `${c.t.schedule.title}: ${c.t.schedule.subtitle.toLocaleLowerCase(c.locale)}.`, `${c.t.schedule.title}: ${c.t.schedule.subtitle.toLowerCase()}.`), c.t.schedule.note),
        [run(c.t.schedule.title, { type: 'openSchedule' })],
      ),
  },
  {
    id: 'hologram',
    match: /(hologram|vucut harita|3d|katman|kas sistem|iskelet|body map|layers|muscle|skeleton)/,
    also: new RegExp(`${HOW.source}|${OPEN.source}|${WANT.source}|kullan|use`),
    answer: (c) =>
      reply(
        lines(
          SAY(c, 'Vücut haritası (ana sayfa):', 'The body map (home page):'),
          bullets([
            SAY(c, 'Bir bölgeye tıkla: bilgi kartında o bölgenin durumu, uzaydaki etkisi ve öneri açılır.', 'Click a region: the info card shows its status, its effect in space and advice.'),
            SAY(c, `Sürükleyerek döndür, tekerlekle yakınlaş; "${c.t.hologram.front}" ve "${c.t.hologram.back}" ile çevir.`, `Drag to rotate, use the wheel to zoom; turn it with "${c.t.hologram.front}" and "${c.t.hologram.back}".`),
            SAY(c, `"${c.t.hologram.explode}": kaslar ve iskelet yan yana açılır; bir yapıya tıklayınca adı ve uzaydaki etkisi gelir.`, `"${c.t.hologram.explode}": muscles and skeleton side by side; click a structure to see its name and effect in space.`),
            SAY(c, `"${c.t.hologram.complaint}" ile ağrıyan yeri işaretleyip şikayet oluşturursun.`, `"${c.t.hologram.complaint}" lets you mark where it hurts and create a complaint.`),
          ]),
        ),
        [run(SAY(c, 'Ana sayfayı aç', 'Open the home page'), { type: 'page', page: 0 })],
      ),
  },
  {
    id: 'exercise-show',
    match: /(hareket|egzersiz|antrenman|exercise|move|workout)/,
    also: /(goster|nasil yapilir|nasil yapacag|hologramda|show|how to do|how do i do)/,
    answer: (c) => {
      const hit = EXERCISE_WORDS.find(([, re]) => re.test(c.q))?.[0]
      if (hit) return exerciseReply(c, hit)
      return reply(
        lines(
          SAY(c, 'Bir hareketi hologramda görmek için:', 'To see a move on the hologram:'),
          steps([
            SAY(c, 'Spor sayfasını aç.', 'Open the sport page.'),
            SAY(c, `"${c.t.sport.programTitle}" listesinde hareketin yanındaki "${c.t.sport.show}"a bas; aynı düğme duraklatır.`, `Press "${c.t.sport.show}" next to the move in "${c.t.sport.programTitle}"; the same button pauses.`),
            SAY(c, 'Antrenörün etrafında sürükleyerek dön; altta doğru formun püf noktaları yazar.', 'Drag to walk around the trainer; the key points of good form are listed below.'),
          ]),
          SAY(c, 'Belirli bir hareketi de sorabilirsin: "squat nasıl yapılır?"', 'You can also ask about a move: "how do I do a squat?"'),
        ),
        [run(SAY(c, 'Spor sayfasını aç', 'Open the sport page'), { type: 'page', page: 2 })],
        'coach',
      )
    },
  },
  {
    id: 'charts',
    match: /(grafik|chart|trend|gecmis deger|eski deger|history of)/,
    answer: (c) => {
      const id = indicatorIn(c.q, c.raw)
      return reply(
        lines(
          SAY(c, `Grafikler, Sağlık kayıtları sayfasındaki "${c.t.doctor.explorerTitle}" bölümündedir: bir gösterge ve aralık (gün, hafta, ay, görev ya da özel aralık) seçersin.`, `Charts are in "${c.t.doctor.explorerTitle}" on the health records page: choose an indicator and a range (day, week, month, mission or custom).`),
          SAY(c, 'Ana sayfadaki bir gösterge kartının mini grafiğine tıklayınca da doğrudan o göstergenin grafiği açılır.', 'Clicking the mini chart on a home page indicator card also opens that chart directly.'),
        ),
        [run(id ? SAY(c, `${resolveName(INDICATORS[id].name, 'tr')} grafiği`, `${resolveName(INDICATORS[id].name, 'en')} chart`) : SAY(c, 'Grafikleri aç', 'Open charts'), { type: 'openExplorer', id: id ?? 'hr' })],
      )
    },
  },
  {
    id: 'layout',
    match: /(bolum ekle|bolum kaldir|bolumleri duzenle|duzeni|yerlesim|tasi|sabitle|kart ekle|kart kaldir|layout|rearrange|pin|hide a section|add a section)/,
    answer: (c) =>
      reply(
        lines(
          SAY(c, 'Sayfaları kendine göre düzenleyebilirsin:', 'You can arrange the pages your way:'),
          bullets([
            SAY(c, `Sol üstteki menü "${c.t.layout.title}": göz simgesiyle bir bölümü açık sayfaya ekler ya da kaldırırsın.`, `The "${c.t.layout.title}" menu at the top left: the eye icon adds a section to the open page or removes it.`),
            SAY(c, 'Bir bölümün üzerine gelince üst kenarında ⓘ, iğne ve X çıkar: ⓘ açıklama, iğne sabitle/serbest bırak, X basılı tutunca kaldırır.', "Hover a section to see ⓘ, the pin and X on its top edge: ⓘ explains it, the pin locks or frees it, and holding X removes it."),
            SAY(c, 'Sabitlemesi kaldırılan bölümü sürükleyip yerleştir, sonra yeniden sabitle.', 'Drag an unpinned section into place, then pin it again.'),
          ]),
        ),
        [run(c.t.layout.title, { type: 'openLayoutMenu' })],
      ),
  },
  {
    id: 'tour',
    match: /(rehber tur|tur baslat|tanit|gezdir|tutorial|guided tour|onboarding|walkthrough)/,
    answer: (c) => reply(SAY(c, 'Rehber tur arayüzü kısa adımlarla tanıtır; istediğin an kapatabilirsin.', 'The guided tour introduces the interface in short steps; you can close it any time.'), [run(c.t.topbar.startTour, { type: 'startTour' })]),
  },
  {
    id: 'sources',
    match: /(kaynak|kaynakca|nereden biliyorsun|sources|references|where does .* come from|nasa verisi)/,
    answer: (c) =>
      reply(
        SAY(c, 'Uygulamadaki bütün sayıların ve eşiklerin kaynakları Kaynaklar penceresindedir: doğrulanmış NASA belgeleri, NASA verileri (DONKI, EPIC, OSDR), tıbbi kaynaklar, yazılım ve görseller. Ayrıca fizibilite ve yol haritası sekmeleri de orada.', "The sources of every number and threshold in the app are in the Sources window: verified NASA documents, NASA data (DONKI, EPIC, OSDR), medical sources, software and visuals. The feasibility and roadmap tabs are there too."),
        [run(c.t.topbar.sources, { type: 'openSources' })],
      ),
  },
  {
    id: 'hazards',
    match: /(tehlike|hazard|uzay havasi|gunes patlama|gunes firtina|space weather|solar flare|solar storm|donki)/,
    answer: (c) =>
      reply(
        lines(
          SAY(c, 'Sağlık kayıtları sayfasındaki "Ortam ve radyasyon" bölümünde toplam dozun, kabin CO₂ ve NASA DONKI\'den gelen uzay havası olayları (güneş parçacık olayları, patlamalar, jeomanyetik fırtınalar) var.', '"Environment and radiation" on the health records page shows your total dose, cabin CO₂ and space weather events from NASA DONKI (solar particle events, flares, geomagnetic storms).'),
          SAY(c, "Aynı bölümdeki tehlikeler düğmesi NASA'nın uzay uçuşunun beş tehlikesini anlatır.", "The hazards button in the same section explains NASA's five hazards of spaceflight."),
        ),
        [run(SAY(c, 'Beş tehlikeyi aç', 'Open the five hazards'), { type: 'openHazards' }), run(SAY(c, 'Sağlık kayıtlarını aç', 'Open health records'), { type: 'page', page: 3 })],
        'medical',
        src('donki', 'hrpHazards'),
      ),
  },
  {
    id: 'language',
    match: /(ingilizce|turkce|dil degis|language|english|turkish)/,
    answer: (c) => reply(SAY(c, 'Dili üst çubuğun sağındaki TR / EN düğmesinden değiştirebilirsin; bütün arayüz ve ben o dile geçeriz.', 'Change the language with the TR / EN switch at the right of the top bar; the whole interface and I switch to it.')),
  },
  {
    id: 'sound',
    match: /(ses ayar|sesi kapat|sesi ac|titresim|sesli oku|voice|sound|vibration|read aloud)/,
    answer: (c) =>
      reply(
        bullets([
          SAY(c, `Uyarı sesi ve görsel titreşim üst çubuktaki iki düğmeyle açılıp kapanır ("${c.t.topbar.soundLabel}", "${c.t.topbar.vibrationLabel}").`, `The alert sound and visual vibration are toggled with two buttons in the top bar ("${c.t.topbar.soundLabel}", "${c.t.topbar.vibrationLabel}").`),
          SAY(c, 'Benim cevaplarımı sesli okumak için her cevabın sağ altındaki hoparlöre bas; ses ayarları bu pencerenin üstünde.', 'To hear my answers, press the speaker at the bottom right of each answer; voice settings are at the top of this window.'),
        ]),
      ),
  },
  {
    id: 'demo',
    match: /(demo|senaryo|scenario)/,
    answer: (c) => reply(SAY(c, 'Üst çubuktaki "Demo" düğmesi hazır senaryoları (ör. bir sağlık sorunu, uzay havası olayı) başlatır; arayüzün bunlara nasıl tepki verdiğini görürsün. Demoyu sıfırlamak da oradan yapılır.', 'The "Demo" button in the top bar starts ready-made scenarios (e.g. a health problem, a space weather event) so you can see how the interface reacts. You can reset the demo there too.')),
  },
  {
    id: 'profile',
    match: /(profil|astronot degis|hekim gorunum|ucus hekimi gorunum|surgeon view|switch astronaut|crew member|\brol\b|\brolu\b|\brole\b)/,
    answer: (c) =>
      reply(
        lines(
          SAY(c, 'Üst çubuğun sağındaki isim düğmesi profil menüsünü açar:', 'The name button at the right of the top bar opens the profile menu:'),
          bullets([
            SAY(c, 'Astronot ile uçuş hekimi görünümü arasında geçebilirsin.', 'Switch between the astronaut and flight surgeon views.'),
            SAY(c, 'Mürettebattan başka bir üyeyi seçebilirsin; her üyenin verisi ayrıdır.', 'Pick another crew member; each has their own data.'),
            SAY(c, 'Yaş, boy ve kilo gibi kişisel bilgileri düzenleyebilirsin.', 'Edit personal details such as age, height and weight.'),
          ]),
        ),
      ),
  },
]

/* ---------- Yardım ve öneriler ---------- */

const EXAMPLES = (c: Ctx) => [
  c.L('Şikayet oluşturmak istiyorum', 'I want to create a complaint'),
  c.L('Son kan tahlilim', 'My latest blood test'),
  c.L('Bu haftaki uykum', 'My sleep this week'),
  c.L('Bugünkü programım', "Today's program"),
]

function helpReply(c: Ctx): AssistantReply {
  return reply(
    lines(
      c.L('Ben Sağlık Asistanı; internetsiz çalışırım ve verilerini uygulamanın içinden okurum. Şunları yapabilirim:', 'I am the Health Assistant; I work offline and read your data from inside the app. I can:'),
      bullets([
        c.L('Sitedeki her şeyi adım adım anlatıp doğrudan açmak: şikayet, check-in, Kayıtlarım, tepki testi, Cupola, nefes egzersizi, rapor ve PDF, hekime mesaj, veri içe aktarma, takvim…', 'Explain anything in the app step by step and open it for you: complaints, check-ins, My records, the reaction test, the Cupola, breathing, the report and PDF, messages to the flight surgeon, data import, the calendar…'),
        c.L('Verilerini cevaplamak: "12 Kasım\'daki kan tahlilim", "dünkü nabzım", "bu haftaki uykum", "radyasyon dozum", "şikayetlerim", "check-in yaptım mı".', 'Answer from your data: "my blood test on 12 November", "my heart rate yesterday", "my sleep this week", "my radiation dose", "my complaints", "did I check in".'),
        c.L('Spor koçu olmak: bugünkü program, bir hareketin doğru formu, şikayete göre uyarlama.', 'Be your sport coach: today\'s program, good form for a move, adjusting to complaints.'),
        c.L('Dinlemek: stres, uyku, yalnızlık; gerektiğinde seni bir insana yönlendiririm.', 'Listen: stress, sleep, loneliness; when needed I point you to a person.'),
      ]),
      c.L('Tanı koymam; emin olmadığın bir durumda uçuş hekimine danış.', 'I do not diagnose; ask the flight surgeon when in doubt.'),
    ),
    EXAMPLES(c).map((e) => ask(e)),
  )
}

/** Hiçbir kural cevap bulamadığında: dürüst ol, ne sorulabileceğini göster */
export function fallbackReply(lang: Lang): AssistantReply {
  const en = lang === 'en'
  const L = (tr: string, e: string) => (en ? e : tr)
  return reply(
    lines(
      L('Bunu tam anlayamadım; uydurmak yerine söyleyeyim.', "I didn't quite get that, and I'd rather say so than guess."),
      L('Şunlardan birini mi demek istedin? Ya da "neler yapabilirsin" diye sor.', 'Did you mean one of these? Or ask "what can you do".'),
    ),
    [ask(L('Neler yapabilirsin?', 'What can you do?')), ask(L('Şikayet oluşturmak istiyorum', 'I want to create a complaint')), ask(L('Son kan tahlilim', 'My latest blood test')), ask(L('Genel durumum nasıl?', 'How am I doing overall?'))],
  )
}

/* ---------- Giriş noktası ---------- */

/**
 * Sorunun site içi yönlendirme ya da veri sorusu olup olmadığına bakar; öyleyse cevabı döndürür, değilse null.
 * Kriz ve hologramdan gelen sorular bu fonksiyondan önce mevcut kurallarla ele alınır.
 */
export async function routeQuestion(question: string, ctx: RouterContext): Promise<AssistantReply | null> {
  const q = fold(question)
  const en = ctx.lang === 'en'
  const c: Ctx = { ...ctx, q, raw: question, en, L: (tr, e) => (en ? e : tr) }

  // Yardım
  if (/(neler yapabilirsin|ne yapabilirsin|ne ise yararsin|nasil yardimci olabilirsin|neler sorabilirim|ne sorabilirim|komutlar|what can you do|how can you help|what can i ask|what do you do)/.test(q) || /^(yardim|help)$/.test(q)) return helpReply(c)

  // İlk yardım ve acil belirtiler: mevcut kurallara bırakılır (yönlendirme değil, hemen ne yapılacağı)
  if (/(kaniyor|kanama|kesik|kestim|\byara|yandi|yanik|bayil|nefes alamiyorum|gogus agri|bleed|cut myself|wound|\bburn|faint|can t breathe|chest pain)/.test(q)) return null

  // Kan tahlili (kanama ilk yardımından önce: "kan tahlilim" kanama değildir)
  if (LAB_WORDS.test(q) || (ANALYTE_WORDS.some(([k, re]) => k !== 'ALT' && k !== 'AST' && k !== 'GLUCOSE' && k !== 'CREATININE' && re.test(q)) && !/(nabiz|tansiyon)/.test(q))) return labsReply(c)

  // Şikayet: güncelleme ve oluşturma rehberi; "şikayetlerim" listesi
  const guide = (id: string) => GUIDES.find((g) => g.id === id)!
  const complaintWord = /(sikayet|rahatsizlik|complaint|discomfort)/.test(q)
  if (complaintWord) {
    if (guide('complaint-update').also!.test(q) && !CREATE.test(q.replace(/gecti|guncelle/g, ''))) return guide('complaint-update').answer(c)
    if (/(sikayetlerim|sikayetim|sikayetlerimi|kac sikayet|aktif sikayet|son sikayet|my complaints|my complaint|active complaint|list)/.test(q) && !/(olustur|ekle|nasil|create|add|how)/.test(q)) return complaintsReply(c)
    return guide('complaint-create').answer(c)
  }

  // Check-in durumu ("yaptım mı", "durum", "kaç") ya da nasıl yapılır
  if (/(check[ -]?in|cekin|chekin)/.test(q)) {
    if (/(yaptim mi|yapmis miyim|durum|ne zaman|kac|bugunku|status|did i|have i|when)/.test(q)) return checkinStatusReply(c)
    return guide('checkin').answer(c)
  }

  // Bugünkü program
  if (/(programim|bugunku program|antrenman program|egzersiz program|bugun ne calis|bugun hangi hareket|today s program|my program|my workout|what should i train|workout plan)/.test(q)) return programReply(c)

  // Genel durum
  if (/(genel durum|nasil gidiyor|sagligim nasil|saglik durumum|durumum nasil|how am i|my health|overall|how is my health|health status)/.test(q)) return statusReply(c)

  // Görev günü ve iletişim gecikmesi
  if (/(kacinci gun|gorev gunu|gorevin kacinci|mission day|which day)/.test(q) && c.snapshot) {
    return reply(c.L(`Bugün ${resolveName(MISSION.name, c.lang)} görevinin ${c.snapshot.missionDay}. günü (görev ${MISSION.durationDays} gün sürer).`, `Today is day ${c.snapshot.missionDay} of the ${resolveName(MISSION.name, c.lang)} mission (${MISSION.durationDays} days in all).`))
  }
  if (/(gecikme|ne zaman ulas|mesaj ne zaman|delay|how long .* message|latency)/.test(q) && c.snapshot) {
    const s = c.snapshot
    return reply(
      s.comm.blackout
        ? c.L('İletişim şu an kesik: mesajların kuyrukta bekler, bağlantı gelince iletilir.', 'Communication is down: your messages wait in a queue and go out when the link returns.')
        : c.L(`Dünya ile tek yönlü iletişim gecikmesi şu an yaklaşık ${delayText(s.comm.delayMs, c.locale)}. Gönderdiğin mesaj ve rapor bu kadar sonra ulaşır.`, `The one-way delay to Earth is about ${delayText(s.comm.delayMs, c.locale)} right now. Messages and reports arrive that much later.`),
      [run(c.L('Mesajları aç', 'Open messages'), { type: 'openMessages' })],
      'general',
      src('podcastDistance'),
    )
  }

  // Kemik kaybı
  if (/(kemik kayb|bone loss|kemiklerim)/.test(q) && c.snapshot) {
    const b = c.snapshot.bone
    return reply(
      lines(
        c.L(`Tahmini kemik kaybın %${num(b.estimatedLossPct, c.lang, 1)}; egzersiz yapmasaydın yaklaşık %${num(b.withoutExercisePct, c.lang, 1)} olurdu. Son 14 gün programa uyumun %${Math.round(b.adherence * 100)}.`, `Your estimated bone loss is ${num(b.estimatedLossPct, c.lang, 1)}%; without exercise it would be about ${num(b.withoutExercisePct, c.lang, 1)}%. Your program adherence over the last 14 days is ${Math.round(b.adherence * 100)}%.`),
        c.L('Uzayda yük taşıyan kemikler egzersizsiz ayda %1–1,5 mineral kaybedebilir; düzenli direnç egzersizi bu kaybı büyük ölçüde yavaşlatır ama tamamen durdurmaz.', 'Without exercise, weight-bearing bones can lose 1–1.5% of their mineral a month in space; regular resistance exercise slows this a lot but does not stop it completely.'),
      ),
      [run(c.L('Spor sayfasını aç', 'Open the sport page'), { type: 'page', page: 2 })],
      'coach',
      src('tb033', 'boneFracture'),
    )
  }

  // Gösterge değeri ("dünkü nabzım", "tansiyonum kaç", "bu haftaki uykum")
  const id = indicatorIn(q, question)
  // Kayıt, grafik, iyileştirme ve yakınma soruları değer sorusu değildir; başka kurallara gider
  const notValue = /(ekle|\bgir\b|girer|giril|kaydet|grafik|nasil olcul|iyilestir|daha iyi|artir|azalt|ipucu|amiyorum|emiyorum|yapamiyorum|sorun|problem|\badd\b|enter|\blog\b|record|chart|better|improve|tips|can t|cannot)/.test(q)
  if (id && !ADVICE.test(q) && !notValue) {
    const when = parseDate(question, c.snapshot?.now ?? Date.now())
    const valueCue = /(kac|ne kadar|nedir|nasil|degeri|degerim|ortalama|en yuksek|en dusuk|olcum|goster|gor|yuksek mi|dusuk mu|normal mi|what|how|show|value|level|average|highest|lowest|is it|my)/.test(q)
    const possessive = /(nabzim|tansiyonum|uykum|sekerim|atesim|dozum|oksijenim|sicakligim|solunumum|ruh halim|suyum|\bmy\b)/.test(q)
    if (when || valueCue || possessive) return indicatorReply(c, id, when)
  }

  // Hareketin nasıl yapıldığı
  const ex = EXERCISE_WORDS.find(([, re]) => re.test(q))?.[0]
  if (ex && /(nasil|form|goster|dogru|how|show|technique|teknik)/.test(q)) return exerciseReply(c, ex)

  // Site içi yönlendirmeler
  for (const g of GUIDES) {
    if (g.id === 'complaint-update' || g.id === 'complaint-create' || g.id === 'checkin') continue
    if (g.match.test(q) && (!g.also || g.also.test(q))) return g.answer(c)
  }
  return null
}
