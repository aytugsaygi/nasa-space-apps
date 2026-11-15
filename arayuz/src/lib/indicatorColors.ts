import { INDICATORS, type IndicatorId } from '../core/catalog'

/** Anlık ölçülen göstergenin mini grafiği son 24 saati, günlük ölçülenin grafiği son 7 günü gösterir */
export const isLiveIndicator = (id: IndicatorId) => INDICATORS[id].cadence === 'live' || INDICATORS[id].cadence === 'hourly'

/**
 * Ana sayfadaki her gösterge kartının kendi rengi: kartın kenar ışığı, simgesi, arka plan parıltısı ve mini grafiği.
 * Durum renkleriyle (yeşil, sarı, kırmızı) karışmasın diye soğuk tonlar ve pembe seçildi.
 */
export const INDICATOR_COLORS: Partial<Record<IndicatorId, string>> = {
  hr: '#6fe9d6',
  bp: '#5cc9e8',
  spo2: '#7aa7ff',
  temp: '#b69cff',
  glucose: '#e39cff',
  sleep: '#8f9cff',
  radiation: '#62e0ff',
  mood: '#ffa6d1',
}

export const indicatorColor = (id: IndicatorId) => INDICATOR_COLORS[id] ?? '#6fe9d6'
