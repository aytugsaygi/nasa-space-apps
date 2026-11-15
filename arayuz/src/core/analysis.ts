import { CAREER_LIMIT_MSV, INDICATORS, relativeStatus, severity, type IndicatorId, type Status } from './catalog'
import { bodyPart } from './coach'
import { CREW, type CrewId } from './crew'
import type { ComplaintDoc, Finding, Fitness, IndicatorState, ScenarioDoc } from './model'
import type { SourceId } from './sources'
import { PERSONAL_IDS, type PersonalId, type PersonalNormal } from './personal'
import { num, tx, type Tx } from './tx'

/*
 * Analiz ve uyarılar (gereksinim belgesi 3. bölüm). Kurallar açıklanabilir: her uyarı neden verildiğini sayılarla söyler
 * ve dayandığı kaynağı gösterir (U-11). Karmaşık bir model yerine kural tabanlı tespit seçildi; jüri ve hekim bir uyarının
 * neden çıktığını sorabilir.
 *
 * - U-01: her ölçüm katalogdaki aralığa göre değerlendirilir (snapshot'taki durumlar)
 * - U-02: kişisel başlangıçtan belirgin sapma, değer normal aralıkta olsa bile işaretlenir
 * - U-03: süren olumsuz eğilim (bir haftadır azalan uyku) tek gün normal görünse de uyarı verir
 * - U-05: seviyeler bilgi / dikkat / kritik, her birinde önerilen eylem var
 * - U-06: uyku ve tepki süresinden göreve uygunluk
 * - U-07: uzun süre hareketsizlik
 * - U-08: görev süresi ve egzersize uyumdan kemik kaybı tahmini
 * - U-09: toplam radyasyon dozu kariyer sınırına göre; güneş parçacık olayı uyarısı
 * - U-10: kabin CO₂ 7 günlük ortalaması
 * - U-13 / D-01: kritik durumlar uçuş hekimine otomatik bildirilir
 */

export interface AnalysisInput {
  astronaut: CrewId
  now: number
  hour: number
  indicators: Record<IndicatorId, IndicatorState>
  /** Son 8 gecenin uykusu (eskiden yeniye) */
  sleepHistory: number[]
  /** Son 5 günün ruh hali (eskiden yeniye) */
  moodHistory: number[]
  exerciseYesterday: number
  /** Planlı antrenman saatinde mi (bu sırada nabzın kişisel normalin üstüne çıkması beklenir) */
  exercising: boolean
  /** Kişisel normal (U-04): son 14 günün verisinden hesaplanan bant */
  personal: Record<PersonalId, PersonalNormal>
  /** Ortama göre günlük egzersiz hedefi (istasyonda ~120, Orion'da 30 dk) */
  exerciseTarget: number
  exerciseToday: number
  plannedToday: number
  programSkipped: boolean
  water: { todayMl: number; expectedMl: number; targetMl: number }
  co2: { latest: number; avg7: number }
  dose: { totalMsv: number; percent: number; todayMsv: number }
  complaints: ComplaintDoc[]
  scenarios: ScenarioDoc[]
  /** Son 14 günün egzersiz uyumu (0-1) */
  adherence: number
  missionDay: number
  comm: { blackout: boolean }
  /** Son 24 saatte gerçek bir güneş parçacık olayı (DONKI) */
  realSep?: { time: string; link: string }
}

const T = tx

function f(input: AnalysisInput, partial: Omit<Finding, 'ts' | 'notifyDoctor' | 'page'> & { page?: number; notifyDoctor?: boolean }): Finding {
  return { ts: input.now, page: 0, notifyDoctor: partial.level === 'kritik', ...partial }
}

const fmt = (id: IndicatorId, v: number, lang: 'tr' | 'en') => num(v, lang, INDICATORS[id].digits)

/** Bir göstergenin değerini dil çiftine çevirir: "112 atım/dk" */
function valueTx(id: IndicatorId, s: IndicatorState): Tx {
  const ind = INDICATORS[id]
  const val = (l: 'tr' | 'en') => (s.value2 !== undefined ? `${fmt(id, s.value ?? 0, l)}/${fmt(id, s.value2, l)}` : fmt(id, s.value ?? 0, l))
  return { tr: `${val('tr')} ${ind.unit.tr}`, en: `${val('en')} ${ind.unit.en}` }
}

/** Ölçüm durumuna göre önerilen eylem (U-05) */
const ACTION: Partial<Record<IndicatorId, Partial<Record<Status, Tx>>>> = {
  hr: {
    dikkat: T('Egzersizde değilsen otur ve 2 dakika yavaş nefes al: 4 saniye al, 6 saniye ver. Göğüs ağrısı olursa hemen uçuş hekimine bağlan.', 'If you are not exercising, sit and breathe slowly for 2 minutes: in for 4 seconds, out for 6. If you get chest pain, call the flight surgeon right away.'),
    kritik: T('Hareketi bırak, bir mürettebat arkadaşına haber ver ve uçuş hekimine bağlan.', 'Stop moving, tell a crewmate and call the flight surgeon.'),
  },
  bp: {
    dikkat: T('Ölçümü 5 dakika dinlendikten sonra tekrarla. Baş dönmesi varsa sabitlenip uzan, sıvı al.', 'Repeat the measurement after resting for 5 minutes. If you feel dizzy, secure yourself, lie back and drink fluids.'),
    kritik: T('Hemen uçuş hekimine bağlan ve ölçümü tekrarla.', 'Call the flight surgeon right away and repeat the measurement.'),
  },
  spo2: {
    dikkat: T('Sensörün yerini kontrol edip ölçümü tekrarla. Değer %92 ve altında kalırsa uçuş hekimine danış.', 'Check the sensor position and measure again. If it stays at 92% or lower, consult the flight surgeon.'),
    kritik: T('Acil: uçuş hekimine hemen bağlan, kabin havası ve CO₂ değerlerini kontrol ettir.', 'Urgent: call the flight surgeon now and have cabin air and CO₂ checked.'),
  },
  temp: {
    dikkat: T('Dinlen, sıvı al ve 1 saat sonra tekrar ölç. Ateş sürerse uçuş hekimine bildir; kapalı ortamda bulaşma riskini azaltmak için ekibe haber ver.', 'Rest, drink fluids and measure again in 1 hour. If the fever continues, tell the flight surgeon and the crew to lower the risk of spreading illness in the closed cabin.'),
    kritik: T('Uçuş hekimine hemen bağlan.', 'Call the flight surgeon right away.'),
  },
  glucose: {
    dikkat: T('Düşükse hızlı emilen bir karbonhidrat al ve 15 dakika sonra tekrar ölç. Yüksekse bir sonraki açlık ölçümünü bekle.', 'If low, have a fast-acting carbohydrate and measure again in 15 minutes. If high, wait for the next fasting measurement.'),
    kritik: T('Uçuş hekimine hemen bağlan.', 'Call the flight surgeon right away.'),
  },
}

/** 'Nabız: dinlenme için yüksek'; etiket zaten göstergenin adını içeriyorsa yalnızca etiket ('Düşük tansiyon') */
function titleFor(name: Tx, label: Tx): Tx {
  const one = (n: string, l: string, loc: string) => (l.toLocaleLowerCase(loc).includes(n.toLocaleLowerCase(loc)) ? l : `${n}: ${l.toLocaleLowerCase(loc)}`)
  return { tr: one(name.tr, label.tr, 'tr-TR'), en: one(name.en, label.en, 'en-US') }
}

const sourcesOf = (id: IndicatorId, basis: SourceId | 'vitalis'): (SourceId | 'vitalis')[] => [...new Set([basis, INDICATORS[id].rangeSource])]

export function analyze(input: AnalysisInput): Finding[] {
  const out: Finding[] = []
  const ind = input.indicators
  const m = CREW[input.astronaut]

  /* U-01: anlık değerler */
  for (const id of ['hr', 'spo2', 'temp', 'bp', 'glucose'] as IndicatorId[]) {
    const s = ind[id]
    if (s.value === null || s.status === 'normal') continue
    const def = INDICATORS[id]
    out.push(
      f(input, {
        key: `${id}:${s.status}`,
        level: s.status,
        indicator: id,
        region: def.region,
        title: titleFor(def.name, s.label),
        reason: {
          tr: `Son ölçüm ${valueTx(id, s).tr}. Referans: ${def.range.tr}.`,
          en: `The latest reading is ${valueTx(id, s).en}. Reference: ${def.range.en}.`,
        },
        action: ACTION[id]?.[s.status] ?? T('Ölçümü tekrarla.', 'Repeat the measurement.'),
        sources: sourcesOf(id, s.basis),
      }),
    )
  }

  /* U-02: kişisel başlangıçtan sapma (değer normal bantta olsa bile) */
  const bp = ind.bp
  if (bp.value !== null && bp.status === 'normal' && bp.value - m.baseline.sys >= 15) {
    out.push(
      f(input, {
        key: 'bp:baseline',
        level: 'bilgi',
        indicator: 'bp',
        region: 'gogus',
        title: T('Tansiyon kendi başlangıcının üstünde', 'Blood pressure above your own baseline'),
        reason: {
          tr: `Büyük tansiyon ${bp.value} mmHg; uçuş öncesi başlangıcın ${m.baseline.sys} mmHg. Değer genel aralıkta ama senin için yüksek.`,
          en: `Systolic pressure is ${bp.value} mmHg; your pre-flight baseline is ${m.baseline.sys} mmHg. It is within the general range but high for you.`,
        },
        action: T('Yarın sabah aynı saatte tekrar ölç; eğilim sürerse uçuş hekimi raporuna eklenir.', 'Measure again at the same time tomorrow; if the trend continues it is added to the flight surgeon report.'),
        sources: ['vitalis', 'mpBloodPressure'],
      }),
    )
  }

  /* Uyku: son gece ve U-03 eğilimi */
  const sleep = input.sleepHistory
  const last = sleep[sleep.length - 1]
  const week = sleep.slice(-7)
  const declining = week.length >= 6 && week.slice(1).filter((v, i) => v < week[i] + 0.05).length >= 5 && week[week.length - 1] < week[0] - 0.8
  if (declining) {
    out.push(
      f(input, {
        key: 'sleep:trend',
        level: 'dikkat',
        indicator: 'sleep',
        region: 'bas',
        page: 1,
        title: T('Uyku bir haftadır azalıyor', 'Sleep has been falling for a week'),
        reason: {
          tr: `Son 7 gecede uyku ${num(week[0], 'tr', 1)} saatten ${num(last, 'tr', 1)} saate indi. Tek bir gece normal görünse de süren azalma dikkat ve performansı düşürür.`,
          en: `Over the last 7 nights sleep fell from ${num(week[0], 'en', 1)} to ${num(last, 'en', 1)} hours. Even if one night looks normal, a continuing decline lowers attention and performance.`,
        },
        action: T('Bu akşam ekranları yatmadan bir saat önce kapat ve uyku kabinini karart. Nefes egzersizi 2. sayfada.', 'Tonight, turn off screens an hour before bed and darken your sleep station. A breathing exercise is on page 2.'),
        sources: ['sleepStudy', 'tb033'],
        notifyDoctor: true,
      }),
    )
  } else if (last !== undefined && ind.sleep.status !== 'normal') {
    out.push(
      f(input, {
        key: `sleep:${ind.sleep.status}`,
        level: ind.sleep.status,
        indicator: 'sleep',
        region: 'bas',
        page: 1,
        title: T('Dün gece az uyudun', 'You slept little last night'),
        reason: {
          tr: `Dün gece ${num(last, 'tr', 1)} saat uyudun. Yetişkinler 7-9 saate ihtiyaç duyar ve NASA 8,5 saat planlar. Yedi gün boyunca 6 saat uyumak, 24-36 saat hiç uyumamak kadar performans düşürür.`,
          en: `You slept ${num(last, 'en', 1)} hours last night. Adults need 7-9 hours and NASA schedules 8.5. Seven days of six hours of sleep lowers performance as much as 24 to 36 hours without sleep.`,
        },
        action: T('Gün içinde dikkat gerektiren işleri ekiple paylaş ve kafeini öğleden sonra bırak.', 'Share tasks that need focus with the crew today and stop caffeine in the afternoon.'),
        sources: ['tb041', 'sleepStudy'],
      }),
    )
  }

  /* Ruh hali: son 3 gün */
  const moods = input.moodHistory.slice(-3)
  if (moods.length === 3 && moods.reduce((a, b) => a + b, 0) / 3 <= 2.5) {
    out.push(
      f(input, {
        key: 'mood:low',
        level: 'dikkat',
        indicator: 'mood',
        region: 'bas',
        page: 1,
        title: T('Ruh halin birkaç gündür düşük', 'Your mood has been low for a few days'),
        reason: {
          tr: `Son 3 günün ruh hali ortalaması ${num(moods.reduce((a, b) => a + b, 0) / 3, 'tr', 1)}/5. Yalnızlık ve kapalı ortam uzun görevlerde herkesi zorlar.`,
          en: `Your average mood over the last 3 days is ${num(moods.reduce((a, b) => a + b, 0) / 3, 'en', 1)}/5. Isolation and confinement are hard for everyone on long missions.`,
        },
        action: T(
          'İstersen asistanla konuş ya da Cupola seansı başlat. Uçuş psikoloğuyla özel görüşme planlamak da bir seçenek.',
          'Talk to the assistant if you like, or start a Cupola session. Scheduling a private conference with the flight psychologist is also an option.',
        ),
        sources: ['tb016', 'hrpHazards'],
        notifyDoctor: true,
      }),
    )
  }

  /* U-06: göreve uygunluk tepki süresinden */
  const rx = ind.reaction
  if (rx.value !== null) {
    const r = relativeStatus(rx.value, m.baseline.reaction)
    if (r.status !== 'normal') {
      out.push(
        f(input, {
          key: `reaction:${r.status}`,
          level: r.status === 'kritik' ? 'dikkat' : 'bilgi',
          indicator: 'reaction',
          region: 'bas',
          title: T('Tepki süren yavaşladı', 'Your reaction time has slowed'),
          reason: {
            tr: `Son test ${rx.value} ms; uçuş öncesi başlangıcın ${m.baseline.reaction} ms (%${Math.round((rx.value / m.baseline.reaction - 1) * 100)} yavaş).`,
            en: `The latest test was ${rx.value} ms; your pre-flight baseline is ${m.baseline.reaction} ms (${Math.round((rx.value / m.baseline.reaction - 1) * 100)}% slower).`,
          },
          action: T('Dikkat gerektiren görevleri (robot kol, uzay yürüyüşü hazırlığı) çift kontrolle yap.', 'Do tasks that need focus (robotic arm, spacewalk prep) with a double check.'),
          sources: ['tb016', 'vitalis'],
        }),
      )
    }
  }

  /* Egzersiz */
  if (input.programSkipped) {
    out.push(
      f(input, {
        key: 'exercise:skipped',
        level: 'dikkat',
        indicator: 'exercise',
        region: 'bacaklar',
        page: 2,
        title: T('Bugünkü antrenman yapılmadı', 'Today\'s workout was skipped'),
        reason: T(
          'Planlanan antrenman tamamlanmadı. Egzersiz yapılmayan günlerde kemik ve kas kaybı hızlanır (egzersizsiz ayda %1-1,5 kemik kaybı).',
          'The planned workout was not completed. Bone and muscle loss speeds up on days without exercise (1-1.5% bone loss a month without exercise).',
        ),
        action: T('Kısa bir program istersen spor koçuna sor; en azından 30 dakika CEVIS bisiklet yap.', 'Ask the sport coach for a short program; at least do 30 minutes on the CEVIS cycle.'),
        sources: ['tb033', 'nasaExercise'],
      }),
    )
  } else if (input.exerciseYesterday < input.exerciseTarget * 0.5) {
    out.push(
      f(input, {
        key: 'exercise:yesterday',
        level: 'dikkat',
        indicator: 'exercise',
        region: 'bacaklar',
        page: 2,
        title: T('Dün egzersiz az kaldı', 'Too little exercise yesterday'),
        reason: {
          tr: `Dün ${input.exerciseYesterday} dakika egzersiz yaptın. Bu ortamda hedef günde ~${input.exerciseTarget} dakika.`,
          en: `You exercised ${input.exerciseYesterday} minutes yesterday. The target here is ~${input.exerciseTarget} minutes a day.`,
        },
        action: T('Bugünkü programı tamamlamaya çalış; koç programı ona göre ayarladı.', 'Try to finish today\'s program; the coach has adjusted it.'),
        sources: ['nasaExercise'],
      }),
    )
  }
  /* U-07: hareketsizlik (ağırlıksız ortamda oturmak yerine "bugün hiç egzersiz yapmamak" olarak yorumlanır) */
  if (!input.programSkipped && input.exerciseToday === 0 && input.hour >= 14 && input.hour < 22) {
    out.push(
      f(input, {
        key: 'exercise:inactive',
        level: 'bilgi',
        indicator: 'exercise',
        region: 'bacaklar',
        page: 2,
        title: T('Bugün henüz hareket etmedin', 'You have not exercised yet today'),
        reason: T('Saat 14:00\'ü geçti ve bugün kayıtlı egzersiz yok.', 'It is past 14:00 and no exercise is logged today.'),
        action: T('Programın 3. sayfada hazır. İlk hareketle başlayabilirsin.', 'Your program is ready on page 3. You can start with the first move.'),
        sources: ['nasaExercise', 'vitalis'],
      }),
    )
  }

  /* U-04: kişisel normalden sapma. Değer genel aralıkta olsa da kişinin son 14 günlük normalinin dışındaysa işaretlenir */
  for (const id of PERSONAL_IDS) {
    const s = input.indicators[id]
    const pn = input.personal[id]
    if (s.value === null || s.status !== 'normal' || !pn) continue
    const high = s.value > pn.high
    if (!high && s.value >= pn.low) continue
    if (high && input.exercising) continue
    const half = (pn.high - pn.low) / 2
    const far = high ? s.value - pn.high > half : pn.low - s.value > half
    const name = INDICATORS[id].name
    const unitTr = INDICATORS[id].unit.tr
    const unitEn = INDICATORS[id].unit.en
    const v = (lang: 'tr' | 'en') => fmt(id, s.value!, lang)
    const band = (lang: 'tr' | 'en') => `${fmt(id, pn.low, lang)}–${fmt(id, pn.high, lang)}`
    const window = pn.basis === 'data' ? { tr: `son ${pn.days} günlük normalin`, en: `your ${pn.days}-day normal` } : { tr: 'uçuş öncesi başlangıcına göre normalin', en: 'your normal from your pre-flight baseline' }
    out.push(
      f(input, {
        key: `personal:${id}:${high ? 'high' : 'low'}`,
        level: far ? 'dikkat' : 'bilgi',
        indicator: id,
        region: INDICATORS[id].region,
        title: high
          ? { tr: `${name.tr} kendi normalinin üstünde`, en: `${name.en} above your own normal` }
          : { tr: `${name.tr} kendi normalinin altında`, en: `${name.en} below your own normal` },
        reason: {
          tr: `Şu an ${v('tr')} ${unitTr}. Genel aralıkta (${INDICATORS[id].range.tr.replace(/^[^0-9]*/, '')}) ama ${window.tr} ${band('tr')} ${unitTr}.`,
          en: `Now ${v('en')} ${unitEn}. Within the general range (${INDICATORS[id].range.en.replace(/^[^0-9]*/, '')}) but ${window.en} is ${band('en')} ${unitEn}.`,
        },
        action: T(
          'Birkaç dakika dinlen ve yeniden ölç. Sapma sürerse ya da kendini iyi hissetmiyorsan uçuş hekimine söyle.',
          'Rest for a few minutes and measure again. If it persists or you feel unwell, tell the flight surgeon.',
        ),
        sources: ['mpVitals', 'vitalis'],
      }),
    )
  }

  /* Su */
  const w = input.water
  // "Su içilmedi" senaryosu sabah da uyarır; normalde sabah 11'den önce su uyarısı verilmez
  const waterMissed = input.scenarios.some((sc) => sc.scenario === 'waterMissed' && sameDay(sc.ts, input.now))
  if (waterMissed && !(input.hour >= 11 && w.todayMl < w.expectedMl * 0.6)) {
    out.push(
      f(input, {
        key: 'water:behind',
        level: 'dikkat',
        indicator: 'water',
        region: 'tum',
        title: T('Bugün neredeyse hiç su içmedin', 'You have barely had any water today'),
        reason: {
          tr: `Bugün ${num(w.todayMl, 'tr')} mL içtin; günlük hedef ${num(w.targetMl / 1000, 'tr', 1)} L. Gün boyunca düzenli içmek hedefe ulaşmayı kolaylaştırır.`,
          en: `You have had ${num(w.todayMl, 'en')} mL today; the daily target is ${num(w.targetMl / 1000, 'en', 1)} L. Drinking regularly through the day makes the target easier to reach.`,
        },
        action: T('Şimdi bir bardak (250 mL) su iç ve yapılacaklar listesinden işaretle.', 'Drink a glass (250 mL) now and tick it in the to-do list.'),
        sources: ['tb027'],
      }),
    )
  }
  if (input.hour >= 11 && w.todayMl < w.expectedMl * 0.6) {
    out.push(
      f(input, {
        key: 'water:behind',
        level: w.todayMl < w.expectedMl * 0.4 ? 'dikkat' : 'bilgi',
        indicator: 'water',
        region: 'tum',
        title: T('Su hedefinin gerisindesin', 'You are behind on water'),
        reason: {
          tr: `Bugün ${num(w.todayMl, 'tr')} mL içtin; bu saatte ~${num(Math.round(w.expectedMl / 50) * 50, 'tr')} mL beklenir. Günlük hedef ${num(w.targetMl / 1000, 'tr', 1)} L.`,
          en: `You have had ${num(w.todayMl, 'en')} mL today; ~${num(Math.round(w.expectedMl / 50) * 50, 'en')} mL is expected by now. The daily target is ${num(w.targetMl / 1000, 'en', 1)} L.`,
        },
        action: T('Şimdi bir bardak (250 mL) su iç ve yapılacaklar listesinden işaretle.', 'Drink a glass (250 mL) now and tick it in the to-do list.'),
        sources: ['tb027'],
      }),
    )
  }

  /* U-09: radyasyon */
  if (input.realSep || input.scenarios.some((s) => s.scenario === 'radiationSpe' && input.now - s.ts < 24 * 3_600_000)) {
    out.push(
      f(input, {
        key: 'radiation:spe',
        level: 'kritik',
        indicator: 'radiation',
        region: 'tum',
        title: T('Güneş parçacık olayı: korunaklı bölüme geç', 'Solar particle event: move to the shielded area'),
        reason: input.realSep
          ? { tr: `NASA DONKI ${input.realSep.time} tarihli bir güneş parçacık olayı kaydetti.`, en: `NASA DONKI recorded a solar particle event at ${input.realSep.time}.` }
          : {
              tr: `Günlük doz ${num(input.dose.todayMsv, 'tr', 1)} mSv'ye çıktı (normalde ~0,5). Tek olayda sınır 250 mSv'dir.`,
              en: `Today's dose rose to ${num(input.dose.todayMsv, 'en', 1)} mSv (normally ~0.5). The limit for a single event is 250 mSv.`,
            },
        action: T('Uyarı kalkana kadar istasyonun korunaklı bölümünde kal ve uzay yürüyüşlerini ertele.', 'Stay in the station\'s shielded area until the alert ends and postpone spacewalks.'),
        sources: ['tb020', 'donki'],
      }),
    )
  }
  if (input.dose.percent >= 80) {
    out.push(
      f(input, {
        key: 'radiation:career',
        level: input.dose.percent >= 100 ? 'kritik' : 'dikkat',
        indicator: 'radiation',
        region: 'tum',
        title: T('Kariyer radyasyon sınırına yaklaşıyorsun', 'Approaching the career radiation limit'),
        reason: {
          tr: `Toplam doz ${num(input.dose.totalMsv, 'tr')} mSv; kariyer sınırı ${CAREER_LIMIT_MSV} mSv (%${Math.round(input.dose.percent)}).`,
          en: `Total dose is ${num(input.dose.totalMsv, 'en')} mSv; the career limit is ${CAREER_LIMIT_MSV} mSv (${Math.round(input.dose.percent)}%).`,
        },
        action: T('Uçuş hekimiyle görev planını gözden geçir.', 'Review the mission plan with the flight surgeon.'),
        sources: ['tb020'],
      }),
    )
  }

  /* U-10: kabin CO₂ */
  const co2 = input.co2
  if (co2.latest > 4.5 || co2.latest > 3.05 || co2.avg7 > 2.5) {
    const level = co2.latest > 4.5 ? 'kritik' : co2.latest > 3.05 ? 'dikkat' : 'bilgi'
    out.push(
      f(input, {
        key: `co2:${level}`,
        level,
        indicator: 'co2',
        region: 'bas',
        title: T('Kabin CO₂ yüksek: baş ağrısı riski', 'Cabin CO₂ is high: headache risk'),
        reason: {
          tr: `Son saatlik ortalama ${num(co2.latest, 'tr', 1)} mmHg (sınır 3), 7 günlük ortalama ${num(co2.avg7, 'tr', 1)} mmHg. 7 günlük ortalama 2,5'in altında tutulursa baş ağrısı riski %1'in altında kalır.`,
          en: `The latest hourly average is ${num(co2.latest, 'en', 1)} mmHg (limit 3) and the 7-day average is ${num(co2.avg7, 'en', 1)} mmHg. Keeping the 7-day average below 2.5 keeps headache risk below 1%.`,
        },
        action: T('Havalandırmanın önünde çalış, uyku kabininde fanı aç. Baş ağrısı olursa şikayet olarak bildir.', 'Work near a ventilation outlet and turn on the fan in your sleep station. Report a headache as a complaint.'),
        sources: ['tb004'],
      }),
    )
  }

  /* Şikayetler */
  for (const c of input.complaints) {
    if (c.status === 'resolved') continue
    const part = bodyPart(c.region, c.side)
    // Kırık ya da çatlak şüphesi şiddetten bağımsız olarak kritiktir ve hekime gider
    const suspect = c.symptom === 'fracture' || c.symptom === 'crack'
    if (c.severity >= 6 || suspect) {
      const critical = suspect || c.severity >= 8
      out.push(
        f(input, {
          key: `complaint:${c.id}:${critical ? 'k' : 'd'}`,
          level: critical ? 'kritik' : 'dikkat',
          region: c.region,
          page: 3,
          // Yeni bildirilen şikayet (son 6 saat) "bildirildi", daha eskisi "sürüyor" diye yazılır
          title:
            input.now - c.ts < 6 * 3_600_000
              ? { tr: `${cap(part.tr)}: ${SYMPTOM_TR[c.symptom]} bildirildi`, en: `${cap(part.en)}: ${SYMPTOM_EN[c.symptom]} reported` }
              : { tr: `${cap(part.tr)} şikayeti sürüyor`, en: `${cap(part.en)} complaint continues` },
          reason: { tr: `Bildirilen şiddet ${c.severity}/10.`, en: `Reported severity ${c.severity}/10.` },
          action: suspect
            ? T(
                'Uçuş hekimine bildirildi. Hekim değerlendirene kadar bölgeyi sabit tut, kemiği oynatmaya çalışma; spor programın bu bölgeyi yormayacak şekilde ayarlandı.',
                'The flight surgeon has been notified. Until they assess it, keep the area still and do not try to move the bone; your workout avoids this area.',
              )
            : T('Şikayet uçuş hekimi raporuna eklendi. Spor programın bu bölgeyi yormayacak şekilde ayarlandı.', 'The complaint was added to the flight surgeon report. Your workout avoids this area.'),
          sources: suspect ? ['vitalis', 'mpBrokenBone'] : ['vitalis'],
          notifyDoctor: true,
        }),
      )
    } else if (input.now - c.ts < 6 * 3_600_000) {
      /*
       * Hafif şikayet: bölgeyi boyamaz, hekime bildirilmez; yine de diğer uyarılarla aynı kutuda bir kez "kaydedildi"
       * diye bilgi verilir (ayrıca ikinci bir onay bildirimi çıkmaz). 6 saat sonra bu not kalkar, şikayet geçmişte kalır.
       */
      out.push(
        f(input, {
          key: `complaint:${c.id}:b`,
          level: 'bilgi',
          region: c.region,
          page: 3,
          title: { tr: `${cap(part.tr)}: hafif ${SYMPTOM_TR[c.symptom]} kaydedildi`, en: `${cap(part.en)}: mild ${SYMPTOM_EN[c.symptom]} recorded` },
          reason: { tr: `Bildirilen şiddet ${c.severity}/10.`, en: `Reported severity ${c.severity}/10.` },
          action: T(
            'Şikayet geçmişine ve hekim raporuna eklendi; uyarı gerektirmiyor. Artarsa ya da geçmezse yeniden bildir.',
            'Added to the complaint history and the surgeon report; no alert needed. Report again if it gets worse or does not go away.',
          ),
          sources: ['vitalis'],
        }),
      )
    } else if (input.now - c.ts >= 7 * 86_400_000) {
      /*
       * Bir haftadır geçmeyen hafif şikayet: NASA bağışıklık kanıt raporu bir haftadan uzun süren olayları "kayda değer"
       * sayar (immuneEB). Bölge dikkat olur ve uçuş hekimine bildirilir.
       */
      const days = Math.floor((input.now - c.ts) / 86_400_000)
      out.push(
        f(input, {
          key: `complaint:${c.id}:w`,
          level: 'dikkat',
          region: c.region,
          page: 3,
          title: { tr: `${cap(part.tr)} şikayeti bir haftadır geçmedi`, en: `${cap(part.en)} complaint has lasted over a week` },
          reason: {
            tr: `${days} gündür süren ${SYMPTOM_TR[c.symptom]} (şiddet ${c.severity}/10). NASA, bir haftadan uzun süren olayları kayda değer sayar.`,
            en: `${SYMPTOM_EN[c.symptom]} for ${days} days (severity ${c.severity}/10). NASA counts events lasting over a week as notable.`,
          },
          action: T(
            'Uçuş hekimine bildirildi. Geçmediyse ya da arttıysa "Azalıyor / Geçti" seçeneğiyle durumunu güncelle; hekimin önerisini bekle.',
            'The flight surgeon has been notified. Update its status with "Easing / Resolved"; wait for the surgeon\'s advice.',
          ),
          sources: ['immuneEB'],
          notifyDoctor: true,
        }),
      )
    }
  }

  /* D-09: iletişim kesintisi */
  if (input.comm.blackout) {
    out.push(
      f(input, {
        key: 'comm:blackout',
        level: 'bilgi',
        region: 'tum',
        page: 3,
        title: T('Dünya ile iletişim kesik', 'Communication with Earth is down'),
        reason: T(
          'Güneş Dünya ile Mars arasına girdiğinde iletişim günlerce kesilebilir. Bu sırada öneriler doğrudan sana yönlendirilir.',
          'When the Sun comes between Earth and Mars, communication can be cut for days. Meanwhile, advice is directed to you.',
        ),
        action: T('Mesajların kuyrukta bekler, bağlantı gelince gönderilir. Acil durumda ekip içindeki sağlık sorumlusuna başvur.', 'Your messages wait in a queue and go out when the link returns. In an emergency, go to the crew medical officer.'),
        sources: ['ascend'],
      }),
    )
  }

  // En önemli uyarılar önce
  return out.sort((a, b) => levelRank(b.level) - levelRank(a.level))
}

const levelRank = (l: Finding['level']) => (l === 'kritik' ? 2 : l === 'dikkat' ? 1 : 0)
const cap = (s: string) => s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1)
const sameDay = (a: number, b: number) => Math.floor(a / 86_400_000) === Math.floor(b / 86_400_000)
const SYMPTOM_TR: Record<ComplaintDoc['symptom'], string> = {
  pain: 'ağrı',
  cramp: 'kramp',
  tight: 'gerginlik',
  numb: 'uyuşma',
  weak: 'güçsüzlük',
  fracture: 'kırık şüphesi',
  crack: 'çatlak şüphesi',
  impact: 'darbe',
  swelling: 'şişlik',
  other: 'rahatsızlık',
}
const SYMPTOM_EN: Record<ComplaintDoc['symptom'], string> = {
  pain: 'pain',
  cramp: 'cramp',
  tight: 'tightness',
  numb: 'numbness',
  weak: 'weakness',
  fracture: 'suspected fracture',
  crack: 'suspected crack',
  impact: 'impact',
  swelling: 'swelling',
  other: 'discomfort',
}

/** U-06: uyku ve tepki süresinden göreve uygunluk */
export function fitnessFor(input: AnalysisInput): { state: Fitness; reason: Tx } {
  const m = CREW[input.astronaut]
  const sleep = input.sleepHistory[input.sleepHistory.length - 1] ?? m.baseline.sleep
  const rx = input.indicators.reaction.value
  const slow = rx ? rx / m.baseline.reaction - 1 : 0
  if (sleep < 4.5 || slow >= 0.35) {
    return { state: 'unfit', reason: { tr: `Uyku ${num(sleep, 'tr', 1)} sa, tepki %${Math.round(slow * 100)} yavaş.`, en: `Sleep ${num(sleep, 'en', 1)} h, reaction ${Math.round(slow * 100)}% slower.` } }
  }
  if (sleep < 6 || slow >= 0.15) {
    return { state: 'caution', reason: { tr: `Uyku ${num(sleep, 'tr', 1)} sa, tepki %${Math.round(slow * 100)} yavaş.`, en: `Sleep ${num(sleep, 'en', 1)} h, reaction ${Math.round(slow * 100)}% slower.` } }
  }
  return { state: 'fit', reason: { tr: `Uyku ${num(sleep, 'tr', 1)} sa, tepki başlangıcına yakın.`, en: `Sleep ${num(sleep, 'en', 1)} h, reaction close to baseline.` } }
}

/**
 * U-08: kemik kaybı tahmini. Egzersizsiz ayda %1-1,5 (tb033, en çok geçen aralık); model aralığın ortası olan %1,25'i kullanır.
 * Egzersiz kaybı büyük ölçüde yavaşlatır ama durdurmaz: kırık riski raporu, ARED ile de kaybın sürdüğünü yazar (boneFracture).
 */
export function boneEstimate(missionDay: number, adherence: number) {
  const months = missionDay / 30
  const withoutExercisePct = months * 1.25
  // Tam uyumda kaybın %70'i önlenir (Vitalis varsayımı; kaynakta sayısal bir oran yok)
  const estimatedLossPct = withoutExercisePct * (1 - 0.7 * adherence)
  return { estimatedLossPct, withoutExercisePct, adherence }
}

/** Hekim görünümündeki genel sağlık puanı (0-100) ve dökümü */
export function scoreFor(findings: Finding[], complaints: ComplaintDoc[]): { score: number; parts: { label: Tx; delta: number }[]; overall: Status } {
  const parts: { label: Tx; delta: number }[] = []
  for (const fd of findings) {
    // Hafif şikayetin bilgi notu puandan ayrıca düşmez: şikayetin kendisi aşağıda sayılır
    if (fd.level === 'bilgi' && fd.key.startsWith('complaint:')) continue
    const delta = fd.level === 'kritik' ? -22 : fd.level === 'dikkat' ? -9 : -2
    parts.push({ label: fd.title, delta })
  }
  for (const c of complaints) {
    // Şiddeti 6 ve üstündeki şikayetler zaten uyarı olarak sayıldı; daha hafif şikayetler küçük bir düşüş getirir
    if (c.status === 'resolved' || c.severity >= 6) continue
    const part = bodyPart(c.region, c.side)
    parts.push({ label: { tr: `Şikayet: ${part.tr} (${c.severity}/10)`, en: `Complaint: ${part.en} (${c.severity}/10)` }, delta: -Math.round(c.severity * 1.2) })
  }
  const score = Math.max(5, Math.min(100, 100 + parts.reduce((n, p) => n + p.delta, 0)))
  const worst = findings.reduce<Status>((s, fd) => (severity(fd.level === 'bilgi' ? 'normal' : fd.level) > severity(s) ? (fd.level as Status) : s), 'normal')
  return { score, parts, overall: worst }
}
