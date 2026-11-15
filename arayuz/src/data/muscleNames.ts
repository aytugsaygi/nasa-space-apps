/**
 * Kas adlarının Türkçesi. Modeldeki adlar (Z-Anatomy) İngilizcedir; Türkçe arayüzde bu sözlükle çevrilir.
 * "Long head of biceps brachii (sol)" gibi adlar kalıpla çözülür: "Sol pazı kası (biseps), uzun baş".
 * Sözlükte olmayan bir ad İngilizce kalır.
 */

const BASE: Record<string, string> = {
  // Göz ve baş
  'lateral rectus': 'Dış düz göz kası',
  'medial rectus': 'İç düz göz kası',
  'superior rectus': 'Üst düz göz kası',
  'inferior rectus': 'Alt düz göz kası',
  'superior oblique': 'Üst eğik göz kası',
  'inferior oblique': 'Alt eğik göz kası',
  'common tendinous ring': 'Ortak kiriş halkası',
  'superior tarsus': 'Üst göz kapağı tarsusu',
  'inferior tarsus': 'Alt göz kapağı tarsusu',
  'levator palpebrae superioris': 'Üst göz kapağını kaldıran kas',
  frontalis: 'Alın kası',
  occipitalis: 'Ense kası',
  'epicranial aponeurosis': 'Kafa derisi aponevrozu',
  temporoparietalis: 'Şakak-yan kafa kası',
  nasalis: 'Burun kası',
  'orbicularis oculi': 'Göz çevresi halka kası',
  'orbicularis oris': 'Ağız çevresi halka kası',
  'zygomaticus major': 'Büyük elmacık kası',
  'zygomaticus minor': 'Küçük elmacık kası',
  'corrugator supercilii': 'Kaş çatma kası',
  'depressor anguli oris': 'Ağız köşesini indiren kas',
  'depressor labii inferioris': 'Alt dudağı indiren kas',
  'levator anguli oris': 'Ağız köşesini kaldıran kas',
  'levator labii superioris': 'Üst dudağı kaldıran kas',
  'levator nasolabialis': 'Burun kanadını ve üst dudağı kaldıran kas',
  'depressor septi nasi': 'Burun bölmesini indiren kas',
  procerus: 'Burun kökü kası',
  risorius: 'Gülme kası',
  mentalis: 'Çene ucu kası',
  bucinator: 'Yanak kası',
  masseter: 'Çiğneme kası (masseter)',
  'medial pterygoid': 'İç kanat kası',
  'lateral pterygoid': 'Dış kanat kası',
  temporalis: 'Şakak kası',

  // Boyun
  sternocleidomastoid: 'Göğüs-köprücük-meme kası',
  digastric: 'İki karınlı kas',
  mylohyoid: 'Çene-dil kemiği kası',
  geniohyoid: 'Çene ucu-dil kemiği kası',
  omohyoid: 'Kürek-dil kemiği kası',
  sternohyoid: 'Göğüs-dil kemiği kası',
  sternothyroid: 'Göğüs-tiroit kası',
  thyrohyoid: 'Tiroit-dil kemiği kası',
  platysma: 'Boyun deri kası (platisma)',
  'scalenus anterior': 'Ön merdiven kası',
  'scalenus medius': 'Orta merdiven kası',
  'scalenus posterior': 'Arka merdiven kası',
  'rectus anterior capitis': 'Ön düz baş kası',
  'rectus posterior major capitis': 'Büyük arka düz baş kası',
  'rectus posterior minor capitis': 'Küçük arka düz baş kası',
  'obliquus inferior capitis': 'Alt eğik baş kası',
  'obliquus superior capitis': 'Üst eğik baş kası',

  // Sırt
  trapezius: 'Trapez kası',
  'latissimus dorsi': 'Geniş sırt kası',
  'levator scapulae': 'Kürek kemiğini kaldıran kas',
  'rhomboid major': 'Büyük eşkenar dörtgen kas',
  'rhomboid minor': 'Küçük eşkenar dörtgen kas',
  'serratus posterior superior': 'Üst arka dişli kas',
  'serratus posterior inferior': 'Alt arka dişli kas',
  'iliocostalis lumborum': 'Bel iliokostal kası',
  'iliocostalis thoracis': 'Göğüs iliokostal kası',
  'iliocostalis colli': 'Boyun iliokostal kası',
  'longissimus thoracis': 'Göğüs en uzun kası',
  'longissimus capitis': 'Baş en uzun kası',
  'longissimus colli': 'Boyun en uzun kası',
  'spinalis thoracis': 'Göğüs dikensi kası',
  'spinalis capitis': 'Baş dikensi kası',
  'spinalis colli': 'Boyun dikensi kası',
  'splenius capitis': 'Baş kayış kası',
  'splenius colli': 'Boyun kayış kası',
  'levatores longi costarum': 'Uzun kaburga kaldırıcı kaslar',
  'levatores breves costarum': 'Kısa kaburga kaldırıcı kaslar',

  // Göğüs ve karın
  'pectoralis major': 'Büyük göğüs kası',
  'pectoralis minor': 'Küçük göğüs kası',
  'serratus anterior': 'Ön dişli kas',
  subclavius: 'Köprücük altı kası',
  'rectus abdominis': 'Düz karın kası',
  'external abdominal oblique': 'Dış eğik karın kası',
  'internal abdominal oblique': 'İç eğik karın kası',
  'transversus abdominis': 'Enine karın kası',
  pyramidalis: 'Piramit kası',
  'linea alba': 'Ak çizgi (linea alba)',
  'inguinal ligament': 'Kasık bağı',
  'pubo-analis': 'Kasık-anüs kası',
  'psoas major': 'Büyük bel kası (psoas)',
  iliacus: 'İliak kas',
  'iliopectineal arch': 'İliopektineal kemer',

  // Omuz ve kol
  deltoid: 'Deltoid kası',
  supraspinatus: 'Diken üstü kası',
  infraspinatus: 'Diken altı kası',
  subscapularis: 'Kürek altı kası',
  'teres major': 'Büyük yuvarlak kas',
  'teres minor': 'Küçük yuvarlak kas',
  'biceps brachii': 'Pazı kası (biseps)',
  'triceps brachii': 'Arka kol kası (triseps)',
  brachialis: 'Kol kası (brakiyalis)',
  coracobrachialis: 'Karga-kol kası',

  // Ön kol
  brachioradialis: 'Kol-radius kası',
  'pronator teres': 'Yuvarlak içe döndürücü kas',
  'pronator quadratus': 'Kare içe döndürücü kas',
  supinator: 'Dışa döndürücü kas',
  anconeus: 'Dirsek kası',
  'flexor carpi radialis': 'Bileği büken radyal kas',
  'flexor carpi ulnaris': 'Bileği büken ulnar kas',
  'palmaris longus': 'Uzun avuç içi kası',
  'flexor digitorum superficialis': 'Yüzeyel parmak bükücü kas',
  'flexor digitorum profundus': 'Derin parmak bükücü kas',
  'flexor pollicis longus': 'Başparmağın uzun bükücü kası',
  'extensor carpi radialis longus': 'Bileği açan uzun radyal kas',
  'extensor carpi radialis brevis': 'Bileği açan kısa radyal kas',
  'extensor carpi ulnaris': 'Bileği açan ulnar kas',
  'extensor digitorum': 'Parmak açıcı kas',
  'extensor digiti minimi': 'Serçe parmak açıcı kas',
  'extensor indicis': 'İşaret parmağı açıcı kas',
  'extensor pollicis longus': 'Başparmağın uzun açıcı kası',
  'extensor pollicis brevis': 'Başparmağın kısa açıcı kası',
  'abductor pollicis longus': 'Başparmağın uzun uzaklaştırıcı kası',

  // El
  'abductor pollicis brevis': 'Başparmağın kısa uzaklaştırıcı kası',
  'flexor pollicis brevis': 'Başparmağın kısa bükücü kası',
  'opponens pollicis': 'Başparmak karşı koyucu kası',
  'adductor pollicis': 'Başparmağı yaklaştıran kas',
  'abductor digiti minimi of hand': 'Serçe parmağı uzaklaştıran kas',
  'flexor digiti minimi of hand': 'Serçe parmak bükücü kas',
  'opponens digiti minimi of hand': 'Serçe parmak karşı koyucu kası',
  'lumbrical of hand': 'Elin solucan biçimli kasları',
  'dorsal interossei of hand': 'Elin sırt kemikler arası kasları',
  'palmar interossei': 'Avuç kemikler arası kasları',
  'palmar aponeurosis': 'Avuç içi aponevrozu',
  'flexor retinaculum of wrist': 'El bileği bükücü tutucu bağı',
  'extensor retinaculum of wrist': 'El bileği açıcı tutucu bağı',
  'superficial transverse metacarpal ligament': 'Elin yüzeyel enine tarak bağı',

  // Kalça ve uyluk
  'gluteus maximus': 'Büyük kalça kası',
  'gluteus medius': 'Orta kalça kası',
  'gluteus minimus': 'Küçük kalça kası',
  'tensor fasciae latae': 'Uyluk zarını geren kas',
  piriformis: 'Armut biçimli kas',
  'quadratus femoris': 'Kare uyluk kası',
  'superior gemellus': 'Üst ikiz kas',
  'inferior gemellus': 'Alt ikiz kas',
  'obturator externus': 'Dış kapatıcı kas',
  'rectus femoris': 'Düz uyluk kası',
  'vastus lateralis': 'Dış geniş kas',
  'vastus medialis': 'İç geniş kas',
  'vastus intermedius': 'Ara geniş kas',
  sartorius: 'Terzi kası',
  gracilis: 'İnce kas',
  pectineus: 'Tarak kası',
  'adductor longus': 'Uzun yaklaştırıcı kas',
  'adductor brevis': 'Kısa yaklaştırıcı kas',
  'adductor magnus': 'Büyük yaklaştırıcı kas',
  'adductor minimus': 'En küçük yaklaştırıcı kas',
  'biceps femoris': 'İki başlı uyluk kası',
  semitendinosus: 'Yarı kirişli kas',
  semimembranosus: 'Yarı zarlı kas',
  'iliotibial tract': 'İliotibial bant',
  'lateral patellar retinaculum': 'Diz kapağının dış tutucu bağı',
  'medial patellar retinaculum': 'Diz kapağının iç tutucu bağı',

  // Bacak
  'tibialis anterior': 'Ön kaval kası',
  'tibialis posterior': 'Arka kaval kası',
  'extensor digitorum longus': 'Uzun parmak açıcı kas',
  'extensor hallucis longus': 'Ayak başparmağının uzun açıcı kası',
  'fibularis longus': 'Uzun kamış kası',
  'fibularis brevis': 'Kısa kamış kası',
  'fibularis tertius': 'Üçüncü kamış kası',
  gastrocnemius: 'Baldır kası (gastroknemius)',
  soleus: 'Soleus kası',
  plantaris: 'Taban kası (plantaris)',
  popliteus: 'Diz arkası kası',
  'flexor digitorum longus': 'Uzun parmak bükücü kas',
  'flexor hallucis longus': 'Ayak başparmağının uzun bükücü kası',
  'calcaneal tendon': 'Aşil tendonu',

  // Ayak
  'flexor hallucis brevis': 'Ayak başparmağının kısa bükücü kası',
  'adductor hallucis': 'Ayak başparmağını yaklaştıran kas',
  'abductor hallucis': 'Ayak başparmağını uzaklaştıran kas',
  'abductor digiti minimi of foot': 'Küçük parmağı uzaklaştıran kas (ayak)',
  'flexor digiti minimi of foot': 'Küçük parmak bükücü kas (ayak)',
  'opponens digiti minimi of foot': 'Küçük parmak karşı koyucu kası (ayak)',
  'extensor digitorum brevis': 'Kısa parmak açıcı kas',
  'extensor hallucis brevis': 'Ayak başparmağının kısa açıcı kası',
  'flexor digitorum brevis': 'Kısa parmak bükücü kas',
  'quadratus plantae': 'Kare taban kası',
  'lumbrical of foot': 'Ayağın solucan biçimli kasları',
  'dorsal interossei of foot': 'Ayağın sırt kemikler arası kasları',
  'plantar interossei': 'Taban kemikler arası kasları',
  'plantar aponeurosis': 'Taban aponevrozu',
  'superior extensor retinaculum of ankle': 'Ayak bileği üst açıcı tutucu bağı',
  'inferior extensor retinaculum of ankle': 'Ayak bileği alt açıcı tutucu bağı',
  'flexor retinaculum of ankle': 'Ayak bileği bükücü tutucu bağı',
  'superior fibular retinaculum': 'Kamış kaslarının üst tutucu bağı',
  'inferior fibular retinaculum': 'Kamış kaslarının alt tutucu bağı',
  'superficial transverse metatarsal ligament': 'Ayağın yüzeyel enine tarak bağı',
}

/** "X'in uzun başı", "X'in inen bölümü" gibi alt bölümler */
const QUALIFIER: Record<string, string> = {
  'long head': 'uzun baş',
  'short head': 'kısa baş',
  'lateral head': 'dış baş',
  'medial head': 'iç baş',
  'superficial head': 'yüzeyel baş',
  'deep head': 'derin baş',
  'humeral head': 'humerus başı',
  'ulnar head': 'ulna başı',
  'radial head': 'radius başı',
  'humero-ulnar head': 'humerus-ulna başı',
  'oblique head': 'eğik baş',
  'transverse head': 'enine baş',
  'clavicular head': 'köprücük kemiği başı',
  'sternocostal head': 'göğüs kemiği-kaburga başı',
  'inferior head': 'alt baş',
  'superior head': 'üst baş',
  'superficial part': 'yüzeyel bölüm',
  'deep part': 'derin bölüm',
  'abdominal part': 'karın bölümü',
  'orbital part': 'göz çukuru bölümü',
  'palpebral part': 'göz kapağı bölümü',
  // Deltoid: ön, orta, arka; trapez: üst (inen), orta (enine), alt (çıkan)
  'clavicular part': 'ön bölüm',
  'acromial part': 'orta bölüm',
  'scapular spinal part': 'arka bölüm',
  'descending part': 'üst bölüm',
  'transverse part': 'orta bölüm',
  'ascending part': 'alt bölüm',
  'anterior belly': 'ön karın',
  'posterior belly': 'arka karın',
  'intermediate tendon': 'ara kiriş',
}

/** Karşılaştırma için sadeleştirilmiş ad: parantez ve "muscle" sözcüğü atılır */
function normalize(name: string) {
  return name
    .replace(/^\((.*)\)$/, '$1')
    .toLowerCase()
    .replace(/\bmuscles?\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function translate(n: string): string | null {
  if (BASE[n]) return BASE[n]
  let m = n.match(/^tendon of (.+)$/)
  if (m && BASE[m[1]]) return `${BASE[m[1]]} kirişi`
  m = n.match(/^trochlea of (.+)$/)
  if (m && BASE[m[1]]) return `${BASE[m[1]]} makarası`
  m = n.match(/^(.+?) (head|part|belly|tendon) of (.+)$/)
  if (m) {
    const q = QUALIFIER[`${m[1]} ${m[2]}`]
    const base = BASE[m[3]]
    if (q && base) return `${base}, ${q}`
  }
  return null
}

/** Özel ad olduğu için küçük harfe çevrilmeyen ilk sözcükler */
const PROPER = /^Aşil /

/** Kasın Türkçe adı; taraf, Türkçedeki gibi başa gelir ("Sol büyük göğüs kası"). Bilinmiyorsa null. */
export function muscleNameTr(label: string): string | null {
  const side = label.match(/ \((sol|sağ)\)$/)
  const base = side ? label.slice(0, -side[0].length) : label
  const tr = translate(normalize(base))
  if (!tr) return null
  if (!side) return tr
  const rest = PROPER.test(tr) ? tr : tr.charAt(0).toLocaleLowerCase('tr-TR') + tr.slice(1)
  return `${side[1] === 'sol' ? 'Sol' : 'Sağ'} ${rest}`
}
