import { describe, expect, it } from 'vitest'
import { CAMERA_FOV, cameraDistance, cameraModeFor, DEFAULT_VIEW, panBy, projectToScreen, ZOOM_MAX, ZOOM_MIN, zoomAt, type CameraMode, type ViewTarget } from './layout'

const HALF_TAN = Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180)
const ASPECT = 16 / 9
const view = (): ViewTarget => ({ ...DEFAULT_VIEW })

/** İmlecin (nx, ny) gösterdiği sahne noktası (z = 0 düzlemi) */
function worldAt(v: ViewTarget, nx: number, ny: number, mode: CameraMode) {
  const d = cameraDistance(mode, ASPECT) / v.zoom
  return { x: v.panX + nx * d * HALF_TAN * ASPECT, y: v.panY + ny * d * HALF_TAN }
}

describe('kamera kipi', () => {
  it('iki katman yan yanayken geniş, diğer durumlarda tek figür', () => {
    expect(cameraModeFor(false, null)).toBe('single')
    expect(cameraModeFor(true, null)).toBe('wide')
    expect(cameraModeFor(true, 'muscles')).toBe('single')
  })

  it('geniş kipte kamera daha uzaktadır', () => {
    expect(cameraDistance('wide', ASPECT)).toBeGreaterThan(cameraDistance('single', ASPECT))
  })

  it('bakış noktası ekranın ortasına düşer', () => {
    const p = projectToScreen(0, 0.88, 'single', ASPECT)
    expect(p.left).toBeCloseTo(0.5)
    expect(p.top).toBeCloseTo(0.5)
  })
})

describe('zoomAt', () => {
  it('yakınlaştırma %100–%500 aralığında kalır', () => {
    const v = view()
    for (let i = 0; i < 20; i++) zoomAt(v, 2, 0, 0, 'single', ASPECT)
    expect(v.zoom).toBe(ZOOM_MAX)
    for (let i = 0; i < 20; i++) zoomAt(v, 0.5, 0, 0, 'single', ASPECT)
    expect(v.zoom).toBe(ZOOM_MIN)
  })

  it('imlecin gösterdiği nokta yakınlaşınca yerinde kalır', () => {
    for (const mode of ['single', 'wide'] as const) {
      const v = view()
      const before = worldAt(v, 0.3, -0.2, mode)
      zoomAt(v, 2, 0.3, -0.2, mode, ASPECT)
      const after = worldAt(v, 0.3, -0.2, mode)
      expect(after.x).toBeCloseTo(before.x)
      expect(after.y).toBeCloseTo(before.y)
    }
  })

  it('ortadan yakınlaşınca görüntü kaymaz', () => {
    const v = view()
    zoomAt(v, 3, 0, 0, 'single', ASPECT)
    expect(v.panX).toBeCloseTo(0)
    expect(v.panY).toBeCloseTo(0)
  })

  it('%100e dönünce kayma sıfırlanır', () => {
    const v = view()
    zoomAt(v, 3, 0.5, 0.5, 'single', ASPECT)
    expect(v.panX).not.toBeCloseTo(0)
    zoomAt(v, 1 / 10, 0.5, 0.5, 'single', ASPECT)
    expect(v.zoom).toBe(1)
    expect(v.panX).toBeCloseTo(0)
    expect(v.panY).toBeCloseTo(0)
  })
})

describe('panBy', () => {
  it('%100de görüntü kaydırılamaz', () => {
    const v = view()
    panBy(v, 200, 150, 600, 'single', ASPECT)
    expect(v.panX).toBeCloseTo(0)
    expect(v.panY).toBeCloseTo(0)
  })

  it('yakınlaşmışken sürükleme yönünün tersine kayar ve çerçeveden taşmaz', () => {
    const v = view()
    zoomAt(v, 4, 0, 0, 'single', ASPECT)
    panBy(v, 20, 0, 600, 'single', ASPECT)
    expect(v.panX).toBeLessThan(0)
    panBy(v, 0, 20, 600, 'single', ASPECT)
    expect(v.panY).toBeGreaterThan(0)

    // Çok uzağa sürüklense de kayma, varsayılan çerçevenin sınırında durur
    panBy(v, -100000, 100000, 600, 'single', ASPECT)
    const d0 = cameraDistance('single', ASPECT)
    const maxY = (d0 - d0 / v.zoom) * HALF_TAN
    expect(v.panY).toBeCloseTo(maxY)
    expect(v.panX).toBeCloseTo(maxY * ASPECT)
  })
})
