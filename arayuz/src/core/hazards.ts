import type { IndicatorId } from './catalog'
import type { SourceId } from './sources'
import { tx, type Tx } from './tx'

/**
 * NASA İnsan Araştırma Programı'nın insan uzay uçuşunun beş tehlikesi (hrpHazards). Açıklamalar NASA'nın tehlike
 * sayfasındaki cümlelerin çevirisidir. "indicators", uygulamada o tehlikeyle ilgili izlenen göstergelerdir; eşleştirme
 * tehlike sayfalarının saydığı etkilere göre yapıldı (ör. yerçekimi: kaslar, kemikler, iç kulak, organlar).
 */
export type HazardId = 'radiation' | 'isolation' | 'distance' | 'gravity' | 'hostile'

export interface Hazard {
  id: HazardId
  name: Tx
  desc: Tx
  /** Uygulamada bu tehlikeyle ilgili izlenen göstergeler */
  indicators: IndicatorId[]
  /** Tehlikenin NASA sayfası */
  url: string
  source: SourceId
}

export const HAZARDS: Hazard[] = [
  {
    id: 'radiation',
    name: tx('Uzay radyasyonu', 'Space radiation'),
    desc: tx(
      'Gözle görülmeyen uzay radyasyonu, uzay uçuşunun en tehlikeli yönlerinden biri sayılır.',
      'Invisible to the human eye, space radiation is considered one of the most hazardous aspects of spaceflight.',
    ),
    indicators: ['radiation'],
    url: 'https://www.nasa.gov/hrp/hazard-space-radiation/',
    source: 'hrpHazards',
  },
  {
    id: 'isolation',
    name: tx('Yalıtım ve kapalı alan', 'Isolation and confinement'),
    desc: tx(
      "Dünya'dan uzakta, küçük bir alanda uzun süre birlikte yaşayan gruplarda davranışsal tepkiler ortaya çıkar. Uyku kaybı ve bozulan gündüz-gece düzeni bunu ağırlaştırabilir.",
      'Behavioral responses occur among groups of people far from Earth who are isolated and confined in a small space over a long period of time. Sleep loss and disrupted circadian rhythms can compound them.',
    ),
    indicators: ['mood', 'sleep', 'reaction'],
    url: 'https://www.nasa.gov/hrp/hazard-isolation-and-confinement/',
    source: 'hrpIsolation',
  },
  {
    id: 'distance',
    name: tx("Dünya'ya uzaklık", 'Distance from Earth'),
    desc: tx(
      "Uzayın derinliklerine gidildikçe talimat, yeni malzeme ve tıbbi bakım almak giderek zorlaşır. Mars ortalama 140 milyon mil uzaktadır; mürettebat kendi başına karar vermek zorunda kalır.",
      'Instructions, new supplies, medical care, and more become increasingly challenging to receive from Earth as astronauts venture deeper into space. Mars is on average 140 million miles away; crews must be self-sufficient.',
    ),
    indicators: ['water', 'glucose'],
    url: 'https://www.nasa.gov/hrp/hazard-distance-from-earth/',
    source: 'hrpDistance',
  },
  {
    id: 'gravity',
    name: tx('Yerçekimi alanları', 'Gravity fields'),
    desc: tx(
      "Astronotların kasları, kemikleri, iç kulağı ve organları istasyondaki, Ay'daki, Mars'taki ve dönüşte Dünya'daki yeni yerçekimine uyum sağlamak zorundadır.",
      "Astronauts' entire bodies – muscles, bones, inner ear, and organs – must adjust to the new gravities on the space station, the Moon, Mars, and Earth once they return home.",
    ),
    indicators: ['hr', 'bp', 'exercise'],
    url: 'https://www.nasa.gov/hrp/hazard-gravity-fields/',
    source: 'hrpGravity',
  },
  {
    id: 'hostile',
    name: tx('Kapalı ve zorlu ortam', 'Hostile/closed environments'),
    desc: tx(
      'Uzay aracında güvenli bir ekosistem sürdürmek zordur: uygun sıcaklık, basınç ve aydınlatma, gürültüyü azaltmak, mikrop topluluklarını ve bağışıklık tepkilerini izlemek gerekir.',
      'Maintaining a safe ecosystem inside a spacecraft presents unique challenges, from ensuring optimal temperatures, pressures, and lighting, to reducing noise, monitoring microbial communities, and tracking immune responses.',
    ),
    indicators: ['co2', 'spo2', 'temp', 'resp'],
    url: 'https://www.nasa.gov/hrp/hazard-hostile-closed-environments/',
    source: 'hrpHazards',
  },
]

/** Bir göstergenin ilgili olduğu tehlikeler */
export const hazardsFor = (id: IndicatorId) => HAZARDS.filter((h) => h.indicators.includes(id))
