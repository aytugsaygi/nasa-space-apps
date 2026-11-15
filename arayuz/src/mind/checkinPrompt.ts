import { useCallback, useEffect, useRef, useState } from 'react'
import type { CheckinWindowView } from '../core/checkins'
import type { CrewId } from '../core/crew'
import { useHealth, useQuery } from '../data/health'
import { useIdle } from '../lib/interaction'

/**
 * Otomatik check-in sorusunun gösterilebileceği pencere; yoksa null (docs/wellbeing CI-03, C-21).
 * Yalnızca astronot görünümünde, pencerede daha önce sorulmamış ve kişi bir şey yapmamışken (autoPrompt), ve uygun bir boş
 * anda (açık pencere, form, mesaj, nefes egzersizi, Cupola, tur ya da açılış yokken) soru döner. Kaydedilmiş ve atlanmış
 * pencere autoPrompt taşımaz, yani kendiliğinden yeniden açılmaz.
 */
export function useCheckinAutoPrompt(quietMs?: number): CheckinWindowView | null {
  const { astronaut, canEdit } = useHealth()
  const idle = useIdle(quietMs)
  const current = useQuery('currentCheckin', astronaut && canEdit ? [astronaut] : null)
  return idle && current?.autoPrompt ? current : null
}

/**
 * Check-in formunun açık olduğu pencere ve onu açıp kapatan işlevler.
 * enabled iken (açılış bitti, astronot görünümü) açık ve henüz sunulmamış pencere uygun boş anda kendiliğinden açılır:
 * önce "sunuldu" kaydedilir (bir kişi ve pencere için en fazla bir kez, yeniden yüklemede de), sonra form açık sayılır
 * (geç gönderim için) ve gösterilir. Kayıt yazılamazsa form gösterilmez; aynı anda tekrar tekrar denenmez.
 */
export function useEntryCheckin(enabled: boolean, quietMs?: number) {
  const { astronaut, canEdit, mutate } = useHealth()
  const [state, setState] = useState<{ astronaut: CrewId; key: string } | null>(null)
  // Görüntülenen astronot değişirse eski kişinin formu açık kalmaz
  const key = state && state.astronaut === astronaut ? state.key : null
  const auto = useCheckinAutoPrompt(quietMs)
  const autoKey = enabled && canEdit && astronaut && key === null ? (auto?.key ?? null) : null
  const handled = useRef<string | null>(null)

  useEffect(() => {
    if (!autoKey || !astronaut) return
    const id = `${astronaut}|${autoKey}`
    if (handled.current === id) return
    handled.current = id
    void (async () => {
      try {
        const marked = await mutate('markCheckinPrompted', astronaut, autoKey)
        if (!marked?.ok) return
        const opened = await mutate('openCheckin', astronaut, autoKey)
        if (opened?.ok) setState({ astronaut, key: autoKey })
      } catch {
        /* Sunucuya ulaşılamadı: bu oturumda bu pencere için yeniden denenmez */
      }
    })()
  }, [autoKey, astronaut, mutate])

  const open = useCallback(
    (windowKey: string) => {
      if (!astronaut) return
      mutate('openCheckin', astronaut, windowKey)
        .then((r) => {
          if (r?.ok) setState({ astronaut, key: windowKey })
        })
        .catch(() => {})
    },
    [astronaut, mutate],
  )
  const close = useCallback(() => setState(null), [])

  return { key, open, close }
}
