import { analyze, boneEstimate, fitnessFor, scoreFor, type AnalysisInput } from './analysis'
import { CAREER_LIMIT_MSV, INDICATORS, INDICATOR_IDS, evaluate, isValid, relativeStatus, type IndicatorId } from './catalog'
import {
  CHECKIN_CONFIG,
  checkinMetaId,
  checkinRecordId,
  deriveView,
  normalizeSubmission,
  submissionAllowed,
  validateCheckinConfig,
  windowAt,
  windowByKey,
  windowsForDate,
  type CheckinConfig,
  type CheckinDoc,
  type CheckinMetaDoc,
  type CheckinWindow,
  type CheckinWindowView,
} from './checkins'
import { addDays } from './zonedTime'
import { checkMindSession, type MindSessionDoc, type MindSessionInput } from './mindTraining'
import { BREATHING_FEEDBACK, checkBreathingSession, type BreathingFeedback, type BreathingSessionDoc, type BreathingSessionInput } from './breathingLog'
import { favoriteDocId, isFavoriteId, type GalleryFavoriteDoc } from './gallery'
import { ASSIST_NOTE_MAX, ASSIST_NOTES_MAX, ASSIST_TTL_MS, assistDocId, isRequestId, type AssistRequestDoc, type AssistTransport } from './crewAssist'
import {
  ATTACHMENT_CATEGORIES,
  checkDoctorRequest,
  checkRange,
  MEDICAL_CONTACTS,
  type AttachmentCategoryId,
  type AttachmentSnapshot,
  type DateRangeError,
  type DoctorRequest,
  type DoctorRequestError,
} from './doctorContact'
import { PERSONAL_IDS, PERSONAL_WINDOW_DAYS, personalNormal, profileOf, validProfilePatch, type PersonalId, type PersonalNormal, type Profile, type ProfileDoc, type ProfilePatch } from './personal'
import { ENV_PLANS, generateProgram, PROGRAM_ENVIRONMENT, pendingCheckin, programId, programMinutes, doneMinutes, type CheckinAnswer, type ProgramDoc } from './coach'
import { CREW, CREW_IDS, DAY, HOUR, MISSION, dayStart, missionDay, type CrewId, type Environment } from './crew'
import type {
  AlertLevel,
  ChatDoc,
  ComplaintDoc,
  ComplaintStatus,
  Finding,
  ImportDoc,
  IndicatorState,
  JournalDoc,
  MeasurementDoc,
  MessageDoc,
  MoodDoc,
  RegionId,
  ScenarioDoc,
  SeenDoc,
  Side,
  Snapshot,
  Symptom,
  TaskDoc,
  TaskDoneDoc,
  WaterDoc,
} from './model'
import { SCENARIO_BY_ID, type ScenarioId } from './scenarios'
import { asleepAt, cumulativeDose, exercisingAt, liveValue, simDaily, simSeries, simWaterSoFar, waterFraction, type Point, type ScenarioEvent } from './sim'
import { COLLECTIONS, newId, type Store } from './store'
import { scheduleFor, tasksFor, type ScheduledCheck, type Task } from './tasks'
import { tx, type Tx } from './tx'

/*
 * Çekirdek motor: kayıtlar (Store) + simülatör + analiz + koç. Sunucuda SQLite ile, sunucuya ulaşılamazsa tarayıcıda
 * localStorage ile aynı şekilde çalışır. Bütün sayılar doğrudan veriden gelir (D-04).
 */

export interface CommState {
  environment: Environment
  blackoutUntil: number
}

interface CommMeta {
  id: string
  astronaut: string
  ts: number
  environment: Environment
  blackoutUntil: number
}

export interface CrewSummary {
  id: CrewId
  name: string
  role: Tx
  score: number
  overall: Snapshot['overall']
  topFinding: Finding | null
  findings: number
  complaints: number
  fitness: Snapshot['fitness']['state']
}

export interface SeriesResult {
  points: Point[]
  stats: { min: number; max: number; avg: number; count: number } | null
}

export interface TickResult {
  snapshot: Snapshot
  /** Bu çağrıda ilk kez görülen (ya da seviyesi değişen) uyarılar; arayüz bunlar için bildirim gösterir */
  fresh: Finding[]
  /** Başka bir mürettebat üyesinden gelen kritik uyarılar (D-06); arayüz bir kez gösterir */
  incoming: Finding[]
}

/** Tek yönlü iletişim gecikmesi. Orion Ay yolunda olduğu için Ay değeri kullanılır; Mars 3-22 dk arasında değişir, demo için 12 dk (ascend) */
export const COMM_DELAY_MS: Record<Environment, number> = { iss: 600, orion: 1300, moon: 1300, mars: 12 * 60_000 }

/**
 * Gecikmenin gerçekte değiştiği aralık. Mars'ta gezegenlerin konumuna göre tek yönde ~3 dk (en yakın) ile 22,5 dk (en uzak)
 * arasındadır (podcastDistance); ASCEND görev boyunca 0-22 dk verir. Arayüz 3-22 dk gösterir, mesajlar demo için 12 dk ile gider.
 */
export const COMM_DELAY_RANGE_MS: Partial<Record<Environment, [number, number]>> = { mars: [3 * 60_000, 22 * 60_000] }

const T = tx

export interface EngineOptions {
  /** Check-in pencereleri ve soruları (testlerde başka saat dilimiyle denenir) */
  checkinConfig?: CheckinConfig
  /** Motorun çalıştığı iletim: sunucu (bütün istemciler paylaşır) ya da tarayıcı (yalnızca bu tarayıcı; demo) */
  transport?: AssistTransport
}

export type AssistError = 'invalid' | 'storage' | 'notFound' | 'notRecipient'
export type AssistResult = { ok: true; request: AssistRequestDoc; duplicate?: boolean } | { ok: false; error: AssistError }

/** Check-in işlemlerinin hata kodları; arayüz bunları iki dilli metne çevirir */
export type CheckinError = 'unknownWindow' | 'notOpen' | 'expired' | 'invalid' | 'empty' | 'noteTooLong' | 'alreadySaved' | 'storage'
export type CheckinResult = { ok: true; view: CheckinWindowView } | { ok: false; error: CheckinError; view: CheckinWindowView | null }

export class Engine {
  readonly store: Store
  private clock: () => number
  readonly checkinConfig: CheckinConfig
  readonly transport: AssistTransport

  constructor(store: Store, clock: () => number = Date.now, options: EngineOptions = {}) {
    this.store = store
    this.clock = clock
    this.checkinConfig = options.checkinConfig ?? CHECKIN_CONFIG
    this.transport = options.transport ?? 'local'
    validateCheckinConfig(this.checkinConfig)
    this.ensureSeed()
  }

  now() {
    return this.clock()
  }

  /* ---------- İlk kayıtlar ---------- */

  /**
   * İlk açılışta (ve demo sıfırlanınca) mürettebatın daha önce bildirip geçmiş şikayetleri yazılır. Başlangıçta etkin
   * şikayet yoktur: bütün bölgeler normaldir; sorunlar demo menüsünden oluşturulur.
   */
  ensureSeed() {
    if (this.store.get('meta', 'seed')) return
    const now = this.now()
    const seed = (astronaut: CrewId, region: RegionId, side: Side, symptom: Symptom, severity: number, daysAgo: number, healedDaysAgo: number, muscles: Tx[] = []) =>
      this.store.put<ComplaintDoc>('complaints', {
        id: newId('c'),
        astronaut,
        ts: now - daysAgo * DAY,
        region,
        side,
        muscles,
        symptom,
        severity,
        note: '',
        status: 'resolved',
        updates: [{ ts: now - healedDaysAgo * DAY, severity: 0, status: 'resolved' }],
        origin: 'hologram',
      })
    // Uzaya uyum sürecinde sırt ağrısı mürettebatın %52'sinde görülür (tb033)
    seed('mori', 'sirt', 'both', 'pain', 4, 20, 14, [T('Erektör spina', 'Erector spinae')])
    seed('lindqvist', 'bas', 'both', 'pain', 2, 12, 10)
    this.store.put('meta', { id: 'seed', astronaut: '*', ts: now })
  }

  /* ---------- Okuma ---------- */

  private scenarioDocs(astronaut?: CrewId): ScenarioDoc[] {
    return this.store.list<ScenarioDoc>('scenarios', astronaut)
  }

  /** Simülatörün kullandığı olaylar: astronotun kendi senaryoları + istasyon genelini etkileyen senaryolar (CO₂) */
  private events(astronaut: CrewId): ScenarioEvent[] {
    return this.scenarioDocs()
      .filter((s) => s.astronaut === astronaut || s.scenario === 'co2High')
      .map((s) => ({ id: s.id, astronaut: s.astronaut as CrewId, scenario: s.scenario, ts: s.ts }))
  }

  private manualPoints(astronaut: CrewId, id: IndicatorId, from = -Infinity, to = Infinity): Point[] {
    return this.store
      .list<MeasurementDoc>('measurements', astronaut)
      .filter((m) => m.indicator === id && m.ts >= from && m.ts <= to)
      .map((m) => ({ t: m.ts, v: m.v, v2: m.v2, source: m.source }))
  }

  /**
   * Bir göstergenin serisi. İçe aktarılan veri, kapsadığı zaman aralığında simülasyonun yerine geçer;
   * elle girilen ve demo ölçümleri simülasyonla birlikte görünür (günlük göstergelerde o günün simüle değerinin yerine geçer).
   */
  series(astronaut: CrewId, id: IndicatorId, from: number, to: number): SeriesResult {
    const now = this.now()
    const events = this.events(astronaut)
    let sim = id === 'mood' || id === 'exercise' || id === 'water' ? this.dailyHistory(astronaut, id, from, Math.min(to, now)) : simSeries(id, astronaut, from, to, events, now)
    const manual = this.manualPoints(astronaut, id, from, to)
    const imported = manual.filter((p) => p.source.startsWith('import:'))
    if (imported.length) {
      const lo = Math.min(...imported.map((p) => p.t))
      const hi = Math.max(...imported.map((p) => p.t))
      sim = sim.filter((p) => p.t < lo || p.t > hi)
    }
    const daily = INDICATORS[id].cadence === 'daily' || INDICATORS[id].cadence === 'weekly'
    if (daily) {
      const days = new Set(manual.map((p) => dayStart(p.t)))
      sim = sim.filter((p) => !days.has(dayStart(p.t)))
    }
    const points = [...sim, ...manual].sort((a, b) => a.t - b.t)
    if (!points.length) return { points, stats: null }
    let min = Infinity
    let max = -Infinity
    let sum = 0
    for (const p of points) {
      min = Math.min(min, p.v)
      max = Math.max(max, p.v)
      sum += p.v
    }
    return { points, stats: { min, max, avg: sum / points.length, count: points.length } }
  }

  /** Su, egzersiz ve ruh halinin günlük geçmişi: geçmiş günler simülasyondan, bugün gerçek kayıtlardan */
  private dailyHistory(astronaut: CrewId, id: 'mood' | 'exercise' | 'water', from: number, to: number): Point[] {
    const now = this.now()
    const events = this.events(astronaut)
    const out: Point[] = []
    const today = dayStart(now)
    for (let d = dayStart(Math.max(from, MISSION.start)); d <= to; d += DAY) {
      if (d === today) {
        // Bugünün ruh hali yalnızca astronot kaydettiyse vardır (elle girilen kayıtlar seriye ayrıca eklenir)
        if (id === 'exercise') out.push({ t: now, v: this.exerciseToday(astronaut), source: 'manual' })
        if (id === 'water') out.push({ t: now, v: this.waterToday(astronaut), source: 'manual' })
        continue
      }
      const day = missionDay(d + 12 * HOUR)
      const program = this.store.get<ProgramDoc>('programs', programId(astronaut, day))
      const v = id === 'exercise' && program ? doneMinutes(program) : simDaily(id, astronaut, day, events, now)
      if (v !== null) out.push({ t: d + (id === 'mood' ? 20 : id === 'water' ? 22 : 21.5) * HOUR, v, source: program && id === 'exercise' ? 'manual' : 'sim' })
    }
    return out
  }

  /** Bir göstergenin en son değeri */
  latest(astronaut: CrewId, id: IndicatorId): Point | null {
    const now = this.now()
    const events = this.events(astronaut)
    const manual = this.manualPoints(astronaut, id, now - 7 * DAY, now)
    const lastManual = manual[manual.length - 1] ?? null
    const cad = INDICATORS[id].cadence
    if (cad === 'live' || cad === 'hourly') {
      // Elle girilen değer 30 dakika boyunca canlı değerin yerine geçer
      if (lastManual && now - lastManual.t < 30 * 60_000) return lastManual
      return liveValue(id, astronaut, now, events)
    }
    if (id === 'water') return { t: now, v: this.waterToday(astronaut), source: 'manual' }
    if (id === 'exercise') return { t: now, v: this.exerciseToday(astronaut), source: 'manual' }
    const { points } = this.series(astronaut, id, now - 10 * DAY, now)
    return points[points.length - 1] ?? null
  }

  waterToday(astronaut: CrewId): number {
    const now = this.now()
    const logs = this.store.list<WaterDoc>('water', astronaut).filter((w) => w.ts >= dayStart(now))
    return simWaterSoFar(astronaut, now, this.events(astronaut)) + logs.reduce((n, w) => n + w.ml, 0)
  }

  exerciseToday(astronaut: CrewId): number {
    const p = this.store.get<ProgramDoc>('programs', programId(astronaut, missionDay(this.now())))
    return p ? doneMinutes(p) : 0
  }

  private dailyValues(astronaut: CrewId, id: IndicatorId, days: number): number[] {
    const now = this.now()
    const events = this.events(astronaut)
    const today = missionDay(now)
    const out: number[] = []
    for (let d = today - days + 1; d <= today; d++) {
      const dayStartT = MISSION.start - (MISSION.start % DAY) + d * DAY
      const manual = this.manualPoints(astronaut, id, dayStartT, dayStartT + DAY - 1)
      if (manual.length) {
        out.push(manual.reduce((n, p) => n + p.v, 0) / manual.length)
        continue
      }
      // Bugünün değeri ölçüm saati geçmediyse yoktur
      if (d === today && id === 'mood') continue
      const v = simDaily(id, astronaut, d, events, now)
      if (v !== null) out.push(v)
    }
    return out
  }

  comm(): CommState {
    const meta = this.store.get<CommMeta>('meta', 'comm')
    return { environment: meta?.environment ?? MISSION.environment, blackoutUntil: meta?.blackoutUntil ?? 0 }
  }

  /** Ortam değişince iletişim gecikmesi değişir; spor programı her zaman istasyon programıdır (PROGRAM_ENVIRONMENT) */
  setEnvironment(environment: Environment) {
    const c = this.comm()
    this.store.put<CommMeta>('meta', { id: 'comm', astronaut: '*', ts: this.now(), environment, blackoutUntil: c.blackoutUntil })
  }

  snapshot(astronaut: CrewId): Snapshot {
    const now = this.now()
    const day = missionDay(now)
    const m = CREW[astronaut]
    const events = this.events(astronaut)
    const hour = ((now % DAY) + DAY) % DAY / HOUR

    const indicators = {} as Record<IndicatorId, IndicatorState>
    for (const id of INDICATOR_IDS) {
      const p = this.latest(astronaut, id)
      const base: IndicatorState = { id, value: p?.v ?? null, value2: p?.v2, t: p?.t ?? null, source: p?.source ?? null, status: 'normal', label: T('Veri yok', 'No data'), basis: INDICATORS[id].rangeSource }
      if (p) {
        const e = id === 'reaction' ? relativeStatus(p.v, m.baseline.reaction) : evaluate(id, p.v, p.v2)
        Object.assign(base, e)
      }
      const bl = m.baseline as unknown as Record<string, number>
      if (id === 'bp') {
        base.baseline = m.baseline.sys
        base.baseline2 = m.baseline.dia
      } else if (bl[id] !== undefined) base.baseline = bl[id]
      indicators[id] = base
    }

    /*
     * Nabız bağlama göre değerlendirilir: planlı antrenmanda yükselmesi, uykuda düşmesi beklenir; bu durumlar "dikkat" sayılmaz.
     * Kritik eşikler, elle girilen ölçümler ve nabzı değiştiren bir demo senaryosu sürerken kural olduğu gibi uygulanır.
     */
    const hr = indicators.hr
    const hrScenario = events.some((e) => SCENARIO_BY_ID[e.scenario].indicators.includes('hr') && now >= e.ts && now < e.ts + SCENARIO_BY_ID[e.scenario].durationMs)
    if (hr.value !== null && hr.status === 'dikkat' && !hrScenario && hr.source !== 'manual') {
      const at = hr.t ?? now
      if (hr.value >= 101 && exercisingAt(at)) Object.assign(hr, { status: 'normal', label: T('Antrenmanda', 'During exercise') })
      else if (hr.value < 50 && asleepAt(at)) Object.assign(hr, { status: 'normal', label: T('Uykuda', 'Asleep') })
    }

    const program = this.program(astronaut)
    const complaints = this.complaints(astronaut)
    const active = complaints.filter((c) => c.status !== 'resolved')
    const water = { todayMl: this.waterToday(astronaut), targetMl: INDICATORS.water.target!, expectedMl: INDICATORS.water.target! * waterFraction(hour) }
    // Su ve egzersiz gün içinde birikir; durumları uyarılarla (analiz) belirlenir
    indicators.water.status = 'normal'
    indicators.water.label = T('Bugün', 'Today')
    indicators.exercise.status = 'normal'
    indicators.exercise.label = T('Bugün', 'Today')

    const radiationOverrides = this.manualPoints(astronaut, 'radiation').filter((p) => p.source.startsWith('import:'))
    const total = cumulativeDose(astronaut, now, events, radiationOverrides)
    const dose = { totalMsv: total, percent: (total / CAREER_LIMIT_MSV) * 100, todayMsv: indicators.radiation.value ?? 0 }

    const co2Pts = simSeries('co2', astronaut, now - 7 * DAY, now, events, now)
    const co2 = { latest: indicators.co2.value ?? 0, avg7: co2Pts.reduce((n, p) => n + p.v, 0) / Math.max(1, co2Pts.length) }

    const profile = this.profile(astronaut)
    const personal = this.personal(astronaut, profile)

    const exHistory = this.dailyValues(astronaut, 'exercise', 15).slice(0, -1)
    const adherence = exHistory.length ? exHistory.filter((v) => v >= 90).length / exHistory.length : 1
    const comm = this.comm()
    const blackout = comm.blackoutUntil > now

    const input: AnalysisInput = {
      astronaut,
      now,
      hour,
      indicators,
      sleepHistory: this.dailyValues(astronaut, 'sleep', 8),
      moodHistory: this.dailyValues(astronaut, 'mood', 5),
      exerciseYesterday: exHistory[exHistory.length - 1] ?? ENV_PLANS[PROGRAM_ENVIRONMENT].targetMin,
      exerciseTarget: ENV_PLANS[PROGRAM_ENVIRONMENT].targetMin,
      personal,
      exercising: exercisingAt(now),
      exerciseToday: program ? doneMinutes(program) : 0,
      plannedToday: program ? programMinutes(program) : 0,
      programSkipped: !!program?.skipped,
      water,
      co2,
      dose,
      complaints: active,
      scenarios: this.scenarioDocs(astronaut),
      adherence,
      missionDay: day,
      comm: { blackout },
    }
    const findings = analyze(input)
    const { score, parts, overall } = scoreFor(findings, active)
    return {
      astronaut,
      now,
      profile,
      personal,
      missionDay: day,
      indicators,
      findings,
      score,
      scoreParts: parts,
      overall,
      dose,
      water,
      exercise: {
        todayMin: input.exerciseToday,
        plannedMin: input.plannedToday,
        targetMin: input.exerciseTarget,
        doneItems: program ? program.items.filter((i) => i.done).length : 0,
        totalItems: program ? program.items.length : 0,
      },
      co2,
      fitness: fitnessFor(input),
      bone: boneEstimate(day, adherence),
      activeComplaints: active,
      comm: { blackout, delayMs: COMM_DELAY_MS[comm.environment], rangeMs: COMM_DELAY_RANGE_MS[comm.environment] },
    }
  }

  /**
   * Arayüzün düzenli çağrısı: anlık durum + yeni uyarılar. Kritik uyarılar uçuş hekimine bildirilir (D-01, D-06).
   * Aynı durum için tekrar bildirim yapılmaz; durum geçip yeniden oluşursa yeniden bildirilir (U-12).
   */
  /** takeInbox: astronotun kendisi bakıyorsa mürettebat uyarıları alınır ve gösterildi işaretlenir (hekim görünümünde değil) */
  tick(astronaut: CrewId, takeInbox = true): TickResult {
    const snapshot = this.snapshot(astronaut)
    const seen = this.store.list<SeenDoc>('seen', astronaut)
    const seenById = new Map(seen.map((s) => [s.id, s]))
    const fresh: Finding[] = []
    const current = new Set<string>()
    for (const fd of snapshot.findings) {
      const id = `${astronaut}:${fd.key}`
      current.add(id)
      const prev = seenById.get(id)
      if (prev && prev.level === fd.level) continue
      this.store.put<SeenDoc>('seen', { id, astronaut, ts: snapshot.now, level: fd.level })
      fresh.push(fd)
      if (fd.notifyDoctor && fd.level === 'kritik') this.notifyCritical(astronaut, fd)
    }
    for (const s of seen) if (!current.has(s.id)) this.store.remove('seen', s.id)
    return { snapshot, fresh, incoming: takeInbox ? this.takeIncoming(astronaut) : [] }
  }

  /**
   * D-06: kritik durumda en yakın birimlere bildirim. Gemideki mürettebat arkadaşları anında, yerdeki uçuş hekimi ortamın
   * iletişim gecikmesiyle (Mars'ta dakikalar) haber alır. Metin üçüncü kişiyle yazılır: kimin, ne olduğu.
   */
  private notifyCritical(astronaut: CrewId, fd: Finding) {
    const name = CREW[astronaut].name
    const i18n = { tr: `${name} — ${fd.title.tr}. ${fd.reason.tr}`, en: `${name} — ${fd.title.en}. ${fd.reason.en}` }
    const msg = this.sendMessage(astronaut, i18n.tr, 'alert', 'system')
    if (msg) this.store.put<MessageDoc>('messages', { ...msg, i18n })
    const now = this.now()
    for (const mate of CREW_IDS) {
      if (mate === astronaut) continue
      const crewText = { tr: `${fd.title.tr}. ${fd.reason.tr}`, en: `${fd.title.en}. ${fd.reason.en}` }
      this.store.put<MessageDoc>('messages', { id: newId('msg'), astronaut, ts: now, from: 'system', to: mate, text: crewText.tr, i18n: crewText, delayMs: 0, deliverAt: now, kind: 'alert' })
    }
  }

  /** Bu astronota gelen, henüz gösterilmemiş mürettebat uyarıları; gösterildi olarak işaretlenir */
  private takeIncoming(astronaut: CrewId): Finding[] {
    const now = this.now()
    const out: Finding[] = []
    for (const m of this.store.list<MessageDoc>('messages')) {
      if (m.to !== astronaut || m.kind !== 'alert' || m.ack || m.deliverAt > now) continue
      this.store.put<MessageDoc>('messages', { ...m, ack: true })
      out.push({
        key: `crew:${m.id}`,
        level: 'kritik',
        title: T(`Mürettebat uyarısı: ${CREW[m.astronaut as CrewId]?.name ?? ''}`, `Crew alert: ${CREW[m.astronaut as CrewId]?.name ?? ''}`),
        reason: m.i18n ?? { tr: m.text, en: m.text },
        action: T('Arkadaşının yanına git ve gerekiyorsa yardım et. Uçuş hekimine de bildirildi.', 'Go to your crewmate and help if needed. The flight surgeon has also been notified.'),
        sources: ['vitalis'],
        ts: m.ts,
        notifyDoctor: false,
        page: 0,
      })
    }
    return out
  }

  /** İçe aktarılan veri setleri (VM-10): Kaynaklar ekranında adı, kaynağı ve bağlantısıyla listelenir */
  imports(): ImportDoc[] {
    return this.store.list<ImportDoc>('imports').sort((a, b) => b.ts - a.ts)
  }

  /** Bir astronota gelen mürettebat uyarıları (gelen kutusu) */
  crewInbox(astronaut: CrewId): MessageDoc[] {
    return this.store
      .list<MessageDoc>('messages')
      .filter((m) => m.to === astronaut && m.kind === 'alert')
      .sort((a, b) => b.ts - a.ts)
  }

  crewOverview(): CrewSummary[] {
    return CREW_IDS.map((id) => {
      const s = this.snapshot(id)
      return {
        id,
        name: CREW[id].name,
        role: CREW[id].role,
        score: s.score,
        overall: s.overall,
        topFinding: s.findings[0] ?? null,
        findings: s.findings.length,
        complaints: s.activeComplaints.length,
        fitness: s.fitness.state,
      }
    })
  }

  /* ---------- Kişisel bilgiler ve kişisel normal (U-04, D-10) ---------- */

  profile(astronaut: CrewId): Profile {
    return profileOf(astronaut, this.store.get<ProfileDoc>('profiles', astronaut))
  }

  /** Yaş, boy ya da kilo değişince kaydedilir; kişisel normal bu andan sonraki verilerle yeniden öğrenilir */
  updateProfile(astronaut: CrewId, patch: ProfilePatch): { ok: boolean; error?: 'invalid'; profile: Profile } {
    const clean: ProfilePatch = {}
    if (patch.age !== undefined) clean.age = Math.round(patch.age)
    if (patch.heightCm !== undefined) clean.heightCm = Math.round(patch.heightCm)
    if (patch.weightKg !== undefined) clean.weightKg = Math.round(patch.weightKg * 10) / 10
    if (!validProfilePatch(clean)) return { ok: false, error: 'invalid', profile: this.profile(astronaut) }
    const cur = this.profile(astronaut)
    const next = { age: clean.age ?? cur.age, heightCm: clean.heightCm ?? cur.heightCm, weightKg: clean.weightKg ?? cur.weightKg }
    if (next.age === cur.age && next.heightCm === cur.heightCm && next.weightKg === cur.weightKg) return { ok: true, profile: cur }
    this.store.put<ProfileDoc>('profiles', { id: astronaut, astronaut, ts: this.now(), changedAt: this.now(), ...next })
    return { ok: true, profile: this.profile(astronaut) }
  }

  /** Kişisel normal: son 14 gün (profil değiştiyse o andan beri), son bir saat hariç */
  personal(astronaut: CrewId, profile = this.profile(astronaut)): Record<PersonalId, PersonalNormal> {
    const now = this.now()
    const to = now - HOUR
    const since = profile.changedAt
    const from = Math.max(now - PERSONAL_WINDOW_DAYS * DAY, since ?? -Infinity, MISSION.start)
    const out = {} as Record<PersonalId, PersonalNormal>
    for (const id of PERSONAL_IDS) {
      const pts = to > from ? this.series(astronaut, id, from, to).points : []
      out[id] = personalNormal(id, pts, CREW[astronaut].baseline[id], from, to, since)
    }
    return out
  }

  /* ---------- Ölçümler ---------- */

  addMeasurement(astronaut: CrewId, indicator: IndicatorId, v: number, v2?: number, source: MeasurementDoc['source'] = 'manual', ts?: number): { ok: boolean; error?: 'invalid' } {
    if (!isValid(indicator, v, v2)) return { ok: false, error: 'invalid' }
    this.store.put<MeasurementDoc>('measurements', { id: newId('m'), astronaut, ts: ts ?? this.now(), indicator, v, v2, source })
    return { ok: true }
  }

  addWater(astronaut: CrewId, ml: number) {
    if (!Number.isFinite(ml) || ml <= 0 || ml > 2000) return
    this.store.put<WaterDoc>('water', { id: newId('w'), astronaut, ts: this.now(), ml })
  }

  addMood(astronaut: CrewId, value: number, tags: string[] = []) {
    const v = Math.round(value)
    if (v < 1 || v > 5) return
    const now = this.now()
    this.store.put<MoodDoc>('moods', { id: newId('mo'), astronaut, ts: now, value: v, tags })
    this.store.put<MeasurementDoc>('measurements', { id: newId('m'), astronaut, ts: now, indicator: 'mood', v, source: 'manual' })
  }

  moods(astronaut: CrewId): MoodDoc[] {
    return this.store.list<MoodDoc>('moods', astronaut)
  }

  /* ---------- Şikayetler ---------- */

  complaints(astronaut: CrewId): ComplaintDoc[] {
    return this.store.list<ComplaintDoc>('complaints', astronaut).sort((a, b) => b.ts - a.ts)
  }

  addComplaint(astronaut: CrewId, c: Pick<ComplaintDoc, 'region' | 'side' | 'muscles' | 'bones' | 'symptom' | 'severity' | 'note' | 'origin'>): ComplaintDoc {
    const doc: ComplaintDoc = { ...c, severity: clampSeverity(c.severity), id: newId('c'), astronaut, ts: this.now(), status: 'active', updates: [] }
    this.store.put('complaints', doc)
    this.refreshProgram(astronaut)
    return doc
  }

  updateComplaint(astronaut: CrewId, id: string, patch: { severity?: number; status?: ComplaintStatus; note?: string }) {
    const c = this.store.get<ComplaintDoc>('complaints', id)
    if (!c || c.astronaut !== astronaut) return null
    const severity = patch.severity !== undefined ? clampSeverity(patch.severity) : c.severity
    const status = patch.status ?? c.status
    const next: ComplaintDoc = { ...c, severity, status, updates: [...c.updates, { ts: this.now(), severity, status, note: patch.note }] }
    this.store.put('complaints', next)
    this.refreshProgram(astronaut)
    return next
  }

  /* ---------- Spor koçu ---------- */

  /** Bugünün programı; yoksa şikayetlere göre üretilip kaydedilir */
  program(astronaut: CrewId, day = missionDay(this.now())): ProgramDoc {
    const id = programId(astronaut, day)
    const saved = this.store.get<ProgramDoc>('programs', id)
    const env = PROGRAM_ENVIRONMENT
    // Program her zaman istasyon programıdır; eski kayıt başka ortama göre kurulduysa (ya da ortamı yoksa istasyon sayılır) yeniden kurulur
    if (saved && (saved.environment ?? 'iss') === env) return saved
    if (saved) return this.refreshProgram(astronaut)
    const p = generateProgram(astronaut, day, this.complaints(astronaut), this.now(), env)
    this.store.put('programs', p)
    return p
  }

  /** Şikayet değişince bugünün programı yeniden üretilir; yapılmış hareketlerin işareti korunur */
  private refreshProgram(astronaut: CrewId): ProgramDoc {
    const day = missionDay(this.now())
    const old = this.store.get<ProgramDoc>('programs', programId(astronaut, day))
    const next = generateProgram(astronaut, day, this.complaints(astronaut), this.now(), PROGRAM_ENVIRONMENT)
    if (old) {
      for (const it of next.items) {
        const prev = old.items.find((o) => o.exercise === it.exercise && o.done)
        if (prev) Object.assign(it, { done: true, doneAt: prev.doneAt })
      }
      next.checkin = old.checkin
      next.skipped = old.skipped
    }
    this.store.put('programs', next)
    return next
  }

  setExerciseDone(astronaut: CrewId, index: number, done: boolean): ProgramDoc {
    const p = this.program(astronaut)
    const items = p.items.map((it, i) => (i === index ? { ...it, done, doneAt: done ? this.now() : undefined } : it))
    const next = { ...p, items, skipped: done ? false : p.skipped }
    this.store.put('programs', next)
    return next
  }

  /** Koçun bugün sorduğu şikayet (dünden kalan, çözülmemiş) */
  checkin(astronaut: CrewId): ComplaintDoc | null {
    const now = this.now()
    return pendingCheckin(this.complaints(astronaut), this.program(astronaut), dayStart(now))
  }

  answerCheckin(astronaut: CrewId, complaintId: string, answer: CheckinAnswer): ProgramDoc {
    const c = this.store.get<ComplaintDoc>('complaints', complaintId)
    if (c && c.astronaut === astronaut) {
      const severity = answer === 'gone' ? 0 : answer === 'better' ? Math.max(1, c.severity - 2) : c.severity
      const status: ComplaintStatus = answer === 'gone' ? 'resolved' : answer === 'better' ? 'improving' : 'active'
      this.store.put<ComplaintDoc>('complaints', { ...c, severity, status, updates: [...c.updates, { ts: this.now(), severity, status }] })
    }
    this.refreshProgram(astronaut)
    const p = this.program(astronaut)
    const next = { ...p, checkin: { complaintId, answer, ts: this.now() } }
    this.store.put('programs', next)
    return next
  }

  /* ---------- Yapılacaklar ---------- */

  tasks(astronaut: CrewId): Task[] {
    const now = this.now()
    const day = missionDay(now)
    const today = dayStart(now)
    const hour = (now - today) / HOUR
    const done: Record<string, boolean> = {}
    for (const d of this.store.list<TaskDoneDoc>('taskDone', astronaut)) {
      const [, dd, key] = d.id.split(':')
      if (Number(dd) === day) done[key] = d.done
    }
    const manualToday = (id: IndicatorId) => this.manualPoints(astronaut, id, today, now).some((p) => p.source === 'manual')
    return tasksFor({
      day,
      hour,
      water: { todayMl: this.waterToday(astronaut), targetMl: INDICATORS.water.target! },
      program: this.program(astronaut),
      measuredToday: manualToday('bp') && manualToday('glucose'),
      moodToday: manualToday('mood'),
      journalToday: this.store.list<JournalDoc>('journal', astronaut).some((j) => j.ts >= today),
      reactionToday: manualToday('reaction'),
      done,
      custom: this.store.list<TaskDoc>('tasks', astronaut).filter((t) => t.day === day),
    })
  }

  /**
   * Rutin kontrol takvimi (R-05): son 7 günün kontrolleri (yapıldı ya da gecikti) ve önümüzdeki 14 gün.
   * Tepki testi o gün girilen bir tepki ölçümüyle, kan örneği ve görüşme yapılacaklar listesindeki işaretle yapılmış sayılır.
   */
  schedule(astronaut: CrewId): ScheduledCheck[] {
    const now = this.now()
    const today = missionDay(now)
    const hour = (now - dayStart(now)) / HOUR
    const marks = new Map<string, boolean>()
    for (const d of this.store.list<TaskDoneDoc>('taskDone', astronaut)) {
      const [, dd, key] = d.id.split(':')
      marks.set(`${dd}:${key}`, d.done)
    }
    const startOf = (day: number) => MISSION.start - (MISSION.start % DAY) + day * DAY
    const reactionOn = (day: number) => this.manualPoints(astronaut, 'reaction', startOf(day), startOf(day) + DAY).some((p) => p.source === 'manual')
    return scheduleFor({
      today,
      back: 7,
      ahead: 14,
      isDone: (day, key) => marks.get(`${day}:${key}`) ?? (key === 'reaction' ? reactionOn(day) : key === 'conference' ? day < today || hour >= 19 : false),
      overdueToday: (key) => (key === 'reaction' ? hour >= 18 : key === 'blood' ? hour >= 12 : false),
    })
  }

  setTaskDone(astronaut: CrewId, key: string, value: boolean) {
    const day = missionDay(this.now())
    if (key.startsWith('custom:')) {
      const id = key.slice(7)
      const t = this.store.get<TaskDoc>('tasks', id)
      if (t && t.astronaut === astronaut) this.store.put('tasks', { ...t, done: value })
      return
    }
    this.store.put<TaskDoneDoc>('taskDone', { id: `${astronaut}:${day}:${key}`, astronaut, ts: this.now(), done: value })
  }

  addTask(astronaut: CrewId, title: string) {
    const clean = title.trim().slice(0, 120)
    if (!clean) return
    this.store.put<TaskDoc>('tasks', { id: newId('t'), astronaut, ts: this.now(), title: clean, day: missionDay(this.now()), done: false })
  }

  removeTask(astronaut: CrewId, id: string) {
    const t = this.store.get<TaskDoc>('tasks', id)
    if (t && t.astronaut === astronaut) this.store.remove('tasks', id)
  }

  /* ---------- Günlük ---------- */

  journal(astronaut: CrewId): JournalDoc[] {
    return this.store.list<JournalDoc>('journal', astronaut).sort((a, b) => b.ts - a.ts)
  }

  addJournal(astronaut: CrewId, text: string, mood?: number): JournalDoc | null {
    const clean = text.trim().slice(0, 4000)
    if (!clean) return null
    const doc: JournalDoc = { id: newId('j'), astronaut, ts: this.now(), text: clean, mood, private: true }
    this.store.put('journal', doc)
    return doc
  }

  removeJournal(astronaut: CrewId, id: string) {
    const j = this.store.get<JournalDoc>('journal', id)
    if (j && j.astronaut === astronaut) this.store.remove('journal', id)
  }

  /* ---------- İyi oluş check-in'leri (CI-01…CI-12) ---------- */

  private checkinRecord(astronaut: CrewId, w: CheckinWindow): CheckinDoc | null {
    const doc = this.store.get<CheckinDoc>('checkins', checkinRecordId(astronaut, w))
    return doc && doc.astronaut === astronaut ? doc : null
  }

  private checkinMeta(astronaut: CrewId, w: CheckinWindow): CheckinMetaDoc | null {
    const doc = this.store.get<CheckinMetaDoc>('checkinMeta', checkinMetaId(astronaut, w))
    return doc && doc.astronaut === astronaut ? doc : null
  }

  private checkinView(astronaut: CrewId, w: CheckinWindow): CheckinWindowView {
    return deriveView(w, this.checkinRecord(astronaut, w), this.checkinMeta(astronaut, w), this.now(), this.checkinConfig)
  }

  /** Sunum bilgisini günceller (otomatik soru, kapatma, formun açılması, taslak); sonucu değiştirmez */
  private patchCheckinMeta(astronaut: CrewId, w: CheckinWindow, patch: Partial<Pick<CheckinMetaDoc, 'promptedAt' | 'dismissedAt' | 'openedAt' | 'draft'>>) {
    const cur = this.checkinMeta(astronaut, w)
    const next: CheckinMetaDoc = { ...(cur ?? { id: checkinMetaId(astronaut, w), astronaut, date: w.date, window: w.window }), ...patch, ts: this.now() }
    if (patch.draft === undefined && 'draft' in patch) delete next.draft
    this.store.put<CheckinMetaDoc>('checkinMeta', next)
    // Sunum bilgisi (ör. "otomatik soru gösterildi") hemen kalıcı yazılır ki sayfa yenilenince soru tekrar açılmasın.
    // Yazılamazsa sonuç değişmez; bilgi bu oturumda geçerli kalır.
    try {
      this.store.flush?.()
    } catch {
      /* yoksay */
    }
  }

  /** Şu an açık olan pencere ve durumu */
  currentCheckin(astronaut: CrewId): CheckinWindowView {
    return this.checkinView(astronaut, windowAt(this.now(), this.checkinConfig))
  }

  /** Şu anki pencerenin ait olduğu görev gününün bütün pencereleri (açılmamış olanlar upcoming) */
  checkinDay(astronaut: CrewId): CheckinWindowView[] {
    const date = windowAt(this.now(), this.checkinConfig).date
    return windowsForDate(date, this.checkinConfig).map((w) => this.checkinView(astronaut, w))
  }

  /** Belirli bir pencerenin durumu */
  checkinWindow(astronaut: CrewId, key: string): CheckinWindowView | null {
    const w = windowByKey(key, this.checkinConfig)
    return w ? this.checkinView(astronaut, w) : null
  }

  /**
   * Check-in geçmişi (CI-11): son `days` görev tarihinin açılmış pencereleri, en yeni önce. Henüz açılmamış pencereler
   * listelenmez; kapanıp sonuçsuz kalanlar "expired" olarak türetilir.
   */
  wellbeingCheckins(astronaut: CrewId, days = 7): CheckinWindowView[] {
    const now = this.now()
    // Şu anki pencerenin görev tarihinden geriye: gece yarısından sonra açık olan akşam penceresi de bugüne sayılır
    const today = windowAt(now, this.checkinConfig).date
    const out: CheckinWindowView[] = []
    for (let i = 0; i < Math.min(60, Math.max(1, Math.round(days))); i++) {
      for (const w of windowsForDate(addDays(today, -i), this.checkinConfig)) if (w.opensAt <= now) out.push(this.checkinView(astronaut, w))
    }
    return out.sort((a, b) => b.opensAt - a.opensAt)
  }

  private acceptingWindow(astronaut: CrewId, key: string): { w: CheckinWindow } | { error: CheckinResult } {
    const w = windowByKey(key, this.checkinConfig)
    if (!w) return { error: { ok: false, error: 'unknownWindow', view: null } }
    const check = submissionAllowed(w, this.checkinMeta(astronaut, w), this.now(), this.checkinConfig)
    if (!check.ok) return { error: { ok: false, error: check.error, view: this.checkinView(astronaut, w) } }
    return { w }
  }

  /** Otomatik check-in sorusu gösterildi: aynı pencerede bir daha otomatik gösterilmez */
  markCheckinPrompted(astronaut: CrewId, key: string): CheckinResult {
    const r = this.acceptingWindow(astronaut, key)
    if ('error' in r) return r.error
    if (this.checkinMeta(astronaut, r.w)?.promptedAt === undefined) this.patchCheckinMeta(astronaut, r.w, { promptedAt: this.now() })
    return { ok: true, view: this.checkinView(astronaut, r.w) }
  }

  /** Form açıldı: pencere kapansa bile bu form süre içinde gönderilebilir (geç gönderim) */
  openCheckin(astronaut: CrewId, key: string): CheckinResult {
    const r = this.acceptingWindow(astronaut, key)
    if ('error' in r) return r.error
    if (this.checkinMeta(astronaut, r.w)?.openedAt === undefined) this.patchCheckinMeta(astronaut, r.w, { openedAt: this.now() })
    return { ok: true, view: this.checkinView(astronaut, r.w) }
  }

  /** Form kapat düğmesiyle kapatıldı (deferred): check-in hâlâ yapılabilir, sonuç değişmez */
  deferCheckin(astronaut: CrewId, key: string): CheckinResult {
    const r = this.acceptingWindow(astronaut, key)
    if ('error' in r) return r.error
    this.patchCheckinMeta(astronaut, r.w, { dismissedAt: this.now() })
    return { ok: true, view: this.checkinView(astronaut, r.w) }
  }

  /** Taslak: cevaplar ve not kesinleşmeden olduğu gibi saklanır; boş ya da sınırı aşan taslak serbesttir, kayıt sayılmaz */
  saveCheckinDraft(astronaut: CrewId, key: string, answers: unknown, note: unknown): CheckinResult {
    const r = this.acceptingWindow(astronaut, key)
    if ('error' in r) return r.error
    const n = normalizeSubmission(answers, note, this.checkinConfig, 'draft')
    if (!n.ok) return { ok: false, error: n.error, view: this.checkinView(astronaut, r.w) }
    this.patchCheckinMeta(astronaut, r.w, { draft: { answers: n.answers, note: n.note, updatedAt: this.now() } })
    return { ok: true, view: this.checkinView(astronaut, r.w) }
  }

  /**
   * Kesin sonucu kalıcı olarak yazar. Kalıcı yazma başarısız olursa önceki durum geri yüklenir ve check-in kesinleşmez
   * (taslak korunur, kullanıcı yeniden deneyebilir). Kimlik pencereye göre sabit olduğu için aynı kişi ve pencere için
   * ikinci bir kayıt oluşmaz.
   */
  private finalizeCheckin(astronaut: CrewId, w: CheckinWindow, doc: CheckinDoc, prev: CheckinDoc | null): CheckinResult {
    try {
      this.store.put<CheckinDoc>('checkins', doc)
      this.store.flush?.()
    } catch {
      try {
        if (prev) this.store.put<CheckinDoc>('checkins', prev)
        else this.store.remove('checkins', doc.id)
      } catch {
        /* Geri yükleme de yazılamazsa bellekteki durum zaten değişmemiş sayılır */
      }
      return { ok: false, error: 'storage', view: this.checkinView(astronaut, w) }
    }
    // Kayıt kesinleşti; taslak artık gerekmez (silinemezse de kayıt geçerlidir)
    try {
      if (this.checkinMeta(astronaut, w)?.draft) this.patchCheckinMeta(astronaut, w, { draft: undefined })
    } catch {
      /* yoksay */
    }
    return { ok: true, view: this.checkinView(astronaut, w) }
  }

  /** Check-in'i kaydeder (saved). En az bir cevap ya da boş olmayan bir not gerekir; boş gönderim kaydedilmez. */
  submitCheckin(astronaut: CrewId, key: string, answers: unknown, note: unknown): CheckinResult {
    const w = windowByKey(key, this.checkinConfig)
    if (!w) return { ok: false, error: 'unknownWindow', view: null }
    const now = this.now()
    const check = submissionAllowed(w, this.checkinMeta(astronaut, w), now, this.checkinConfig)
    if (!check.ok) return { ok: false, error: check.error, view: this.checkinView(astronaut, w) }
    const n = normalizeSubmission(answers, note, this.checkinConfig)
    if (!n.ok) return { ok: false, error: n.error, view: this.checkinView(astronaut, w) }
    const prev = this.checkinRecord(astronaut, w)
    const doc: CheckinDoc = {
      id: checkinRecordId(astronaut, w),
      astronaut,
      ts: now,
      date: w.date,
      window: w.window,
      outcome: 'saved',
      answers: n.answers,
      note: n.note,
      submittedAt: now,
      late: check.late,
      answered: n.answered,
      omitted: n.omitted,
      revision: (prev?.revision ?? 0) + 1,
    }
    return this.finalizeCheckin(astronaut, w, doc, prev)
  }

  /** Pencereyi bilerek atlar (skipped). Kaydedilmiş bir check-in atlanarak silinemez. */
  skipCheckin(astronaut: CrewId, key: string): CheckinResult {
    const w = windowByKey(key, this.checkinConfig)
    if (!w) return { ok: false, error: 'unknownWindow', view: null }
    const now = this.now()
    const check = submissionAllowed(w, this.checkinMeta(astronaut, w), now, this.checkinConfig)
    if (!check.ok) return { ok: false, error: check.error, view: this.checkinView(astronaut, w) }
    const prev = this.checkinRecord(astronaut, w)
    if (prev?.outcome === 'saved') return { ok: false, error: 'alreadySaved', view: this.checkinView(astronaut, w) }
    if (prev?.outcome === 'skipped') return { ok: true, view: this.checkinView(astronaut, w) }
    const answers = Object.fromEntries(this.checkinConfig.questions.map((q) => [q.id, null]))
    const doc: CheckinDoc = {
      id: checkinRecordId(astronaut, w),
      astronaut,
      ts: now,
      date: w.date,
      window: w.window,
      outcome: 'skipped',
      answers,
      note: '',
      submittedAt: now,
      late: check.late,
      answered: 0,
      omitted: this.checkinConfig.questions.map((q) => q.id),
      revision: 1,
    }
    return this.finalizeCheckin(astronaut, w, doc, null)
  }

  /* ---------- Nefes molası oturumları (BR-05, BR-06) ---------- */

  /** Oturumun üst bilgisini saklar (aynı kimlikle ikinci kayıt açılmaz); geri bildirim ayrı kaydedilir */
  saveBreathingSession(astronaut: CrewId, input: BreathingSessionInput): { ok: boolean; error?: 'invalid' | 'storage' } {
    if (!checkBreathingSession(input)) return { ok: false, error: 'invalid' }
    const prev = this.store.get<BreathingSessionDoc>('breathingSessions', input.id)
    if (prev) return prev.astronaut === astronaut ? { ok: true } : { ok: false, error: 'invalid' }
    const doc: BreathingSessionDoc = { ...input, astronaut, feedback: null }
    try {
      this.store.put<BreathingSessionDoc>('breathingSessions', doc)
      this.store.flush?.()
    } catch {
      try {
        this.store.remove('breathingSessions', doc.id)
      } catch {
        /* yoksay */
      }
      return { ok: false, error: 'storage' }
    }
    return { ok: true }
  }

  /** İsteğe bağlı geri bildirim; puan ya da başarı ölçüsü hesaplanmaz */
  setBreathingFeedback(astronaut: CrewId, id: string, feedback: BreathingFeedback | null): { ok: boolean; error?: 'invalid' | 'notFound' } {
    if (feedback !== null && !BREATHING_FEEDBACK.includes(feedback)) return { ok: false, error: 'invalid' }
    const doc = this.store.get<BreathingSessionDoc>('breathingSessions', id)
    if (!doc || doc.astronaut !== astronaut) return { ok: false, error: 'notFound' }
    this.store.put<BreathingSessionDoc>('breathingSessions', { ...doc, feedback })
    return { ok: true }
  }

  breathingSessions(astronaut: CrewId): BreathingSessionDoc[] {
    return this.store.list<BreathingSessionDoc>('breathingSessions', astronaut).filter((d) => d.astronaut === astronaut).sort((a, b) => b.ts - a.ts)
  }

  /* ---------- Zihin egzersizleri: tamamlanan oturumların sonuçları ---------- */

  /** Oturum sonucunu saklar; aynı kimlikle ikinci kayıt açılmaz (ağ tekrar denerse çift kayıt olmasın) */
  saveMindSession(astronaut: CrewId, input: MindSessionInput): { ok: boolean; error?: 'invalid' | 'storage' } {
    if (!checkMindSession(input)) return { ok: false, error: 'invalid' }
    const prev = this.store.get<MindSessionDoc>('mindSessions', input.id)
    if (prev) return prev.astronaut === astronaut ? { ok: true } : { ok: false, error: 'invalid' }
    const doc: MindSessionDoc = { ...input, astronaut }
    try {
      this.store.put<MindSessionDoc>('mindSessions', doc)
      this.store.flush?.()
    } catch {
      try {
        this.store.remove('mindSessions', doc.id)
      } catch {
        /* yoksay */
      }
      return { ok: false, error: 'storage' }
    }
    return { ok: true }
  }

  /** Astronotun oturumları, yeniden eskiye */
  mindSessions(astronaut: CrewId): MindSessionDoc[] {
    return this.store.list<MindSessionDoc>('mindSessions', astronaut).filter((d) => d.astronaut === astronaut).sort((a, b) => b.ts - a.ts)
  }

  /* ---------- Dünya galerisi: seçilmiş görsellerin favorileri (GAL) ---------- */

  galleryFavorites(astronaut: CrewId): string[] {
    return this.store
      .list<GalleryFavoriteDoc>('galleryFavorites', astronaut)
      .filter((d) => d.astronaut === astronaut)
      .sort((a, b) => a.ts - b.ts)
      .map((d) => d.item)
  }

  /** Favori ekler ya da kaldırır; yazılamazsa önceki hal korunur */
  setGalleryFavorite(astronaut: CrewId, item: string, on: boolean): { ok: boolean; error?: 'invalid' | 'storage' } {
    if (!isFavoriteId(item)) return { ok: false, error: 'invalid' }
    const id = favoriteDocId(astronaut, item)
    const prev = this.store.get<GalleryFavoriteDoc>('galleryFavorites', id)
    if (!!prev === on) return { ok: true }
    try {
      if (on) this.store.put<GalleryFavoriteDoc>('galleryFavorites', { id, astronaut, ts: this.now(), item })
      else this.store.remove('galleryFavorites', id)
      this.store.flush?.()
    } catch {
      try {
        if (prev) this.store.put('galleryFavorites', prev)
        else this.store.remove('galleryFavorites', id)
      } catch {
        /* yoksay */
      }
      return { ok: false, error: 'storage' }
    }
    return { ok: true }
  }

  /* ---------- Acil durum: mürettebattan acil yardım isteği (EM-03, EM-04) ---------- */

  /** Kalıcı yazar; yazılamazsa önceki hali geri koyar ve false döner */
  private persistAssist(doc: AssistRequestDoc, prev: AssistRequestDoc | null): boolean {
    try {
      this.store.put<AssistRequestDoc>('assists', doc)
      this.store.flush?.()
      return true
    } catch {
      try {
        if (prev) this.store.put<AssistRequestDoc>('assists', prev)
        else this.store.remove('assists', doc.id)
      } catch {
        /* yoksay */
      }
      return false
    }
  }

  /**
   * İsteği kaydeder ve gönderen dışındaki bütün mürettebata yöneltir. Yalnızca istek kimliği, gönderen, zaman ve konum
   * (yok: null) saklanır. Aynı istek kimliğiyle ikinci gönderim yeni istek açmaz.
   */
  sendAssistRequest(astronaut: CrewId, requestId: string): AssistResult {
    if (!isRequestId(requestId)) return { ok: false, error: 'invalid' }
    const existing = this.store.get<AssistRequestDoc>('assists', assistDocId(requestId))
    if (existing) return existing.sender === astronaut ? { ok: true, request: existing, duplicate: true } : { ok: false, error: 'invalid' }
    const doc: AssistRequestDoc = {
      id: assistDocId(requestId),
      astronaut,
      ts: this.now(),
      requestId,
      sender: astronaut,
      recipients: CREW_IDS.filter((c) => c !== astronaut),
      location: null,
      transport: this.transport,
      deliveries: {},
      acks: {},
    }
    return this.persistAssist(doc, null) ? { ok: true, request: doc } : { ok: false, error: 'storage' }
  }

  /** Gönderenin istekleri (en yeni önce) */
  assistRequests(astronaut: CrewId): AssistRequestDoc[] {
    return this.store.list<AssistRequestDoc>('assists', astronaut).filter((d) => d.sender === astronaut).sort((a, b) => b.ts - a.ts)
  }

  /**
   * Bu mürettebata gelen ve süresi geçmemiş istekler: henüz yanıt vermedikleri ve (yanıt verse de) sonlandırılmış olanlar.
   * Sonlandırılan istek "acil durum kapatıldı" bildirimi olarak bir kez gösterilir.
   */
  incomingAssists(astronaut: CrewId): AssistRequestDoc[] {
    const now = this.now()
    return this.store
      .list<AssistRequestDoc>('assists')
      .filter((d) => d.recipients.includes(astronaut) && (!d.acks[astronaut] || d.endedAt !== undefined) && now - d.ts < ASSIST_TTL_MS)
      .sort((a, b) => b.ts - a.ts)
  }

  /** Sağlık ekibi (uçuş hekimi) görünümü: bütün mürettebatın süresi geçmemiş acil durumları, en yeni önce */
  activeEmergencies(): AssistRequestDoc[] {
    const now = this.now()
    return this.store
      .list<AssistRequestDoc>('assists')
      .filter((d) => now - d.ts < ASSIST_TTL_MS)
      .sort((a, b) => b.ts - a.ts)
  }

  /** Gönderenin kendi isteği (başkasının isteği değiştirilemez) */
  private ownAssist(astronaut: CrewId, requestId: string): { prev: AssistRequestDoc } | { error: AssistError } {
    if (!isRequestId(requestId)) return { error: 'invalid' }
    const prev = this.store.get<AssistRequestDoc>('assists', assistDocId(requestId))
    if (!prev) return { error: 'notFound' }
    if (prev.sender !== astronaut) return { error: 'invalid' }
    return { prev }
  }

  /** Gönderen acil durumu sonlandırır; ikinci kez sonlandırmak ilk anı korur */
  endAssist(astronaut: CrewId, requestId: string): AssistResult {
    const own = this.ownAssist(astronaut, requestId)
    if ('error' in own) return { ok: false, error: own.error }
    const { prev } = own
    if (prev.endedAt !== undefined) return { ok: true, request: prev, duplicate: true }
    const next: AssistRequestDoc = { ...prev, endedAt: this.now() }
    return this.persistAssist(next, prev) ? { ok: true, request: next } : { ok: false, error: 'storage' }
  }

  /** Gönderenin "Her şey yolunda mı?" sorusuna sesli ya da yazılı cevabı; sonlandırılmış isteğe eklenmez */
  addAssistNote(astronaut: CrewId, requestId: string, text: string): AssistResult {
    const own = this.ownAssist(astronaut, requestId)
    if ('error' in own) return { ok: false, error: own.error }
    const { prev } = own
    const clean = text.replace(/\s+/g, ' ').trim()
    if (!clean || clean.length > ASSIST_NOTE_MAX || prev.endedAt !== undefined) return { ok: false, error: 'invalid' }
    const notes = [...(prev.notes ?? []), { at: this.now(), text: clean }].slice(-ASSIST_NOTES_MAX)
    const next: AssistRequestDoc = { ...prev, notes }
    return this.persistAssist(next, prev) ? { ok: true, request: next } : { ok: false, error: 'storage' }
  }

  private receipt(astronaut: CrewId, requestId: string, field: 'deliveries' | 'acks'): AssistResult {
    if (!isRequestId(requestId)) return { ok: false, error: 'invalid' }
    const prev = this.store.get<AssistRequestDoc>('assists', assistDocId(requestId))
    if (!prev) return { ok: false, error: 'notFound' }
    if (!prev.recipients.includes(astronaut)) return { ok: false, error: 'notRecipient' }
    // Aynı onay tekrar gelirse (yinelenen olay) ilk an korunur
    if (prev[field][astronaut]) return { ok: true, request: prev, duplicate: true }
    const r = { at: this.now(), transport: this.transport }
    const next: AssistRequestDoc = { ...prev, [field]: { ...prev[field], [astronaut]: r } }
    // Yanıt veren alıcı isteği almış demektir
    if (field === 'acks' && !next.deliveries[astronaut]) next.deliveries = { ...next.deliveries, [astronaut]: r }
    return this.persistAssist(next, prev) ? { ok: true, request: next } : { ok: false, error: 'storage' }
  }

  /** Alıcının uygulaması isteği ekrana getirdi: alındı onayı */
  confirmAssistDelivery(astronaut: CrewId, requestId: string): AssistResult {
    return this.receipt(astronaut, requestId, 'deliveries')
  }

  /** Alıcı "yardıma geliyorum" dedi */
  ackAssist(astronaut: CrewId, requestId: string): AssistResult {
    return this.receipt(astronaut, requestId, 'acks')
  }

  /* ---------- Acil destek: hekimle iletişim (EM-02, EM-04) ---------- */

  /** Yapılandırılmış tıbbi alıcılar */
  doctorContacts() {
    return [...MEDICAL_CONTACTS]
  }

  /**
   * Ek önizlemesi: seçilen kategorilerin [from, to] aralığındaki (iki uç dahil) gerçek kayıtları, kaynağa göre sayılar ve
   * ilk/son kayıt anı. Kayıt yoksa sayı 0'dır; veri varmış gibi gösterilmez. Referans an, şimdiden ileride olamaz.
   */
  attachmentPreview(astronaut: CrewId, categories: AttachmentCategoryId[], from: number, to: number, reference: number): { ok: true; snapshot: AttachmentSnapshot } | { ok: false; error: DateRangeError } {
    const ref = Math.min(reference, this.now())
    const bad = checkRange(from, to, ref)
    if (bad) return { ok: false, error: bad }
    const ids = ATTACHMENT_CATEGORIES.filter((c) => categories.includes(c))
    return {
      ok: true,
      snapshot: {
        reference: ref,
        from,
        to,
        timeZone: this.checkinConfig.timeZone,
        categories: ids.map((id) => {
          const points = this.series(astronaut, id, from, to).points.filter((p) => p.t >= from && p.t <= to)
          const sources: Record<string, number> = {}
          for (const p of points) {
            const k = p.source.startsWith('import:') ? 'import' : p.source
            sources[k] = (sources[k] ?? 0) + 1
          }
          return {
            id,
            count: points.length,
            first: points[0]?.t ?? null,
            last: points.at(-1)?.t ?? null,
            sources,
            points: points.map((p) => (p.v2 === undefined ? { t: p.t, v: p.v, source: p.source } : { t: p.t, v: p.v, v2: p.v2, source: p.source })),
          }
        }),
      },
    }
  }

  /**
   * Hekime gözden geçirilmiş isteği gönderir. Gönderim yeri bu uygulamanın veri deposudur (yerel/demo giden kutusu):
   * gerçek bir iletişim hattı yoktur. Gecikme ve kesinti kuyruğu ortamın iletişim modeline göre hesaplanır; teslim ya da
   * okundu onayı üretilmez. Aynı istek kimliğiyle ikinci gönderim yeni mesaj açmaz. Metin kısaltılmaz; ek, gönderim
   * anındaki haliyle kopyalanır ve sonradan değişmez. Kalıcı yazılamazsa mesaj kaydedilmiş sayılmaz.
   */
  sendDoctorRequest(astronaut: CrewId, req: DoctorRequest): { ok: true; message: MessageDoc; duplicate: boolean } | { ok: false; error: DoctorRequestError | 'storage' } {
    const bad = checkDoctorRequest(req, MEDICAL_CONTACTS)
    if (bad) return { ok: false, error: bad }
    const existing = this.store.list<MessageDoc>('messages', astronaut).find((m) => m.requestId === req.requestId && m.astronaut === astronaut)
    if (existing) return { ok: true, message: existing, duplicate: true }
    const now = this.now()
    const comm = this.comm()
    const blackout = comm.blackoutUntil > now
    const delayMs = COMM_DELAY_MS[comm.environment]
    const doc: MessageDoc = {
      id: newId('msg'),
      astronaut,
      ts: now,
      from: astronaut,
      to: req.recipient,
      text: req.text,
      delayMs,
      deliverAt: blackout ? comm.blackoutUntil + delayMs : now + delayMs,
      kind: 'message',
      queued: blackout,
      requestId: req.requestId,
      symptoms: [...req.symptoms],
      other: req.other,
      attachment: req.attachment ? structuredClone(req.attachment) : null,
    }
    try {
      this.store.put<MessageDoc>('messages', doc)
      this.store.flush?.()
    } catch {
      try {
        this.store.remove('messages', doc.id)
      } catch {
        /* yoksay */
      }
      return { ok: false, error: 'storage' }
    }
    return { ok: true, message: doc, duplicate: false }
  }

  /* ---------- Hekimle iletişim ---------- */

  messages(astronaut?: CrewId): (MessageDoc & { delivered: boolean })[] {
    const now = this.now()
    const blackout = this.comm().blackoutUntil > now
    return this.store
      .list<MessageDoc>('messages', astronaut)
      .filter((msg) => msg.from === 'surgeon' || msg.to === 'surgeon')
      .map((msg) => ({ ...msg, delivered: !(msg.queued && blackout) && msg.deliverAt <= now }))
      .sort((a, b) => b.ts - a.ts)
  }

  sendMessage(astronaut: CrewId, text: string, kind: MessageDoc['kind'] = 'message', from: MessageDoc['from'] = astronaut, to: MessageDoc['to'] = 'surgeon'): MessageDoc | null {
    const clean = text.trim().slice(0, 2000)
    if (!clean) return null
    const now = this.now()
    const comm = this.comm()
    const blackout = comm.blackoutUntil > now
    const delayMs = COMM_DELAY_MS[comm.environment]
    const doc: MessageDoc = { id: newId('msg'), astronaut, ts: now, from, to, text: clean, delayMs, deliverAt: blackout ? comm.blackoutUntil + delayMs : now + delayMs, kind, queued: blackout }
    this.store.put('messages', doc)
    return doc
  }

  /* ---------- Demo senaryoları ---------- */

  triggerScenario(astronaut: CrewId, scenario: ScenarioId) {
    const now = this.now()
    if (!SCENARIO_BY_ID[scenario]) return
    this.store.put<ScenarioDoc>('scenarios', { id: newId('s'), astronaut, ts: now, scenario })
    const events = this.events(astronaut)
    // Günlük ölçülen göstergeler için senaryo anında bir ölçüm yazılır (gerçek bir ölçüm gibi)
    for (const id of ['bp', 'glucose'] as IndicatorId[]) {
      if (!SCENARIO_BY_ID[scenario].indicators.includes(id)) continue
      const p = liveValue(id, astronaut, now, events)
      this.store.put<MeasurementDoc>('measurements', { id: newId('m'), astronaut, ts: now, indicator: id, v: p.v, v2: p.v2, source: 'demo' })
    }
    if (scenario === 'moodLow') this.store.put<MeasurementDoc>('measurements', { id: newId('m'), astronaut, ts: now, indicator: 'mood', v: 2, source: 'demo' })
    if (scenario === 'sleepDebt') this.store.put<MeasurementDoc>('measurements', { id: newId('m'), astronaut, ts: now, indicator: 'reaction', v: Math.round(CREW[astronaut].baseline.reaction * 1.24), source: 'demo' })
    if (scenario === 'impactHand') {
      this.addComplaint(astronaut, { region: 'eller', side: 'right', muscles: [], symptom: 'pain', severity: 8, note: '', origin: 'demo' })
    }
    if (scenario === 'workoutMissed') {
      const p = this.program(astronaut)
      this.store.put('programs', { ...p, skipped: true, items: p.items.map((i) => ({ ...i, done: false, doneAt: undefined })) })
    }
    if (scenario === 'commBlackout') {
      this.store.put<CommMeta>('meta', { id: 'comm', astronaut: '*', ts: now, environment: 'mars', blackoutUntil: now + 72 * HOUR })
    }
    this.forgetScenarioAlerts(astronaut, scenario)
  }

  /**
   * Demo: senaryo yeniden tetiklenince (durum hâlâ sürse bile) ilgili uyarılar bir sonraki güncellemede yeniden bildirilir.
   * Gerçek veride aynı durum tekrar uyarılmaz (U-12); bu yalnızca demo düğmesinin "olay şimdi yeniden oldu" anlamı içindir.
   */
  private forgetScenarioAlerts(astronaut: CrewId, scenario: ScenarioId) {
    const indicators = SCENARIO_BY_ID[scenario].indicators
    const related = this.snapshot(astronaut).findings.filter(
      (f) => (f.indicator && indicators.includes(f.indicator)) || (scenario === 'commBlackout' && f.key === 'comm:blackout'),
    )
    for (const f of related) this.store.remove('seen', `${astronaut}:${f.key}`)
  }

  /**
   * Demoyu başlangıç durumuna döndürür (fabrika ayarı): bütün mürettebatın ölçümleri, şikayetleri, senaryoları, mesajları,
   * su ve ruh hali kayıtları, yapılacakları, günlüğü, asistan sohbetleri, profili (yaş, boy, kilo) ve görev ortamı silinir;
   * ilk kayıtlar yeniden yazılır. Sonuçta bütün değerler simülasyonun normal akışına döner ve hiçbir bölgede sorun kalmaz.
   * İçe aktarılan veri setleri (NASA verisi) demo verisi değildir, korunur.
   */
  resetDemo() {
    for (const c of COLLECTIONS) {
      if (c === 'imports') continue
      for (const doc of this.store.list(c)) {
        // İçe aktarılan veri setlerinin ölçümleri korunur
        if (c === 'measurements' && (doc as MeasurementDoc).source.startsWith('import:')) continue
        this.store.remove(c, doc.id)
      }
    }
    this.ensureSeed()
    for (const id of CREW_IDS) {
      this.refreshProgram(id)
      // Başlangıç durumundaki bilgi notları (ör. "su hedefinin gerisindesin") bilinen durum sayılır: sıfırlayınca bildirim yağmaz
      this.tick(id, false)
    }
  }

  /* ---------- Sohbet geçmişi ---------- */

  chats(astronaut: CrewId): ChatDoc[] {
    return this.store.list<ChatDoc>('chats', astronaut).sort((a, b) => b.ts - a.ts)
  }

  saveChat(astronaut: CrewId, chat: Omit<ChatDoc, 'astronaut' | 'ts'> & { ts?: number }) {
    const messages = chat.messages.slice(-200).map((m) => ({ role: m.role, text: String(m.text).slice(0, 6000), ts: m.ts }))
    this.store.put<ChatDoc>('chats', { ...chat, astronaut, ts: chat.ts ?? this.now(), messages, title: chat.title.slice(0, 80) })
  }

  removeChat(astronaut: CrewId, id: string) {
    const c = this.store.get<ChatDoc>('chats', id)
    if (c && c.astronaut === astronaut) this.store.remove('chats', id)
  }

  /**
   * Uçuş hekimi raporu (D-02): dönemdeki her göstergenin son değeri, ortalaması, en düşük/en yüksek değeri ve eğilimi,
   * şikayetler ve etkin uyarılar. Bütün sayılar doğrudan veriden hesaplanır (D-04); yapay zeka yalnızca açıklama yazabilir.
   */
  report(astronaut: CrewId, days: number) {
    const now = this.now()
    const from = now - days * DAY
    const snap = this.snapshot(astronaut)
    const ids: IndicatorId[] = ['hr', 'bp', 'spo2', 'temp', 'resp', 'glucose', 'sleep', 'mood', 'exercise', 'water', 'radiation', 'co2', 'reaction']
    const today = dayStart(now)
    const rows = ids.map((id) => {
      // Su ve egzersiz gün içinde birikir: bugünün yarım değeri istatistiğe ve eğilime katılmaz, "bugün (sürüyor)" diye gösterilir
      const partial = id === 'water' || id === 'exercise'
      const all = this.series(astronaut, id, from, now)
      const points = partial ? all.points.filter((p) => p.t < today) : all.points
      const stats = partial ? statsOf(points) : all.stats
      const half = points.length >> 1
      const avg = (pts: Point[]) => pts.reduce((n, p) => n + p.v, 0) / Math.max(1, pts.length)
      const delta = points.length >= 4 ? avg(points.slice(half)) - avg(points.slice(0, half)) : 0
      const span = Math.max(1e-6, INDICATORS[id].band[1] - INDICATORS[id].band[0])
      const trend: 'up' | 'down' | 'flat' = Math.abs(delta) < span * 0.08 ? 'flat' : delta > 0 ? 'up' : 'down'
      const s = snap.indicators[id]
      // Referans: göstergenin normal bandı (tansiyonda büyük ve küçük tansiyon); aralığın kaynağı katalogda
      const ref: { low: number; high: number; low2?: number; high2?: number } =
        id === 'bp' ? { low: INDICATORS.bp.band[0], high: INDICATORS.bp.band[1], low2: 60, high2: 80 } : { low: INDICATORS[id].band[0], high: INDICATORS[id].band[1] }
      return { id, latest: s.value, latest2: s.value2, status: s.status, stats, trend, ref, partial }
    })
    return { astronaut, from, to: now, days, rows, complaints: this.complaints(astronaut).filter((c) => c.ts >= from || c.status !== 'resolved'), findings: snap.findings, score: snap.score }
  }

  /** Arayüzün okunmamış uyarı geçmişi için */
  alertHistory(astronaut: CrewId): { level: AlertLevel; key: string; ts: number }[] {
    return this.store.list<SeenDoc>('seen', astronaut).map((s) => ({ level: s.level, key: s.id.split(':').slice(1).join(':'), ts: s.ts }))
  }
}

function statsOf(points: Point[]): SeriesResult['stats'] {
  if (!points.length) return null
  let min = Infinity
  let max = -Infinity
  let sum = 0
  for (const p of points) {
    min = Math.min(min, p.v)
    max = Math.max(max, p.v)
    sum += p.v
  }
  return { min, max, avg: sum / points.length, count: points.length }
}

const clampSeverity = (v: number) => Math.max(0, Math.min(10, Math.round(Number.isFinite(v) ? v : 0)))
