import { doneMinutes, ENV_PLANS, programMinutes, type ProgramDoc } from './coach'
import { DRAW_DAYS } from './labs'
import type { TaskDoc } from './model'
import type { SourceId } from './sources'
import { num, tx, type Tx } from './tx'

/*
 * Ana sayfadaki "Yapılacaklar" listesi: günün rutinleri (su, ölçüm, antrenman, ruh hali, günlük) ve planlı kontroller.
 * Astronotun yapmadığı şeyleri bir bakışta görmesi için gecikenler öne çıkar (konu metni: astronotu belli aralıklarla
 * ölçüm almaya ve belirli işlemleri yapmaya yönlendirmek).
 */

export type TaskKind = 'water' | 'measure' | 'workout' | 'mood' | 'journal' | 'reaction' | 'conference' | 'blood' | 'custom'

export interface Task {
  key: string
  kind: TaskKind
  title: Tx
  detail?: Tx
  done: boolean
  /** İlerleme (su, antrenman) */
  progress?: { value: number; target: number }
  /** Planlanan saat (istasyon saati, GMT) */
  due?: string
  overdue: boolean
  /** İşin yapıldığı sayfa (0 ana, 1 zihin, 2 spor, 3 doktor) */
  page: number
  source?: SourceId
  /** Kullanıcının eklediği görev (silinebilir) */
  customId?: string
}

export interface TaskInput {
  day: number
  hour: number
  water: { todayMl: number; targetMl: number }
  program: ProgramDoc | null
  measuredToday: boolean
  moodToday: boolean
  journalToday: boolean
  reactionToday: boolean
  done: Record<string, boolean>
  custom: TaskDoc[]
}

const T = tx

export function tasksFor(input: TaskInput): Task[] {
  const { day, hour } = input
  const out: Task[] = []
  const mark = (key: string, auto: boolean) => input.done[key] ?? auto

  // Su: 2,5 L hedef (tb027); 250 mL'lik bardaklarla ilerler
  const w = input.water
  out.push({
    key: 'water',
    kind: 'water',
    title: T('Günlük suyunu iç', 'Drink your daily water'),
    detail: { tr: `${num(w.todayMl / 1000, 'tr', 2)} / ${num(w.targetMl / 1000, 'tr', 1)} L`, en: `${num(w.todayMl / 1000, 'en', 2)} / ${num(w.targetMl / 1000, 'en', 1)} L` },
    done: w.todayMl >= w.targetMl,
    progress: { value: w.todayMl, target: w.targetMl },
    overdue: hour >= 18 && w.todayMl < w.targetMl * 0.7,
    page: 0,
    source: 'tb027',
  })

  out.push({
    key: 'measure',
    kind: 'measure',
    title: T('Sabah ölçümü: tansiyon ve kan şekeri', 'Morning check: blood pressure and blood sugar'),
    detail: T('Kahvaltıdan önce, aç karnına', 'Before breakfast, on an empty stomach'),
    due: '07:30',
    done: mark('measure', input.measuredToday),
    overdue: hour >= 9.5 && !mark('measure', input.measuredToday),
    page: 0,
  })

  if (input.program) {
    const total = programMinutes(input.program)
    const done = doneMinutes(input.program)
    const allDone = input.program.items.every((i) => i.done)
    out.push({
      key: 'workout',
      kind: 'workout',
      title: T('Günlük antrenman', 'Daily workout'),
      detail: { tr: `${done} / ${total} dk`, en: `${done} / ${total} min` },
      due: '09:30',
      done: allDone,
      progress: { value: done, target: total },
      overdue: !!input.program.skipped || (hour >= 20 && !allDone),
      page: 2,
      source: ENV_PLANS[input.program.environment ?? 'iss'].sources[0],
    })
  }

  out.push({
    key: 'mood',
    kind: 'mood',
    title: T('Ruh halini kaydet', 'Log your mood'),
    due: '20:00',
    done: mark('mood', input.moodToday),
    overdue: hour >= 22 && !mark('mood', input.moodToday),
    page: 1,
    source: 'tb016',
  })

  out.push({
    key: 'journal',
    kind: 'journal',
    title: T('Kendine bir not bırak', 'Leave yourself a note'),
    detail: T('Bugün nasıl hissettin? (isteğe bağlı)', 'How did you feel today? (optional)'),
    done: mark('journal', input.journalToday),
    overdue: false,
    page: 1,
    source: 'tb016',
  })

  // Haftalık tepki testi (NASA bilişsel testleri uçuş öncesi başlangıçla karşılaştırır, tb016)
  if (day % 7 === 3) {
    out.push({
      key: 'reaction',
      kind: 'reaction',
      title: T('Haftalık tepki testi', 'Weekly reaction test'),
      detail: T('2 dakika sürer', 'Takes 2 minutes'),
      due: '10:00',
      done: mark('reaction', input.reactionToday),
      overdue: hour >= 18 && !mark('reaction', input.reactionToday),
      page: 3,
      source: 'tb016',
    })
  }

  // Haftalık özel psikolojik görüşme (tb016: private psychological conferences)
  if (day % 7 === 5) {
    out.push({ key: 'conference', kind: 'conference', title: T('Özel psikolojik görüşme', 'Private psychological conference'), due: '18:00', done: mark('conference', hour >= 19), overdue: false, page: 1, source: 'tb016' })
  }

  // Planlı kan örneği (örnekler santrifüjlenip dondurulur, sonra incelenir; nasaBloodBlog)
  if (DRAW_DAYS.includes(day)) {
    out.push({
      key: 'blood',
      kind: 'blood',
      title: T('Kan örneği ver', 'Give a blood sample'),
      detail: { tr: `Görev günü ${day} planlı örnek`, en: `Planned sample, mission day ${day}` },
      due: '08:00',
      done: mark('blood', false),
      overdue: hour >= 12 && !mark('blood', false),
      page: 3,
      source: 'nasaBloodBlog',
    })
  }

  for (const c of input.custom) {
    out.push({ key: `custom:${c.id}`, kind: 'custom', title: { tr: c.title, en: c.title }, done: c.done, overdue: false, page: 0, customId: c.id })
  }

  // Gecikenler önce, sonra yapılmayanlar, en sonda yapılanlar
  const rank = (t: Task) => (t.done ? 2 : t.overdue ? 0 : 1)
  return out.sort((a, b) => rank(a) - rank(b))
}

/* ---------- Rutin kontrol takvimi (R-05) ---------- */

export type CheckKind = 'reaction' | 'conference' | 'blood'
export type CheckStatus = 'done' | 'overdue' | 'today' | 'upcoming'

export interface ScheduledCheck {
  day: number
  key: CheckKind
  title: Tx
  due: string
  status: CheckStatus
  page: number
  source: SourceId
}

/** Planlı rutin kontroller: haftalık tepki testi ve psikolojik görüşme (tb016), görev planındaki kan örnekleri (nasaBloodBlog) */
const CHECKS: { key: CheckKind; on: (day: number) => boolean; title: Tx; due: string; page: number; source: SourceId }[] = [
  { key: 'reaction', on: (d) => d % 7 === 3, title: T('Haftalık tepki testi', 'Weekly reaction test'), due: '10:00', page: 3, source: 'tb016' },
  { key: 'conference', on: (d) => d % 7 === 5, title: T('Özel psikolojik görüşme', 'Private psychological conference'), due: '18:00', page: 1, source: 'tb016' },
  { key: 'blood', on: (d) => DRAW_DAYS.includes(d), title: T('Kan örneği', 'Blood sample'), due: '08:00', page: 3, source: 'nasaBloodBlog' },
]

export interface ScheduleInput {
  today: number
  /** Geriye ve ileriye kaç gün */
  back: number
  ahead: number
  /** Geçmiş ya da bugünkü bir kontrol yapıldı mı */
  isDone: (day: number, key: CheckKind) => boolean
  /** Bugün gecikmiş sayılır mı (saat geçti) */
  overdueToday: (key: CheckKind) => boolean
}

/** Geçmiş haftanın kontrolleri (yapıldı / gecikti), bugün ve önümüzdeki iki haftanın planı */
export function scheduleFor(input: ScheduleInput): ScheduledCheck[] {
  const out: ScheduledCheck[] = []
  for (let day = input.today - input.back; day <= input.today + input.ahead; day++) {
    if (day < 0) continue
    for (const c of CHECKS) {
      if (!c.on(day)) continue
      const done = day <= input.today && input.isDone(day, c.key)
      const status: CheckStatus = done ? 'done' : day < input.today ? 'overdue' : day === input.today ? (input.overdueToday(c.key) ? 'overdue' : 'today') : 'upcoming'
      out.push({ day, key: c.key, title: c.title, due: c.due, status, page: c.page, source: c.source })
    }
  }
  return out
}
