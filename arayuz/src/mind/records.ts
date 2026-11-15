import { CHECKIN_CONFIG, type CheckinWindowView } from '../core/checkins'
import type { JournalDoc } from '../core/model'
import { civilDate } from '../core/zonedTime'

/*
 * Kayıtlarım listesi (docs/wellbeing CI-11, HCI-01): check-in kayıtları ve günlük notları tek listede, en yeni önce.
 * - Check-in: kaydedilen ve atlanan pencereler ile yanıtsız kapanan pencereler (ayrı ayrı; yanıtsız kapanma atlama sayılmaz).
 *   Açık, ertelenmiş ve henüz açılmamış pencereler kayıt değildir, listelenmez.
 * - Günlük: bağımsız notlar; check-in notlarıyla karışmaz.
 * Sıralama gerçek kayıt anına göredir: check-in'de gönderim anı (yanıtsız kapanan pencerede kapanış), günlükte yazılma anı.
 */

export type RecordFilter = 'all' | 'checkins' | 'journal'
export const RECORD_FILTERS: RecordFilter[] = ['all', 'checkins', 'journal']

export type RecordItem =
  | { kind: 'checkin'; id: string; at: number; date: string; view: CheckinWindowView }
  | { kind: 'journal'; id: string; at: number; date: string; doc: JournalDoc }

export function buildRecords(views: readonly CheckinWindowView[], journal: readonly JournalDoc[], filter: RecordFilter, timeZone = CHECKIN_CONFIG.timeZone): RecordItem[] {
  const out: RecordItem[] = []
  if (filter !== 'journal') {
    for (const v of views) {
      if (v.outcome !== 'saved' && v.outcome !== 'skipped' && v.outcome !== 'expired') continue
      out.push({ kind: 'checkin', id: `checkin:${v.key}`, at: v.record?.submittedAt ?? v.closesAt, date: v.date, view: v })
    }
  }
  if (filter !== 'checkins') {
    for (const doc of journal) out.push({ kind: 'journal', id: `journal:${doc.id}`, at: doc.ts, date: civilDate(doc.ts, timeZone), doc })
  }
  return out.sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1))
}
