import { useMemo } from 'react'
import { resolve, tx, useI18n, type Lang } from '../i18n'
import type { RegionData, RegionId } from './types'

/*
 * Tüm değerler kurgusaldır ve demo amaçlıdır.
 * Gerçek veri, diğer grupların servisinden aynı biçimde gelecektir.
 * Metinler tx(Türkçe, İngilizce) çiftleriyle yazılır.
 */

const HRP = { label: tx('NASA İnsan Araştırma Programı', 'NASA Human Research Program'), url: 'https://www.nasa.gov/hrp/' }
const ROADMAP = { label: 'NASA Human Research Roadmap', url: 'https://humanresearchroadmap.nasa.gov/' }

const RAW = {
  bas: {
    id: 'bas',
    name: tx('Baş ve boyun', 'Head and neck'),
    facing: 'on',
    status: 'normal',
    summary: tx(
      'Sıvı kayması belirtileri izleniyor. Görme ve baş ağrısı değerleri normal aralıkta.',
      'Fluid shift signs are monitored. Vision and headache values are within normal range.',
    ),
    metrics: [
      { label: tx('Görme keskinliği', 'Visual acuity'), value: tx('1,0', '1.0'), hint: tx('Haftalık göz testinin sonucu. 1,0 tam görme demektir.', 'Result of the weekly eye test. 1.0 means full vision.') },
      { label: tx('Baş ağrısı', 'Headache'), value: '1', unit: '/10', hint: tx('Astronotun bugün bildirdiği ağrı puanı.', 'Pain score reported by the astronaut today.') },
      { label: tx('Kabin CO₂', 'Cabin CO₂'), value: tx('2,6', '2.6'), unit: 'mmHg', hint: tx('Yüksek CO₂ baş ağrısını artırabilir.', 'High CO₂ can worsen headaches.') },
    ],
    trend: { label: tx('Kabin CO₂', 'Cabin CO₂'), unit: 'mmHg', values: [2.9, 2.8, 3.1, 2.7, 2.6, 2.7, 2.6], range: [0, 3.5] },
    details: [
      tx(
        'Mikro yerçekiminde vücut sıvıları baş bölgesine doğru kayar. Bu durum yüzde şişlik ve göz arkasında basınç yapabilir.',
        'In microgravity, body fluids shift toward the head. This can cause facial puffiness and pressure behind the eyes.',
      ),
      tx('Görme değişiklikleri uzun görevlerde izlenen başlıca risklerden biridir.', 'Vision changes are one of the main risks monitored on long missions.'),
    ],
    advice: tx('Görmede bulanıklık fark edersen bunu günlük raporuna ekle.', 'If you notice blurred vision, add it to your daily report.'),
    source: ROADMAP,
  },
  gogus: {
    id: 'gogus',
    name: tx('Göğüs', 'Chest'),
    facing: 'on',
    status: 'normal',
    summary: tx('Kalp ritmi düzenli. Dinlenme nabzı son bir haftada sabit.', 'Heart rhythm is regular. Resting heart rate has been stable for a week.'),
    metrics: [
      { label: tx('Dinlenme nabzı', 'Resting heart rate'), value: '62', unit: tx('atım/dk', 'bpm'), hint: tx('Sabah uyanınca ölçülen nabız.', 'Heart rate measured right after waking up.') },
      { label: tx('Kalp ritmi', 'Heart rhythm'), value: tx('Düzenli', 'Regular'), hint: tx('Göğüs bandındaki EKG sensöründen gelir.', 'Comes from the ECG sensor in the chest strap.') },
      { label: tx('Solunum', 'Breathing'), value: '14', unit: tx('/dk', '/min'), hint: tx('Dakikadaki nefes sayısı.', 'Breaths per minute.') },
    ],
    trend: { label: tx('Dinlenme nabzı', 'Resting heart rate'), unit: tx('atım/dk', 'bpm'), values: [61, 63, 62, 64, 62, 61, 62], range: [50, 80] },
    details: [
      tx(
        'Uzayda kalp daha az çalışmak zorunda kaldığı için zamanla küçülebilir. Düzenli egzersiz bunu yavaşlatır.',
        'In space the heart works less hard, so it can shrink over time. Regular exercise slows this down.',
      ),
    ],
    advice: tx('Günlük kardiyo egzersizini planlandığı gibi sürdür.', 'Keep up your daily cardio exercise as planned.'),
    source: HRP,
  },
  sirt: {
    id: 'sirt',
    name: tx('Sırt', 'Back'),
    facing: 'arka',
    status: 'normal',
    summary: tx('Omurga uzaması izleniyor. Uzaya uyum sürecinde mürettebatın yarısından fazlasında sırt ağrısı görülür.', 'Spinal elongation is monitored. Back pain appears in more than half of crew members during space adaptation.'),
    metrics: [
      { label: tx('Boy uzaması', 'Height gain'), value: tx('+3,1', '+3.1'), unit: 'cm', hint: tx('Omurlar arası boşluk açıldıkça boy uzar.', 'Height increases as the spaces between vertebrae open up.') },
      { label: tx('Esneme', 'Stretching'), value: '2/3', unit: tx('seans', 'sessions'), hint: tx('Bugün tamamlanan esneme seansları.', 'Stretching sessions completed today.') },
      { label: tx('Duruş sapması', 'Posture deviation'), value: '4', unit: '°', hint: tx('Sırt sensörünün ölçtüğü öne eğilme açısı.', 'Forward lean angle measured by the back sensor.') },
    ],
    trend: { label: tx('Boy uzaması', 'Height gain'), unit: 'cm', values: [2.7, 2.8, 2.9, 2.9, 3.0, 3.1, 3.1], range: [0, 4] },
    details: [
      tx(
        'Yerçekimi olmadığında omurlar arasındaki diskler genişler ve boy birkaç santimetre uzayabilir. Bu da bel ağrısına yol açabilir.',
        'Without gravity, the discs between vertebrae expand and height can increase by a few centimetres. This can cause lower back pain.',
      ),
      tx('Esneme ve çekirdek kas egzersizleri ağrıyı azaltmaya yardım eder.', 'Stretching and core exercises help reduce the pain.'),
    ],
    advice: tx('Kalan esneme seansını tamamla. Ağrı artarsa uçuş hekimine bildir.', 'Finish the remaining stretching session. Tell the flight surgeon if the pain gets worse.'),
    source: ROADMAP,
  },
  ustKol: {
    id: 'ustKol',
    name: tx('Üst kollar', 'Upper arms'),
    facing: 'on',
    status: 'normal',
    summary: tx('Kas kütlesi korunuyor. Direnç egzersizi hedefleri tamam.', 'Muscle mass is maintained. Resistance exercise targets are met.'),
    metrics: [
      { label: tx('Kas kütlesi', 'Muscle mass'), value: tx('−1,2', '−1.2'), unit: '%', hint: tx('Görev başına göre değişim.', 'Change since the start of the mission.') },
      { label: tx('Direnç egzersizi', 'Resistance exercise'), value: '45', unit: tx('dk', 'min'), hint: tx('Bugün yapılan direnç egzersizi süresi.', 'Resistance exercise time today.') },
      { label: tx('Kan basıncı', 'Blood pressure'), value: '118/76', unit: 'mmHg', hint: tx('Kol manşetiyle sabah ölçümü.', 'Morning reading with an arm cuff.') },
    ],
    trend: { label: tx('Kas kütlesi değişimi', 'Muscle mass change'), unit: '%', values: [-0.8, -0.9, -1.0, -1.0, -1.1, -1.2, -1.2], range: [-3, 0] },
    details: [
      tx(
        'Uzayda kaslar daha az yük taşıdığı için zayıflar. Günlük direnç egzersizi bu kaybı yavaşlatır.',
        'In space, muscles carry less load and weaken. Daily resistance exercise slows this loss.',
      ),
    ],
    advice: tx('Egzersiz programı hedefte, değişiklik gerekmiyor.', 'Your exercise programme is on target; no change needed.'),
    source: HRP,
  },
  onKol: {
    id: 'onKol',
    name: tx('Ön kollar', 'Forearms'),
    facing: 'on',
    status: 'normal',
    summary: tx('Kavrama gücü normal. Bileklerde zorlanma görülmüyor.', 'Grip strength is normal. No strain in the wrists.'),
    metrics: [
      { label: tx('Kavrama gücü', 'Grip strength'), value: '41', unit: 'kg', hint: tx('El dinamometresiyle haftalık ölçüm.', 'Weekly measurement with a hand dynamometer.') },
      { label: tx('Bilek hareketi', 'Wrist range'), value: '82', unit: '°', hint: tx('Bileğin bükülme açısı (haftalık kontrol).', 'Wrist flexion angle (weekly check).') },
      { label: tx('Cilt ısısı', 'Skin temperature'), value: tx('33,4', '33.4'), unit: '°C', hint: tx('Koldaki tablet sensöründen gelir.', 'Comes from the wrist tablet sensor.') },
    ],
    trend: { label: tx('Kavrama gücü', 'Grip strength'), unit: 'kg', values: [42, 42, 41, 41, 42, 41, 41], range: [36, 50] },
    details: [
      tx(
        'Uzay yürüyüşlerinde basınçlı eldivenlere karşı çalışmak ön kol kaslarını çok yorar.',
        'Working against pressurised gloves during spacewalks tires the forearm muscles a lot.',
      ),
    ],
    advice: tx('Uzay yürüyüşünden önce ön kol esnemelerini yap.', 'Do forearm stretches before a spacewalk.'),
    source: HRP,
  },
  eller: {
    id: 'eller',
    name: tx('Eller', 'Hands'),
    facing: 'on',
    status: 'normal',
    summary: tx(
      'Eldiven basıncı ve tırnaklar izleniyor. Uzay yürüyüşlerinden sonra parmak uçları kontrol edilir.',
      'Glove pressure and fingernails are monitored. Fingertips are checked after spacewalks.',
    ),
    metrics: [
      { label: tx('Kavrama gücü', 'Grip strength'), value: '38', unit: 'kg', hint: tx('El dinamometresiyle haftalık ölçüm.', 'Weekly measurement with a hand dynamometer.') },
      { label: tx('Eldiven içi ısı', 'In-glove temperature'), value: tx('24,8', '24.8'), unit: '°C', hint: tx('Uzay yürüyüşü eldiveninin sensöründen gelir.', 'Comes from the spacewalk glove sensor.') },
      { label: tx('Son uzay yürüyüşü', 'Last spacewalk'), value: '2', unit: tx('gün önce', 'days ago'), hint: tx('Eldiven kullanımından bu yana geçen süre.', 'Time since the gloves were last used.') },
    ],
    trend: { label: tx('Eldiven içi ısı', 'In-glove temperature'), unit: '°C', values: [24.1, 24.6, 25.2, 24.9, 24.4, 24.7, 24.8], range: [18, 30] },
    details: [
      tx(
        'Basınçlı eldivenler parmak uçlarına baskı yapar. Uzun uzay yürüyüşlerinden sonra parmak uçlarında morarma ve tırnak sorunları görülebilir.',
        'Pressurised gloves press on the fingertips. After long spacewalks, bruising and fingernail problems can appear.',
      ),
      tx('Eldiven bedeninin doğru seçilmesi bu sorunları azaltır.', 'Choosing the right glove size reduces these problems.'),
    ],
    advice: tx('Bir sonraki uzay yürüyüşünden önce eldiven bedenini kontrol ettir.', 'Have your glove size checked before the next spacewalk.'),
    source: ROADMAP,
  },
  bacaklar: {
    id: 'bacaklar',
    name: tx('Bacaklar', 'Legs'),
    facing: 'on',
    status: 'normal',
    summary: tx('Kas ve kemik kaybı beklenen aralıkta. Koşu bandı programı sürüyor.', 'Muscle and bone loss is within the expected range. The treadmill programme continues.'),
    metrics: [
      { label: tx('Kemik yoğunluğu', 'Bone density'), value: tx('−0,9', '−0.9'), unit: tx('%/ay', '%/mo'), hint: tx('Uzayda yük taşıyan kemikler ayda %1-1,5 mineral kaybedebilir.', 'In space, weight-bearing bones can lose 1-1.5% of their mineral per month.') },
      { label: tx('Koşu bandı', 'Treadmill'), value: '30', unit: tx('dk', 'min'), hint: tx('Bugünkü koşu bandı süresi.', 'Treadmill time today.') },
      { label: tx('Baldır çevresi', 'Calf girth'), value: tx('36,2', '36.2'), unit: 'cm', hint: tx('Sıvı kayması ve kas kaybını izlemek için ölçülür.', 'Measured to track fluid shift and muscle loss.') },
    ],
    trend: { label: tx('Kemik yoğunluğu değişimi', 'Bone density change'), unit: tx('%/ay', '%/mo'), values: [-1.1, -1.0, -1.0, -0.9, -0.9, -0.9, -0.9], range: [-1.5, 0] },
    details: [
      tx(
        'Yük taşımayan kemikler zamanla incelir. Koşu bandı ve direnç egzersizi kemiklere yük bindirerek bu kaybı yavaşlatır.',
        'Bones that carry no load thin over time. Treadmill and resistance exercise load the bones and slow this loss.',
      ),
    ],
    advice: tx('Koşu bandı programına devam et.', 'Keep going with the treadmill programme.'),
    source: HRP,
  },
  ayaklar: {
    id: 'ayaklar',
    name: tx('Ayaklar', 'Feet'),
    facing: 'on',
    status: 'normal',
    summary: tx(
      'Cilt durumu iyi. Ayak tabanlarında incelme görülüyor, bu uzayda olağandır.',
      'Skin condition is good. The soles are thinning, which is normal in space.',
    ),
    metrics: [
      { label: tx('Cilt durumu', 'Skin condition'), value: tx('İyi', 'Good'), hint: tx('Haftalık görsel kontrolün sonucu.', 'Result of the weekly visual check.') },
      { label: tx('Ayak bileği şişliği', 'Ankle swelling'), value: tx('Yok', 'None'), hint: tx('Sıvı birikimi olup olmadığını gösterir.', 'Shows whether fluid is building up.') },
      { label: tx('Ayak ısısı', 'Foot temperature'), value: tx('31,9', '31.9'), unit: '°C', hint: tx('Çorap sensöründen gelir.', 'Comes from the sock sensor.') },
    ],
    trend: { label: tx('Ayak ısısı', 'Foot temperature'), unit: '°C', values: [31.6, 31.8, 32.0, 31.7, 31.9, 32.1, 31.9], range: [30, 34] },
    details: [
      tx(
        'Ayak tabanları uzayda yük taşımadığı için yumuşar. Bu durum Dünya\'ya dönüşte geçicidir.',
        'The soles soften in space because they carry no load. This is temporary after returning to Earth.',
      ),
    ],
    advice: tx('Herhangi bir işlem gerekmiyor.', 'No action needed.'),
    source: HRP,
  },
}

export const REGION_ORDER: RegionId[] = ['bas', 'gogus', 'sirt', 'ustKol', 'onKol', 'eller', 'bacaklar', 'ayaklar']

/** Durumlar dilden bağımsızdır */
export const BASE_STATUS = Object.fromEntries(REGION_ORDER.map((id) => [id, RAW[id].status])) as Record<RegionId, RegionData['status']>
export const REGION_FACING = Object.fromEntries(REGION_ORDER.map((id) => [id, RAW[id].facing])) as Record<RegionId, RegionData['facing']>

const cache: Partial<Record<Lang, Record<RegionId, RegionData>>> = {}

export function regionsFor(lang: Lang): Record<RegionId, RegionData> {
  return (cache[lang] ??= resolve(RAW, lang) as unknown as Record<RegionId, RegionData>)
}

export function useRegions() {
  const { lang } = useI18n()
  return useMemo(() => regionsFor(lang), [lang])
}
