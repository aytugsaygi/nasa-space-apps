import { tx, type Tx } from './tx'

/*
 * Uygulamadaki her sağlık bilgisi, eşik ve veri bir kaynağa bağlıdır.
 * Buradaki kaynakların hepsi açılıp okundu (8 ve 9 Kasım 2026); açılmayan ya da doğrulanmayan kaynak eklenmez.
 * Kaynaklar ekranı bu listeden oluşur (teslim formundaki References alanıyla aynı olsun diye).
 */

export type SourceKind = 'nasa' | 'nasaData' | 'medical' | 'agency'

export interface Source {
  id: SourceId
  kind: SourceKind
  title: string
  org: string
  url: string
  /** Belgenin tarihi ya da sürümü */
  date?: string
  /** Uygulamada ne için kullanıldığı */
  use: Tx
}

export type SourceId =
  | 'tb033'
  | 'tb004'
  | 'tb020'
  | 'tb027'
  | 'tb016'
  | 'nasaExercise'
  | 'hrpHazards'
  | 'nasaBloodBlog'
  | 'ascend'
  | 'osd569'
  | 'osd575'
  | 'donki'
  | 'epic'
  | 'mpVitals'
  | 'mpPulseOx'
  | 'mpBloodPressure'
  | 'mpLowSugar'
  | 'cdcDiabetes'
  | 'sleepStudy'
  | 'orionLife'
  | 'orionFlywheel'
  | 'partialGravity'
  | 'moonFacts'
  | 'humansToMars'
  | 'mpBleeding'
  | 'mpCuts'
  | 'mpBrokenBone'
  | 'cognition'
  | 'cdcBmi'
  | 'issFacts'
  | 'issWater'
  | 'humanBody'
  | 'venusFacts'
  | 'sunFacts'
  | 'marsFacts'
  | 'hrpRisks'
  | 'hrpOngoing'
  | 'hrpDistance'
  | 'hrpIsolation'
  | 'hrpGravity'
  | 'boneFracture'
  | 'csaRadiation'
  | 'csaScience'
  | 'immuneEB'
  | 'sansEB'
  | 'standardMeasures'
  | 'co2Ops'
  | 'std3001v1'
  | 'tb041'
  | 'foodRisk'
  | 'nutritionER'
  | 'csaBioMonitor'
  | 'podcastDistance'
  | 'teamRisk'
  | 'radCancer'
  | 'dynamicLoads'
  | 'nutritionBands'
  | 'std3001v2'
  | 'mindIss'
  | 'actSpeed'
  | 'visuospatial'
  | 'sensorimotorRisk'
  | 'spatialTraining'
  | 'nbackMeta'

const LIST: Source[] = [
  {
    id: 'tb033',
    kind: 'nasa',
    title: 'NASA-STD-3001 Technical Brief OCHMO-TB-033: Spaceflight Experience and Medical Care',
    org: 'NASA OCHMO',
    date: 'Rev C, 25.07.2023',
    url: 'https://www.nasa.gov/wp-content/uploads/2023/07/ochmo-tb-033-spaceflight-experience-medical-care-rev-c.pdf',
    use: tx(
      'Uzaya uyum, sırt ağrısı (%52), kemik kaybı (ayda ~%1,5), sıvı kayması ve uyku ilacı kullanımı bilgileri',
      'Space adaptation, back pain (52%), bone loss (~1.5%/month), fluid shift and sleep medication facts',
    ),
  },
  {
    id: 'tb004',
    kind: 'nasa',
    title: 'NASA-STD-3001 Technical Brief OCHMO-TB-004: Carbon Dioxide (CO2)',
    org: 'NASA OCHMO',
    date: 'Rev D',
    url: 'https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf',
    use: tx('Kabin CO₂ sınırları (1 saatlik ortalama ≤3 mmHg, 7 günlük <2,5 mmHg) ve baş ağrısı riski', 'Cabin CO₂ limits (1-hour average ≤3 mmHg, 7-day <2.5 mmHg) and headache risk'),
  },
  {
    id: 'tb020',
    kind: 'nasa',
    title: 'NASA-STD-3001 Technical Brief OCHMO-TB-020: Radiation Protection',
    org: 'NASA OCHMO',
    date: 'Rev E, 27.12.2022',
    url: 'https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf',
    use: tx('Kariyer radyasyon sınırı (600 mSv), güneş parçacık olayı sınırı (250 mSv) ve günlük doz', 'Career radiation limit (600 mSv), solar particle event limit (250 mSv) and daily dose'),
  },
  {
    id: 'tb027',
    kind: 'nasa',
    title: 'NASA-STD-3001 Technical Brief OCHMO-TB-027: Water – Human Consumption',
    org: 'NASA OCHMO',
    date: 'Rev B, 07.03.2023',
    url: 'https://www.nasa.gov/wp-content/uploads/2023/03/water-technical-brief-ochmo.pdf',
    use: tx('Günlük su ihtiyacı (2,5 L) ve susuzluk belirtileri', 'Daily water need (2.5 L) and signs of dehydration'),
  },
  {
    id: 'tb016',
    kind: 'nasa',
    title: 'NASA-STD-3001 Technical Brief OCHMO-TB-016: Behavioral Health and Performance',
    org: 'NASA OCHMO',
    date: 'Rev B, 24.10.2023',
    url: 'https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-016-behavioral-health.pdf',
    use: tx(
      'Özel psikolojik görüşmeler, aile görüşmeleri, aylık bilişsel test ve astronot günlükleri',
      'Private psychological conferences, family conferences, monthly cognitive testing and astronaut journals',
    ),
  },
  {
    id: 'nasaExercise',
    kind: 'nasa',
    title: 'Astronaut Exercise',
    org: 'NASA',
    date: '20.05.2024',
    url: 'https://www.nasa.gov/missions/station/iss-research/astronaut-exercise',
    use: tx('Günde ortalama iki saat egzersiz; ARED, T2 koşu bandı ve CEVIS bisikleti', 'About two hours of exercise per day; ARED, T2 treadmill and CEVIS cycle'),
  },
  {
    id: 'hrpHazards',
    kind: 'nasa',
    title: '5 Hazards of Human Spaceflight',
    org: 'NASA Human Research Program',
    url: 'https://www.nasa.gov/hrp/hazards',
    use: tx('İnsan uzay uçuşunun beş tehlikesi', 'The five hazards of human spaceflight'),
  },
  {
    id: 'nasaBloodBlog',
    kind: 'nasa',
    title: 'Medical Tests, Microbiology Top Research Schedule Aboard Station',
    org: 'NASA Space Station Blog',
    date: '31.03.2026',
    url: 'https://www.nasa.gov/blogs/spacestation/2026/03/31/medical-tests-microbiology-top-research-schedule-aboard-station',
    use: tx('İstasyonda kan alınması, santrifüjlenmesi ve sonradan incelenmek üzere dondurulması', 'Blood draws on the station, centrifuging and freezing for later analysis'),
  },
  {
    id: 'ascend',
    kind: 'nasa',
    title: 'Communication Delays, Disruptions, and Blackouts for Crewed Mars Missions (ASCEND)',
    org: 'NASA Langley (McBrayer, Chai, Judd)',
    url: 'https://ntrs.nasa.gov/api/citations/20220013418/downloads/ASCEND-Communication%20Delays%2C%20Disruptions%2C%20and%20Blackouts%20for%20Crewed%20Mars%20Missions.pdf',
    use: tx('Mars iletişim gecikmesi (görev boyunca 0-22 dakika, Mars yakınında 15-21 dakika) ve kavuşum kesintileri', 'Mars communication delay (0-22 minutes over a mission, 15-21 minutes near Mars) and conjunction blackouts'),
  },
  {
    id: 'osd569',
    kind: 'nasaData',
    title: 'OSD-569: Whole Blood Measurements from the SpaceX Inspiration4 Mission (CBC)',
    org: 'NASA Open Science Data Repository',
    url: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-569',
    use: tx('Tam kan sayımı verisi ve referans aralıkları (uçuş öncesi ve sonrası)', 'Complete blood count data and reference ranges (before and after flight)'),
  },
  {
    id: 'osd575',
    kind: 'nasaData',
    title: 'OSD-575: SpaceX Inspiration4 Blood Serum Metabolic Panel (CMP)',
    org: 'NASA Open Science Data Repository',
    url: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-575',
    use: tx('Metabolik panel verisi ve referans aralıkları (uçuş öncesi ve sonrası)', 'Metabolic panel data and reference ranges (before and after flight)'),
  },
  {
    id: 'donki',
    kind: 'nasaData',
    title: 'DONKI: Space Weather Database Of Notifications, Knowledge, Information',
    org: 'NASA CCMC',
    url: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/',
    use: tx('Gerçek güneş patlaması, güneş parçacık olayı ve jeomanyetik fırtına kayıtları', 'Real solar flare, solar particle event and geomagnetic storm records'),
  },
  {
    id: 'epic',
    kind: 'nasaData',
    title: 'EPIC: Earth Polychromatic Imaging Camera API',
    org: 'NASA (DSCOVR)',
    url: 'https://epic.gsfc.nasa.gov/about/api',
    use: tx('Dünya\'nın her gün çekilen tam disk fotoğrafları', 'Full-disc photos of Earth taken every day'),
  },
  {
    id: 'mpVitals',
    kind: 'medical',
    title: 'Vital signs',
    org: 'MedlinePlus (U.S. National Library of Medicine)',
    url: 'https://medlineplus.gov/ency/article/002341.htm',
    use: tx('Nabız, solunum ve vücut sıcaklığının dinlenmedeki normal aralıkları', 'Resting normal ranges for pulse, breathing and body temperature'),
  },
  {
    id: 'mpPulseOx',
    kind: 'medical',
    title: 'Pulse Oximetry',
    org: 'MedlinePlus (U.S. National Library of Medicine)',
    url: 'https://medlineplus.gov/lab-tests/pulse-oximetry/',
    use: tx('Oksijen doygunluğu aralıkları (%95-100 normal, ≤%92 hekime, ≤%88 acil)', 'Oxygen saturation ranges (95-100% normal, ≤92% call a doctor, ≤88% urgent)'),
  },
  {
    id: 'mpBloodPressure',
    kind: 'medical',
    title: 'High Blood Pressure',
    org: 'MedlinePlus (U.S. National Library of Medicine)',
    url: 'https://medlineplus.gov/highbloodpressure.html',
    use: tx('Tansiyon kategorileri (normal, yükselmiş, evre 1, evre 2, kriz)', 'Blood pressure categories (normal, elevated, stage 1, stage 2, crisis)'),
  },
  {
    id: 'mpLowSugar',
    kind: 'medical',
    title: 'Low blood sugar',
    org: 'MedlinePlus (U.S. National Library of Medicine)',
    url: 'https://medlineplus.gov/ency/article/000386.htm',
    use: tx('Düşük kan şekeri eşikleri (70 mg/dL altı düşük, 54 altı ciddi)', 'Low blood sugar thresholds (below 70 mg/dL low, below 54 serious)'),
  },
  {
    id: 'cdcDiabetes',
    kind: 'medical',
    title: 'Diabetes Testing',
    org: 'CDC',
    url: 'https://www.cdc.gov/diabetes/diabetes-testing/index.html',
    use: tx('Açlık kan şekeri aralıkları (99 ve altı normal)', 'Fasting blood sugar ranges (99 or below normal)'),
  },
  {
    id: 'sleepStudy',
    kind: 'medical',
    title: 'Sleep deficiency and sleep medication use in astronauts (Barger et al., The Lancet Neurology)',
    org: 'Brigham and Women\'s Hospital, via ScienceDaily',
    date: '08.08.2014',
    url: 'https://www.sciencedaily.com/releases/2014/08/140807215803.htm',
    use: tx('NASA\'nın planladığı 8,5 saat uyku ve istasyondaki ortalama 6,09 saat', 'NASA\'s scheduled 8.5 hours of sleep and the 6.09-hour average on the station'),
  },
  {
    id: 'orionLife',
    kind: 'nasa',
    title: 'Life Encapsulated: Inside NASA\'s Orion for Artemis II Moon Mission',
    org: 'NASA',
    date: '29.09.2023, rev. 15.04.2026',
    url: 'https://www.nasa.gov/humans-in-space/life-encapsulated-inside-nasas-orion-for-artemis-ii-moon-mission/',
    use: tx(
      'Orion uzay aracında günde 30 dakika egzersiz; kürek çekme, squat ve deadlift yapılan kablolu uçan tekerlek (flywheel)',
      '30 minutes of daily exercise on the Orion spacecraft; a cable-based flywheel for rowing, squats and deadlifts',
    ),
  },
  {
    id: 'orionFlywheel',
    kind: 'nasa',
    title: 'I Am Artemis: Ryan Schulte',
    org: 'NASA',
    date: '29.04.2026',
    url: 'https://www.nasa.gov/missions/artemis/i-am-artemis/i-am-artemis-ryan-schulte/',
    use: tx(
      'Uçan tekerlekle yapılan hareketler (squat, deadlift, eğilerek kürek, topuk kaldırma, kürek çekme), günde ~30 dk; uzun Ay yüzeyi yürüyüşlerine hazırlık',
      'Flywheel exercises (squats, deadlifts, bent rows, heel raises, rowing), ~30 min/day; preparing for long lunar spacewalks',
    ),
  },
  {
    id: 'partialGravity',
    kind: 'nasa',
    title: 'The Partial Gravity of the Moon and Mars Appears Insufficient to Maintain Human Health (ICES-2021-142)',
    org: 'NASA Ames Research Center (H. W. Jones)',
    date: '2021',
    url: 'https://ntrs.nasa.gov/api/citations/20210019591/downloads/ICES-2021-142.pdf',
    use: tx(
      '0,4 g altındaki kısmi yerçekimi kas, kemik ve kalp-damar kondisyonunu korumaya yetmez; egzersiz Ay ve Mars\'ta da gerekir',
      'Partial gravity below 0.4 g is insufficient to maintain muscle, bone and cardiovascular conditioning; exercise is still needed on the Moon and Mars',
    ),
  },
  {
    id: 'moonFacts',
    kind: 'nasa',
    title: 'Moon Facts',
    org: 'NASA Science',
    url: 'https://science.nasa.gov/moon/facts/',
    use: tx('Ay yüzeyindeki yerçekimi Dünya\'nınkinin altıda biri', 'Gravity on the Moon\'s surface is one-sixth of Earth\'s'),
  },
  {
    id: 'humansToMars',
    kind: 'nasa',
    title: 'Humans to Mars',
    org: 'NASA',
    url: 'https://www.nasa.gov/humans-in-space/humans-to-mars/',
    use: tx('Mars\'ta yerçekimi Dünya\'nın %38\'i (Dünya\'da 100 pound olan biri Mars\'ta 38 pound gelir)', 'Mars gravity is 38% of Earth\'s (100 pounds on Earth weighs 38 pounds on Mars)'),
  },
  {
    id: 'mpBleeding',
    kind: 'medical',
    title: 'Bleeding (MedlinePlus Medical Encyclopedia)',
    org: 'MedlinePlus (U.S. National Library of Medicine)',
    date: '14.10.2025',
    url: 'https://medlineplus.gov/ency/article/000045.htm',
    use: tx('Dış kanamada doğrudan baskı, bezi kaldırmadan bekleme, kan geçerse üstüne bez ekleme', 'Direct pressure for external bleeding, not lifting the cloth, adding cloth if blood soaks through'),
  },
  {
    id: 'mpCuts',
    kind: 'medical',
    title: 'Cuts and puncture wounds (MedlinePlus Medical Encyclopedia)',
    org: 'MedlinePlus (U.S. National Library of Medicine)',
    date: '14.10.2025',
    url: 'https://medlineplus.gov/ency/article/000043.htm',
    use: tx('Küçük kesikte temizlik ve bandaj; 10 dakika baskıyla durmayan kanamada acil yardım', 'Cleaning and dressing minor cuts; emergency help if bleeding does not stop after 10 minutes of pressure'),
  },
  {
    id: 'mpBrokenBone',
    kind: 'medical',
    title: 'Broken bone (MedlinePlus Medical Encyclopedia)',
    org: 'MedlinePlus (U.S. National Library of Medicine)',
    date: '14.01.2026',
    url: 'https://medlineplus.gov/ency/article/000001.htm',
    use: tx('Kırık şüphesinde bölgeyi sabitleme, kemiği düzeltmeye ya da oynatmaya çalışmama, buz ve yüksekte tutma, dolaşımı kontrol etme', 'For a suspected break: immobilising the area, not straightening or testing the bone, ice and elevation, checking circulation'),
  },
  {
    id: 'cognition',
    kind: 'medical',
    title: 'Development and Validation of the Cognition Test Battery for Spaceflight (Basner et al.)',
    org: 'Aerospace Medicine and Human Performance',
    date: '11.2015',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4691281/',
    use: tx('Astronotlar için geliştirilen 10 testlik Cognition bataryası; zihin egzersizlerinin seçimine dayanak olan ISS sonuçları (Dev ve ark., 2024) bu bataryayla ölçüldü', 'The 10-test Cognition battery designed for astronauts; the ISS results behind the choice of the mind exercises (Dev et al., 2024) were measured with it'),
  },
  {
    id: 'cdcBmi',
    kind: 'medical',
    title: 'Adult BMI Categories',
    org: 'CDC',
    date: '19.03.2024',
    url: 'https://www.cdc.gov/bmi/adult-calculator/bmi-categories.html',
    use: tx('Vücut kitle indeksi (kilo / boy²) ve yetişkin kategorileri (18,5-25 sağlıklı)', 'Body mass index (weight / height²) and adult categories (18.5-25 healthy)'),
  },
  /* "Günün bilgisi" kartı (ana sayfa, her şey yolundayken); hepsi 13 Kasım 2026'da açılıp sayıları birebir doğrulandı */
  {
    id: 'issFacts',
    kind: 'nasa',
    title: 'Space Station Facts and Figures',
    org: 'NASA',
    url: 'https://www.nasa.gov/international-space-station/space-station-facts-and-figures/',
    use: tx("Günün bilgisi: istasyonun 90 dakikada bir tur atması, günde 16 gün doğumu, hızı, boyu, kütlesi ve Kasım 2000'den beri kesintisiz yaşanması", "Fact of the day: the station orbiting every 90 minutes, 16 sunrises a day, its speed, length, mass and continuous occupation since November 2000"),
  },
  {
    id: 'issWater',
    kind: 'nasa',
    title: 'NASA Achieves Water Recovery Milestone on International Space Station',
    org: 'NASA',
    url: 'https://www.nasa.gov/missions/station/iss-research/nasa-achieves-water-recovery-milestone-on-international-space-station/',
    use: tx("Günün bilgisi: istasyonda suyun %98'inin idrar, nefes ve terden geri kazanılması", "Fact of the day: 98% of water recovered on the station from urine, breath and sweat"),
  },
  {
    id: 'humanBody',
    kind: 'nasa',
    title: 'The Human Body in Space',
    org: 'NASA',
    url: 'https://www.nasa.gov/humans-in-space/the-human-body-in-space/',
    use: tx("Günün bilgisi: kemiklerin ayda %1-1,5 mineral kaybı ve sıvıların başa doğru kayması", "Fact of the day: bones losing 1-1.5% mineral density a month and fluids shifting toward the head"),
  },
  {
    id: 'venusFacts',
    kind: 'nasa',
    title: 'Venus Facts',
    org: 'NASA Science',
    url: 'https://science.nasa.gov/venus/venus-facts/',
    use: tx("Günün bilgisi: Venüs'te günün yıldan uzun olması, Güneş'in batıdan doğması ve 467 °C yüzey sıcaklığı", "Fact of the day: a Venus day longer than its year, the Sun rising in the west and the 467 °C surface"),
  },
  {
    id: 'sunFacts',
    kind: 'nasa',
    title: 'Sun Facts',
    org: 'NASA Science',
    url: 'https://science.nasa.gov/sun/facts/',
    use: tx("Günün bilgisi: Güneş'in yaşı, uzaklığı, hacmine sığan Dünya sayısı ve çekirdek sıcaklığı", "Fact of the day: the Sun's age, distance, how many Earths fit inside it and its core temperature"),
  },
  {
    id: 'marsFacts',
    kind: 'nasa',
    title: 'Mars Facts',
    org: 'NASA Science',
    url: 'https://science.nasa.gov/mars/facts/',
    use: tx("Günün bilgisi: Mars'ta günün uzunluğu, tozlu kırmızı gökyüzü ve iki uydusu", "Fact of the day: the length of a Mars day, its dusty red sky and its two moons"),
  },
  /* Space Apps 2026 "Health Monitoring Software" challenge kaynakları (14 Kasım 2026'da açılıp okundu) */
  {
    id: 'hrpRisks',
    kind: 'nasa',
    title: 'Risks of Human Spaceflight',
    org: 'NASA Human Research Program',
    url: 'https://www.nasa.gov/hrp/risks/',
    use: tx("HRP'nin izlediği riskler: bağışıklık, kalp-damar, kemik, görme (SANS), uyku, davranış, radyasyona bağlı kanser vb.", "The risks the HRP tracks: immune, cardiovascular, bone, vision (SANS), sleep, behavioral, radiation-induced cancer and more"),
  },
  {
    id: 'hrpOngoing',
    kind: 'nasa',
    title: 'Ongoing HRP Research in Space',
    org: 'NASA Human Research Program',
    date: '18.08.2026',
    url: 'https://www.nasa.gov/hrp/ongoing-hrp-research/',
    use: tx("Artemis II ve ISS'te süren sağlık izleme araştırmaları (ARCHeR, Standard Measures, CIPHER vb.)", "Health monitoring research under way on Artemis II and the ISS (ARCHeR, Standard Measures, CIPHER and more)"),
  },
  {
    id: 'hrpDistance',
    kind: 'nasa',
    title: 'Hazard: Distance from Earth',
    org: 'NASA Human Research Program',
    url: 'https://www.nasa.gov/hrp/hazard-distance-from-earth/',
    use: tx("Günün bilgisi: Mars'ın uzaklığı ve tek yönde 20 dakikaya varan iletişim gecikmesi; mürettebatın kendi başına sağlık kararı alması", "Fact of the day: Mars's distance and the communication delay of up to 20 minutes one way; crews handling medical situations on their own"),
  },
  {
    id: 'hrpIsolation',
    kind: 'nasa',
    title: 'Hazard: Isolation and Confinement',
    org: 'NASA Human Research Program',
    date: '01.08.2024',
    url: 'https://www.nasa.gov/hrp/hazard-isolation-and-confinement/',
    use: tx("Günün bilgisi: HERA ve CHAPEA'da yalıtım ve kapalı ortam çalışmaları; uyku kaybı ve gündüz-gece düzeninin bozulması", "Fact of the day: isolation and confinement studies in HERA and CHAPEA; sleep loss and disrupted circadian rhythms"),
  },
  {
    id: 'hrpGravity',
    kind: 'nasa',
    title: 'Hazard: Gravity Fields',
    org: 'NASA Human Research Program',
    url: 'https://www.nasa.gov/hrp/hazard-gravity-fields/',
    use: tx("Günün bilgisi: sıvıların başa kayması ve görme, böbrek taşı riski, Mars'ta yerçekimi (Dünya'nın üçte biri)", "Fact of the day: fluids shifting to the head and vision, kidney stone risk, gravity on Mars (one-third of Earth's)"),
  },
  {
    id: 'boneFracture',
    kind: 'nasa',
    title: 'Evidence Report: Risk of Bone Fracture due to Spaceflight-induced Changes to Bone',
    org: 'NASA Human Research Program',
    date: '12.05.2017',
    url: 'https://humanresearchroadmap.nasa.gov/Evidence/reports/Fracture.pdf',
    use: tx("Kemik kaybı (ayda %1-1,5), DXA'nın sınırı, kemik yıkım belirteçleri ve Mars görevi sonrası kırık riski; tahmini kemik kaybı hesabının dayanağı", "Bone loss (1-1.5% per month), the limits of DXA, bone resorption biomarkers and fracture risk after a Mars mission; the basis of the estimated bone loss"),
  },
  {
    id: 'csaRadiation',
    kind: 'agency',
    title: 'Monitoring radiation for astronaut health',
    org: 'Canadian Space Agency',
    date: '26.02.2026',
    url: 'https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp',
    use: tx("Günün bilgisi: ISS'teki radyasyonun yaklaşık %30'unu oluşturan nötron radyasyonu ve onu ölçen CANS cihazı", "Fact of the day: neutron radiation, about 30% of the radiation on the ISS, and the CANS instrument that measures it"),
  },
  {
    id: 'csaScience',
    kind: 'agency',
    title: 'Why do we conduct science experiments in space?',
    org: 'Canadian Space Agency',
    date: '28.10.2025',
    url: 'https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp',
    use: tx("Günün bilgisi: ISS'te aynı anda süren deney sayısı ve uzay ortamının hızlanmış yaşlanmaya benzer etkileri", "Fact of the day: the number of experiments running on the ISS at once and how spaceflight effects resemble accelerated aging"),
  },
  /* Challenge kaynaklarının derin taraması (14 Kasım 2026): belgelerin metni indirilip ilgili cümleler birebir okundu */
  {
    id: 'immuneEB',
    kind: 'nasa',
    title: 'Evidence Report: Risk of Adverse Health Outcomes and Decrements in Performance Due to Altered Immune Response',
    org: 'NASA Human Research Program',
    date: '15.06.2022',
    url: 'https://humanresearchroadmap.nasa.gov/evidence/reports/IMMUNE%20EB%20Update%202021%20v02%20FINAL_6-15-22.pdf',
    use: tx("Bir haftadan uzun süren, tekrarlayan ya da tedaviye yanıt vermeyen olaylar \"kayda değer\" sayılır (mürettebatın %46'sı uçuşta yaşadı); uzun süren şikayet uyarısının dayanağı", "Events that persisted longer than 1 week, were repeated or did not respond to treatment count as \"notable\" (46% of crew had one in flight); the basis of the long-lasting complaint alert"),
  },
  {
    id: 'sansEB',
    kind: 'nasa',
    title: 'Evidence Report: Risk of Spaceflight Associated Neuro-ocular Syndrome (SANS)',
    org: 'NASA Human Research Program',
    date: '15.08.2022',
    url: 'https://humanresearchroadmap.nasa.gov/evidence/reports/SANS%20EB%202022%20FINAL_8-15-22.pdf',
    use: tx('Uzun görevlerde mürettebatın yaklaşık %70\'inde göz değişikliğinin erken belirtileri; yakın görme şikayeti %48; check-in\'deki görme sorusunun dayanağı', 'About 70% of long-duration crew show the earliest signs of eye changes; near vision complaints 48%; the basis of the vision question in check-ins'),
  },
  {
    id: 'standardMeasures',
    kind: 'nasa',
    title: 'Spaceflight Standard Measures: Characterizing How Humans Adapt in Space',
    org: 'NASA',
    url: 'https://www.nasa.gov/humans-in-space/spaceflight-standard-measures-characterizing-how-humans-adapt-in-space/',
    use: tx('Astronotlar uyanınca uyku, yatmadan önce ruh hali ve takım uyumu anketi doldurur; check-in\'deki takım uyumu sorusunun dayanağı', 'Astronauts fill in a sleep questionnaire on waking and a mood and team cohesion questionnaire before sleep; the basis of the team question in check-ins'),
  },
  {
    id: 'co2Ops',
    kind: 'nasa',
    title: 'CO2 on the International Space Station: An Operations Update (Law, Alexander)',
    org: 'NASA Johnson Space Center',
    url: 'https://ntrs.nasa.gov/api/citations/20150019624/downloads/20150019624.pdf',
    use: tx('Mürettebatta CO₂ belirtileri 2,3 mmHg\'den itibaren; 0,5-2,0 mmHg sağlık ve performansı koruyabilir; CO₂ belirtileri haftalık özel hekim görüşmelerinde sorulur', 'CO₂ symptoms in crew from 2.3 mmHg; 0.5-2.0 mmHg may maintain health and performance; CO₂ symptoms are asked about in weekly private medical conferences'),
  },
  {
    id: 'std3001v1',
    kind: 'nasa',
    title: 'NASA-STD-3001 Volume 1, Revision C: Crew Health',
    org: 'NASA OCHMO',
    url: 'https://www.nasa.gov/wp-content/uploads/2023/11/nasa-std-3001-vol-1-rev-c-with-signature.pdf',
    use: tx('Önerilen 8,5 saatlik uyku periyodu (ayrıca uyku öncesi 2 ve sonrası 1,5 saat programa konmalı); kariyer radyasyon sınırı 600 mSv', 'Recommended 8.5 h sleep period (the schedule also needs 2 h pre-sleep and 1.5 h post-sleep); career radiation limit 600 mSv'),
  },
  {
    id: 'tb041',
    kind: 'nasa',
    title: 'NASA-STD-3001 Technical Brief OCHMO-TB-041: Sleep Accommodations',
    org: 'NASA OCHMO',
    url: 'https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-041-sleep-accommodations.pdf',
    use: tx('Astronotlar uzayda ortalama yaklaşık altı saat uyuyor', 'Astronauts average about six hours of sleep in space'),
  },
  {
    id: 'foodRisk',
    kind: 'nasa',
    title: 'Risk of Inadequate Food and Nutrition: Risk Record Rev D',
    org: 'NASA Human System Risk Board',
    url: 'https://www.nasa.gov/wp-content/uploads/2025/08/food-risk-record-rev-d-web-final.pdf',
    use: tx('2000-2024 arasında mürettebatın %25\'i uçuşta vücut kütlesinin %5\'inden fazlasını kaybetti', '25% of crew from 2000-2024 lost more than 5% of body mass in flight'),
  },
  {
    id: 'nutritionER',
    kind: 'nasa',
    title: 'Evidence Report: Risk of Performance Decrement and Crew Illness Due to Inadequate Food and Nutrition',
    org: 'NASA Human Research Program',
    date: '2020',
    url: 'https://humanresearchroadmap.nasa.gov/Evidence/other/Nutrition%20ER_human_adaptation_2020_final.pdf',
    use: tx('Altı temel besin (enerji, sıvı, kalsiyum, protein, sodyum, demir) uçuş hekimlerine haftalık bildirilir', 'Six key nutrients (energy, fluid, calcium, protein, sodium, iron) are reported weekly to flight surgeons'),
  },
  {
    id: 'csaBioMonitor',
    kind: 'agency',
    title: 'Bio-Monitor',
    org: 'Canadian Space Agency',
    url: 'https://www.asc-csa.gc.ca/eng/sciences/bio-monitor.asp',
    use: tx('Giyilebilir sistem nabız ve kalp elektriği, tansiyon, solunum, deri ısısı, kan oksijeni ve aktiviteyi ölçer; gösterge setimizin bir dayanağı', 'A wearable that measures pulse and heart electrical activity, blood pressure, breathing, skin temperature, blood oxygen and activity; a basis for our indicator set'),
  },
  {
    id: 'podcastDistance',
    kind: 'nasa',
    title: 'Houston We Have a Podcast, Episode 59: Hazard 3: Distance',
    org: 'NASA Johnson Space Center',
    date: '24.08.2018',
    url: 'https://www.nasa.gov/podcasts/houston-we-have-a-podcast/hazard-3-distance/',
    use: tx('Mars en yakındayken tek yönlü gecikme yaklaşık 3 dakika, en uzaktayken 22,5 dakika; gösterilen gecikme aralığının dayanağı', 'At closest approach the one-way delay to Mars is about 3 minutes, at farthest 22.5 minutes; the basis of the delay range shown'),
  },
  {
    id: 'teamRisk',
    kind: 'nasa',
    title: 'Team Risk: Inadequate Cooperation, Coordination, Communication, and Psychosocial Adaptation within a Team',
    org: 'NASA Human Health and Performance',
    url: 'https://www.nasa.gov/directorates/esdmd/hhp/team-risk/',
    use: tx("Mürettebat içinde zaman zaman görülen çatışma; ekip eğitimi ve performansı sistematik olarak izlenmiyor. Check-in'deki ekip uyumu sorusunun dayanağı", 'Occasional conflict within crews; team training and performance are not systematically monitored. The basis of the team question in the check-in'),
  },
  {
    id: 'radCancer',
    kind: 'nasa',
    title: 'Risk of Radiation-Induced Cancers',
    org: 'NASA Human Research Program',
    url: 'https://www.nasa.gov/reference/risk-of-radiation-induced-cancers/',
    use: tx('Günün bilgisi: istasyon görevleri manyetosferin içinde, Ay ve Mars görevleri dışında', 'Fact of the day: station missions stay inside the magnetosphere, Moon and Mars missions go beyond it'),
  },
  {
    id: 'dynamicLoads',
    kind: 'nasa',
    title: 'Risk of Injury from Dynamic Loads',
    org: 'NASA Human Research Program',
    url: 'https://www.nasa.gov/reference/risk-of-injury-from-dynamic-loads/',
    use: tx("Günün bilgisi: Ay ve Mars'ta inişten hemen sonra araçtan kendi başına çıkma ve çalışma", 'Fact of the day: getting out of the vehicle and working unaided shortly after landing on the Moon and Mars'),
  },
  {
    id: 'nutritionBands',
    kind: 'nasa',
    title: 'Nutrition Requirements, Standards, and Operating Bands for Exploration Missions',
    org: 'NASA Johnson Space Center, Nutritional Biochemistry Laboratory',
    date: 'Rev 1, 12.2005',
    url: 'https://ntrs.nasa.gov/api/citations/20200001703/downloads/20200001703.pdf',
    use: tx('Su eşiği: günlük sıvı 1-1,5 mL/kcal ve en az 2000 mL; günde 2 L altı kırmızı bant', 'Water threshold: daily fluid 1-1.5 mL/kcal and at least 2000 mL; below 2 L a day is the red band'),
  },
  {
    id: 'std3001v2',
    kind: 'nasa',
    title: 'NASA-STD-3001 Volume 2, 6.0 Natural and Induced Environments',
    org: 'NASA OCHMO',
    url: 'https://www.nasa.gov/reference/6-0-natural-and-induced-environments-vol-2/',
    use: tx('[V2 6004] 1 saatlik ortalama CO₂ en fazla 3 mmHg; [V2 6022] kabin değerleri güvenli sınırın dışına çıkınca mürettebat uyarılmalı', '[V2 6004] one-hour average CO₂ no more than 3 mmHg; [V2 6022] the crew must be alerted when cabin values leave safe limits'),
  },
  {
    id: 'mindIss',
    kind: 'medical',
    title: 'Cognitive performance in ISS astronauts on 6-month low earth orbit missions (Dev et al.)',
    org: 'Frontiers in Physiology',
    date: '20.11.2024',
    url: 'https://www.frontiersin.org/articles/10.3389/fphys.2024.1451269/full',
    use: tx(
      "25 ISS astronotunda Cognition bataryası: sistematik düşüş yok; uçuşun başında işlem hızı, görsel çalışma belleği ve sürekli dikkat yavaşladı; görsel çalışma belleği hızı dönüşten 30 gün sonra uçuş öncesine dönmedi. Hızlı bakış ve Bellek akışı egzersizlerinin seçim gerekçesi",
      'Cognition battery in 25 ISS astronauts: no systematic decline; processing speed, visual working memory and sustained attention slowed in early flight; visual working memory speed had not returned to pre-flight levels 30 days after the mission. Why the Quick glance and Memory stream exercises were chosen',
    ),
  },
  {
    id: 'actSpeed',
    kind: 'medical',
    title: 'Speed of processing training results in lower risk of dementia (Edwards et al.)',
    org: "Alzheimer's & Dementia: Translational Research & Clinical Interventions",
    date: '2017',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5700828/',
    use: tx(
      'ACTIVE randomize kontrollü çalışması (2802 yaşlı yetişkin, 10 yıl): hız eğitimi alanlarda demans riski kontrole göre daha düşük (HR 0,71); bellek ve akıl yürütme eğitiminde anlamlı fark yok. Hızlı bakış egzersizinin dayanağı; katılımcılar 65 yaş ve üstüydü',
      'ACTIVE randomized controlled trial (2,802 older adults, 10 years): lower dementia risk after speed training than control (HR 0.71); no significant difference after memory or reasoning training. The basis of the Quick glance exercise; participants were 65 and older',
    ),
  },
  {
    id: 'visuospatial',
    kind: 'medical',
    title: 'Persistent deterioration of visuospatial performance in spaceflight (Takács et al.)',
    org: 'Scientific Reports',
    date: '2021',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8100295/',
    use: tx(
      'ISS görevindeki 5 astronotla öncü çalışma: görsel-uzamsal görevlerde yörüngede Dünya\'dakinden yavaş ve daha çok hatalıydılar; uçuşun yaklaşık 8. ve 50. gününde uyum belirtisi görülmedi. Zihinde döndür egzersizinin seçim gerekçesi',
      'Pilot study of 5 astronauts on an ISS mission: on visuospatial tasks they were slower and made more errors in orbit than on Earth, with no signs of adaptation at about day 8 and day 50. Why the Mental rotation exercise was chosen',
    ),
  },
  {
    id: 'sensorimotorRisk',
    kind: 'nasa',
    title: 'Risk of Altered Sensorimotor and Vestibular Function',
    org: 'NASA Human Research Program',
    url: 'https://www.nasa.gov/reference/risk-of-altered-sensorimotor-and-vestibular-function/',
    use: tx('Yerçekimi değişimi hareket hastalığına ve uzamsal yönelim bozukluğuna yol açabilir; Zihinde döndür egzersizinin uzay bağlamı', 'Gravity changes can cause motion sickness and spatial disorientation; the space context of the Mental rotation exercise'),
  },
  {
    id: 'spatialTraining',
    kind: 'medical',
    title: 'The malleability of spatial skills: a meta-analysis of training studies (Uttal et al.)',
    org: 'Psychological Bulletin',
    date: '2013',
    url: 'https://pubmed.ncbi.nlm.nih.gov/22663761/',
    use: tx(
      '217 çalışmanın meta-analizi: uzamsal beceriler eğitimle gelişir, kazanım sonradan yapılan testlerde de sürer ve eğitilmeyen uzamsal görevlere de geçer. Zihinde döndür egzersizinin dayanağı',
      'Meta-analysis of 217 studies: spatial skills improve with training, gains hold at delayed posttests and transfer to untrained spatial tasks. The basis of the Mental rotation exercise',
    ),
  },
  {
    id: 'nbackMeta',
    kind: 'medical',
    title: 'Working memory training revisited: A multi-level meta-analysis of n-back training studies (Soveri et al.)',
    org: 'Psychonomic Bulletin & Review',
    date: '2017',
    url: 'https://doi.org/10.3758/s13423-016-1217-0',
    use: tx(
      "33 randomize kontrollü çalışma: n-geri eğitimi eğitilmeyen n-geri görevlerine orta düzeyde, diğer bellek ve akıl yürütme görevlerine çok az geçer; kazanımın önemli kısmı göreve özgüdür. Bellek akışı egzersizinin dayanağı ve sınırı",
      '33 randomized controlled trials: n-back training transfers moderately to untrained n-back tasks and very little to other memory and reasoning tasks; much of the gain is task-specific. The basis and the limit of the Memory stream exercise',
    ),
  },
]

export const SOURCES: Record<SourceId, Source> = Object.fromEntries(LIST.map((s) => [s.id, s])) as Record<SourceId, Source>
export const SOURCE_LIST = LIST

/** Kısa ad: "MedlinePlus · Bleeding", "NASA OCHMO · NASA-STD-3001 Technical Brief OCHMO-TB-033" */
export function sourceShort(id: SourceId): string {
  const s = SOURCES[id]
  return `${s.org.split(' (')[0]} · ${s.title.split(' (')[0].split(':')[0]}`
}
