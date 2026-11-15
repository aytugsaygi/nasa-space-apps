import { INDICATOR_IDS, INDICATORS, type Band, type IndicatorId } from './catalog'
import { SOURCE_LIST, SOURCES, type SourceId } from './sources'
import { tx, type Tx } from './tx'

/*
 * "NASA verisi nerede karar veriyor?" haritası. Elle yazılmış bir liste değildir: eşik satırları gösterge kataloğundaki
 * her bandın dayanağından (basis) üretilir; katalog değişince harita da değişir. Kaynaklar penceresinin "NASA verisi"
 * sekmesi ve teslim metni (scripts/nasa-data-table.mjs) buradan okur.
 *
 * Dürüstlük: NASA belgesine dayanan eşik, tıbbi kaynağa dayanan eşik ve Health Atlas kuralı (kaynakta eşik yok) ayrı
 * etiketlenir. Cupola dokuları ve Dünya galerisi karar vermez; "deneyim" olarak ayrı yazılır.
 */

export type BasisKind = 'nasa' | 'medical' | 'rule'

/** Bir bandın dayanağının türü: NASA belgesi/verisi, tıbbi kaynak ya da Health Atlas kuralı */
export function basisKind(basis: Band['basis']): BasisKind {
  if (basis === 'vitalis') return 'rule'
  const kind = SOURCES[basis].kind
  return kind === 'nasa' || kind === 'nasaData' ? 'nasa' : 'medical'
}

export interface ThresholdRow {
  indicator: IndicatorId
  /** Dayanağa göre gruplanmış bant sayıları ve kaynaklar */
  groups: { kind: BasisKind; bands: number; sources: SourceId[] }[]
}

/** Her gösterge için eşiklerin dayanakları (tansiyonda iki değerin bantları birlikte sayılır) */
export function thresholdRows(): ThresholdRow[] {
  return INDICATOR_IDS.map((id) => {
    const ind = INDICATORS[id]
    const bands = [...ind.bands, ...(ind.bands2 ?? [])]
    const groups = (['nasa', 'medical', 'rule'] as BasisKind[])
      .map((kind) => {
        const own = bands.filter((b) => basisKind(b.basis) === kind)
        const sources = [...new Set(own.map((b) => b.basis).filter((b): b is SourceId => b !== 'vitalis'))]
        return { kind, bands: own.length, sources }
      })
      .filter((g) => g.bands > 0)
    return { indicator: id, groups }
  })
}

export interface DecisionRow {
  id: string
  /** Karar ya da deneyim */
  type: 'decision' | 'experience'
  what: Tx
  where: Tx
  /** NASA verisi mi, NASA belgesindeki eşik mi */
  data: Tx
  sources: SourceId[]
  /** Kaynaklar listesinde olmayan (görsel varlık) bağlantılar */
  links?: { label: string; url: string }[]
}

/**
 * Eşik dışındaki kararlar. Her satırın kaynakları kodda o kararı veren yerde de yazılıdır (analysis.ts, labs.ts,
 * coach.ts, hazards.ts); nasaMap.test.ts her kaynağın listede olduğunu denetler.
 */
export const DECISIONS: DecisionRow[] = [
  {
    id: 'labs',
    type: 'decision',
    what: tx('Kan tahlilinde "Düşük" ve "Yüksek" bayrakları', '"Low" and "High" flags in blood tests'),
    where: tx('Sağlık kayıtları → Kan tahlilleri', 'Health records → Blood tests'),
    data: tx(
      'Gerçek veri: Inspiration4 mürettebatının laboratuvar referans aralıkları ve değerleri',
      'Real data: laboratory reference ranges and values from the Inspiration4 crew',
    ),
    sources: ['osd569', 'osd575'],
  },
  {
    id: 'sep',
    type: 'decision',
    what: tx('Kritik radyasyon uyarısı ("korunaklı bölüme geç")', 'Critical radiation alert ("move to the shielded area")'),
    where: tx('Uyarı kutusu ve Ortam ve radyasyon kartı', 'Alert box and Environment and radiation card'),
    data: tx(
      'Gerçek veri: DONKI\'nin kaydettiği bir güneş parçacık olayı (SEP) uyarıyı tetikler; tek olay sınırı 250 mSv',
      'Real data: a solar particle event (SEP) recorded by DONKI triggers the alert; single-event limit 250 mSv',
    ),
    sources: ['donki', 'tb020'],
  },
  {
    id: 'career',
    type: 'decision',
    what: tx('Toplam radyasyon dozunun kariyer sınırına oranı', 'Total radiation dose as a share of the career limit'),
    where: tx('Ana sayfa radyasyon kartı ve uyarı (%80 üstü)', 'Home radiation card and alert (above 80%)'),
    data: tx('NASA belgesindeki sınır: kariyer boyunca 600 mSv', 'Limit from a NASA document: 600 mSv over a career'),
    sources: ['tb020'],
  },
  {
    id: 'delay',
    type: 'decision',
    what: tx('Uçuş hekimine giden mesajın gecikmesi ve iletişim kesintisi', 'Delay of messages to the flight surgeon and communication blackout'),
    where: tx('Rapor ve uçuş hekimi; görev ortamı Mars seçilince', 'Report and flight surgeon; when the mission environment is Mars'),
    data: tx('NASA belgesindeki değer: Mars\'a tek yönde ~3–22,5 dakika; kavuşumda günlerce kesinti', 'Value from NASA documents: ~3–22.5 minutes one way to Mars; days of blackout at conjunction'),
    sources: ['podcastDistance', 'ascend'],
  },
  {
    id: 'exercise',
    type: 'decision',
    what: tx('Günün egzersiz programı ve günlük hedef', 'Daily exercise program and daily target'),
    where: tx('Spor → Günün programı ve Spor koçu', 'Training → Today\'s program and Training coach'),
    data: tx(
      'NASA belgesindeki program: istasyonda ARED, T2 ve CEVIS ile günde ~2 saat; Orion\'da uçan tekerlek',
      'Program from NASA documents: ~2 hours a day with ARED, T2 and CEVIS on the station; flywheel on Orion',
    ),
    sources: ['nasaExercise', 'orionLife', 'orionFlywheel'],
  },
  {
    id: 'hazards',
    type: 'decision',
    what: tx('Göstergelerin bağlandığı beş uzay tehlikesi', 'The five spaceflight hazards each indicator is linked to'),
    where: tx('Gösterge ayrıntısı ve Tehlikeler penceresi', 'Indicator details and the Hazards dialog'),
    data: tx('NASA İnsan Araştırma Programı\'nın beş tehlikesi', 'The five hazards of NASA\'s Human Research Program'),
    sources: ['hrpHazards'],
  },
  {
    id: 'epic',
    type: 'experience',
    what: tx('Dünya galerisi: EPIC kamerasının Dünya fotoğrafları', 'Earth gallery: Earth photos from the EPIC camera'),
    where: tx('Zihinsel sağlık → Destek kütüphanesi', 'Mental health → Support library'),
    data: tx('Gerçek veri (karar vermez; deneyim)', 'Real data (no decision; experience)'),
    sources: ['epic'],
  },
]

/** Uygulamanın çektiği NASA veri setleri (DONKI ve EPIC canlı, internet yokken gömülü anlık görüntü; OSDR anlık görüntü) */
export const NASA_DATASETS: SourceId[] = ['donki', 'epic', 'osd569', 'osd575']

export interface NasaCounts {
  /** Doğrulanmış kaynak sayısı (Kaynaklar listesi) */
  sources: number
  /** Bunlardan NASA belgesi ya da verisi olanlar */
  nasaSources: number
  indicators: number
  /** En az bir eşiği NASA belgesine dayanan gösterge sayısı */
  nasaIndicators: number
  /** NASA belgesine dayanan bant sayısı / toplam bant */
  nasaBands: number
  bands: number
}

export function nasaCounts(): NasaCounts {
  const rows = thresholdRows()
  const sum = (kind?: BasisKind) => rows.reduce((n, r) => n + r.groups.filter((g) => !kind || g.kind === kind).reduce((m, g) => m + g.bands, 0), 0)
  return {
    sources: SOURCE_LIST.length,
    nasaSources: SOURCE_LIST.filter((s) => s.kind === 'nasa' || s.kind === 'nasaData').length,
    indicators: rows.length,
    nasaIndicators: rows.filter((r) => r.groups.some((g) => g.kind === 'nasa')).length,
    nasaBands: sum('nasa'),
    bands: sum(),
  }
}

/** Bir kaynak NASA'nın mı (uyarı kutusundaki ve gösterge ayrıntısındaki "NASA" rozeti için) */
export const isNasaSource = (id: SourceId) => SOURCES[id].kind === 'nasa' || SOURCES[id].kind === 'nasaData'
