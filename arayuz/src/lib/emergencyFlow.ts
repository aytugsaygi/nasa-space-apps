import { useSyncExternalStore } from 'react'

/*
 * Acil destek akışlarının açık olup olmadığı. "Hekimle iletişime geç" penceresi uygulama düzeyinde tek bir yerde çizilir;
 * acil destek bölümü, acil destek penceresi ya da check-in formu onu buradan açar (iç içe pencere oluşmaz).
 */

let doctorOpen = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

export function openDoctorContact() {
  doctorOpen = true
  emit()
}

export function closeDoctorContact() {
  doctorOpen = false
  emit()
}

export function useDoctorContactOpen() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => doctorOpen,
    () => false,
  )
}

/* Acil durum (mürettebattan acil yardım isteği) ekranı */
let assistOpen = false
const assistListeners = new Set<() => void>()
const emitAssist = () => assistListeners.forEach((fn) => fn())

export function openCrewAssist() {
  assistOpen = true
  emitAssist()
}

export function closeCrewAssist() {
  assistOpen = false
  emitAssist()
}

export function useCrewAssistOpen() {
  return useSyncExternalStore(
    (fn) => {
      assistListeners.add(fn)
      return () => assistListeners.delete(fn)
    },
    () => assistOpen,
    () => false,
  )
}
