import type { CrewId } from './crew'
import type { Doc } from './store'

/*
 * Acil durum → mürettebattan acil yardım isteği (docs/wellbeing EM-01, EM-03, EM-04, EM-05).
 *
 * İstek yalnızca şunları taşır: benzersiz istek kimliği, gönderen, zaman ve (gerçekten varsa) konum. Uygulamada konum
 * verisi olmadığı için konum her zaman null'dır ve öyle gösterilir. Günlük ya da sağlık notu eklenmez.
 *
 * İletim, uygulamanın paylaşılan iletişim katmanıdır:
 * - Sunucu modu: bütün istemciler aynı sunucuya bağlanır ve düzenli olarak yoklar (5 sn). Alıcının uygulaması isteği
 *   ekrana getirince alındı onayını kendisi gönderir (confirm). Sunucunun isteği kaydetmesi teslim sayılmaz.
 * - Tarayıcı modu (sunucu yok): veri yalnızca bu tarayıcıdadır; başka bir mürettebat istemcisi isteği alamaz. Bu moddaki
 *   her onay "yerel demo" olarak işaretlenir ve gerçek teslim sayılmaz.
 * Yanıt ("geliyorum") yalnızca alıcı açıkça bildirirse kaydedilir; o olmadan "yardım geliyor" denmez.
 */

export type AssistTransport = 'server' | 'local'

export interface AssistReceipt {
  at: number
  /** Onayın geldiği iletim: yerel demo onayı gerçek teslim değildir */
  transport: AssistTransport
}

export interface AssistRequestDoc extends Doc {
  requestId: string
  /** Gönderen (Doc.astronaut ile aynı) */
  sender: CrewId
  /** Bildirimin gideceği mürettebat (gönderen hariç) */
  recipients: CrewId[]
  /** Konum: uygulamada konum verisi yok; null "bilinmiyor" demektir */
  location: null
  /** İsteğin kaydedildiği iletim */
  transport: AssistTransport
  /** Alıcının uygulamasının isteği aldığını bildirdiği an */
  deliveries: Partial<Record<CrewId, AssistReceipt>>
  /** Alıcının "yardıma geliyorum" yanıtı */
  acks: Partial<Record<CrewId, AssistReceipt>>
  /** Gönderen acil durumu sonlandırdı (mürettebata ve sağlık ekibine "kapatıldı" bildirimi gider) */
  endedAt?: number
  /** Gönderenin sesli ya da yazılı cevabı ("Her şey yolunda mı?" sorusuna); mürettebat ve sağlık ekibi görür */
  notes?: AssistNote[]
}

export interface AssistNote {
  at: number
  text: string
}

/** Bir notun ve not sayısının üst sınırı */
export const ASSIST_NOTE_MAX = 500
export const ASSIST_NOTES_MAX = 40

export const assistDocId = (requestId: string) => `as:${requestId}`
export const isRequestId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v)

/** Gelen istekler bu süreden eskiyse gösterilmez (eski bir isteğin günler sonra açılmaması için) */
export const ASSIST_TTL_MS = 2 * 3_600_000
