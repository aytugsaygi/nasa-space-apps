import { useEffect, useLayoutEffect, useRef } from 'react'

/**
 * Pencere düzeyinde tuş dinleyicisi; her zaman en son çizimdeki işleyiciyi çağırır.
 * Dinleyici bir kez bağlanır. İşleyici her çizimde yeniden bağlansaydı, yeni durum çizildikten sonra ama dinleyici
 * yenilenmeden önce gelen bir basış eski durumu görür ve kaybolabilirdi (ör. geri bildirim bitmiş ama eski işleyici
 * "geri bildirim gösteriliyor" sanır). İşleyici çizimle aynı anda (useLayoutEffect) güncellendiği için arada tuş olayı
 * işlenemez.
 */
export function useWindowKeys(handler: (e: KeyboardEvent) => void) {
  const latest = useRef(handler)
  useLayoutEffect(() => {
    latest.current = handler
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => latest.current(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
