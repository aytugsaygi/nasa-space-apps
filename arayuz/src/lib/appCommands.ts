import { useEffect, useRef } from 'react'
import type { IndicatorId } from '../core/catalog'
import type { ExerciseId } from '../core/coach'

/*
 * Uygulama komutları: Sağlık Asistanı'nın cevabındaki düğmeler sitede bir şeyi doğrudan açar (sayfa, pencere, test,
 * grafik, belirli bir kan tahlili örneği…). Komutu, o şeyi zaten açabilen bileşen dinler; böylece asistan arayüzün iç
 * durumunu bilmek zorunda kalmaz. App önce komutun sayfasına geçer, sonra komutu yayınlar.
 */
export type AppCommand =
  | { type: 'page'; page: number }
  | { type: 'startComplaint' }
  | { type: 'openCheckin' }
  | { type: 'openRecords' }
  | { type: 'openJournal' }
  | { type: 'openLibrary'; item: 'cupola' | 'breathing' | 'gallery' }
  | { type: 'openMindGames' }
  | { type: 'openReaction' }
  | { type: 'openEmergency' }
  | { type: 'openDoctorContact' }
  | { type: 'openCrewAssist' }
  | { type: 'openIndicator'; id: IndicatorId }
  | { type: 'openExplorer'; id: IndicatorId }
  | { type: 'openLabs'; day?: number; view?: 'single' | 'history' | 'nasa' }
  | { type: 'openReport' }
  | { type: 'openMessages' }
  | { type: 'openImport' }
  | { type: 'openSchedule' }
  | { type: 'openMeasure' }
  | { type: 'openHistory' }
  | { type: 'openHazards' }
  | { type: 'openSources' }
  | { type: 'startTour' }
  | { type: 'openLayoutMenu' }
  | { type: 'showExercise'; exercise: ExerciseId }

export type AppCommandType = AppCommand['type']
type Of<T extends AppCommandType> = Extract<AppCommand, { type: T }>

const listeners = new Set<(cmd: AppCommand) => void>()

/** Komutu yayınlar (önce sayfa geçişi App'te yapılır) */
export function runCommand(cmd: AppCommand) {
  for (const fn of [...listeners]) fn(cmd)
}

/** Bütün komutları dinler (App: komutun bölümünün bulunduğu sayfaya geçer, uygulama düzeyindeki pencereleri açar) */
export function useAppCommands(handler: (cmd: AppCommand) => void) {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })
  useEffect(() => {
    const fn = (cmd: AppCommand) => ref.current(cmd)
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [])
}

/** Bir komut türünü dinler; işleyici her çizimde güncellenir, abonelik bir kez kurulur */
export function useAppCommand<T extends AppCommandType>(type: T, handler: (cmd: Of<T>) => void) {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })
  useEffect(() => {
    const fn = (cmd: AppCommand) => {
      if (cmd.type === type) ref.current(cmd as Of<T>)
    }
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [type])
}
