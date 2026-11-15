import { useMemo } from 'react'
import { resolve, tx, useI18n, type Lang, type Tx } from '../i18n'
import { SOURCE_LIST, type SourceKind } from '../core/sources'

/* Metinler tx(Türkçe, İngilizce) çiftleriyle yazılır. */

/** Kurgusal astronot ve görev bilgileri */
export const CREW = {
  name: 'E. Yıldız',
  role: tx('Görev uzmanı', 'Mission specialist'),
  mission: tx('Kuzey Işığı-3', 'Northern Light-3'),
}

/** Rehber tur metinleri. Metni değiştirmek için yalnızca bu listeyi düzenleyin. */
const TOUR_RAW: {
  element: string
  title: Tx
  description: Tx
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** Adım bölüm menüsünün içindeyse tur menüyü açar, değilse kapatır */
  inMenu?: boolean
  /** Adımın sayfası (0 ana sayfa, 1 zihinsel sağlık, 2 spor, 3 sağlık kayıtları); tur gerekirse sayfayı değiştirir */
  page?: number
}[] = [
  {
    element: '#tour-vitals',
    title: tx('Yaşamsal değerler', 'Vital signs'),
    description: tx(
      'Nabız, tansiyon, oksijen, ısı, kan şekeri, uyku, radyasyon ve genel ruh hali. Her kartın altında referans aralığı var; karta basınca grafik (gün, hafta, ay ya da istediğin aralık), eşikler ve kaynaklar açılır.',
      'Heart rate, blood pressure, oxygen, temperature, blood sugar, sleep, radiation and overall mood. Each card shows its reference range; press a card to open its chart (day, week, month or any range), thresholds and sources.',
    ),
    side: 'bottom',
  },
  {
    element: '#tour-hologram',
    title: tx('Vücut hologramı', 'Body hologram'),
    description: tx(
      'Figürü fareyle sürükleyerek döndür; imleç bu alandayken fare tekerleğiyle imlecin gösterdiği yere yakınlaşırsın. Bir bölgenin üzerine gelince adı görünür, tıklayınca o bölgenin kartı açılır.',
      'Drag with the mouse to rotate the figure; with the cursor in this area, the mouse wheel zooms toward where it points. Hover over a region to see its name; click it to open its card.',
    ),
    side: 'right',
  },
  {
    element: '#tour-view',
    title: tx('Görünüm kontrolleri', 'View controls'),
    description: tx(
      'Sırta bakmak için Arka\'ya bas. Katmanlara ayır ile kas ve iskelet sistemini gerçek dokusuyla yan yana görürsün; alttaki listeden birini seçince yalnızca o katman kalır.',
      'Press Back to see the back. Split into layers shows the muscular and skeletal systems side by side with their real tissue look; pick one from the list below to show only that layer.',
    ),
    side: 'top',
  },
  {
    element: '#tour-complaint',
    title: tx('Rahatsızlık bildir', 'Report discomfort'),
    description: tx(
      'Bir kasında ya da kemiğinde rahatsızlık varsa buna bas: kas ve iskelet sistemi yan yana açılır. Birine tıklayıp devam et, bir ya da birden fazla kas veya kemik seçip ne hissettiğini söyle, sonra asistana sor. Yanındaki düğme şikayet geçmişini açar.',
      'If a muscle or bone is bothering you, press this: the muscular and skeletal systems open side by side. Click one to continue, pick one or more muscles or bones, say what you feel, then ask the assistant. The button next to it opens your complaint history.',
    ),
    side: 'top',
  },
  {
    element: '#tour-panel',
    title: tx('Bilgi kartı', 'Info card'),
    description: tx(
      'Seçtiğin bölgenin durumu, birkaç temel değer ve son 7 günün grafiği burada. Bilginin kaynağı kartın altında.',
      'The selected region\'s status, a few key values and a 7-day chart appear here. The source is at the bottom of the card.',
    ),
    side: 'left',
  },
  {
    element: '#tour-todo',
    title: tx('Yapılacaklar', 'To-do'),
    description: tx(
      'Günün rutinleri: su, sabah ölçümü, antrenman, ruh hali ve planlı kontroller. Gecikenler en üstte. Suyu buradan eklersin; diğerleri seni ilgili sayfaya götürür.',
      'Today\'s routines: water, morning check, workout, mood and planned checks. Overdue items come first. Log water here; the others take you to the right page.',
    ),
    side: 'left',
  },
  {
    element: '#tour-pin',
    title: tx('Sabitleme', 'Pinning'),
    description: tx(
      'Bir bölümün üzerine gelince üst kenarında iğne belirir. Sabitlemeyi kaldırınca bölümü sürükleyip istediğin yere bırakabilirsin; tekrar sabitleyince yerine kilitlenir ve içindeki düğmeler kullanılabilir olur.',
      'Hover over a section to see a pin on its top edge. Unpin it to drag the section anywhere and drop it; pin it again to lock it in place and use its buttons.',
    ),
    side: 'bottom',
  },
  {
    element: '#tour-remove',
    title: tx('Bölümü kaldır', 'Remove a section'),
    description: tx(
      'Bölümün üst kenarında, iğnenin yanındaki X\'i 1 saniye basılı tut: halka dolunca bölüm arayüzden kalkar ve menüdeki gözü söner. Erken bırakırsan hiçbir şey olmaz. Geri getirmek için menüyü kullan.',
      'Hold the X next to the pin on a section\'s top edge for 1 second: when the ring fills, the section leaves the interface and its eye in the menu turns off. Let go early and nothing happens. Use the menu to bring it back.',
    ),
    side: 'bottom',
  },
  {
    element: '#page-next',
    title: tx('Sayfalar', 'Pages'),
    description: tx(
      'Ekranın sağındaki ve solundaki oklarla yan sayfalara geçebilirsin. Menüden bir bölüm açtığında, o an bulunduğun sayfaya gelir.',
      'Use the arrows on the right and left of the screen to switch to the side pages. When you turn on a section from the menu, it appears on the page you are on.',
    ),
    side: 'left',
  },
  {
    element: '#tools-menu-button',
    title: tx('Bölüm menüsü', 'Sections menu'),
    description: tx(
      'Arayüzde hangi bölümlerin olacağını buradan seçersin. Profiller ve düzeni sıfırlama da bu menüde.',
      'Choose which sections appear in the interface. Profiles and layout reset are in this menu too.',
    ),
    side: 'bottom',
  },
  {
    element: '#tools-menu-list',
    title: tx('Göster ve gizle', 'Show and hide'),
    description: tx(
      'Göz simgesi bölümü arayüze ekler, üstü çizili göz kaldırır. Eklenen bölüm sabitlenmemiş gelir; istediğin yere yerleştirip sabitlersin.',
      'The eye icon adds a section; the crossed-out eye removes it. An added section arrives unpinned so you can place it and pin it.',
    ),
    side: 'right',
    inMenu: true,
  },
  {
    element: '#layout-profiles',
    title: tx('Profiller', 'Profiles'),
    description: tx(
      'Üç ayrı düzen kaydedebilirsin. 1, 2 ya da 3\'e basınca arayüz o profilin düzenine geçer. Her profil kendi düzenini hatırlar; noktalı profiller özelleştirilmiştir.',
      'Save up to three layouts. Press 1, 2 or 3 to switch the interface to that profile\'s layout. Each profile remembers its own layout; a dot marks a customised profile.',
    ),
    side: 'top',
    inMenu: true,
  },
  {
    element: '#layout-reset',
    title: tx('Düzeni sıfırla', 'Reset layout'),
    description: tx(
      'Seçili profilin düzenini değiştirdiğinde bu düğme etkinleşir. Basınca onay istenir; onaylarsan düzen ilk haline döner. Fikrini değiştirirsen çıkan bildirimden geri alabilirsin.',
      'This button turns on once you change the selected profile\'s layout. Pressing it asks for confirmation; confirm to return to the original layout. Changed your mind? Undo it from the notification.',
    ),
    side: 'top',
    inMenu: true,
  },
  {
    element: '#tour-alerts',
    title: tx('Bildirimler', 'Notifications'),
    description: tx(
      'Uyarılar önem sırasına göre renk, ikon ve sesle gelir. Kritik uyarıda bu simge titrer.',
      'Alerts arrive with colour, icon and sound by severity. This icon shakes on a critical alert.',
    ),
    side: 'bottom',
  },
  {
    element: '#tour-demo',
    title: tx('Demo senaryoları', 'Demo scenarios'),
    description: tx(
      'Sunum için bir sağlık durumu tetikle: tansiyon düştü, su içilmedi, güneş parçacık olayı… Senaryo gerçek bir ölçüm gibi sisteme girer; uyarı, yapılacaklar, spor koçu ve hekim bildirimi kendiliğinden tepki verir.',
      'Trigger a health situation for the presentation: blood pressure dropped, water not drunk, solar particle event… It enters the system like a real reading; the alert, to-dos, sport coach and physician notification react on their own.',
    ),
    side: 'bottom',
  },
  {
    element: '#tour-profile',
    title: tx('Profil', 'Profile'),
    description: tx(
      'Başka bir astronot olarak ya da uçuş hekimi olarak gir. Hekim önce mürettebatın sağlık puanlarını görür; bir isme basınca o astronotun arayüzünü açar.',
      'Enter as another astronaut or as the flight surgeon. The surgeon first sees the crew\'s health scores; pressing a name opens that astronaut\'s interface.',
    ),
    side: 'bottom',
  },
  {
    element: '#tour-feedback',
    title: tx('Ses ve titreşim', 'Sound and vibration'),
    description: tx('Sesi ve görsel titreşimi ayrı ayrı açıp kapatabilirsin. Tercihin hatırlanır.', 'Turn sound and visual vibration on or off separately. Your choice is remembered.'),
    side: 'bottom',
  },
  {
    element: '#tour-lang',
    title: tx('Dil', 'Language'),
    description: tx('Arayüzü Türkçe ya da İngilizce kullanabilirsin.', 'Use the interface in Turkish or English.'),
    side: 'bottom',
  },
  {
    element: '#tour-assistant',
    title: tx('Sağlık Asistanı', 'Health Assistant'),
    description: tx(
      'Tek asistan bütün sisteme hakim: konuya göre spor koçu, dinleyen ya da arkadaş olur. Yazabilir ya da mikrofonla konuşabilirsin; her cevabın sağ altındaki hoparlör onu kadın ya da erkek sesle okur.',
      'A single assistant knows the whole system: depending on the topic it becomes your sport coach, a listener or a friend. Type or speak into the microphone; the speaker at the bottom right of each reply reads it in a female or male voice.',
    ),
    side: 'bottom',
  },
  {
    element: '#tour-mood',
    page: 1,
    title: tx('Günün check-in\'leri', 'Today\'s check-ins'),
    description: tx(
      'Görev gününde sabah, öğle ve akşam olmak üzere üç isteğe bağlı check-in penceresi vardır. Her kart pencerenin görev saatine göre aralığını ve durumunu gösterir.',
      'Each mission day has three optional check-in windows: morning, midday and evening. Each card shows the window\'s range in mission time and its status.',
    ),
    side: 'bottom',
  },
  {
    element: '#tour-journal',
    page: 1,
    title: tx('Kayıtlarım', 'My records'),
    description: tx(
      'Check-in geçmişini ve günlük notlarını açar. Kayıtlar hekim görünümünde gösterilmez. Acil destek üst çubuktaki "Acil durum" düğmesindedir.',
      'Opens your check-in history and journal notes. Records are not shown in the flight surgeon view. Emergency support is the "Emergency" button in the top bar.',
    ),
    side: 'bottom',
  },
  {
    element: '#tour-knowyourself',
    page: 1,
    title: tx('Kendini tanı', 'Know yourself'),
    description: tx(
      'Zihin egzersizleri ve kısa testler: tepki testi yorgunluğunu ölçer; görüş ve tutarlılık testleri sonraki sürümde gelecek.',
      'Mind training and short tests: the reaction test measures fatigue; the vision and consistency tests are coming in a later version.',
    ),
    side: 'left',
  },
  {
    element: '#tour-cupola',
    page: 1,
    title: tx('Destek kütüphanesi', 'Support library'),
    description: tx(
      'Kendi başına yapabileceğin dört kısa şey: Cupola\'dan Dünya, nefes egzersizi, Dünya galerisi ve günlük. "Başlat" seçtiğini tam ekran açar; sol üstteki "Geri" ile dönersin.',
      'Four short things you can do on your own: Earth from the Cupola, a breathing exercise, the Earth gallery and your journal. "Start" opens your choice full screen; "Back" at the top left brings you back.',
    ),
    side: 'top',
  },
  {
    element: '#tour-breathing',
    page: 1,
    title: tx('Nefes egzersizi', 'Breathing exercise'),
    description: tx('Kısa, yönlendirmeli bir nefes egzersizi. Süreyi, hareketli ya da sabit görünümü ve sesi sen seçersin; hiçbir şey kendiliğinden başlamaz.', 'A short guided breathing exercise. You choose the duration, an animated or still visual and the sound; nothing starts on its own.'),
    side: 'top',
  },
  {
    element: '#tour-mindgames',
    page: 1,
    title: tx('Zihin egzersizleri', 'Mind training'),
    description: tx(
      'Uçuşta yavaşladığı ölçülen üç beceri için üç kısa egzersiz: Hızlı bakış (işlem hızı), Bellek akışı (görsel çalışma belleği) ve Zihinde döndür (uzamsal düşünme). Sonuçların kaydedilir, gelişimini izlersin.',
      'Three short exercises for three skills measured to slow down in flight: Quick glance (processing speed), Memory stream (visual working memory) and Mental rotation (spatial thinking). Your results are saved so you can follow your progress.',
    ),
    side: 'left',
  },
  {
    element: '#tour-trainer',
    page: 2,
    title: tx('Hologram antrenör', 'Hologram trainer'),
    description: tx(
      'Senin hologram modelin hareketi gösterir. Sürükleyerek açıyı değiştir ve doğru formu her yönden gör; çalışan bölgeler parlar.',
      'Your hologram model performs the move. Drag to change the angle and see the correct form from every side; the working areas glow.',
    ),
    side: 'right',
  },
  {
    element: '#tour-program',
    page: 2,
    title: tx('Günün programı', 'Today\'s program'),
    description: tx(
      'İstasyondaki cihazlara (ARED, T2, CEVIS) göre günlük program. Bir şikayet bildirdiysen o bölgeyi yoran hareketler hafifletilir ya da değiştirilir. Göster düğmesi hareketi hologramda oynatır.',
      'A daily program built on the station\'s devices (ARED, T2, CEVIS). If you reported a complaint, moves that strain that area are lightened or replaced. Show plays the move on the hologram.',
    ),
    side: 'left',
  },
  {
    element: '#tour-coach',
    page: 2,
    title: tx('Spor koçu', 'Sport coach'),
    description: tx(
      'Koç dünkü şikayetini sorar ve programı cevabına göre kurar. Halka bugünkü egzersiz dakikanı, silüet bugün çalışan bölgeleri gösterir; altında kemik kaybı tahmini var.',
      'The coach asks about yesterday\'s complaint and builds the program from your answer. The ring shows today\'s exercise minutes and the silhouette the regions worked today; the bone-loss estimate is below.',
    ),
    side: 'left',
  },
  {
    element: '#tour-explorer',
    page: 3,
    title: tx('Göstergeler ve grafikler', 'Indicators and charts'),
    description: tx('Her göstergeyi gün, hafta, ay, bütün görev ya da istediğin tarih aralığında incele.', 'Explore any indicator by day, week, month, the whole mission or any date range.'),
    side: 'bottom',
  },
  {
    element: '#tour-labs',
    page: 3,
    title: tx('Kan tahlilleri', 'Blood tests'),
    description: tx(
      'Uçuş içi örnekler ve NASA OSDR\'deki Inspiration4 mürettebatının gerçek kan değerleri. Örnekler dondurulup sonra incelendiği için son sonuç "analiz bekliyor" görünür.',
      'In-flight samples and real blood values of the Inspiration4 crew from NASA OSDR. Samples are frozen and analysed later, so the latest result shows "awaiting analysis".',
    ),
    side: 'left',
  },
  {
    element: '#tour-report',
    page: 3,
    title: tx('Rapor ve uçuş hekimi', 'Report and flight surgeon'),
    description: tx(
      'Tek tıkla rapor (sade ya da hekim dili), PDF olarak kaydetme ve hekime gönderme. Mesajlar görev ortamına göre gecikir: Mars\'ta 22 dakikaya kadar.',
      'One-click report (plain or physician language), save as PDF and send to the surgeon. Messages are delayed by the mission environment: up to 22 minutes at Mars.',
    ),
    side: 'top',
  },
  {
    element: '#tour-environment',
    page: 3,
    title: tx('Ortam ve radyasyon', 'Environment and radiation'),
    description: tx(
      'Toplam doz NASA\'nın 600 mSv kariyer sınırına göre izlenir; NASA DONKI\'deki gerçek güneş olayları burada.',
      'Total dose is tracked against NASA\'s 600 mSv career limit; real solar events from NASA DONKI are here.',
    ),
    side: 'top',
  },
  {
    element: '#tour-history',
    page: 3,
    title: tx('Şikayet ve uyarı geçmişi', 'Complaint and alert history'),
    description: tx('Güncel uyarılar ve son şikayetler. Tepki testi Zihinsel sağlık sayfasındadır.', 'Current alerts and recent complaints. The reaction test is on the Wellbeing page.'),
    side: 'top',
  },
]

export function tourFor(lang: Lang) {
  return resolve(TOUR_RAW, lang)
}

/** Sohbet panelindeki hazır sorular: asistanın farklı türden işlerini gösterir (yönlendirme, veri, koçluk, destek) */
const QUICK_RAW = [
  tx('Şikayet oluşturmak istiyorum', 'I want to create a complaint'),
  tx('Son kan tahlilim', 'My latest blood test'),
  tx('Bugünkü programım', "Today's program"),
  tx('Kendimi yalnız hissediyorum', 'I feel lonely'),
]

/** Uygulamada kullanılan dış kaynaklar ve lisansları */
const SOURCES_RAW: { group: Tx; items: { name: Tx | string; note: Tx | string; url?: string }[] }[] = [
  {
    group: tx('Bölge kartları', 'Region cards'),
    items: [
      { name: tx('NASA İnsan Araştırma Programı', 'NASA Human Research Program'), note: tx('Bölge kartlarındaki genel bilgiler', 'General information on the region cards'), url: 'https://www.nasa.gov/hrp/' },
      { name: 'NASA Human Research Roadmap', note: tx('Uzay uçuşu sağlık riskleri', 'Spaceflight health risks'), url: 'https://humanresearchroadmap.nasa.gov/' },
    ],
  },
  {
    group: tx('Yazılım', 'Software'),
    items: [
      { name: 'React, Vite, TypeScript', note: tx('MIT ve Apache 2.0 lisansı', 'MIT and Apache 2.0 licences') },
      { name: 'Three.js, React Three Fiber, drei', note: tx('MIT lisansı', 'MIT licence'), url: 'https://threejs.org' },
      { name: '@react-three/postprocessing', note: tx('MIT lisansı', 'MIT licence') },
      { name: 'Tailwind CSS', note: tx('MIT lisansı', 'MIT licence') },
      { name: 'Motion', note: tx('MIT lisansı', 'MIT licence') },
      { name: 'driver.js', note: tx('MIT lisansı', 'MIT licence'), url: 'https://github.com/kamranahmedse/driver.js' },
      { name: 'sonner', note: tx('MIT lisansı', 'MIT licence') },
      { name: tx('Lucide ikonları', 'Lucide icons'), note: tx('ISC lisansı', 'ISC licence'), url: 'https://lucide.dev' },
      { name: tx('Sora ve Manrope yazı tipleri (Fontsource)', 'Sora and Manrope fonts (Fontsource)'), note: 'SIL Open Font License 1.1', url: 'https://fontsource.org' },
      { name: 'react-grid-layout', note: tx('MIT lisansı', 'MIT licence'), url: 'https://github.com/react-grid-layout/react-grid-layout' },
      { name: tx('Draco 3D çözücü (Google)', 'Draco 3D decoder (Google)'), note: tx('Apache 2.0 lisansı', 'Apache 2.0 licence'), url: 'https://github.com/google/draco' },
      { name: tx('Node.js (sunucu ve SQLite)', 'Node.js (server and SQLite)'), note: tx('MIT lisansı', 'MIT licence'), url: 'https://nodejs.org' },
    ],
  },
  {
    group: tx('Görsel ve ses', 'Visuals and audio'),
    items: [
      {
        name: tx('3D anatomi modeli: Z-Anatomy', '3D anatomy model: Z-Anatomy'),
        note: tx('CC BY-SA 4.0 · Türetilmiş model de aynı lisansla paylaşılır', 'CC BY-SA 4.0 · The derived model is shared under the same licence'),
        url: 'https://github.com/Z-Anatomy/Models-of-human-anatomy',
      },
      {
        name: tx('BodyParts3D (Z-Anatomy temel modeli)', 'BodyParts3D (Z-Anatomy base model)'),
        note: 'The Database Center for Life Science · CC BY-SA 2.1 Japan',
        url: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html',
      },
      {
        name: tx('Hologram antrenör modeli: Quaternius Universal Base Characters', 'Hologram trainer model: Quaternius Universal Base Characters'),
        note: tx('CC0 (kamu malı) · Doku ve göz/kaş parçaları çıkarıldı', 'CC0 (public domain) · Textures and eye/brow parts removed'),
        url: 'https://quaternius.com/packs/universalbasecharacters.html',
      },
      {
        name: tx('Antrenör cihazı: halter barı ("Barbell", J-Toastie)', 'Trainer equipment: barbell ("Barbell", J-Toastie)'),
        note: tx('CC BY 3.0 · Poly Pizza · Hologram malzemesiyle çizilir', 'CC BY 3.0 · Poly Pizza · Drawn with the hologram material'),
        url: 'https://poly.pizza/m/S3myL1W9d7',
      },
      {
        name: tx('Antrenör cihazı: egzersiz bisikleti ("Exercise Bike", Dave Edwards)', 'Trainer equipment: exercise bike ("Exercise Bike", Dave Edwards)'),
        note: tx('CC BY 3.0 · Poly Pizza · Pedal kolları figürle birlikte döner', 'CC BY 3.0 · Poly Pizza · The cranks turn with the figure'),
        url: 'https://poly.pizza/m/9DwoznfSPHY',
      },
      {
        name: tx('Antrenör cihazı: bench ve dambıllar ("Exercise Equipment", sirkitree)', 'Trainer equipment: bench and dumbbells ("Exercise Equipment", sirkitree)'),
        note: tx('CC BY 3.0 · Poly Pizza · Setteki yerdeki bar gösterilmez', 'CC BY 3.0 · Poly Pizza · The barbell lying on the floor is not shown'),
        url: 'https://poly.pizza/m/e9qDJpbSTxf',
      },
      {
        name: tx('Antrenör cihazı: koşu bandı ("Treadmill", CreativeTrio)', 'Trainer equipment: treadmill ("Treadmill", CreativeTrio)'),
        note: tx('CC0 (kamu malı) · Poly Pizza', 'CC0 (public domain) · Poly Pizza'),
        url: 'https://poly.pizza/m/9hYy4Zmk67',
      },
      {
        name: tx('Cupola videoları ve durağan kareleri', 'Cupola videos and still frames'),
        note: tx(
          'Dört manzara (gün doğumu, Sahra ve Nil, Hint Okyanusu, gece ışıkları) Gemini ile SI kullanılarak üretildi; yarı hıza yavaşlatılıp kesintisiz döngüye alındı. Her videonun ve karenin sol üstünde görünür "AI GENERATED" filigranı var; gerçek ya da canlı ISS görüntüsü değildir',
          'The four views (sunrise, Sahara and the Nile, Indian Ocean, city lights) were generated with SI using Gemini, slowed to half speed and looped seamlessly. Every video and still frame has a visible "AI GENERATED" watermark at the top left; they are not real or live ISS footage',
        ),
      },
      {
        name: tx('Dünya galerisi: doğa ve şehir fotoğrafları (16 fotoğraf)', 'Earth gallery: nature and city photos (16 photos)'),
        note: tx(
          'Wikimedia Commons öne çıkan resimleri · CC0, CC BY 2.5/3.0 ve CC BY-SA 3.0/4.0 · Yalnızca boyutları küçültüldü. Her fotoğrafın yazarı, lisansı ve Commons sayfası galerinin görüntüleyicisinde yazar',
          "Wikimedia Commons featured pictures · CC0, CC BY 2.5/3.0 and CC BY-SA 3.0/4.0 · Only resized. Each photo's author, license and Commons page are shown in the gallery viewer",
        ),
      },
      {
        name: tx('Açılış videosu', 'Intro video'),
        note: tx(
          'Görüntü ve ses Higgsfield ile SI (süper zeka) kullanılarak üretildi; her karede görünür filigran var',
          'Video and audio generated with SI (super intelligence) using Higgsfield; a visible watermark is in every frame',
        ),
      },
      {
        name: tx('Uzay arka planı', 'Space background'),
        note: tx('Gemini ile SI kullanılarak üretildi; görselin sol kenarında "Background generated by Gemini" filigranı var', 'Generated with SI using Gemini; watermarked "Background generated by Gemini" on the left edge of the image'),
      },
      {
        name: tx('Hologramın arka planı', 'Hologram backdrop'),
        note: tx('Gemini ile SI kullanılarak üretildi; görselin sol kenarında "Generated by Gemini" filigranı var', 'Generated with SI using Gemini; watermarked "Generated by Gemini" on the left edge of the image'),
      },
      {
        name: tx('Zihinsel sağlık videoları', 'Wellbeing videos'),
        note: tx(
          'Check-in, Kendini tanı (zihin egzersizleri, görüş, tepki ve tutarlılık testleri) ve destek kütüphanesi (Cupola, nefes egzersizi, Dünya galerisi, günlük) kutularının arkasındaki 11 video Gemini ile SI kullanılarak üretildi; her birinin sol üstünde görünür "AI GENERATED" filigranı var',
          'The 11 videos behind the check-in, Know yourself (mind training, vision, reaction and consistency tests) and support library (Cupola, breathing exercise, Earth gallery, journal) tiles were generated with SI using Gemini; each has a visible "AI GENERATED" watermark at the top left',
        ),
      },
      {
        name: tx('Spor sayfası antrenör arka planı', 'Sport page trainer backdrop'),
        note: tx('Gemini ile SI kullanılarak üretildi; görselin sol altında "Generated by Gemini" filigranı var', 'Generated with SI using Gemini; watermarked "Generated by Gemini" in the bottom-left corner of the image'),
      },
      { name: tx('Efektler ve sesler', 'Effects and sounds'), note: tx('Kodla üretildi (shader, Canvas, Web Audio API)', 'Generated in code (shaders, Canvas, Web Audio API)') },
    ],
  },
]

/**
 * Süper zeka (SI) kullanımı: 2026 Space Apps kuralları "AI" yerine "Super Intelligence (SI)" der. Bu liste README'deki
 * "Use of Super Intelligence" bölümü ve repo kökündeki SI-DISCLOSURE.md ile aynı tutulur.
 */
const AI_USE: { name: Tx; note: Tx; url?: string }[] = [
  { name: tx('Kod yazımı', 'Coding'), note: tx('Claude Code (Anthropic) yardımıyla yazıldı', 'Written with the help of Claude Code (Anthropic)') },
  {
    name: tx('Açılış videosu', 'Intro video'),
    note: tx('Görüntü ve ses Higgsfield ile üretildi; videoda görünür filigran var', 'Video and audio generated with Higgsfield; visible watermark in the video'),
  },
  { name: tx('Uzay arka planı', 'Space background'), note: tx('Gemini ile üretildi; görselde filigran var', 'Generated with Gemini; watermarked in the image') },
  { name: tx('Hologramın arka planı', 'Hologram backdrop'), note: tx('Gemini ile üretildi; görselde filigran var', 'Generated with Gemini; watermarked in the image') },
  { name: tx('Spor sayfası antrenör arka planı', 'Sport page trainer backdrop'), note: tx('Gemini ile üretildi; görselde filigran var', 'Generated with Gemini; watermarked in the image') },
  { name: tx('Cupola videoları', 'Cupola videos'), note: tx('Gemini ile üretildi; videolarda görünür "AI GENERATED" filigranı var', 'Generated with Gemini; visible "AI GENERATED" watermark in the videos') },
  { name: tx('Zihinsel sağlık videoları', 'Wellbeing videos'), note: tx('Gemini ile üretildi; videolarda görünür "AI GENERATED" filigranı var', 'Generated with Gemini; visible "AI GENERATED" watermark in the videos') },
  {
    name: tx('Sağlık Asistanı', 'Health Assistant'),
    note: tx('Şu an çevrimdışı ve kural tabanlı; dil modeli bağlantısı sunucuda hazırlanacak (API anahtarı tarayıcıya gitmez)', 'Currently offline and rule-based; the language model connection will be added on the server (the API key never reaches the browser)'),
  },
  { name: tx('Sesli okuma', 'Read aloud'), note: tx('Tarayıcının kendi konuşma sentezi (SI kullanılmaz)', 'The browser\'s built-in speech synthesis (no SI)') },
]

const KIND_GROUP: Record<SourceKind, Tx> = {
  nasa: tx('NASA belgeleri', 'NASA documents'),
  nasaData: tx('NASA verisi', 'NASA data'),
  medical: tx('Tıbbi kaynaklar', 'Medical sources'),
  agency: tx('Diğer uzay ajansları', 'Other space agencies'),
}

/** Doğrulanmış kaynak listesinden (core/sources.ts) Kaynaklar ekranı grupları */
function verifiedGroups(): { group: Tx; items: { name: Tx | string; note: Tx | string; url?: string }[] }[] {
  return (['nasa', 'nasaData', 'medical', 'agency'] as SourceKind[]).map((kind) => ({
    group: KIND_GROUP[kind],
    items: SOURCE_LIST.filter((src) => src.kind === kind).map((src) => ({
      name: src.title,
      note: tx(`${src.org}${src.date ? ` · ${src.date}` : ''} — ${src.use.tr}`, `${src.org}${src.date ? ` · ${src.date}` : ''} — ${src.use.en}`),
      url: src.url,
    })),
  }))
}

/** Kaynaklar penceresindeki bütün gruplar; teslim için References listesi de buradan üretilir (scripts/references.mjs) */
export function sourceGroups(lang: Lang) {
  return resolve([...verifiedGroups(), ...SOURCES_RAW, { group: tx('Süper zeka (SI) kullanımı', 'Use of Super Intelligence (SI)'), items: AI_USE }], lang)
}

export function useContent() {
  const { lang } = useI18n()
  return useMemo(
    () => ({
      crew: resolve(CREW, lang),
      tour: tourFor(lang),
      quickQuestions: resolve(QUICK_RAW, lang),
      sources: sourceGroups(lang),
    }),
    [lang],
  )
}
