import { INDICATORS } from '../core/catalog'
import { bodyPart, ENV_PLANS, EXERCISES, programMinutes, type ProgramDoc } from '../core/coach'
import type { AssistantMode, ComplaintDoc, RegionId, Side, Snapshot, Symptom } from '../core/model'
import { num } from '../core/tx'
import type { Lang } from '../i18n'
import { SOURCES, sourceShort, type SourceId } from '../core/sources'
import type { AppCommand } from './appCommands'
import { offlineAnswer, offlineSources, type AnswerSource, type AssistantContext } from './assistant'

/*
 * Tek asistan, birden çok rol. Asistan bütün sisteme hakimdir: sağlık verisini, şikayetleri, günün spor programını ve
 * ruh halini bilir. Rolü sorunun konusu ve açık olan sayfa belirler (ya da kullanıcı seçer):
 * - Spor koçu: program, egzersiz, şikayete göre uyarlama, dünkü şikayetin takibi
 * - Psikolog: stres, kaygı, yalnızlık, uyku; nefes egzersizi, günlük ve insan desteğine yönlendirme (kriz hep önce)
 * - Arkadaş: gündelik sohbet
 * - Sağlık: yaşamsal değerler ve genel durum
 *
 * Şu an çevrimdışı ve kural tabanlıdır. Dil modeli bağlandığında buildPrompt() ile aynı bağlam modele gönderilir;
 * eylem düğmeleri (şikayeti kaydet, programı ayarla, nefes egzersizini aç) aynı kalır.
 */

export type ActionKind = 'saveComplaint' | 'checkin' | 'goPage' | 'addWater' | 'ask' | 'run'

export interface AssistantAction {
  kind: ActionKind
  label: string
  /** saveComplaint: şikayet; checkin: cevap ve şikayet kimliği; goPage: sayfa; ask: sorulacak metin */
  complaint?: Pick<ComplaintDoc, 'region' | 'side' | 'symptom' | 'severity' | 'note'>
  answer?: 'same' | 'better' | 'gone'
  complaintId?: string
  page?: number
  question?: string
  /** run: sitede bir şeyi doğrudan açan komut (lib/appCommands) */
  command?: AppCommand
}

export interface AssistantReply {
  text: string
  mode: AssistantMode
  actions: AssistantAction[]
  /** Bilgi veren cevaplarda dayanılan kaynaklar (P-04); gündelik sohbette boş */
  sources?: AnswerSource[]
}

export interface RichContext extends AssistantContext {
  name?: string
  program?: ProgramDoc | null
  complaints?: ComplaintDoc[]
  checkin?: ComplaintDoc | null
  /** Kullanıcının seçtiği rol; 'auto' ise konuya ve sayfaya göre */
  forcedMode?: AssistantMode | 'auto'
}

const lines = (...l: (string | false | null | undefined)[]) => l.filter((x) => x !== false && x !== null && x !== undefined).join('\n')

/* ---------- Metinden şikayet çıkarma ---------- */

const REGION_WORDS: [RegionId, RegExp][] = [
  ['onKol', /(ön ?kol|bile[kğ]|forearm|wrist)/],
  ['eller', /((^|\s)el(im|imi|imde|in|ler|lerim)?\b|parma[kğ]|hand|finger|palm|avuç)/],
  ['ustKol', /(omuz|omz|üst ?kol|pazı|dirse[kğ]|shoulder|upper arm|biceps|triceps|elbow|\bkol(um|umda|un)?\b|\barm\b)/],
  ['ayaklar', /(aya[kğ]|topu[kğ]|foot|feet|ankle|heel|toe)/],
  ['bacaklar', /(baca[kğ]|diz|uyluk|baldır|kalça|leg|knee|thigh|calf|hip|hamstring)/],
  ['sirt', /(sırt|\bbel(im|imde|in)?\b|omurga|back|spine|lower back)/],
  ['gogus', /(göğüs|göğs|kaburga|chest|rib)/],
  ['bas', /(baş(ım)?|kafa|boyun|boyn|ense|head|neck|migren|migraine)/],
]

const SYMPTOM_WORDS: [Symptom, RegExp][] = [
  ['cramp', /(kramp|cramp)/],
  ['numb', /(uyuş|karınca|numb|tingl)/],
  ['tight', /(gergin|tutul|kasıl|tight|stiff)/],
  ['weak', /(güçsüz|halsiz kol|zayıf|weak)/],
  ['pain', /(ağrı|acı|sızl|incin|burk|hurt|pain|ache|sore|injur|sprain)/],
]

export function parseComplaint(text: string, lang: Lang): Pick<ComplaintDoc, 'region' | 'side' | 'symptom' | 'severity' | 'note'> | null {
  const q = text.toLocaleLowerCase(lang === 'en' ? 'en-US' : 'tr-TR')
  const symptom = SYMPTOM_WORDS.find(([, re]) => re.test(q))?.[0]
  if (!symptom) return null
  const region = REGION_WORDS.find(([, re]) => re.test(q))?.[0]
  if (!region) return null
  const side: Side = /(sağ|right)/.test(q) ? 'right' : /(sol|left)/.test(q) ? 'left' : 'both'
  const m = q.match(/(\d{1,2})\s*\/\s*10/) ?? q.match(/(\d{1,2})\s*(puan|üzerinden|out of)/)
  const severity = m ? Math.min(10, Math.max(0, Number(m[1]))) : /(çok|şiddetli|dayanılmaz|severe|really bad|a lot)/.test(q) ? 7 : /(hafif|biraz|mild|a bit|slight)/.test(q) ? 3 : 5
  return { region, side, symptom, severity, note: text.slice(0, 300) }
}

/* ---------- Rol seçimi ---------- */

function detectMode(q: string, ctx: RichContext): AssistantMode {
  if (ctx.forcedMode && ctx.forcedMode !== 'auto') return ctx.forcedMode
  const has = (re: RegExp) => re.test(q)
  if (has(/(program|antrenman|egzersiz|spor|koşu|bisiklet|ared|squat|deadlift|workout|exercise|training|run|cycle|coach|koç)/)) return 'coach'
  if (has(/(stres|kaygı|endişe|yalnız|üzgün|mutsuz|bunal|moral|ağla|korku|panik|özledim|psikolo|stress|anxious|anxiety|lonely|sad|depress|panic|homesick|therap)/)) return 'psych'
  if (has(/(nabız|tansiyon|oksijen|ateş|şeker|uyku|su |radyasyon|durumum|sağlığım|heart|pressure|oxygen|fever|sugar|sleep|water|radiation|how am i|my health)/)) return 'medical'
  if (has(/(merhaba|selam|naber|nasılsın|canım sıkıl|sıkıldım|şaka|fıkra|konuşalım|hello|hi\b|hey|how are you|bored|joke|chat)/)) return 'friend'
  if (ctx.page === 2) return 'coach'
  if (ctx.page === 1) return 'psych'
  return 'general'
}

/* ---------- Cevaplar ---------- */

function programSummary(p: ProgramDoc, lang: Lang): string {
  const en = lang === 'en'
  const items = p.items.map((it, i) => {
    const ex = EXERCISES[it.exercise]
    const dose = it.sets && it.reps ? `${it.sets}×${it.reps}` : it.sets ? `${it.sets} ${en ? 'sets' : 'set'}` : ''
    const done = it.done ? (en ? ' ✓' : ' ✓') : ''
    const note = it.note ? ` — ${it.note[lang]}` : ''
    return `${i + 1}. ${ex.name[lang]}${dose ? ` ${dose}` : ''} (${it.minutes} ${en ? 'min' : 'dk'})${done}${note}`
  })
  return items.join('\n')
}

function coachReply(q: string, ctx: RichContext, lang: Lang): AssistantReply {
  const en = lang === 'en'
  const p = ctx.program
  const actions: AssistantAction[] = []
  // Dünden kalan şikayet önce sorulur
  if (ctx.checkin) {
    const c = ctx.checkin
    const part = bodyPart(c.region, c.side)[lang]
    actions.push(
      { kind: 'checkin', label: en ? 'Still there' : 'Hâlâ var', answer: 'same', complaintId: c.id },
      { kind: 'checkin', label: en ? 'Better' : 'Azaldı', answer: 'better', complaintId: c.id },
      { kind: 'checkin', label: en ? 'Gone' : 'Geçti', answer: 'gone', complaintId: c.id },
    )
    return {
      mode: 'coach',
      actions,
      text: en
        ? lines(`Before we plan today: yesterday you reported ${symptomWord(c.symptom, lang)} in your ${part} (${c.severity}/10). Is it still there?`, '', 'I will set up today\'s program based on your answer.')
        : lines(`Bugünü planlamadan önce: dün ${part} bölgende ${symptomWord(c.symptom, lang)} bildirmiştin (${c.severity}/10). Hâlâ sürüyor mu?`, '', 'Bugünkü programı cevabına göre kuracağım.'),
    }
  }
  if (/(kısa|vaktim az|az zaman|short|quick|no time|30 ?dk|30 ?min)/.test(q)) {
    return {
      mode: 'coach',
      actions: [{ kind: 'goPage', label: en ? 'Open the sport page' : 'Spor sayfasını aç', page: 2 }],
      text: en
        ? lines('Here is a 30-minute version that still protects your bones and heart:', '', '1. Warm-up (5 min)', '2. ARED squat 2×8 (8 min)', '3. ARED heel raise 2×12 (5 min)', '4. CEVIS cycle (12 min)', '', 'Even a short session is far better than none. Tomorrow we go back to the full program.')
        : lines('Kemiklerini ve kalbini yine koruyan 30 dakikalık bir sürüm:', '', '1. Isınma (5 dk)', '2. ARED squat 2×8 (8 dk)', '3. ARED topuk kaldırma 2×12 (5 dk)', '4. CEVIS bisiklet (12 dk)', '', 'Kısa bir seans bile hiç yapmamaktan çok daha iyi. Yarın tam programa döneriz.'),
    }
  }
  if (!p) return { mode: 'coach', actions, text: en ? 'Your program is being prepared.' : 'Programın hazırlanıyor.' }
  const total = programMinutes(p)
  const done = p.items.filter((i) => i.done).length
  const adapted = (ctx.complaints ?? []).filter((c) => p.adaptedFor.includes(c.id))
  actions.push({ kind: 'goPage', label: en ? 'Open the sport page' : 'Spor sayfasını aç', page: 2 })
  return {
    mode: 'coach',
    actions,
    text: en
      ? lines(
          `Today's program is ${total} minutes (${done}/${p.items.length} done):`,
          '',
          programSummary(p, lang),
          '',
          adapted.length ? `I adjusted it for your ${adapted.map((c) => bodyPart(c.region, c.side).en).join(' and ')}: moves that strain ${adapted.length > 1 ? 'those areas' : 'that area'} were lightened or replaced.` : 'You have no active complaints, so this is the full program.',
          p.skipped && 'Today was marked as skipped. Even 30 minutes on the CEVIS cycle helps.',
          '',
          'Press Show next to a move on the sport page and the hologram will demonstrate it.',
        )
      : lines(
          `Bugünkü programın ${total} dakika (${done}/${p.items.length} tamam):`,
          '',
          programSummary(p, lang),
          '',
          adapted.length ? `Programı ${adapted.map((c) => bodyPart(c.region, c.side).tr).join(' ve ')} için ayarladım: ${adapted.length > 1 ? 'bu bölgeleri' : 'bu bölgeyi'} yoran hareketler hafifletildi ya da değiştirildi.` : 'Etkin bir şikayetin yok, bu yüzden tam program uygulanıyor.',
          p.skipped && 'Bugün antrenman yapılmadı olarak işaretli. 30 dakika CEVIS bisiklet bile iyi gelir.',
          '',
          'Spor sayfasında bir hareketin yanındaki Göster düğmesine basarsan hologram hareketi gösterir.',
        ),
  }
}

function symptomWord(s: Symptom, lang: Lang) {
  const w: Record<Symptom, [string, string]> = {
    pain: ['ağrı', 'pain'],
    cramp: ['kramp', 'a cramp'],
    tight: ['gerginlik', 'tightness'],
    numb: ['uyuşma', 'numbness'],
    weak: ['güçsüzlük', 'weakness'],
    fracture: ['kırık şüphesi', 'a suspected fracture'],
    crack: ['çatlak şüphesi', 'a suspected crack'],
    impact: ['darbe', 'an impact'],
    swelling: ['şişlik', 'swelling'],
    other: ['rahatsızlık', 'discomfort'],
  }
  return w[s][lang === 'en' ? 1 : 0]
}

function complaintReply(c: NonNullable<ReturnType<typeof parseComplaint>>, ctx: RichContext, lang: Lang, canSave: boolean): AssistantReply {
  const en = lang === 'en'
  const part = bodyPart(c.region, c.side)[lang]
  const existing = (ctx.complaints ?? []).find((x) => x.status !== 'resolved' && x.region === c.region && (x.side === c.side || x.side === 'both' || c.side === 'both'))
  const actions: AssistantAction[] = canSave && !existing ? [{ kind: 'saveComplaint', label: en ? 'Save as a complaint and adjust my program' : 'Şikayet olarak kaydet, programımı ayarla', complaint: c }] : []
  if (!canSave) actions.length = 0
  const sev = c.severity >= 7
  return {
    mode: 'coach',
    actions,
    text: en
      ? lines(
          `I understand: ${symptomWord(c.symptom, lang)} in your ${part}${c.severity !== 5 ? ` (${c.severity}/10)` : ''}.`,
          '',
          existing ? 'This area is already in your complaint record, and today\'s program avoids straining it.' : 'If you save it as a complaint, I will remove or lighten moves that strain this area in today\'s workout, and I will check on it tomorrow.',
          '',
          '• Rest the area and avoid loaded movements for now',
          c.symptom === 'cramp' ? '• Stretch slowly and drink a glass of water' : '• A warm compress for 15 minutes may help',
          '',
          sev ? 'This sounds strong. Please tell the flight surgeon now, especially if there is swelling, numbness or you cannot move it.' : 'Tell the flight surgeon if it gets worse or does not ease within 48 hours.',
        )
      : lines(
          `Anladım: ${part} bölgende ${symptomWord(c.symptom, lang)}${c.severity !== 5 ? ` (${c.severity}/10)` : ''}.`,
          '',
          existing ? 'Bu bölge zaten şikayet kaydında ve bugünkü program onu yormayacak şekilde ayarlı.' : 'Şikayet olarak kaydedersen bugünkü antrenmanda bu bölgeyi yoran hareketleri çıkarır ya da hafifletirim; yarın da nasıl olduğunu sorarım.',
          '',
          '• Şimdilik bölgeyi dinlendir, yüklü hareketlerden kaçın',
          c.symptom === 'cramp' ? '• Yavaşça esnet ve bir bardak su iç' : '• 15 dakika ılık kompres iyi gelebilir',
          '',
          sev ? 'Bu güçlü bir ağrı gibi görünüyor. Özellikle şişlik, uyuşma ya da hareket ettirememe varsa uçuş hekimine şimdi haber ver.' : 'Kötüleşirse ya da 48 saatte geçmezse uçuş hekimine bildir.',
        ),
  }
}

function psychReply(q: string, ctx: RichContext, lang: Lang): AssistantReply {
  const en = lang === 'en'
  const sleep = ctx.snapshot?.indicators.sleep.value
  const actions: AssistantAction[] = [
    { kind: 'goPage', label: en ? 'Breathing exercise' : 'Nefes egzersizi', page: 1 },
    { kind: 'goPage', label: en ? 'Start a Cupola session' : 'Cupola seansı başlat', page: 1 },
  ]
  const lonely = /(yalnız|özledim|aile|lonely|homesick|miss)/.test(q)
  return {
    mode: 'psych',
    actions,
    text: en
      ? lines(
          lonely ? 'Missing home and people you love is one of the hardest parts of a long mission. It makes complete sense.' : 'Thank you for telling me. What you feel makes sense; months in a small, closed space are hard for anyone.',
          '',
          'A few things that often help:',
          '• Two minutes of slow breathing (in 4, out 6) calms the body first',
          '• Writing a few lines in your journal helps put feelings into words',
          lonely ? '• A family conference can be requested for the next communication window' : '• Ten minutes in the Cupola watching Earth is a favourite for many astronauts',
          sleep !== null && sleep !== undefined && sleep < 6 ? `• You slept ${num(sleep, lang, 1)} h last night; tiredness makes everything heavier` : null,
          '',
          'If this feeling has lasted for several days, a private conference with the flight psychologist is a good idea. I am here to keep talking if you like.',
        )
      : lines(
          lonely ? 'Evi ve sevdiklerini özlemek uzun görevlerin en zor yanlarından biri. Çok anlaşılır.' : 'Bunu benimle paylaştığın için teşekkür ederim. Hissettiğin şey çok anlaşılır; aylarca küçük, kapalı bir alanda olmak herkesi zorlar.',
          '',
          'Çoğu zaman şunlar iyi gelir:',
          '• İki dakika yavaş nefes (4 saniye al, 6 saniye ver) önce bedeni sakinleştirir',
          '• Günlüğüne birkaç satır yazmak duyguları kelimeye dökmeye yardım eder',
          lonely ? '• Bir sonraki iletişim penceresi için aile görüşmesi talep edebilirsin' : '• Cupola\'da on dakika Dünya\'yı izlemek birçok astronotun en sevdiği şey',
          sleep !== null && sleep !== undefined && sleep < 6 ? `• Dün gece ${num(sleep, lang, 1)} saat uyudun; yorgunluk her şeyi daha ağır hissettirir` : null,
          '',
          'Bu his birkaç gündür sürüyorsa uçuş psikoloğuyla özel bir görüşme iyi olur. İstersen konuşmaya devam edelim, dinliyorum.',
        ),
  }
}

function friendReply(q: string, ctx: RichContext, lang: Lang): AssistantReply {
  const en = lang === 'en'
  const name = ctx.name ? ctx.name.split(' ').pop() : ''
  if (/(şaka|fıkra|joke)/.test(q))
    return {
      mode: 'friend',
      actions: [],
      text: en ? 'Why did the astronaut break up with the Moon? It needed space. 🌙\n\nYour turn: what made you smile today?' : 'Astronot Ay\'dan neden ayrılmış? Biraz alana ihtiyacı varmış. 🌙\n\nSıra sende: bugün seni ne gülümsetti?',
    }
  if (/(sıkıl|bored)/.test(q))
    return {
      mode: 'friend',
      actions: [{ kind: 'goPage', label: en ? 'Open the Cupola' : 'Cupola\'yı aç', page: 1 }],
      text: en
        ? 'Boredom on a long mission is real. How about a Cupola pass over the Sahara, or writing tomorrow\'s small goal in your journal? I can also just chat.'
        : 'Uzun görevde sıkılmak çok normal. Sahra üzerinden bir Cupola geçişine ne dersin, ya da yarının küçük hedefini günlüğüne yazmaya? İstersen sadece sohbet de edebiliriz.',
    }
  const score = ctx.snapshot?.score
  return {
    mode: 'friend',
    actions: [],
    text: en
      ? `Hi${name ? ` ${name}` : ''}! I am doing well, thanks for asking. ${score !== undefined ? `Your health score today is ${score}. ` : ''}How are you feeling? I can be your coach, a listener or just a friend to chat with.`
      : `Selam${name ? ` ${name}` : ''}! İyiyim, sorduğun için teşekkürler. ${score !== undefined ? `Bugünkü sağlık puanın ${score}. ` : ''}Sen nasılsın? Koçun, seni dinleyen biri ya da sohbet edecek bir arkadaş olabilirim.`,
  }
}

function medicalReply(q: string, ctx: RichContext, lang: Lang): AssistantReply | null {
  const en = lang === 'en'
  const s = ctx.snapshot
  if (!s) return null
  if (/(durumum|sağlığım|nasıl görünüyor|how am i|my health|overall)/.test(q)) {
    const top = s.findings.slice(0, 3).map((f) => `• ${f.title[lang]}`)
    return {
      mode: 'medical',
      actions: [],
      text: en
        ? lines(`Your health score today is ${s.score}/100.`, '', top.length ? 'Things that need attention:' : 'Everything looks within range.', ...top, '', `Fitness for duty: ${s.fitness.state === 'fit' ? 'fit' : s.fitness.state === 'caution' ? 'caution' : 'not fit'} (${s.fitness.reason.en}).`)
        : lines(`Bugünkü sağlık puanın ${s.score}/100.`, '', top.length ? 'Dikkat isteyenler:' : 'Her şey aralığında görünüyor.', ...top, '', `Göreve uygunluk: ${s.fitness.state === 'fit' ? 'uygun' : s.fitness.state === 'caution' ? 'dikkat' : 'uygun değil'} (${s.fitness.reason.tr}).`),
    }
  }
  if (/(su |water|susa|thirst|hydrat)/.test(q + ' ')) {
    const w = s.water
    return {
      mode: 'medical',
      actions: [{ kind: 'addWater', label: en ? 'Log a glass (250 mL)' : 'Bir bardak ekle (250 mL)' }],
      text: en
        ? `You have had ${num(w.todayMl, lang)} mL today; NASA's standard is 2.5 L a day. Losing water equal to 2.5% of body weight already impairs focus and cuts physical performance by about a third.`
        : `Bugün ${num(w.todayMl, lang)} mL içtin; NASA standardı günde 2,5 L. Vücut ağırlığının %2,5'i kadar su kaybı bile dikkati bozar, fiziksel performansı üçte bir oranında düşürür.`,
    }
  }
  if (/(uyku|uyu|sleep|insomnia)/.test(q)) {
    const v = s.indicators.sleep.value
    return {
      mode: 'medical',
      actions: [{ kind: 'goPage', label: en ? 'Breathing exercise' : 'Nefes egzersizi', page: 1 }],
      text: en
        ? lines(v !== null ? `You slept ${num(v, lang, 1)} hours last night. NASA schedules 8.5 hours; the station average is about 6.1.` : '', '', '• Dim your sleep station and stop screens an hour before bed', '• Keep the same bedtime every day', '• Avoid caffeine in the afternoon', '', 'If poor sleep lasts more than three nights, tell the flight surgeon.')
        : lines(v !== null ? `Dün gece ${num(v, lang, 1)} saat uyudun. NASA 8,5 saat planlar; istasyon ortalaması yaklaşık 6,1 saat.` : '', '', '• Uyku kabinini karart, yatmadan bir saat önce ekranları kapat', '• Her gün aynı saatte yat', '• Öğleden sonra kafeini bırak', '', 'Kötü uyku üç geceden uzun sürerse uçuş hekimine bildir.'),
    }
  }
  for (const id of ['bp', 'glucose', 'spo2', 'temp', 'radiation'] as const) {
    const words: Record<typeof id, RegExp> = { bp: /(tansiyon|blood pressure)/, glucose: /(şeker|glucose|sugar)/, spo2: /(oksijen|oxygen|spo2)/, temp: /(ateş|ısı|sıcaklık|fever|temperature)/, radiation: /(radyasyon|radiation|doz)/ }
    if (!words[id].test(q)) continue
    const st = s.indicators[id]
    const ind = INDICATORS[id]
    const val = st.value === null ? '—' : st.value2 !== undefined ? `${st.value}/${st.value2}` : num(st.value, lang, ind.digits)
    return {
      mode: 'medical',
      actions: [],
      text: en
        ? lines(`Your ${ind.name.en.toLowerCase()} is ${val} ${ind.unit.en} — ${st.label.en.toLowerCase()}.`, `Reference: ${ind.range.en}.`, '', ind.space.en, id === 'radiation' ? `Total dose: ${num(s.dose.totalMsv, lang)} mSv of the 600 mSv career limit.` : null)
        : lines(`${ind.name.tr} şu an ${val} ${ind.unit.tr} — ${st.label.tr.toLocaleLowerCase('tr-TR')}.`, `Referans: ${ind.range.tr}.`, '', ind.space.tr, id === 'radiation' ? `Toplam doz: 600 mSv kariyer sınırının ${num(s.dose.totalMsv, lang)} mSv'si.` : null),
    }
  }
  return null
}

const srcOf = (ids: SourceId[]): AnswerSource[] => [...new Set(ids)].map((id) => ({ label: sourceShort(id), url: SOURCES[id].url }))

const MEDICAL_WORDS: [IndicatorWord, RegExp][] = [
  ['bp', /(tansiyon|blood pressure)/],
  ['glucose', /(şeker|glucose|sugar)/],
  ['spo2', /(oksijen|oxygen|spo2)/],
  ['temp', /(ateş|ısı|sıcaklık|fever|temperature)/],
  ['radiation', /(radyasyon|radiation|doz)/],
  ['hr', /(nabız|heart|pulse)/],
]
type IndicatorWord = 'bp' | 'glucose' | 'spo2' | 'temp' | 'radiation' | 'hr'

/** Sorunun cevabı, rolü, eylem düğmeleri ve dayandığı kaynaklar */
export function planAnswer(question: string, ctx: RichContext, canSave: boolean): AssistantReply {
  const reply = planCore(question, ctx, canSave)
  if (reply.sources) return reply
  const q = question.toLocaleLowerCase(ctx.lang === 'en' ? 'en-US' : 'tr-TR')
  const coach = ENV_PLANS[ctx.program?.environment ?? 'iss'].sources
  let sources: AnswerSource[]
  if (reply.mode === 'friend') sources = []
  else if (reply.mode === 'coach') sources = srcOf(/(sırt|bel|back)/.test(q) ? [...coach, 'tb033'] : coach)
  else if (reply.mode === 'psych') sources = /(kendime zarar|intihar|ölmek|dayanamıyorum|suicide|want to die|go on)/.test(q) ? offlineSources(question, ctx) : srcOf(/(uyku|uyu|sleep)/.test(q) ? ['tb016', 'sleepStudy'] : ['tb016'])
  else {
    // Sağlık: soru bir göstergeyle ilgiliyse göstergenin aralık kaynağı; değilse ilk yardım ve bölge cevaplarının kaynağı
    const hit = MEDICAL_WORDS.find(([, re]) => re.test(q))?.[0]
    if (/(uyku|uyu|sleep|insomnia)/.test(q)) sources = srcOf(['sleepStudy'])
    else if (hit && !ctx.structure && !/(kan |kanı|kesik|yara|bleed|cut|wound)/.test(q)) sources = srcOf(hit === 'radiation' ? ['tb020'] : [INDICATORS[hit].rangeSource])
    else sources = offlineSources(question, ctx)
  }
  return { ...reply, sources }
}

function planCore(question: string, ctx: RichContext, canSave: boolean): AssistantReply {
  const lang = ctx.lang
  const q = question.toLocaleLowerCase(lang === 'en' ? 'en-US' : 'tr-TR')
  // Kriz belirtileri ve hologramdan gelen sorular mevcut kurallarla (her zaman önce)
  const crisis = /(kendime zarar|intihar|ölmek istiyorum|dayanamıyorum|yaşamak istemiyorum|hurt myself|suicide|want to die|can't go on|cannot go on)/.test(q)
  if (crisis || ctx.structure) return { text: offlineAnswer(question, ctx), mode: crisis ? 'psych' : 'medical', actions: [] }

  const mode = detectMode(q, ctx)
  const complaint = parseComplaint(question, lang)
  if (complaint && !/(kanı|kesik|yara|bleed|cut|wound)/.test(q)) return complaintReply(complaint, ctx, lang, canSave)
  if (mode === 'coach') return coachReply(q, ctx, lang)
  if (mode === 'psych') return psychReply(q, ctx, lang)
  const medical = medicalReply(q, ctx, lang)
  if (medical) return medical
  if (mode === 'friend') return friendReply(q, ctx, lang)
  return { text: offlineAnswer(question, ctx), mode, actions: [] }
}

/**
 * Dil modeli bağlandığında kullanılacak sistem istemi: rol, sınırlar ve astronotun güncel bağlamı.
 * API anahtarı yalnızca sunucuda tutulur; bu metin sunucuya gönderilir.
 */
export function buildPrompt(ctx: RichContext, mode: AssistantMode): string {
  const s: Snapshot | null | undefined = ctx.snapshot
  const lang = ctx.lang
  const role = { coach: 'sport coach', psych: 'calm, supportive listener (not a psychologist)', friend: 'friendly companion', medical: 'health assistant', general: 'health assistant' }[mode]
  return [
    `You are Health Assistant, the single assistant of Health Atlas, an astronaut health console. Current role: ${role}. Answer in ${lang === 'en' ? 'English' : 'Turkish'}, briefly.`,
    'Never diagnose. In a crisis, direct the person to the flight surgeon or flight psychologist immediately.',
    s ? `Health score ${s.score}/100. Findings: ${s.findings.map((f) => f.title.en).join('; ') || 'none'}.` : '',
    ctx.program ? `Today's program: ${ctx.program.items.map((i) => EXERCISES[i.exercise].name.en).join(', ')}.` : '',
    ctx.complaints?.length ? `Active complaints: ${ctx.complaints.filter((c) => c.status !== 'resolved').map((c) => `${c.symptom} ${bodyPart(c.region, c.side).en} ${c.severity}/10`).join('; ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n')
}
