import type { SourceId } from '../core/sources'
import { tx, type Tx } from '../core/tx'

/**
 * "Günün bilgisi": ana sayfadaki genel değerlendirme kartında, her şey yolundayken gösterilen uzay bilgileri.
 * Her bilginin sayıları kaynağındaki NASA sayfasından birebir alındı (13 Kasım 2026'da açılıp doğrulandı).
 * Kaynağı olmayan ya da sayfada geçmeyen bilgi eklenmez.
 */
export interface SpaceFact {
  text: Tx
  source: SourceId
}

export const SPACE_FACTS: SpaceFact[] = [
  {
    text: tx(
      "Uluslararası Uzay İstasyonu Dünya'nın çevresini yaklaşık 90 dakikada bir dolanır. 24 saatte 16 tur atar; yani istasyondakiler her gün 16 gün doğumu ve 16 gün batımı görür.",
      'The International Space Station orbits Earth about every 90 minutes. It makes 16 orbits in 24 hours, so the crew sees 16 sunrises and 16 sunsets every day.',
    ),
    source: 'issFacts',
  },
  {
    text: tx(
      "Uzay istasyonu saniyede yaklaşık 8 kilometre (5 mil) hızla gider. Bir günde, Ay'a gidip dönmeye denk bir yol alır.",
      'The space station travels at about 8 kilometres (five miles) per second. In about a day it covers the distance to the Moon and back.',
    ),
    source: 'issFacts',
  },
  {
    text: tx(
      'Uzay istasyonu uçtan uca 109 metredir; bir Amerikan futbolu sahasından yalnızca bir yarda kısa. Kütlesi 419.725 kilogramdır.',
      'The space station is 109 metres end to end, one yard shy of an American football field. Its mass is 419,725 kilograms.',
    ),
    source: 'issFacts',
  },
  {
    text: tx("Uzay istasyonunda Kasım 2000'den beri kesintisiz olarak insan yaşıyor.", 'The space station has been continuously occupied since November 2000.'),
    source: 'issFacts',
  },
  {
    text: tx(
      "İstasyonda suyun %98'i geri kazanılır: idrardan ve mürettebatın nefesiyle terinden havaya karışan nemden yeniden su elde edilir.",
      "The station recovers 98% of its water: from urine and from the moisture the crew's breath and sweat release into the cabin air.",
    ),
    source: 'issWater',
  },
  {
    text: tx(
      'Uzay uçuşunda yük taşıyan kemikler her ay ortalama %1 ile %1,5 arasında mineral yoğunluğu kaybeder. Astronotların her gün egzersiz yapmasının bir nedeni de bu.',
      'During spaceflight, weight-bearing bones lose on average 1% to 1.5% of mineral density per month. It is one reason astronauts exercise every day.',
    ),
    source: 'humanBody',
  },
  {
    text: tx('Mikro yerçekiminde vücuttaki sıvılar yukarıya, başa doğru kayar.', 'In microgravity, the fluids in the body shift upward to the head.'),
    source: 'humanBody',
  },
  {
    text: tx(
      "Venüs'te bir gün 243 Dünya günü sürer. Bu, Venüs'ün Güneş çevresindeki 225 günlük yılından bile uzundur.",
      'A day on Venus lasts 243 Earth days, longer even than a Venus year, which takes only 225 Earth days.',
    ),
    source: 'venusFacts',
  },
  {
    text: tx("Venüs, Dünya'ya göre ters yönde döner; bu yüzden orada Güneş batıdan doğar, doğuda batar.", 'Venus spins backward compared to Earth, so there the Sun rises in the west and sets in the east.'),
    source: 'venusFacts',
  },
  {
    text: tx("Venüs Güneş Sistemi'nin en sıcak gezegenidir: yüzey sıcaklığı yaklaşık 467 °C'dir.", 'Venus is the hottest planet in our solar system, with surface temperatures of about 467 °C.'),
    source: 'venusFacts',
  },
  {
    text: tx("Güneş'in hacmini doldurmak için 1,3 milyon Dünya gerekir.", "It would take 1.3 million Earths to fill the Sun's volume."),
    source: 'sunFacts',
  },
  {
    text: tx("Güneş'in çekirdeğindeki sıcaklık yaklaşık 15 milyon °C'dir.", "The temperature in the Sun's core is about 15 million °C."),
    source: 'sunFacts',
  },
  {
    text: tx(
      "Güneş yaklaşık 4,5 milyar yaşında bir sarı cüce yıldızdır ve Dünya'dan ortalama 150 milyon kilometre uzaktadır.",
      'The Sun is a 4.5 billion-year-old yellow dwarf star, about 150 million kilometres from Earth.',
    ),
    source: 'sunFacts',
  },
  {
    text: tx("Mars'ta bir gün 24,6 saat sürer; Dünya'daki 23,9 saatlik güne çok yakındır.", 'Mars completes one rotation every 24.6 hours, very similar to one day on Earth (23.9 hours).'),
    source: 'marsFacts',
  },
  {
    text: tx("Mars'ta gökyüzü mavi değildir: havadaki toz yüzünden puslu ve kırmızı görünür.", 'On Mars the sky is not blue: suspended dust makes it look hazy and red.'),
    source: 'marsFacts',
  },
  {
    text: tx(
      "Mars'ın iki küçük uydusu vardır: Phobos ve Deimos. İkisinin de yakalanmış asteroitler olabileceği düşünülüyor.",
      'Mars has two small moons, Phobos and Deimos, that may be captured asteroids.',
    ),
    source: 'marsFacts',
  },
  {
    text: tx("Ay, Dünya'dan ortalama 384.400 kilometre uzaktadır.", 'The Moon is an average of 384,400 kilometres away from Earth.'),
    source: 'moonFacts',
  },
  {
    text: tx("Ay her yıl Dünya'dan yaklaşık 2,5 santimetre (bir inç) uzaklaşıyor.", 'The Moon is slowly moving away from Earth, getting about 2.5 centimetres (an inch) farther each year.'),
    source: 'moonFacts',
  },
  {
    text: tx("Ay'ın yüzeyindeki yerçekimi Dünya'nınkinin altıda biridir.", "Gravity on the Moon's surface is one-sixth of Earth's."),
    source: 'moonFacts',
  },
  {
    text: tx("Ay'ın kendi çevresinde dönüşü yörüngesiyle eşleştiği için Dünya'dan hep aynı yüzünü görürüz.", "The Moon's spin matches its orbit, so the same side always faces Earth."),
    source: 'moonFacts',
  },
  {
    text: tx("Ay, Dünya dışında insanların ayak bastığı tek gök cismidir (şimdilik).", 'The Moon is the only celestial body beyond Earth visited by human beings, so far.'),
    source: 'moonFacts',
  },
  {
    text: tx(
      "Dünya ile Mars arasındaki iletişim gecikmesi tek yönde 20 dakikaya kadar çıkabilir; bu yüzden Dünya'dan anlık rehberlik sınırlıdır.",
      "The communication delay between Earth and Mars can reach up to 20 minutes one way, so real-time guidance from Earth is limited.",
    ),
    source: 'hrpDistance',
  },
  {
    text: tx(
      "Mars, Dünya'ya ortalama 140 milyon mil (yaklaşık 225 milyon km) uzaklıktadır. Bir Mars yolculuğu yaklaşık üç yıl sürer; Ay yolculuğu ise üç gün.",
      "Mars is on average about 140 million miles (about 225 million km) from Earth. A Mars trip would last roughly three years, compared with a three-day lunar trip.",
    ),
    source: 'hrpDistance',
  },
  {
    text: tx(
      "Derin uzay görevlerinde astronotlar ekipman arızası, tıbbi acil durum ve erzağı paylaştırma gibi durumlarla Dünya'dan asgari destekle başa çıkabilmelidir.",
      "On deep-space missions astronauts must handle equipment failures, medical emergencies and the rationing of supplies with minimal support from teams on Earth.",
    ),
    source: 'hrpDistance',
  },
  {
    text: tx(
      "NASA'nın HERA simülasyon habitatı yaklaşık 60 m²'dir (650 fit kare); mürettebat içinde bir seferde 45 gün yaşar. CHAPEA'da dört kişilik ekip 158 m²'lik (1.700 fit kare) bir habitatta bir yıl kalır.",
      "NASA's HERA habitat is 650 square feet (about 60 m²) and crews live inside for 45 days at a time. In CHAPEA, four crew members spend a year in a 1,700-square-foot (about 158 m²) habitat.",
    ),
    source: 'hrpIsolation',
  },
  {
    text: tx(
      "Yalıtılmış ve dar bir ortamda uyku kaybı, bozulan gündüz-gece düzeni ve iş yükü fazlalığı birbirini ağırlaştırabilir.",
      "In isolation and confinement, sleep loss, disrupted circadian rhythms and work overload can compound one another.",
    ),
    source: 'hrpIsolation',
  },
  {
    text: tx(
      "Sıvılar başa doğru kayınca gözlere baskı yapabilir ve görme sorunlarına yol açabilir.",
      "When fluids shift toward the head, they may pressure the eyes and cause vision problems.",
    ),
    source: 'hrpGravity',
  },
  {
    text: tx(
      "Önlem alınmazsa susuzluk ve kemiklerden artan kalsiyum atılımı, uzayda böbrek taşı riskini artırabilir.",
      "Without preventive measures, dehydration and increased calcium excretion from bones may raise the risk of kidney stones in space.",
    ),
    source: 'hrpGravity',
  },
  {
    text: tx(
      "Mars'ta yerçekimi Dünya'nınkinin yaklaşık üçte biridir. Ağırlıksızlıktan yerçekimine dönüş baş dönmesine ve bayılmaya yol açabilir.",
      "Gravity on Mars is about one-third of Earth's. Moving from weightlessness back to gravity may cause lightheadedness and fainting.",
    ),
    source: 'hrpGravity',
  },
  {
    text: tx(
      "Nötron radyasyonu ISS'teki toplam radyasyonun yaklaşık %30'unu oluşturur ve ciddi biyolojik hasara yol açabildiği için özellikle zararlıdır.",
      "Neutron radiation contributes about 30% of the total radiation on the ISS and is especially harmful because it can cause serious biological damage.",
    ),
    source: 'csaRadiation',
  },
  {
    text: tx(
      "ISS'te her an ortalama 200 uluslararası deney sürer.",
      "On average there are 200 international experiments on board the ISS at any given time.",
    ),
    source: 'csaScience',
  },
  {
    text: tx(
      "Uzayda ağırlıksız yaşamanın astronotlardaki etkileri, hızlanmış yaşlanmaya ve hareketsiz yaşamın yol açtığı sağlık sorunlarına benzer.",
      "The effects of weightlessness on astronauts are similar to accelerated aging and to health problems caused by a sedentary lifestyle.",
    ),
    source: 'csaScience',
  },
  {
    text: tx(
      "4-6 aylık görevlerde yük taşıyan bölgelerin (kalça, bel omurları, alt bacaklar) kemik yoğunluğu ayda ortalama %1-1,5 azalır. Bu, DXA ölçümlerine göredir.",
      "On 4-6 month missions, the bone mineral density of weight-bearing sites (hip, lumbar spine, lower limbs) falls by an average of 1-1.5% per month, as measured by DXA.",
    ),
    source: 'boneFracture',
  },
  {
    text: tx(
      "Uzayda kemik yıkımı baskındır ve kemik yapımıyla birlikte ilerlemez; bu yüzden kemik toplamda kaybolur.",
      "In space, bone resorption predominates and is uncoupled from bone formation, so there is a net loss of bone.",
    ),
    source: 'boneFracture',
  },
  {
    text: tx(
      "DXA ile ölçülen kemik yoğunluğu, kemik dayanımının yalnızca %50-70'ini yansıtır; bu yüzden kırık riski için tek başına yeterli değildir.",
      "Bone density measured by DXA accounts for only 50-70% of actual bone strength, so it alone is not enough to judge fracture risk.",
    ),
    source: 'boneFracture',
  },
  {
    text: tx(
      "Uzun bir Mars görevinden dönen astronotların Dünya'daki kırık riskinin, özellikle yana düşmelerde, yaşlı menopoz sonrası bir kadınınkiyle benzer düzeyde olacağı tahmin ediliyor.",
      "Astronauts returning from a long Mars mission are estimated to have a fracture risk on Earth comparable to an elderly postmenopausal woman, particularly in a sideways fall.",
    ),
    source: 'boneFracture',
  },
  {
    text: tx(
      "NASA'nın İnsan Araştırma Programı riskleri ayrı ayrı izler: bağışıklık, kalp-damar, kemik, görme, uyku, davranış ve radyasyona bağlı kanser gibi.",
      "NASA's Human Research Program tracks risks one by one: immune, cardiovascular, bone, vision, sleep, behavioral and radiation-induced cancer, among others.",
    ),
    source: 'hrpRisks',
  },
  {
    text: tx(
      "Artemis II'de NASA'nın ARCHeR araştırması mürettebatın iyi oluşunu, aktivitesini ve uykusunu görev boyunca izliyor.",
      "On Artemis II, NASA's ARCHeR study tracks crew well-being, activity and sleep during the mission.",
    ),
    source: 'hrpOngoing',
  },
  {
    text: tx(
      "Uzun görevlere katılan astronotların yaklaşık %70'inde gözde değişikliğin en erken belirtileri görülüyor. Yakın görme şikayeti uzun görevlerde astronotların %48'inde bildirildi.",
      "About 70% of crewmembers on long-duration missions show the earliest signs of eye changes. Near vision complaints were reported by 48% of astronauts on long-duration missions.",
    ),
    source: 'sansEB',
  },
  {
    text: tx(
      "2000-2024 arasında ISS mürettebatının %25'i uçuşta vücut kütlesinin %5'inden fazlasını kaybetti.",
      "25% of crew from 2000 to 2024 lost more than 5% of body mass while in flight.",
    ),
    source: 'foodRisk',
  },
  {
    text: tx(
      "Astronotlar uzayda ortalama yaklaşık altı saat uyuyor. NASA standardı ise 8,5 saatlik bir uyku periyodu öneriyor; programa ayrıca uyku öncesi 2 ve sonrası 1,5 saatlik süre de konmalı.",
      "Astronauts average about six hours of sleep in space, while the NASA standard recommends an 8.5-hour sleep period, and the schedule also needs 2 hours before and 1.5 hours after sleep.",
    ),
    source: 'std3001v1',
  },
  {
    text: tx(
      "ISS'te mürettebat CO₂ belirtilerini 2,3 mmHg'den itibaren bildirdi: önce yorgunluk ve baş dolgunluğu, daha yukarıda atlanan prosedür adımları ve baş ağrısı.",
      "On the ISS, crews reported CO₂ symptoms starting at 2.3 mmHg: first fatigue and full-headedness, higher up missed procedure steps and headaches.",
    ),
    source: 'co2Ops',
  },
  {
    text: tx(
      "Uzun görevlerdeki astronotların %46'sı uçuşta \"kayda değer\" bir tıbbi olay yaşadı: bir haftadan uzun süren, tekrarlayan ya da tedaviye yanıt vermeyen olaylar.",
      "46% of long-duration astronauts reported \"notable\" medical events in flight: events that lasted over a week, recurred or did not respond to treatment.",
    ),
    source: 'immuneEB',
  },
  {
    text: tx(
      "Altı temel besin (enerji, sıvı, kalsiyum, protein, sodyum ve demir) uçuş hekimlerine her hafta bildiriliyor.",
      "Six key nutrients (energy, fluid, calcium, protein, sodium and iron) are reported weekly to flight surgeons.",
    ),
    source: 'nutritionER',
  },
  {
    text: tx(
      "Astronotlar uyanınca uyku kalitesini, yatmadan önce de ruh hallerini ve ekip uyumlarını soran kısa anketler dolduruyor (NASA Standard Measures).",
      "Astronauts complete a questionnaire on sleep after waking up, and another on mood and team cohesion before going to sleep (NASA Standard Measures).",
    ),
    source: 'standardMeasures',
  },
  {
    text: tx(
      "Kanada Uzay Ajansı'nın Bio-Monitor giysisi nabzı, tansiyonu, solunumu, deri ısısını, kandaki oksijeni ve hareketi aynı anda ölçüyor.",
      "The Canadian Space Agency's Bio-Monitor garment measures pulse, blood pressure, breathing, skin temperature, blood oxygen and activity.",
    ),
    source: 'csaBioMonitor',
  },
  {
    text: tx(
      "NASA'nın kariyer radyasyon sınırı 600 mSv ve bu sınır her yaş ve cinsiyet için aynı.",
      "NASA's career radiation limit is 600 mSv, and it is the same for all ages and sexes.",
    ),
    source: 'std3001v1',
  },
  {
    text: tx(
      "NASA, uzun süre yalıtım ve kapalı ortamın ekip işleyişini bozabileceğini belirtiyor: uzay istasyonunda hem uçuş öncesinde hem uçuş sırasında mürettebat içinde zaman zaman çatışma görüldü.",
      "NASA notes that long isolation and confinement can weaken how a team works together: occasional conflict within crews has been seen both before and during flights to the space station.",
    ),
    source: 'teamRisk',
  },
  {
    text: tx(
      "Uzay istasyonu görevleri tamamen Dünya'nın koruyucu manyetosferinin içinde kalır; Ay ve Mars görevleri ise bu koruyucu kabarcığın dışına çıkar.",
      "Space station missions stay entirely within Earth's protective magnetosphere, while missions to the Moon and Mars go beyond this protective bubble.",
    ),
    source: 'radCancer',
  },
  {
    text: tx(
      "Dünya'ya inen mürettebatı araçtan çıkarmak için ekipler hazır bekler. Ay'da ve Mars'ta ise astronotlar inişten hemen sonra araçtan kendi başlarına çıkıp kendi başlarına çalışmak zorunda kalacak.",
      "When crews land on Earth, teams stand by to help them out of the vehicle. On the Moon and Mars, astronauts will need to get out on their own and work on their own shortly after landing.",
    ),
    source: 'dynamicLoads',
  },
]
