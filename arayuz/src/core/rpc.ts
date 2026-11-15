import { ENVIRONMENTS, isCrewId, type CrewId, type Environment } from './crew'
import type { Engine } from './engine'
import type { IndicatorId } from './catalog'
import { INDICATOR_IDS } from './catalog'
import type { CheckinAnswer } from './coach'
import type { ChatDoc, ComplaintDoc, ComplaintStatus } from './model'
import { isScenarioId, type ScenarioId } from './scenarios'
import { labDraws } from './labs'
import type { BreathingFeedback, BreathingSessionInput } from './breathingLog'
import type { MindSessionInput } from './mindTraining'
import { ATTACHMENT_CATEGORIES, type AttachmentCategoryId, type DoctorRequest } from './doctorContact'

/*
 * Arayüz ile çekirdek motor arasındaki tek sözleşme. Sunucuda POST /api/rpc/:yöntem ile, sunucu yoksa tarayıcıda doğrudan
 * çağrılır. Yeni bir işlem eklemek için yalnızca bu listeye bir satır eklenir.
 */

const crew = (v: unknown): CrewId => {
  if (!isCrewId(v)) throw new RpcError('astronot geçersiz')
  return v
}
const indicator = (v: unknown): IndicatorId => {
  if (typeof v !== 'string' || !(INDICATOR_IDS as string[]).includes(v)) throw new RpcError('gösterge geçersiz')
  return v as IndicatorId
}
const n = (v: unknown, name = 'sayı'): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new RpcError(`${name} geçersiz`)
  return v
}
/** Metni kısaltmadan denetler: sınırı aşan metin sessizce kesilmez, istek reddedilir */
const fullText = (v: unknown, max: number): string => {
  if (v === undefined || v === null) return ''
  if (typeof v !== 'string') throw new RpcError('metin geçersiz')
  if (v.length > max) throw new RpcError('metin çok uzun')
  return v
}
const s = (v: unknown, max = 4000): string => {
  if (typeof v !== 'string') throw new RpcError('metin geçersiz')
  return v.slice(0, max)
}

export class RpcError extends Error {}

export const RPC = {
  snapshot: (e: Engine, a: CrewId) => e.snapshot(crew(a)),
  tick: (e: Engine, a: CrewId, viewer?: 'astronaut' | 'surgeon') => e.tick(crew(a), viewer !== 'surgeon'),
  series: (e: Engine, a: CrewId, id: IndicatorId, from: number, to: number) => e.series(crew(a), indicator(id), n(from), n(to)),
  crewOverview: (e: Engine) => e.crewOverview(),
  addMeasurement: (e: Engine, a: CrewId, id: IndicatorId, v: number, v2?: number) => e.addMeasurement(crew(a), indicator(id), n(v), v2 === undefined || v2 === null ? undefined : n(v2)),
  addWater: (e: Engine, a: CrewId, ml: number) => e.addWater(crew(a), n(ml)),
  addMood: (e: Engine, a: CrewId, value: number, tags: string[] = []) => e.addMood(crew(a), n(value), Array.isArray(tags) ? tags.map((t) => s(t, 40)).slice(0, 8) : []),
  moods: (e: Engine, a: CrewId) => e.moods(crew(a)),
  complaints: (e: Engine, a: CrewId) => e.complaints(crew(a)),
  addComplaint: (e: Engine, a: CrewId, c: Pick<ComplaintDoc, 'region' | 'side' | 'muscles' | 'bones' | 'symptom' | 'severity' | 'note' | 'origin'>) => e.addComplaint(crew(a), { ...c, note: s(c.note ?? '', 1000), severity: n(c.severity, 'şiddet') }),
  updateComplaint: (e: Engine, a: CrewId, id: string, patch: { severity?: number; status?: ComplaintStatus; note?: string }) => e.updateComplaint(crew(a), s(id, 80), patch),
  program: (e: Engine, a: CrewId) => e.program(crew(a)),
  setExerciseDone: (e: Engine, a: CrewId, index: number, done: boolean) => e.setExerciseDone(crew(a), n(index), !!done),
  checkin: (e: Engine, a: CrewId) => e.checkin(crew(a)),
  answerCheckin: (e: Engine, a: CrewId, id: string, answer: CheckinAnswer) => e.answerCheckin(crew(a), s(id, 80), answer === 'gone' || answer === 'better' ? answer : 'same'),
  tasks: (e: Engine, a: CrewId) => e.tasks(crew(a)),
  setTaskDone: (e: Engine, a: CrewId, key: string, done: boolean) => e.setTaskDone(crew(a), s(key, 120), !!done),
  addTask: (e: Engine, a: CrewId, title: string) => e.addTask(crew(a), s(title, 200)),
  removeTask: (e: Engine, a: CrewId, id: string) => e.removeTask(crew(a), s(id, 80)),
  journal: (e: Engine, a: CrewId) => e.journal(crew(a)),
  addJournal: (e: Engine, a: CrewId, text: string, mood?: number) => e.addJournal(crew(a), s(text), mood === undefined || mood === null ? undefined : n(mood)),
  removeJournal: (e: Engine, a: CrewId, id: string) => e.removeJournal(crew(a), s(id, 80)),
  messages: (e: Engine, a?: CrewId) => e.messages(a === undefined || a === null ? undefined : crew(a)),
  sendMessage: (e: Engine, a: CrewId, text: string, kind: 'message' | 'report' = 'message', from?: 'surgeon') =>
    e.sendMessage(crew(a), s(text, 2000), kind === 'report' ? 'report' : 'message', from === 'surgeon' ? 'surgeon' : crew(a), from === 'surgeon' ? crew(a) : 'surgeon'),
  comm: (e: Engine) => e.comm(),
  setEnvironment: (e: Engine, env: Environment) => e.setEnvironment(ENVIRONMENTS.includes(env) ? env : 'iss'),
  triggerScenario: (e: Engine, a: CrewId, id: ScenarioId) => {
    if (!isScenarioId(id)) throw new RpcError('senaryo geçersiz')
    return e.triggerScenario(crew(a), id)
  },
  resetDemo: (e: Engine) => e.resetDemo(),
  labs: (e: Engine, a: CrewId) => labDraws(crew(a), e.now()),
  report: (e: Engine, a: CrewId, days: number) => e.report(crew(a), Math.min(180, Math.max(1, Math.round(n(days))))),
  alertHistory: (e: Engine, a: CrewId) => e.alertHistory(crew(a)),
  chats: (e: Engine, a: CrewId) => e.chats(crew(a)),
  saveChat: (e: Engine, a: CrewId, chat: Omit<ChatDoc, 'astronaut' | 'ts'>) => e.saveChat(crew(a), { ...chat, id: s(chat.id, 80), title: s(chat.title, 80) }),
  removeChat: (e: Engine, a: CrewId, id: string) => e.removeChat(crew(a), s(id, 80)),
  profile: (e: Engine, a: CrewId) => e.profile(crew(a)),
  crewInbox: (e: Engine, a: CrewId) => e.crewInbox(crew(a)),
  imports: (e: Engine) => e.imports(),
  schedule: (e: Engine, a: CrewId) => e.schedule(crew(a)),
  // İyi oluş check-in'leri; koçun şikayet takibindeki checkin/answerCheckin ile karışmasın diye ayrı adlar (spec C-07).
  // Cevaplar ve not motorda yapılandırmaya göre denetlenir; burada yalnızca tür ve uzunluk sınırlanır.
  currentCheckin: (e: Engine, a: CrewId) => e.currentCheckin(crew(a)),
  checkinDay: (e: Engine, a: CrewId) => e.checkinDay(crew(a)),
  checkinWindow: (e: Engine, a: CrewId, key: string) => e.checkinWindow(crew(a), s(key, 40)),
  wellbeingCheckins: (e: Engine, a: CrewId, days = 7) => e.wellbeingCheckins(crew(a), n(days, 'gün')),
  markCheckinPrompted: (e: Engine, a: CrewId, key: string) => e.markCheckinPrompted(crew(a), s(key, 40)),
  openCheckin: (e: Engine, a: CrewId, key: string) => e.openCheckin(crew(a), s(key, 40)),
  deferCheckin: (e: Engine, a: CrewId, key: string) => e.deferCheckin(crew(a), s(key, 40)),
  saveCheckinDraft: (e: Engine, a: CrewId, key: string, answers: Record<string, string | null>, note?: string) =>
    e.saveCheckinDraft(crew(a), s(key, 40), answers, fullText(note, 20_000)),
  submitCheckin: (e: Engine, a: CrewId, key: string, answers: Record<string, string | null>, note?: string) =>
    e.submitCheckin(crew(a), s(key, 40), answers, fullText(note, 20_000)),
  skipCheckin: (e: Engine, a: CrewId, key: string) => e.skipCheckin(crew(a), s(key, 40)),
  // Acil destek: hekimle iletişim (istek gövdesi motorda checkDoctorRequest ile ayrıntılı denetlenir)
  doctorContacts: (e: Engine) => e.doctorContacts(),
  // Nefes molası oturum kayıtları (biçim motorda denetlenir)
  saveBreathingSession: (e: Engine, a: CrewId, input: BreathingSessionInput) => {
    if (!input || typeof input !== 'object') throw new RpcError('oturum geçersiz')
    return e.saveBreathingSession(crew(a), input)
  },
  setBreathingFeedback: (e: Engine, a: CrewId, id: string, feedback: BreathingFeedback | null) => e.setBreathingFeedback(crew(a), s(id, 80), feedback),
  breathingSessions: (e: Engine, a: CrewId) => e.breathingSessions(crew(a)),
  // Zihin egzersizi sonuçları (biçim motorda denetlenir)
  saveMindSession: (e: Engine, a: CrewId, input: MindSessionInput) => {
    if (!input || typeof input !== 'object') throw new RpcError('oturum geçersiz')
    return e.saveMindSession(crew(a), input)
  },
  mindSessions: (e: Engine, a: CrewId) => e.mindSessions(crew(a)),
  // Dünya galerisi favorileri (yalnızca seçilmiş görsel kimlikleri; kişisel fotoğraflar sunucuya gitmez)
  galleryFavorites: (e: Engine, a: CrewId) => e.galleryFavorites(crew(a)),
  setGalleryFavorite: (e: Engine, a: CrewId, item: string, on: boolean) => e.setGalleryFavorite(crew(a), s(item, 100), on === true),
  // Acil durum: mürettebattan acil yardım isteği (istek kimliği motorda denetlenir)
  sendAssistRequest: (e: Engine, a: CrewId, requestId: string) => e.sendAssistRequest(crew(a), s(requestId, 80)),
  assistRequests: (e: Engine, a: CrewId) => e.assistRequests(crew(a)),
  incomingAssists: (e: Engine, a: CrewId) => e.incomingAssists(crew(a)),
  confirmAssistDelivery: (e: Engine, a: CrewId, requestId: string) => e.confirmAssistDelivery(crew(a), s(requestId, 80)),
  ackAssist: (e: Engine, a: CrewId, requestId: string) => e.ackAssist(crew(a), s(requestId, 80)),
  endAssist: (e: Engine, a: CrewId, requestId: string) => e.endAssist(crew(a), s(requestId, 80)),
  addAssistNote: (e: Engine, a: CrewId, requestId: string, text: string) => e.addAssistNote(crew(a), s(requestId, 80), fullText(text, 2000)),
  activeEmergencies: (e: Engine) => e.activeEmergencies(),
  attachmentPreview: (e: Engine, a: CrewId, categories: AttachmentCategoryId[], from: number, to: number, reference: number) => {
    if (!Array.isArray(categories) || categories.some((c) => !(ATTACHMENT_CATEGORIES as readonly string[]).includes(c))) throw new RpcError('kategori geçersiz')
    return e.attachmentPreview(crew(a), categories, n(from), n(to), n(reference))
  },
  sendDoctorRequest: (e: Engine, a: CrewId, req: DoctorRequest) => {
    if (!req || typeof req !== 'object') throw new RpcError('istek geçersiz')
    return e.sendDoctorRequest(crew(a), req)
  },
  updateProfile: (e: Engine, a: CrewId, p: { age?: number; heightCm?: number; weightKg?: number }) => {
    if (!p || typeof p !== 'object') throw new RpcError('profil geçersiz')
    const opt = (v: unknown, name: string) => (v === undefined || v === null ? undefined : n(v, name))
    return e.updateProfile(crew(a), { age: opt(p.age, 'yaş'), heightCm: opt(p.heightCm, 'boy'), weightKg: opt(p.weightKg, 'kilo') })
  },
}

export type Rpc = typeof RPC
export type RpcName = keyof Rpc
export type RpcArgs<K extends RpcName> = Parameters<Rpc[K]> extends [Engine, ...infer R] ? R : never
export type RpcResult<K extends RpcName> = ReturnType<Rpc[K]>

export function isRpcName(v: string): v is RpcName {
  return Object.prototype.hasOwnProperty.call(RPC, v)
}

export function dispatch<K extends RpcName>(engine: Engine, name: K, args: unknown[]): RpcResult<K> {
  const fn = RPC[name] as (e: Engine, ...a: unknown[]) => RpcResult<K>
  return fn(engine, ...args)
}
