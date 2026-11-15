/**
 * Arayüz ile veri grupları arasındaki sözleşme taslağı.
 * Diğer gruplar gerçek veriyi bu biçimde gönderirse arayüz değişmeden çalışır.
 */

export type Status = 'normal' | 'dikkat' | 'kritik'

export type RegionId =
  | 'bas'
  | 'gogus'
  | 'sirt'
  | 'ustKol'
  | 'onKol'
  | 'eller'
  | 'bacaklar'
  | 'ayaklar'

export interface Metric {
  label: string
  value: string
  unit?: string
  /** Üzerine gelince gösterilen kısa açıklama */
  hint: string
  status?: Status
}

export interface RegionData {
  id: RegionId
  name: string
  /** Hologramın hangi yönden bu bölgeyi gösterdiği */
  facing: 'on' | 'arka'
  status: Status
  summary: string
  metrics: Metric[]
  trend: {
    label: string
    unit: string
    /** Son 7 günün değerleri, en eski önce */
    values: number[]
    /** Normal aralık [alt, üst] */
    range: [number, number]
  }
  details: string[]
  advice: string
  source: { label: string; url: string }
}

export interface Vital {
  id: string
  label: string
  value: string
  unit: string
  hint: string
  status: Status
}

export type AlertLevel = 'bilgi' | 'dikkat' | 'kritik'

export interface HealthAlert {
  id: string
  level: AlertLevel
  title: string
  body: string
  region?: RegionId
}
