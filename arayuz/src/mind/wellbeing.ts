import { tx, type Lang, type Tx } from '../i18n'

/*
 * Ruh sağlığı bölümlerinin verileri: Cupola seansları, üzerinden geçilen yerlerin adları.
 * Metinler tx(Türkçe, İngilizce) çiftleriyle yazılır.
 */

/* ---------- Cupola seansları ---------- */

export type SessionId = 'sunrise' | 'sahara' | 'ocean' | 'cityLights'

export interface CupolaSession {
  id: SessionId
  title: Tx
  /** Seansın türü (belgedeki kategoriler: doğa, deniz, şehir) */
  kind: Tx
  description: Tx
  /** Seansın başladığı yer (istasyonun tam altındaki nokta, derece) */
  lat: number
  lon: number
  /** Yörünge yönü: kuzeyden saat yönünde (derece); istasyon yaklaşık kuzeydoğuya doğru ilerler */
  heading: number
  /** Güneşin tam tepede olduğu nokta (derece); gece-gündüz sınırı buna göre çizilir */
  sunLat: number
  sunLon: number
}

/**
 * Seanslar. Güneşin konumu, seansın havasını belirler:
 * gün doğumunda istasyon gece tarafından gündüze doğru ilerler; gece ışıklarında güneş Dünya'nın arkasındadır.
 */
export const CUPOLA_SESSIONS: CupolaSession[] = [
  {
    id: 'sunrise',
    title: tx('Gün doğumu', 'Sunrise'),
    kind: tx('Gökyüzü', 'Sky'),
    description: tx(
      'Pasifik Okyanusu üzerinde gecenin içinden gün ışığına doğru ilerle. Ufuk çizgisinin önce maviye, sonra turuncuya dönüşünü izle.',
      'Travel from night into daylight over the Pacific Ocean. Watch the horizon turn blue, then orange.',
    ),
    lat: -8,
    lon: -150,
    heading: 60,
    sunLat: 5,
    sunLon: -40,
  },
  {
    id: 'sahara',
    title: tx('Sahra ve Nil', 'Sahara and the Nile'),
    kind: tx('Doğa', 'Nature'),
    description: tx(
      'Sahra Çölü\'nün kum denizinin üzerinden Nil Vadisi\'ne ve Kızıldeniz\'e doğru süzül.',
      'Glide over the sand sea of the Sahara towards the Nile Valley and the Red Sea.',
    ),
    lat: 18,
    lon: 8,
    heading: 70,
    sunLat: 12,
    sunLon: -5,
  },
  {
    id: 'ocean',
    title: tx('Hint Okyanusu', 'Indian Ocean'),
    kind: tx('Deniz', 'Sea'),
    description: tx(
      'Uçsuz bucaksız mavinin üzerinde, güneşin suya yansıyan parıltısıyla sakin bir geçiş.',
      'A calm pass over endless blue, with sunlight glinting on the water.',
    ),
    lat: -22,
    lon: 62,
    heading: 55,
    sunLat: -18,
    sunLon: 70,
  },
  {
    id: 'cityLights',
    title: tx('Gece ışıkları', 'City lights'),
    kind: tx('Şehir', 'City'),
    description: tx(
      'Gecenin karanlığında Avrupa\'nın şehir ışıklarının üzerinden geç. Işıklar insanların orada yaşadığını hatırlatır.',
      'Pass over the city lights of Europe in the dark of night. The lights are a reminder of the people living below.',
    ),
    lat: 40,
    lon: -6,
    heading: 65,
    sunLat: -10,
    sunLon: 175,
  },
]

/** Seans süresi seçenekleri (dakika) */
export const SESSION_MINUTES = [3, 5, 10] as const
/** Hız seçenekleri: gerçek yörünge hızı ve hızlandırılmış */
export const SESSION_SPEEDS = [1, 8] as const

/* ---------- Üzerinden geçilen yer ---------- */

/**
 * Kaba bölge kutuları: [ad, güney, kuzey, batı, doğu] (derece). Sıra önemlidir: önce küçük ve belirgin yerler denenir.
 * Amaç tam harita değil, seansı anlatan kısa bir yer adı vermektir.
 */
const PLACES: [Tx, number, number, number, number][] = [
  [tx('Nil Vadisi', 'Nile Valley'), 22, 31.5, 29.5, 33.5],
  [tx('Kızıldeniz', 'Red Sea'), 13, 28, 33, 43],
  [tx('Akdeniz', 'Mediterranean Sea'), 31, 45, -5, 36],
  [tx('Himalayalar', 'Himalayas'), 27, 36, 72, 96],
  [tx('Arap Yarımadası', 'Arabian Peninsula'), 12, 32, 35, 60],
  [tx('Sahra Çölü', 'Sahara Desert'), 15, 33, -17, 35],
  [tx('Avrupa', 'Europe'), 36, 71, -11, 45],
  [tx('Hindistan', 'India'), 6, 30, 68, 90],
  [tx('Doğu Asya', 'East Asia'), 18, 54, 96, 146],
  [tx('Avustralya', 'Australia'), -44, -10, 112, 155],
  [tx('Afrika', 'Africa'), -35, 15, -18, 52],
  [tx('Kuzey Amerika', 'North America'), 15, 72, -168, -52],
  [tx('Güney Amerika', 'South America'), -56, 13, -82, -34],
  [tx('Hint Okyanusu', 'Indian Ocean'), -50, 25, 40, 112],
  [tx('Atlantik Okyanusu', 'Atlantic Ocean'), -60, 70, -70, -5],
  [tx('Antarktika', 'Antarctica'), -90, -60, -180, 180],
]
const PACIFIC = tx('Pasifik Okyanusu', 'Pacific Ocean')

/** İstasyonun altındaki yerin adı (bilinmeyen açık denizler Pasifik sayılır) */
export function placeAt(lat: number, lon: number, lang: Lang): string {
  const l = ((((lon + 180) % 360) + 360) % 360) - 180
  const hit = PLACES.find(([, s, n, w, e]) => lat >= s && lat <= n && l >= w && l <= e)
  return (hit ? hit[0] : PACIFIC)[lang]
}

/** Enlem ve boylamı yön harfleriyle yazar: "12,4° K · 34,1° D" */
export function formatCoords(lat: number, lon: number, lang: Lang): string {
  const f = new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const l = ((((lon + 180) % 360) + 360) % 360) - 180
  const ns = lat >= 0 ? (lang === 'tr' ? 'K' : 'N') : lang === 'tr' ? 'G' : 'S'
  const ew = l >= 0 ? (lang === 'tr' ? 'D' : 'E') : lang === 'tr' ? 'B' : 'W'
  return `${f.format(Math.abs(lat))}° ${ns} · ${f.format(Math.abs(l))}° ${ew}`
}
