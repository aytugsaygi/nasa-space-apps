import { SOURCES, sourceShort, type SourceId } from '../core/sources'
import { layersFor, type StructureLayer } from '../data/anatomy'
import { REGION_ORDER, regionsFor } from '../data/regions'
import type { RegionId, Vital } from '../data/types'
import type { Lang } from '../i18n'
import type { BoneSymptom, MuscleSymptom, Snapshot, Symptom } from '../core/model'

export type { BoneSymptom, MuscleSymptom, Symptom }

/** Rahatsızlık bildirirken kaslar için seçilebilen belirtiler */
export const MUSCLE_SYMPTOMS: MuscleSymptom[] = ['pain', 'cramp', 'tight', 'numb', 'weak']
/** Kemikler için seçilebilen belirtiler; "Diğer" seçilince durum kısaca yazılır */
export const BONE_SYMPTOMS: BoneSymptom[] = ['fracture', 'crack', 'pain', 'impact', 'swelling', 'other']
export const SYMPTOMS_BY_LAYER: Record<StructureLayer, Symptom[]> = { muscles: MUSCLE_SYMPTOMS, bones: BONE_SYMPTOMS }

/** Hologramda seçilen bir yapı (kas ya da kemik) hakkındaki soru; rahatsızlık bildiriminde belirti de gelir */
export interface StructureQuestion {
  /** Arayüz dilindeki adı */
  name: string
  layer: StructureLayer
  region: RegionId
  symptom: Symptom | null
  /** Rahatsızlık bildirirken birden çok kas seçildiyse hepsi (seçim sırasıyla); bölgelere göre raporlanır */
  muscles?: { name: string; region: RegionId }[]
  /** Rahatsızlık bildirirken birden çok kemik seçildiyse hepsi */
  bones?: { name: string; region: RegionId }[]
  /** Kişinin kendi sözleriyle anlattığı durum (kemik bildiriminde) */
  note?: string
}

export interface AssistantContext {
  selectedRegion: RegionId | null
  vitals: Vital[]
  lang: Lang
  /** Soru hologramdaki bir yapıdan geldiyse (yazılan sorularda yoktur) */
  structure?: StructureQuestion
  /** Astronotun anlık sağlık durumu (motordan) */
  snapshot?: Snapshot | null
  /** Açık olan sayfa (0 ana, 1 zihin, 2 spor, 3 kayıtlar): asistanın rolü buna göre seçilir */
  page?: number
}

/**
 * Asistanın cevabını parça parça (akışlı) döndürür.
 *
 * Şu an çevrimdışı demo modunda: hazır cevaplar anahtar kelimeyle seçilir.
 * Backend hazır olduğunda bu fonksiyonun içi, soruyu ve bağlamı (dil, seçili bölge,
 * yaşamsal değerler) backend'e gönderip akışlı cevabı okuyan kodla değiştirilir.
 * Bağlantı koparsa yine buradaki hazır cevaplara dönülebilir.
 * API anahtarı asla arayüz koduna yazılmamalıdır.
 */
export async function* askAssistant(question: string, ctx: AssistantContext): AsyncGenerator<string> {
  const answer = offlineAnswer(question, ctx)
  await wait(380)
  const tokens = answer.match(/\S+\s*/g) ?? [answer]
  for (const t of tokens) {
    yield t
    await wait(18 + Math.random() * 40)
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

const lines = (...l: string[]) => l.join('\n')

/** Cevaptaki bilginin kaynağı (P-04): sohbette cevabın altında bağlantı olarak görünür */
export interface AnswerSource {
  label: string
  url: string
}

const src = (...ids: SourceId[]): AnswerSource[] => ids.map((id) => ({ label: sourceShort(id), url: SOURCES[id].url }))

/** offlineAnswer ile aynı konu ayrımı: hangi cevap verildiyse onun dayandığı kaynaklar */
export function offlineSources(raw: string, ctx: AssistantContext): AnswerSource[] {
  const en = ctx.lang === 'en'
  const q = raw.toLocaleLowerCase(en ? 'en-US' : 'tr-TR')
  const has = (...words: string[]) => words.some((w) => q.includes(w))
  if (has('kendime zarar', 'intihar', 'ölmek istiyorum', 'dayanamıyorum', 'yaşamak istemiyorum', 'hurt myself', 'suicide', 'want to die', "can't go on", 'cannot go on')) return src('tb016')
  if (ctx.structure) {
    const r = regionsFor(ctx.lang)[ctx.structure.region]
    const region = r ? [{ label: r.source.label, url: r.source.url }] : []
    // Kemik bildiriminde ilk yardım adımları MedlinePlus "Broken bone" sayfasına dayanır
    return ctx.structure.layer === 'bones' && ctx.structure.symptom ? [...src('mpBrokenBone'), ...region] : region
  }
  if (has('kan', 'kesik', 'yara', 'kesti', 'bleed', 'blood', 'cut', 'wound')) return src('mpBleeding', 'mpCuts')
  if (has('yalnız', 'üzgün', 'mutsuz', 'kaygı', 'endişe', 'stres', 'bunal', 'özledim', 'moral', 'lonely', 'sad', 'anxious', 'anxiety', 'stress', 'homesick', 'miss my')) return src('tb016')
  if (has('uyu', 'uyku', 'uykusuz', 'sleep', 'insomnia')) return src('sleepStudy')
  if (has('sırt', 'belim', 'bel ağr', 'back')) return src('tb033')
  if (has('baş ağr', 'başım', 'migren', 'headache', 'migraine')) return src('tb033', 'tb004')
  if (has('nabız', 'kalp', 'çarpıntı', 'heart', 'pulse', 'palpitation')) return src('mpVitals')
  const regions = regionsFor(ctx.lang)
  const region =
    Object.values(regions).find((r) => q.includes(r.name.toLocaleLowerCase(en ? 'en-US' : 'tr-TR'))) ??
    (ctx.selectedRegion && has('bölge', 'region') ? regions[ctx.selectedRegion] : null)
  if (region) return [{ label: region.source.label, url: region.source.url }]
  return []
}

export function offlineAnswer(raw: string, ctx: AssistantContext): string {
  const { lang } = ctx
  const en = lang === 'en'
  const q = raw.toLocaleLowerCase(en ? 'en-US' : 'tr-TR')
  // Anahtar kelimeler her iki dilde aranır; cevap arayüz dilinde verilir
  const has = (...words: string[]) => words.some((w) => q.includes(w))
  const vital = (id: string) => ctx.vitals.find((v) => v.id === id)
  const regions = regionsFor(lang)

  // Kriz belirtileri her zaman önce gelir ve bir insana yönlendirir
  if (has('kendime zarar', 'intihar', 'ölmek istiyorum', 'dayanamıyorum', 'yaşamak istemiyorum', 'hurt myself', 'suicide', 'want to die', "can't go on", 'cannot go on')) {
    return en
      ? lines(
          'Thank you for telling me. What you are going through is very heavy, and you do not have to carry it alone.',
          '',
          'Please talk to a person right now: contact the flight psychologist or flight surgeon. Ask a crew member to come and be with you.',
          '',
          'I am here, but real human support matters far more than me right now.',
        )
      : lines(
          'Bunu benimle paylaştığın için teşekkür ederim. Şu an yaşadığın şey çok ağır ve yalnız taşımak zorunda değilsin.',
          '',
          'Lütfen hemen bir insanla konuş: uçuş psikoloğuna ya da uçuş hekimine şimdi bağlan. Ekibinden birine de yanına gelmesini söyle.',
          '',
          'Ben buradayım, ama bu konuda gerçek bir insanın desteği benden çok daha önemli.',
        )
  }

  // Hologramdan gelen soru: seçilen yapı ve bildirilen belirtiye göre cevap
  if (ctx.structure) return structureAnswer(ctx.structure, lang)

  if (has('kan', 'kesik', 'yara', 'kesti', 'bleed', 'blood', 'cut', 'wound')) {
    return en
      ? lines(
          'Take a deep breath first. Let\'s go step by step.',
          '',
          '1. Press firmly on the wound with clean gauze. Keep the pressure on until the bleeding stops; do not lift it to check.',
          '2. If the gauze soaks through, do not remove it; add a new one on top.',
          '',
          'If you are on a spacewalk, do not take off the glove. Tell your crew and mission control right away.',
          '',
          'If the bleeding does not stop within 10 minutes or the cut is deep, contact the flight surgeon.',
        )
      : lines(
          'Önce derin bir nefes al. Birlikte adım adım gidelim.',
          '',
          '1. Temiz bir gazlı bezle yaraya doğrudan ve sıkıca bastır. Kanama durana kadar baskıyı sürdür; bakmak için bezi kaldırma.',
          '2. Bez kanla dolarsa çıkarma, üstüne yenisini ekle.',
          '',
          'Uzay yürüyüşündeysen eldiveni çıkarma. Durumu hemen ekibine ve uçuş kontrolüne bildir.',
          '',
          'Kanama 10 dakikada durmazsa ya da kesik derinse uçuş hekimine bağlan.',
        )
  }

  if (has('yalnız', 'üzgün', 'mutsuz', 'kaygı', 'endişe', 'stres', 'bunal', 'özledim', 'moral', 'lonely', 'sad', 'anxious', 'anxiety', 'stress', 'homesick', 'miss my')) {
    return en
      ? lines(
          'It makes complete sense to feel this way. Months away from home in a small space is hard for anyone.',
          '',
          'You could try something small today: schedule a video call with your family or share a meal with a crewmate. Many astronauts find that watching Earth from the window helps.',
          '',
          'If this feeling has lasted for a few days, I suggest talking to the flight psychologist. You can keep telling me about it if you like; I am listening.',
        )
      : lines(
          'Böyle hissetmen çok anlaşılır. Aylarca evden uzakta, dar bir alanda olmak herkesi zorlar.',
          '',
          'Bugün küçük bir şey deneyebilirsin: ailenle bir görüntülü görüşme planla ya da ekipten biriyle birlikte yemek ye. Dünya\'yı pencereden izlemek de birçok astronota iyi geliyor.',
          '',
          'Bu his birkaç gündür sürüyorsa uçuş psikoloğuyla konuşmanı öneririm. İstersen şimdi anlatmaya devam edebilirsin, dinliyorum.',
        )
  }

  if (has('uyu', 'uyku', 'uykusuz', 'sleep', 'insomnia')) {
    const u = vital('uyku')
    return en
      ? lines(
          u ? `You slept ${u.value} ${u.unit} last night; NASA schedules 8.5 hours; the station average is about 6 hours.` : 'Sleep problems are common in space.',
          '',
          'These can help:',
          '• Dim the light in your sleep station and avoid screens for an hour before bed',
          '• Go to bed at the same time every day',
          '• Avoid caffeine in the afternoon',
          '',
          'If it lasts more than three nights, tell the flight surgeon.',
        )
      : lines(
          u ? `Dün gece ${u.value} ${u.unit} uyumuşsun, NASA 8,5 saat planlar; istasyon ortalaması yaklaşık 6 saat.` : 'Uyku uzayda sık yaşanan bir sorun.',
          '',
          'Şunlar yardımcı olabilir:',
          '• Uyku kabinindeki ışığı kısmak ve yatmadan bir saat önce ekranlardan uzak durmak',
          '• Her gün aynı saatte yatmak',
          '• Öğleden sonra kafein almamak',
          '',
          'Üç geceden fazla sürerse uçuş hekimine bildir.',
        )
  }

  if (has('sırt', 'belim', 'bel ağr', 'back')) {
    const m = regions.sirt.metrics[0]
    return en
      ? lines(
          `Your back pain today is ${m.value}${m.unit}. This is very common in space because the spine lengthens.`,
          '',
          '• Finish the remaining stretching session',
          '• Gently pulling your knees toward your stomach while sleeping can relieve the lower back',
          '• Do not skip core exercises',
          '',
          'Tell the flight surgeon if the pain goes above 6/10 or spreads to your leg.',
        )
      : lines(
          `Sırt ağrın bugün ${m.value}${m.unit}. Uzayda omurga uzadığı için bu çok sık görülür.`,
          '',
          '• Kalan esneme seansını tamamla',
          '• Uyurken dizlerini hafifçe karnına çekmek beli rahatlatabilir',
          '• Çekirdek kas egzersizlerini atlama',
          '',
          'Ağrı 6/10\'u geçerse ya da bacağına yayılırsa uçuş hekimine bildir.',
        )
  }

  if (has('baş ağr', 'başım', 'migren', 'headache', 'migraine')) {
    return en
      ? lines(
          'Headaches in space can come from fluids shifting toward the head or from cabin CO₂. Cabin CO₂ is currently within the normal range.',
          '',
          '• Drink a glass of water',
          '• Rest for a few minutes in front of the ventilation',
          '',
          'Tell the flight surgeon if your vision becomes blurry or the pain does not go away.',
        )
      : lines(
          'Baş ağrısı uzayda sıvıların başa doğru kaymasından ya da kabindeki CO₂\'den olabilir. Şu an kabin CO₂ değeri normal aralıkta.',
          '',
          '• Bir bardak su iç',
          '• Havalandırmanın önünde birkaç dakika dinlen',
          '',
          'Görmen bulanıklaşırsa ya da ağrı geçmezse uçuş hekimine bildir.',
        )
  }

  if (has('nabız', 'kalp', 'çarpıntı', 'heart', 'pulse', 'palpitation')) {
    const n = vital('nabiz')
    const high = n && n.status !== 'normal'
    return en
      ? lines(
          ...(n ? [`Your heart rate is ${n.value} ${n.unit} right now.`] : []),
          high
            ? 'That is high for resting. If you are not exercising, sit and breathe slowly for 2 minutes: in for 4 seconds, out for 6.'
            : 'That is within the normal range.',
          '',
          'If you have chest pain or shortness of breath, contact the flight surgeon immediately.',
        )
      : lines(
          ...(n ? [`Nabzın şu an ${n.value} ${n.unit}.`] : []),
          high ? 'Bu değer dinlenme için yüksek. Egzersizde değilsen oturup 2 dakika yavaş nefes al: 4 saniye al, 6 saniye ver.' : 'Bu değer normal aralıkta.',
          '',
          'Göğüs ağrısı ya da nefes darlığı olursa hemen uçuş hekimine bağlan.',
        )
  }

  const regionList = Object.values(regions)
  const region =
    regionList.find((r) => q.includes(r.name.toLocaleLowerCase(en ? 'en-US' : 'tr-TR'))) ??
    (ctx.selectedRegion && has('bölge', 'region') ? regions[ctx.selectedRegion] : null)
  if (region) {
    return en
      ? lines(`${region.name}: ${region.summary}`, '', `My suggestion: ${region.advice}`, '', 'If you notice any change, add it to your daily report.')
      : lines(`${region.name}: ${region.summary}`, '', `Önerim: ${region.advice}`, '', 'Bir değişiklik fark edersen günlük raporuna ekle.')
  }

  if (has('merhaba', 'selam', 'nasılsın', 'hello', 'hi ', 'hey', 'how are you')) {
    return en
      ? 'Hello, I am here. How are you feeling today? We can talk about first aid, pain, sleep or how you are feeling.'
      : 'Merhaba, buradayım. Bugün nasıl hissediyorsun? İlk yardım, ağrı, uyku ya da moral konusunda konuşabiliriz.'
  }

  return en
    ? lines(
        'I cannot give you a reliable answer on this.',
        '',
        'I can help with first aid, pain, sleep or how you are feeling. If you are unsure about something health-related, it is best to ask the flight surgeon.',
      )
    : lines(
        'Bu konuda sana güvenilir bir cevap veremem.',
        '',
        'İlk yardım, ağrı, uyku ya da moral konularında yardımcı olabilirim. Sağlığınla ilgili emin olmadığın bir durumda uçuş hekimine danışmak en doğrusu.',
      )
}

/** Hologramda seçilen yapı (ya da rahatsızlık bildirirken birden çok kas ya da kemik) için cevap */
function structureAnswer(s: StructureQuestion, lang: Lang): string {
  if (s.layer === 'bones' && s.symptom) return boneAnswer(s, s.symptom as BoneSymptom, lang)
  if (s.muscles && s.muscles.length > 1) return musclesAnswer(s.muscles, s.symptom as MuscleSymptom | null, lang)
  const en = lang === 'en'
  const region = regionsFor(lang)[s.region]
  const name = s.name

  if (!s.symptom) {
    const note = layersFor(lang)[s.layer].note
    return en
      ? lines(`${name} is in the ${region.name.toLowerCase()} region.`, '', note, '', 'If you feel any discomfort here, use Report discomfort on the hologram and tell me what you feel.')
      : lines(`${name}, ${region.name.toLocaleLowerCase('tr-TR')} bölgesinde.`, '', note, '', 'Burada bir rahatsızlık hissedersen hologramdaki Rahatsızlık bildir düğmesiyle ne hissettiğini bana söyleyebilirsin.')
  }

  const symptom = s.symptom as MuscleSymptom
  const lead = MUSCLE_LEAD[symptom][lang](name)
  const context = SYMPTOM_CONTEXT[symptom]?.[lang]
  const advice = symptomAdvice(symptom, en, false)
  return lines(context ? `${lead} ${context}` : lead, '', ...(advice.intro ? [advice.intro] : []), ...advice.bullets, '', advice.escalation)
}

/** Kemik belirtisinin adı (cevabın ilk cümlesinde) */
const BONE_WORD: Record<BoneSymptom, Record<Lang, string>> = {
  fracture: { tr: 'kırık şüphesi', en: 'a suspected fracture' },
  crack: { tr: 'çatlak şüphesi', en: 'a suspected crack' },
  pain: { tr: 'ağrı', en: 'pain' },
  impact: { tr: 'darbe', en: 'an impact' },
  swelling: { tr: 'şişlik', en: 'swelling' },
  other: { tr: 'rahatsızlık', en: 'discomfort' },
}

/**
 * Kemik bildirimi için cevap (bir ya da birden çok kemik). İlk yardım adımları MedlinePlus "Broken bone" sayfasına dayanır:
 * bölgeyi sabitle, kemiği düzeltmeye ya da oynatmaya çalışma, buz ve yüksekte tutma, dolaşımı kontrol et.
 * Kırık ve çatlak tanısını hekim koyar; asistan yalnızca şüpheyi hekime iletmeyi söyler.
 */
function boneAnswer(s: StructureQuestion, symptom: BoneSymptom, lang: Lang): string {
  const en = lang === 'en'
  const items = s.bones && s.bones.length > 1 ? s.bones : [{ name: s.name, region: s.region }]
  const many = items.length > 1
  const word = BONE_WORD[symptom][lang]
  const names = items.map((b) => b.name).join('; ')
  const lead = en
    ? many
      ? `You reported ${word} in ${items.length} bones: ${names}.`
      : `You reported ${word} in the ${s.name}.`
    : many
      ? `${items.length} kemikte ${word} bildirdin: ${names}.`
      : `${s.name} için ${word} bildirdin.`
  const described = s.note ? [en ? `What you described: "${s.note}"` : `Anlattığın: "${s.note}"`] : []
  const context = en
    ? 'In space, weight-bearing bones can lose about 1–1.5% of their mineral per month, which can make them more vulnerable.'
    : 'Uzayda yük taşıyan kemikler ayda yaklaşık %1–1,5 mineral kaybedebilir; bu, kemikleri daha hassas yapabilir.'
  const it = en ? (many ? 'these bones' : 'the bone') : many ? 'kemikleri' : 'kemiği'
  const suspect = symptom === 'fracture' || symptom === 'crack'

  const firstAid = en
    ? [
        '• Keep the area still; if you can, support it with a splint or sling that covers the joints above and below',
        `• Do not try to straighten ${it} or test whether it moves`,
        '• Put a cold pack wrapped in cloth on it and keep it raised to ease pain and swelling',
        '• Check beyond the injury: pale, cold or bluish skin, numbness or tingling are warning signs',
      ]
    : [
        '• Bölgeyi sabit tut; yapabiliyorsan üstündeki ve altındaki eklemi de içine alan bir atel ya da askıyla destekle',
        `• ${it.charAt(0).toLocaleUpperCase('tr-TR') + it.slice(1)} düzeltmeye ya da oynayıp oynamadığını denemeye çalışma`,
        '• Bir beze sarılı soğuk kompres koy ve bölgeyi yüksekte tut; ağrı ve şişliği azaltır',
        '• Yaralanmanın ötesini kontrol et: soluk, soğuk ya da morumsu cilt, uyuşma veya karıncalanma uyarı işaretidir',
      ]
  const stopExercise = en ? '• Stop today\'s exercise; your workout will avoid this area' : '• Bugünkü egzersizi bırak; spor programın bu bölgeyi yormayacak şekilde ayarlanır'

  if (suspect) {
    return lines(
      `${lead} ${context}`,
      ...described,
      '',
      en ? 'Only the flight surgeon can confirm a fracture. Until then:' : 'Kırığı ancak uçuş hekimi doğrulayabilir. O zamana kadar:',
      ...firstAid,
      stopExercise,
      '',
      en
        ? 'Tell the flight surgeon about the suspected fracture right away. Get help immediately if the bone is pushing through the skin, there is heavy bleeding, or the area below the injury is pale, cold or blue. If the injury is in the head, neck, back, hip or thigh, do not move the person.'
        : 'Kırık şüphesini hemen uçuş hekimine bildir. Kemik deriden dışarı çıkıyorsa, kanama çoksa ya da yaralanmanın altı soluk, soğuk veya morsa hemen yardım çağır. Yaralanma baş, boyun, sırt, kalça ya da uylukta ise kişiyi hareket ettirme.',
    )
  }

  const tips: Record<Exclude<BoneSymptom, 'fracture' | 'crack'>, string[]> = en
    ? {
        pain: ['• Avoid moves that load the painful bone in today\'s exercise', '• Rate the pain from 0 to 10 and add it to your daily report'],
        impact: [firstAid[2], '• Watch the area over the next hours for swelling, bruising or pain on movement'],
        swelling: [firstAid[2], firstAid[3]],
        other: ['• Avoid loading the area until it has been checked', '• Rate how it feels from 0 to 10 and add it to your daily report'],
      }
    : {
        pain: ['• Bugünkü egzersizde ağrıyan kemiğe yük bindiren hareketlerden kaçın', '• Ağrıyı 0 ile 10 arasında puanla ve günlük raporuna ekle'],
        impact: [firstAid[2], '• Sonraki saatlerde bölgede şişlik, morarma ya da hareketle artan ağrı olup olmadığını izle'],
        swelling: [firstAid[2], firstAid[3]],
        other: ['• Bölge kontrol edilene kadar üzerine yük bindirme', '• Nasıl hissettiğini 0 ile 10 arasında puanla ve günlük raporuna ekle'],
      }
  return lines(
    `${lead} ${context}`,
    ...described,
    '',
    en ? 'For now, try this:' : 'Şimdilik şunları dene:',
    ...tips[symptom],
    stopExercise,
    '',
    en
      ? 'Tell the flight surgeon if you cannot move or put weight on the area, if the shape looks wrong, if swelling or pain grows, or if numbness or tingling appears.'
      : 'Bölgeyi hareket ettiremiyor ya da üzerine yük veremiyorsan, şekli bozuk görünüyorsa, şişlik ya da ağrı artıyorsa veya uyuşma, karıncalanma başlarsa uçuş hekimine bildir.',
  )
}

/** Tek kas için cevabın ilk cümlesi */
const MUSCLE_LEAD: Record<MuscleSymptom, Record<Lang, (name: string) => string>> = {
  pain: { tr: (n) => `${n} için ağrı bildirdin.`, en: (n) => `You reported pain in the ${n}.` },
  cramp: { tr: (n) => `${n} için kramp bildirdin.`, en: (n) => `You reported a cramp in the ${n}.` },
  tight: { tr: (n) => `${n} için gerginlik bildirdin.`, en: (n) => `You reported tightness in the ${n}.` },
  numb: { tr: (n) => `${n} çevresinde uyuşma bildirdin.`, en: (n) => `You reported numbness around the ${n}.` },
  weak: { tr: (n) => `${n} için güçsüzlük bildirdin.`, en: (n) => `You reported weakness in the ${n}.` },
}

/** Belirtinin uzaydaki olası nedeni (ilk cümlenin ardından) */
const SYMPTOM_CONTEXT: Partial<Record<MuscleSymptom, Record<Lang, string>>> = {
  pain: {
    tr: 'Uzayda kaslar yük taşımadığı için zayıflar; egzersiz günlerinde ağrı sık görülür.',
    en: 'In space, muscles carry no load and weaken, so soreness on exercise days is common.',
  },
  tight: {
    tr: 'Uzun süre aynı pozisyonda kalmak (ör. ayak sabitleyicide çalışmak) kasları gerebilir.',
    en: 'Staying in one position for a long time, such as working in foot restraints, can tighten muscles.',
  },
  numb: { tr: 'Uyuşma çoğunlukla bir sinirin sıkışmasından olur.', en: 'Numbness usually comes from pressure on a nerve.' },
  weak: {
    tr: 'Uzayda yük taşımayan kaslar haftalar içinde yavaşça güç kaybeder; bu beklenen, yavaş bir değişimdir.',
    en: 'In space, muscles that carry no load slowly lose strength over weeks; this is an expected, gradual change.',
  },
}

/** Belirtinin adı (birden çok kas için cevapta) */
const SYMPTOM_WORD: Record<MuscleSymptom, Record<Lang, string>> = {
  pain: { tr: 'ağrı', en: 'pain' },
  cramp: { tr: 'kramp', en: 'a cramp' },
  tight: { tr: 'gerginlik', en: 'tightness' },
  numb: { tr: 'uyuşma', en: 'numbness' },
  weak: { tr: 'güçsüzlük', en: 'weakness' },
}

/**
 * Belirtiye göre yapılacaklar ve ne zaman uçuş hekimine başvurulacağı.
 * many: birden çok kas söz konusudur ("bu kası" yerine "bu kasları").
 * spots: kaslar farklı bölgelerdedir ("bölgeye" yerine "bölgelere").
 */
function symptomAdvice(symptom: MuscleSymptom, en: boolean, many: boolean, spots = false): { intro?: string; bullets: string[]; escalation: string } {
  const it = en ? (many ? 'these muscles' : 'this muscle') : many ? 'bu kasları' : 'bu kası'
  const It = en ? (many ? 'the muscles' : 'the muscle') : many ? 'Kasları' : 'Kası'
  const area = en ? (spots ? 'these areas' : 'the area') : spots ? 'bölgeleri' : 'bölgeyi'
  const Area = en ? area : area.charAt(0).toLocaleUpperCase('tr-TR') + area.slice(1)
  switch (symptom) {
    case 'pain':
      return en
        ? {
            intro: 'For now, try this:',
            bullets: [
              `• In today's resistance session, go lighter on moves that load ${it}`,
              '• Apply a warm compress for 15 minutes, then stretch gently',
              '• Rate the pain from 0 to 10 and add it to your daily report',
            ],
            escalation: 'Tell the flight surgeon if the pain goes above 6/10, if there is swelling or bruising, or if it does not ease within 48 hours.',
          }
        : {
            intro: 'Şimdilik şunları dene:',
            bullets: [
              `• Bugünkü direnç egzersizinde ${it} zorlayan hareketleri hafiflet`,
              `• ${spots ? 'Bölgelere' : 'Bölgeye'} 15 dakika ılık kompres uygula, ardından nazikçe esnet`,
              '• Ağrıyı 0 ile 10 arasında puanla ve günlük raporuna ekle',
            ],
            escalation: 'Ağrı 6/10\'u geçerse, şişlik ya da morarma olursa veya 48 saatte hafiflemezse uçuş hekimine bildir.',
          }
    case 'cramp':
      return en
        ? {
            bullets: [
              `• Slowly stretch ${It.toLowerCase()} the opposite way and hold for 30 seconds`,
              '• Massage it gently',
              '• Drink water with electrolytes: body fluid drops in space, which can make cramps more frequent',
            ],
            escalation: 'Tell the flight surgeon if cramps keep coming back or one lasts longer than 10 minutes.',
          }
        : {
            bullets: [
              `• ${It} yavaşça ters yöne doğru uzat ve 30 saniye tut`,
              '• Hafifçe ovarak masaj yap',
              '• Elektrolitli su iç: uzayda vücut sıvısı azaldığı için kramp daha sık görülebilir',
            ],
            escalation: 'Kramp sık tekrarlarsa ya da 10 dakikadan uzun sürerse uçuş hekimine bildir.',
          }
    case 'tight':
      return en
        ? {
            bullets: [
              '• Warm up with light movement for 5 minutes',
              `• Loosen ${It.toLowerCase()} with 20–30 second stretches`,
              '• Do not skip the warm-up before exercise',
            ],
            escalation: 'Tell the flight surgeon if the tightness limits your movement.',
          }
        : {
            bullets: ['• 5 dakika hafif hareketle ısın', `• ${It} 20–30 saniyelik esnemelerle gevşet`, '• Egzersizden önce ısınmayı atlama'],
            escalation: 'Gerginlik hareketini kısıtlıyorsa uçuş hekimine bildir.',
          }
    case 'numb':
      return en
        ? {
            bullets: [
              `• Change position and loosen any strap, clothing or equipment pressing on ${area}`,
              '• If you are on a spacewalk, tell your crew about glove or suit pressure',
              `• Move ${area} gently`,
            ],
            escalation: 'If the numbness does not pass within 15 minutes, spreads, or comes with weakness, contact the flight surgeon right away.',
          }
        : {
            bullets: [
              `• Pozisyonunu değiştir; ${area} sıkan kayışı, giysiyi ya da ekipmanı gevşet`,
              '• Uzay yürüyüşündeysen eldiven ya da giysi basıncını ekibine bildir',
              `• ${Area} hafifçe hareket ettir`,
            ],
            escalation: 'Uyuşma 15 dakikada geçmezse, yayılırsa ya da güçsüzlükle birlikte gelirse hemen uçuş hekimine bağlan.',
          }
    case 'weak':
      return en
        ? {
            bullets: ['• Keep to your resistance exercise plan', '• Do not skip protein-rich meals'],
            escalation: 'If the weakness started suddenly or is clearly on one side only, it may be urgent: contact the flight surgeon right away.',
          }
        : {
            bullets: ['• Direnç egzersizi programını aksatma', '• Protein ağırlıklı öğünleri atlama'],
            escalation: 'Güçsüzlük aniden başladıysa ya da yalnızca bir tarafta belirginse acil olabilir: hemen uçuş hekimine bağlan.',
          }
  }
}

/**
 * Kas şikâyetinde bölgeye özel yorum: o bölgenin kasları uzayda neden ve nasıl zorlanır, bölge için ne yapılmalı.
 * Birden çok kas seçildiğinde her bölgenin raporunda kullanılır.
 */
const REGION_NOTE: Record<RegionId, Record<Lang, { note: string; advice: string }>> = {
  bas: {
    tr: {
      note: 'Baş ve boyun kasları uzayda başı taşımak zorunda kalmaz; ekrana uzun süre eğilmek ya da başı sabit tutmak boyunda gerginlik yapabilir.',
      advice: 'Ekranı göz hizasına getir; saatte bir boynunu yavaşça sağa, sola ve öne doğru esnet.',
    },
    en: {
      note: 'Head and neck muscles do not have to hold the head up in space; leaning toward a screen or holding the head still for long can strain the neck.',
      advice: 'Bring the screen to eye level and gently stretch your neck to each side and forward once an hour.',
    },
  },
  gogus: {
    tr: {
      note: 'Göğüs ve karın kasları gövdeyi sabitlerken ve direnç egzersizinde (itme ve gövde hareketleri) çalışır; ağır itme hareketleri bu bölgeyi zorlayabilir.',
      advice: 'Direnç egzersizinde itme ve mekik türü hareketleri hafiflet; derin ve yavaş nefes alarak gövdeni gevşet.',
    },
    en: {
      note: 'Chest and abdominal muscles work to stabilise the trunk and during resistance exercise (pushing and core moves); heavy pushing can strain this area.',
      advice: 'Go lighter on pushing and crunch-type moves in resistance exercise, and relax your trunk with slow, deep breaths.',
    },
  },
  sirt: {
    tr: {
      note: 'Uzayda omurga uzar ve sırt kasları yük taşımadığı için zayıflar; bel ve sırt ağrısı astronotlarda sık görülür.',
      advice: 'Dizlerini göğsüne çekerek 30 saniye esne; ayak sabitleyicide uzun süre öne eğilmekten kaçın.',
    },
    en: {
      note: 'In space the spine lengthens and back muscles weaken because they carry no load; back pain is common among astronauts.',
      advice: 'Pull your knees to your chest and hold for 30 seconds, and avoid leaning forward in foot restraints for long periods.',
    },
  },
  ustKol: {
    tr: {
      note: 'Omuz ve üst kol kasları, istasyonda tutamaklarla kendini çekip iterken ve direnç egzersizinde en çok çalışan kaslardır.',
      advice: 'Tutamaklarla hareket ederken kollarını dönüşümlü kullan; bugün baş üstü hareketleri sınırla.',
    },
    en: {
      note: 'Shoulder and upper-arm muscles do most of the work when you pull and push yourself along handrails and during resistance exercise.',
      advice: 'Alternate arms when moving along handrails and limit overhead moves today.',
    },
  },
  onKol: {
    tr: {
      note: 'Ön kol kasları, uzay giysisi eldiveniyle kavrama ve aletlerle uzun süre çalışma sırasında yorulur.',
      advice: 'Bileklerini çevir, parmaklarını açıp kapayarak esnet; uzun kavrama işlerine ara ver.',
    },
    en: {
      note: 'Forearm muscles tire from gripping in spacesuit gloves and from long periods of tool work.',
      advice: 'Roll your wrists, open and close your fingers to stretch, and take breaks from long gripping tasks.',
    },
  },
  eller: {
    tr: {
      note: 'El kasları eldiven basıncından ve uzun süre bir şeyi kavramaktan yorulur.',
      advice: 'Elini birkaç kez sıkıp aç, parmaklarını tek tek esnet; eldiven bedenini kontrol ettir.',
    },
    en: {
      note: 'Hand muscles tire from glove pressure and from holding on to things for long periods.',
      advice: 'Squeeze and open your hand a few times, stretch each finger, and have your glove size checked.',
    },
  },
  bacaklar: {
    tr: {
      note: 'Uzayda bacak kasları yük taşımadığı için en hızlı zayıflayan kaslardır; koşu bandı ve bisiklet egzersizi bu kasları yorar.',
      advice: 'Bugün koşu bandı süresini kısalt; ısınma ve soğuma esnemelerini atlama, uyluk ve baldırı 30\'ar saniye esnet.',
    },
    en: {
      note: 'Leg muscles weaken fastest in space because they carry no load; treadmill and cycling exercise tire them.',
      advice: 'Shorten your treadmill time today, do not skip warm-up and cool-down stretches, and stretch your thighs and calves for 30 seconds each.',
    },
  },
  ayaklar: {
    tr: {
      note: 'Ayak kasları uzayda neredeyse hiç yük taşımaz; ayak sabitleyiciler ve koşu bandı ayak tabanını ve bileği zorlayabilir.',
      advice: 'Ayak bileğini daireler çizerek çevir ve ayak sabitleyicideki konumunu değiştir.',
    },
    en: {
      note: 'Foot muscles carry almost no load in space; foot restraints and the treadmill can strain the soles and ankles.',
      advice: 'Circle your ankles and change your position in the foot restraints.',
    },
  },
}

/**
 * Birden çok kas için cevap. Kaslar bölgelere ayrılır (baştan ayağa):
 * - hepsi aynı bölgedeyse o bölgeye göre tek bir değerlendirme,
 * - farklı bölgelerdeyse her bölge için ayrı rapor; belirtiye göre yapılacaklar sonda bir kez söylenir.
 * Kas adlarının bazılarında virgül olduğu için adlar noktalı virgülle ayrılır.
 */
function musclesAnswer(muscles: { name: string; region: RegionId }[], symptom: MuscleSymptom | null, lang: Lang): string {
  const en = lang === 'en'
  const regions = regionsFor(lang)
  const groups = REGION_ORDER.map((region) => ({ region, names: muscles.filter((m) => m.region === region).map((m) => m.name) })).filter((g) => g.names.length)
  const word = symptom ? SYMPTOM_WORD[symptom][lang] : ''
  const context = symptom ? SYMPTOM_CONTEXT[symptom]?.[lang] : undefined
  const lastRecord = en ? 'Latest record for this region' : 'Bu bölgenin son kaydı'
  const chooseSymptom = en ? 'Choose what you feel on the card and ask me again.' : 'Karttan ne hissettiğini seçip bana yeniden sor.'
  const advice = symptom ? symptomAdvice(symptom, en, true, groups.length > 1) : null

  if (groups.length === 1) {
    const { region: id, names } = groups[0]
    const r = regions[id]
    const note = REGION_NOTE[id][lang]
    const area = en ? `the ${r.name.toLowerCase()} region` : `${r.name} bölgesinde`
    const head = symptom
      ? en
        ? `You reported ${word} in ${names.length} muscles in ${area}.`
        : `${area[0].toLocaleUpperCase('tr-TR') + area.slice(1)} ${names.length} kasta ${word} bildirdin.`
      : en
        ? `You selected ${names.length} muscles in ${area}.`
        : `${area[0].toLocaleUpperCase('tr-TR') + area.slice(1)} ${names.length} kas seçtin.`
    const body = [
      head,
      `${en ? 'Selected muscles' : 'Seçtiğin kaslar'}: ${names.join('; ')}.`,
      '',
      ...(context ? [context] : []),
      note.note,
      `${lastRecord}: ${r.summary}`,
    ]
    if (!advice) return lines(...body, '', chooseSymptom)
    return lines(...body, '', ...(advice.intro ? [advice.intro] : []), ...advice.bullets, `• ${note.advice}`, '', advice.escalation)
  }

  const head = symptom
    ? en
      ? `You reported ${word} in ${groups.length} different regions; here is a separate report for each.`
      : `${groups.length} ayrı bölgede ${word} bildirdin; her bölgeyi ayrı değerlendiriyorum.`
    : en
      ? `You selected muscles in ${groups.length} different regions; here is a separate report for each.`
      : `${groups.length} ayrı bölgede kas seçtin; her bölgeyi ayrı değerlendiriyorum.`
  const reports = groups.flatMap(({ region: id, names }, i) => {
    const r = regions[id]
    const note = REGION_NOTE[id][lang]
    const count = en ? `${names.length} muscle${names.length === 1 ? '' : 's'}` : `${names.length} kas`
    return ['', `${i + 1}. ${r.name} (${count}): ${names.join('; ')}`, note.note, `${lastRecord}: ${r.summary}`, `${en ? 'For this region' : 'Bu bölge için'}: ${note.advice}`]
  })
  if (!advice) return lines(head, ...reports, '', chooseSymptom)
  return lines(context ? `${head} ${context}` : head, ...reports, '', en ? 'For all of them:' : 'Hepsi için:', ...advice.bullets, '', advice.escalation)
}
