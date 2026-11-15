/**
 * Rehber turun spot ışığı geometrisi.
 *
 * Spot ışığı (karartmadaki delik) her zaman hedeften büyüktür: hedefin etrafında boşluk bırakılır.
 * Boşluk, komşu bir öğe daha yakındaysa küçülür; böylece delik yandaki göstergeyi kesmez.
 * Deliğin köşesi hedefin köşesiyle eş merkezlidir (hedefin yarıçapı + boşluk); yuvarlak düğmede daire olur.
 * Parlak halka bu deliğin tam kenarına çizilir.
 */

/** Hedef boyutuna göre istenen boşluk (px) */
const GAP_SMALL = 8
const GAP_MEDIUM = 10
const GAP_LARGE = 12
/** Komşu öğeyle arada en az bu kadar boşluk kalır */
const NEIGHBOR_CLEARANCE = 2
const MIN_GAP = 4

/** Komşuluk hesabında hesaba katılan, ekranda kutu gibi görünen öğeler */
const BOX_SELECTOR = 'button, a[href], input, .panel, [data-vital-card], [role="group"], .page-dots'

function onScreen(r: DOMRect) {
  return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth && r.bottom > 0 && r.top < window.innerHeight
}

/** Öğenin köşe yarıçapı; kendisinin yoksa (ör. düğme grubu) içindeki kutuların en büyüğü */
function radiusOf(el: Element) {
  const read = (e: Element) => {
    const v = parseFloat(getComputedStyle(e).borderTopLeftRadius) || 0
    const r = e.getBoundingClientRect()
    return Math.min(v, Math.min(r.width, r.height) / 2)
  }
  const own = read(el)
  if (own > 0) return own
  let max = 0
  const kids = el.querySelectorAll('*')
  for (let i = 0; i < kids.length && i < 120; i++) max = Math.max(max, read(kids[i]))
  return max
}

/** Hedefin dışındaki en yakın kutuya olan mesafe (hedefle örtüşen ya da onu içeren öğeler sayılmaz) */
function clearanceAround(el: Element, r: DOMRect) {
  let min = Infinity
  for (const o of document.querySelectorAll(BOX_SELECTOR)) {
    // Yan sayfadaki (gizli) öğeler komşu sayılmaz
    if (o === el || el.contains(o) || o.contains(el) || o.closest('.driver-popover') || o.closest('[data-page][inert]')) continue
    const q = o.getBoundingClientRect()
    if (!onScreen(q)) continue
    const dx = Math.max(q.left - r.right, r.left - q.right, 0)
    const dy = Math.max(q.top - r.bottom, r.top - q.bottom, 0)
    if (dx === 0 && dy === 0) continue
    min = Math.min(min, Math.max(dx, dy))
  }
  return min
}

export interface Spotlight {
  gap: number
  radius: number
  rect: DOMRect
}

export function spotlightFor(el: Element): Spotlight {
  const rect = el.getBoundingClientRect()
  const size = Math.min(rect.width, rect.height)
  const wanted = size <= 40 ? GAP_SMALL : size <= 120 ? GAP_MEDIUM : GAP_LARGE
  const gap = Math.max(MIN_GAP, Math.min(wanted, clearanceAround(el, rect) - NEIGHBOR_CLEARANCE))
  const radius = Math.min(radiusOf(el) + gap, size / 2 + gap)
  return { gap, radius, rect }
}

/* Halka: deliğin kenarında parlayan çerçeve (karartmanın üstünde, tur kutusunun altında) */

const RING_ID = 'tour-ring'

export function placeRing(el: Element | null | undefined) {
  let ring = document.getElementById(RING_ID)
  if (!ring) {
    ring = document.createElement('div')
    ring.id = RING_ID
    ring.setAttribute('aria-hidden', 'true')
    document.body.appendChild(ring)
  }
  if (!el || !el.isConnected) {
    ring.style.opacity = '0'
    return
  }
  const { gap, radius, rect } = spotlightFor(el)
  Object.assign(ring.style, {
    left: `${rect.left - gap}px`,
    top: `${rect.top - gap}px`,
    width: `${rect.width + gap * 2}px`,
    height: `${rect.height + gap * 2}px`,
    borderRadius: `${radius}px`,
    opacity: '1',
  })
}

export function removeRing() {
  document.getElementById(RING_ID)?.remove()
}
