import type { LayerId } from '../data/anatomy'

/*
 * Hologram sahnesi ile DOM katmanının (etiketler, yakınlaştırma) paylaştığı yerleşim hesapları.
 * Ayrı dosyada durur; böylece 3D sahne yüklenmeden de kullanılabilir.
 */

/** Katmanlara ayrılmış görünümde katmanların yatay konumu (metre) */
export const LAYER_X: Record<LayerId, number> = { muscles: -0.5, bones: 0.5 }

export const CAMERA_FOV = 30
export const LOOK_AT_Y = 0.88
const HALF_TAN = Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180)

/** Tek katman seçildiğinde diğerleri bu derinliğe çekilerek kaybolur (metre) */
export const BACK_Z = -3
/** Kaybolan katmanların ortadan uzaklığı ve aralığı (metre) */
export const BACK_GAP = 1.0
export const BACK_STEP = 0.75

/** single: tek figür (hologram ya da tek katman), wide: kas ve iskelet yan yana */
export type CameraMode = 'single' | 'wide'

export function cameraModeFor(exploded: boolean, focus: LayerId | null): CameraMode {
  return exploded && !focus ? 'wide' : 'single'
}

/**
 * Kameranın figürden uzaklığı (yakınlaştırma yokken).
 * fit: alan genişliğinin kullanılabilen oranı (ör. yanda kart açıkken figürler kartın solundaki boşluğa sığar).
 * Tek figürde kullanılmaz; tek figür dar boşluğa da sığar.
 */
export function cameraDistance(mode: CameraMode, aspect: number, fit = 1) {
  // İki figür: kenardaki figürün kolları da (yaklaşık ±0,85 m) kullanılabilen genişliğe sığar
  // Kart açıkken (fit < 1) kenar payı daralır: figürler dar boşlukta mümkün olduğunca büyük kalır
  if (mode === 'wide') return Math.max(4.4, (fit < 1 ? 1.0 : 1.1) / (HALF_TAN * aspect * fit))
  return Math.max(4.0, 0.95 / (HALF_TAN * aspect))
}

/**
 * Kameranın baktığı yükseklik. Kart açıkken kamera geri çekilir (figürler dar boşluğa sığar); bakış noktası da aynı oranda
 * yükselir, böylece zemin ekranda varsayılan görünümdeki yerinde kalır ve figürler havada asılı değil, yere basar görünür.
 */
export function lookAtY(mode: CameraMode, aspect: number, fit = 1) {
  return (LOOK_AT_Y * cameraDistance(mode, aspect, fit)) / cameraDistance(mode, aspect, 1)
}

/** Verilen uzaklıktaki kameranın z = 0 düzleminde gördüğü genişlik (metre) */
export function visibleWidth(distance: number, aspect: number) {
  return 2 * distance * HALF_TAN * aspect
}

/** Sahnedeki bir noktanın (z = 0 düzlemi) yakınlaştırma yokken ekrandaki yeri, 0–1 aralığında */
export function projectToScreen(x: number, y: number, mode: CameraMode, aspect: number, fit = 1) {
  const d = cameraDistance(mode, aspect, fit)
  return {
    left: 0.5 + x / (2 * d * HALF_TAN * aspect),
    top: 0.5 + (lookAtY(mode, aspect, fit) - y) / (2 * d * HALF_TAN),
  }
}

/* ---------- Yakınlaştırma ve kaydırma ---------- */

export const ZOOM_MIN = 1
export const ZOOM_MAX = 5

/** Kameranın hedef görünümü: yakınlaştırma katsayısı ve varsayılan bakış noktasından kayma (metre) */
export interface ViewTarget {
  zoom: number
  panX: number
  panY: number
}

export const DEFAULT_VIEW: ViewTarget = { zoom: 1, panX: 0, panY: 0 }

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Kayma sınırı: yakınlaştırılmış görüntü varsayılan çerçevenin dışına taşmaz (1×'te kayma sıfırdır) */
function clampPan(v: ViewTarget, mode: CameraMode, aspect: number, fit: number) {
  const d0 = cameraDistance(mode, aspect, fit)
  const maxY = (d0 - d0 / v.zoom) * HALF_TAN
  const maxX = maxY * aspect
  v.panX = clamp(v.panX, -maxX, maxX)
  v.panY = clamp(v.panY, -maxY, maxY)
}

/**
 * İmlecin altındaki nokta yerinde kalacak şekilde yakınlaştırır ya da uzaklaştırır.
 * nx, ny: imlecin 3D alandaki yeri, -1 (sol/alt) ile 1 (sağ/üst) arasında.
 */
export function zoomAt(v: ViewTarget, factor: number, nx: number, ny: number, mode: CameraMode, aspect: number, fit = 1) {
  const d0 = cameraDistance(mode, aspect, fit)
  const d = d0 / v.zoom
  const wx = v.panX + nx * d * HALF_TAN * aspect
  const wy = v.panY + ny * d * HALF_TAN
  v.zoom = clamp(v.zoom * factor, ZOOM_MIN, ZOOM_MAX)
  const d2 = d0 / v.zoom
  v.panX = wx - nx * d2 * HALF_TAN * aspect
  v.panY = wy - ny * d2 * HALF_TAN
  clampPan(v, mode, aspect, fit)
}

/** Görüntüyü fareyle tutup sürüklemiş gibi kaydırır (piksel cinsinden) */
export function panBy(v: ViewTarget, dx: number, dy: number, heightPx: number, mode: CameraMode, aspect: number, fit = 1) {
  const perPixel = (2 * (cameraDistance(mode, aspect, fit) / v.zoom) * HALF_TAN) / Math.max(heightPx, 1)
  v.panX -= dx * perPixel
  v.panY += dy * perPixel
  clampPan(v, mode, aspect, fit)
}
