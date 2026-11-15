import { useSyncExternalStore } from 'react'

/*
 * Acil durumu bildiren kişinin kendi ekranındaki bildirim: "X acil durum bildirdi · mürettebat ve sağlık ekibi" ve
 * "X acil durumu kapattı". Mesaj bildirimleri gibi sağ altta sağdan kayarak çıkar (MessageNotifier'ın bölgesinde).
 * Bir olay = tek bildirim: aynı kimlikle ikinci kez eklenmez.
 */

export interface EmergencyNotice {
  /** İstek kimliği ve olay: "<id>:start" ya da "<id>:end" */
  id: string
  kind: 'start' | 'end'
  /** Bildiren (bildirim yalnızca onun ekranında görünür) */
  sender: string
  name: string
  at: number
  /** Sunucu yok: bildirim yalnızca bu tarayıcıya kaydedildi */
  demo: boolean
}

/** Bildirim bu süre sonra kendiliğinden kalkar (kişi daha önce kapatabilir) */
const SHOW_MS = { start: 8_000, end: 6_000 } as const

let notices: EmergencyNotice[] = []
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

export function pushEmergencyNotice(n: EmergencyNotice) {
  if (notices.some((x) => x.id === n.id)) return
  // Kapanış bildirimi gelince aynı isteğin açılış bildirimi kalkar (ekranda tek kutu)
  const request = n.id.split(':')[0]
  notices = [...notices.filter((x) => x.id.split(':')[0] !== request), n].slice(-3)
  timers.set(
    n.id,
    setTimeout(() => dismissEmergencyNotice(n.id), SHOW_MS[n.kind]),
  )
  emit()
}

export function dismissEmergencyNotice(id: string) {
  const t = timers.get(id)
  if (t) clearTimeout(t)
  timers.delete(id)
  if (!notices.some((x) => x.id === id)) return
  notices = notices.filter((x) => x.id !== id)
  emit()
}

/** Testler ve demo sıfırlama için */
export function clearEmergencyNotices() {
  for (const t of timers.values()) clearTimeout(t)
  timers.clear()
  notices = []
  emit()
}

export function useEmergencyNotices() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => notices,
    () => notices,
  )
}
