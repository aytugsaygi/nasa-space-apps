import { useSyncExternalStore } from 'react'
import type { ExerciseId } from '../core/coach'

/*
 * Programdaki "Hareketi göster" düğmesi ile hologram antrenör arasındaki ortak durum:
 * hangi hareket gösteriliyor ve oynatılıyor mu.
 */

export interface TrainerState {
  exercise: ExerciseId | null
  playing: boolean
  /** Programdaki sırası (yapıldı işaretlemek için) */
  index: number | null
  /** Kamera ve hareket baştan başlasın diye her sıfırlamada artar (sahne bu değerle yeniden kurulur) */
  view: number
}

let state: TrainerState = { exercise: null, playing: false, index: null, view: 0 }
const listeners = new Set<() => void>()

export function setTrainer(next: Partial<TrainerState>) {
  state = { ...state, ...next }
  for (const l of listeners) l()
}

/** Hareketi bırakır ve hologramı ilk görünümüne (açı, uzaklık, boş antrenör) döndürür */
export function resetTrainer() {
  setTrainer({ exercise: null, playing: false, index: null, view: state.view + 1 })
}

export function useTrainer(): TrainerState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}
