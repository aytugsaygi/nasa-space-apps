import { useSyncExternalStore } from 'react'

/**
 * Bir bölüm sürüklenirken açık olan küçük ortak durum.
 * 3D sahne bunu okuyup çizimi duraklatır; böylece ekran kartı sürüklemeye ayrılır ve hareket akıcı kalır.
 * R3F ayrı bir React ağacında çalıştığı için bağlam (context) yerine modül düzeyinde saklanır.
 */
let dragging = false
const listeners = new Set<() => void>()

export function setToolDragging(value: boolean) {
  if (dragging === value) return
  dragging = value
  document.body.classList.toggle('tool-dragging', value)
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Sahne duraklamalı mı: bir bölüm sürükleniyor */
export function useScenePaused() {
  return useSyncExternalStore(subscribe, () => dragging)
}
