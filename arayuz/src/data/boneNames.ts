/**
 * Kemik adlarının Türkçesi. Modeldeki adlar (Z-Anatomy) İngilizcedir; Türkçe arayüzde bu sözlükle çevrilir.
 * Kaburga, omur, parmak kemiği ve diş gibi sıralı adlar kalıpla çözülür ("Fifth rib (sol)" → "Sol 5. kaburga").
 * Sözlükte olmayan bir ad İngilizce kalır.
 */

const BASE: Record<string, string> = {
  // Kafatası ve yüz
  'parietal bone': 'Yan kafa kemiği',
  'frontal bone': 'Alın kemiği',
  'sinus of frontal bone': 'Alın kemiği sinüsü',
  'occipital bone': 'Art kafa kemiği',
  'sphenoid bone': 'Kama kemiği',
  'sinus of sphenoid bone': 'Kama kemiği sinüsü',
  'temporal bone': 'Şakak kemiği',
  'ethmoid bone': 'Kalbur kemiği',
  'anterior cells of ethmoid bone': 'Kalbur kemiği ön hücreleri',
  'middle cells of ethmoid bone': 'Kalbur kemiği orta hücreleri',
  'posterior cells of ethmoid bone': 'Kalbur kemiği arka hücreleri',
  'inferior nasal concha bone': 'Alt burun kemikçiği',
  'lacrimal bone': 'Gözyaşı kemiği',
  'nasal bone': 'Burun kemiği',
  vomer: 'Saban kemiği',
  maxilla: 'Üst çene kemiği',
  'palatine bone': 'Damak kemiği',
  'zygomatic bone': 'Elmacık kemiği',
  mandible: 'Alt çene kemiği',
  'hyoid bone': 'Dil kemiği',
  malleus: 'Çekiç kemiği',
  incus: 'Örs kemiği',
  stapes: 'Üzengi kemiği',
  // Kıkırdaklar
  'major alar cartilage': 'Burun kanadı kıkırdağı',
  'nasal septal cartilage': 'Burun bölmesi kıkırdağı',
  'lateral process of nasal septal cartilage': 'Burun bölmesi kıkırdağının yan çıkıntısı',
  'thyroid cartilage': 'Kalkan kıkırdak',
  'cricoid cartilage': 'Yüzük kıkırdak',
  'arytenoid cartilage': 'İbrik kıkırdak',
  'corniculate cartilage': 'Boynuzsu kıkırdak',
  // Omurga ve göğüs
  'atlas (c1)': 'Atlas omuru (C1)',
  'axis (c2)': 'Aksis omuru (C2)',
  sacrum: 'Sağrı kemiği',
  coccyx: 'Kuyruk sokumu kemiği',
  'manubrium of sternum': 'Göğüs kemiği sapı',
  'body of sternum': 'Göğüs kemiği gövdesi',
  'xiphoid process': 'Kılıç çıkıntısı',
  // Kollar ve eller
  clavicle: 'Köprücük kemiği',
  scapula: 'Kürek kemiği',
  humerus: 'Pazı kemiği (humerus)',
  radius: 'Döner kemik (radius)',
  ulna: 'Dirsek kemiği (ulna)',
  'scaphoid bone': 'Kayıksı kemik',
  'lunate bone': 'Ay kemiği',
  'triquetrum bone': 'Üçgen kemik',
  'pisiform bone': 'Bezelye kemiği',
  'trapezium bone': 'Büyük trapez kemiği',
  'trapezoid bone': 'Küçük trapez kemiği',
  'capitate bone': 'Başlı kemik',
  'hamate bone': 'Çengelli kemik',
  // Bacaklar ve ayaklar
  'hip bone': 'Kalça kemiği',
  femur: 'Uyluk kemiği',
  patella: 'Diz kapağı kemiği',
  tibia: 'Kaval kemiği',
  fibula: 'Kamış kemiği',
  talus: 'Aşık kemiği',
  calcaneus: 'Topuk kemiği',
  'navicular bone': 'Ayak kayıksı kemiği',
  'cuboid bone': 'Küp kemiği',
  'medial cuneiform bone': 'İç çivi kemiği',
  'intermediate cuneiform bone': 'Orta çivi kemiği',
  'lateral cuneiform bone': 'Dış çivi kemiği',
  'sesamoid bones of foot': 'Ayağın susam kemikleri',
}

const ORDINAL: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
}

const PHALANX: Record<string, string> = { distal: 'uç', middle: 'orta', proximal: 'dip' }
const SPINE: Record<string, string> = { C: 'Boyun', T: 'Sırt', L: 'Bel' }
const TOOTH: Record<string, string> = {
  'medial incisor': 'orta kesici diş',
  'lateral incisor': 'yan kesici diş',
  canine: 'köpek dişi',
  premolar: 'küçük azı dişi',
  'molar tooth': 'büyük azı dişi',
}

function translate(n: string): string | null {
  if (BASE[n]) return BASE[n]
  let m = n.match(/^vertebra ([ctl])(\d+)$/)
  if (m) return `${SPINE[m[1].toUpperCase()]} omuru (${m[1].toUpperCase()}${m[2]})`
  m = n.match(/^(\w+) rib$/)
  if (m && ORDINAL[m[1]]) return `${ORDINAL[m[1]]}. kaburga`
  m = n.match(/^costal cartilage of (\w+) rib$/)
  if (m && ORDINAL[m[1]]) return `${ORDINAL[m[1]]}. kaburga kıkırdağı`
  m = n.match(/^(\w+) (metacarpal|metatarsal) bone$/)
  if (m && ORDINAL[m[1]]) return `${m[2] === 'metacarpal' ? 'El' : 'Ayak'} ${ORDINAL[m[1]]}. tarak kemiği`
  m = n.match(/^(distal|middle|proximal) phalanx of (\w+) finger of (hand|foot)$/)
  if (m && ORDINAL[m[2]]) return `${m[3] === 'hand' ? 'El' : 'Ayak'} ${ORDINAL[m[2]]}. parmak ${PHALANX[m[1]]} kemiği`
  m = n.match(/^(upper|lower) (?:(first|second) )?(medial incisor|lateral incisor|canine|premolar|molar tooth)$/)
  if (m) return `${m[1] === 'upper' ? 'Üst' : 'Alt'} ${m[2] ? `${ORDINAL[m[2]]}. ` : ''}${TOOTH[m[3]]}`
  return null
}

/** Kemiğin Türkçe adı; taraf, Türkçedeki gibi başa gelir ("Sol uyluk kemiği"). Bilinmiyorsa null. */
export function boneNameTr(label: string): string | null {
  const side = label.match(/ \((sol|sağ)\)$/)
  const base = side ? label.slice(0, -side[0].length) : label
  const tr = translate(base.toLowerCase().replace(/\s+/g, ' ').trim())
  if (!tr) return null
  if (!side) return tr
  // Rakamla başlayan adlarda ("5. kaburga") büyük harf sorunu yoktur; diğerlerinde ilk harf küçülür
  return `${side[1] === 'sol' ? 'Sol' : 'Sağ'} ${tr.charAt(0).toLocaleLowerCase('tr-TR') + tr.slice(1)}`
}
