import { useSyncExternalStore } from 'react'
import { CREW, FLIGHT_SURGEON } from '../core/crew'
import type { MessageDoc } from '../core/model'
import { resolve, type Lang } from '../i18n'

/** Alıcıya ulaşmış rapor ya da mesaj */
export type InboxMessage = MessageDoc & { delivered: boolean }

/*
 * Okunmamış mesajlar: uygulama kapalıyken ya da açılış ekranı sürerken ulaşan rapor ve mesajlar. Bunlar sağ altta kayarak
 * çıkmaz; zil düğmesindeki listede bekler ve açılışta zilin altında "okunmamış bildirimlerin var" kutusu çıkar.
 * Liste mesaj bildirimi bileşeninde (MessageNotifier) tutulur; üst bar buradan okur ve mesajı onun açma işleviyle açar.
 */

let unread: InboxMessage[] = []
let handlers: { open: (m: InboxMessage) => void; markRead: (ids: string[]) => void } = { open: () => {}, markRead: () => {} }
const listeners = new Set<() => void>()

export function setUnreadMessages(list: InboxMessage[]) {
  const same = list.length === unread.length && list.every((m, i) => m.id === unread[i]?.id)
  if (same) return
  unread = list
  listeners.forEach((fn) => fn())
}

export function registerInboxHandlers(h: typeof handlers) {
  handlers = h
}

export function useInbox() {
  const list = useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => unread,
    () => unread,
  )
  return { unread: list, open: (m: InboxMessage) => handlers.open(m), markRead: (ids: string[]) => handlers.markRead(ids) }
}

/** Mesajın alıcısı ve göndereni (rolüyle: "Pilot A. Okafor") */
export function describeMessage(m: InboxMessage, lang: Lang) {
  const person = (id: InboxMessage['from'] | InboxMessage['to']) => (id === 'surgeon' ? FLIGHT_SURGEON : id === 'system' ? null : CREW[id])
  const to = person(m.to)!
  const from = person(m.from)
  return {
    to: { name: to.name, role: resolve(to.role, lang) },
    sender: from ? `${resolve(from.role, lang)} ${from.name}` : '',
    report: m.kind === 'report',
  }
}
