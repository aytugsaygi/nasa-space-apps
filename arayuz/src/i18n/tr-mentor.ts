/*
 * Mentör formuna göre eklenenler (Kaynaklar penceresinin sekmeleri, veri içe aktarma, SI etiketi) için Türkçe metinler.
 * tr.ts'ye eklenir; en-mentor.ts bu dosyanın tipine birebir uymak zorundadır.
 *
 * Kural: uydurma sayı ya da fiyat yok. Rakamlar yalnızca doğrulanmış kaynaklardan (core/sources.ts) gelir; maliyet
 * kalemleri rakamsız, nitel yazılır.
 */
export const trMentor = {
  badge: {
    nasa: 'NASA',
    nasaTitle: 'Bu bilginin kaynağı bir NASA belgesi ya da NASA verisi',
  },

  about: {
    tabsLabel: 'Kaynaklar penceresinin bölümleri',
    tabs: { sources: 'Kaynaklar', nasa: 'NASA verisi', feasibility: 'Fizibilite', roadmap: 'Yol haritası' },

    nasa: {
      title: 'NASA verisi nerede karar veriyor?',
      summary: (sources: number, nasaSources: number, nasaIndicators: number, indicators: number, datasets: number) =>
        `${sources} doğrulanmış kaynak (${nasaSources}'i NASA) · ${indicators} göstergenin ${nasaIndicators}'inde en az bir eşik NASA belgesine dayanır · ${datasets} NASA veri seti`,
      thresholds: 'Gösterge eşikleri',
      thresholdsDesc: 'Her göstergenin durum bantları ve dayanakları. Liste gösterge kataloğundan kendiliğinden üretilir.',
      kinds: { nasa: 'NASA belgesi', medical: 'Tıbbi kaynak', rule: 'Health Atlas kuralı' },
      bands: (n: number) => `${n} bant`,
      ruleNote: 'Health Atlas kuralı: kaynakta bu eşik yok; prototip için konuldu, gerçek kullanımda ekip hekimi belirler.',
      decisions: 'Kararlar ve deneyim',
      cols: { what: 'Karar', where: 'Uygulamada', data: 'NASA verisi', source: 'Kaynak' },
      experience: 'Deneyim',
      decision: 'Karar',
    },

    feasibility: {
      lead: 'Health Atlas yeni donanım ya da ücretli yazılım gerektirmez; asıl maliyet geliştirme emeği ile gerçek kullanım için gereken tıbbi yazılım onayı ve uçuş sertifikasyonudur.',
      cols: { item: 'Kalem', today: 'Bugün', real: 'Gerçek kullanımda', basis: 'Dayanak' },
      rows: [
        {
          item: 'Geliştirme',
          today: 'Açık kaynak araçlar (TypeScript, React, three.js, Node.js, SQLite); lisans ücreti yok, maliyet ekip emeği',
          real: 'Bakım ve doğrulama için küçük bir yazılım ekibi',
          basis: 'Yazılım lisansları (Kaynaklar sekmesi)',
        },
        {
          item: 'Donanım',
          today: 'Yeni donanım yok; tarayıcıda çalışır (tablet, dizüstü bilgisayar)',
          real: 'Sensör verisi mevcut giyilebilir cihazlardan gelir (ör. CSA Bio-Monitor)',
          basis: 'CSA Bio-Monitor',
        },
        {
          item: 'Yazılım ve model lisansları',
          today: 'MIT, Apache 2.0, ISC; anatomi modeli CC BY-SA 4.0; antrenör modeli CC0; cihaz modelleri CC BY 3.0 ve CC0',
          real: 'Aynı; ücret yok',
          basis: 'Kaynaklar sekmesi',
        },
        {
          item: 'Veri',
          today: 'NASA DONKI, EPIC ve OSDR herkese açık; DONKI ve EPIC API anahtarı olmadan çekilir, internet yokken gömülü anlık görüntü kullanılır',
          real: 'Aynı',
          basis: 'DONKI, EPIC, OSDR',
        },
        {
          item: 'İşletme',
          today: 'Tek süreçli Node.js sunucusu ve SQLite; internetsiz çalışır; bulut hizmeti kullanılmaz',
          real: 'Yerde tek sunucu ya da araç içindeki bilgisayar',
          basis: 'Mimari (README)',
        },
        {
          item: 'Dil modeli',
          today: 'Bağlı değil; asistan çevrimdışı ve kural tabanlı',
          real: 'İsteğe bağlı, kullanıma göre değişen tek maliyet kalemi; kapatılırsa çevrimdışı cevaplar çalışmaya devam eder',
          basis: 'Fiyat yazılmadı (sağlayıcının resmi fiyat sayfası doğrulanmadı)',
        },
        {
          item: 'Gerçek kullanıma geçiş',
          today: 'Yok (prototip)',
          real: 'Tıbbi yazılım onayı, siber güvenlik denetimi ve uçuş sertifikasyonu; tutarı ajansın sürecine bağlıdır',
          basis: 'Rakam verilmedi',
        },
      ],
      funding: 'Kaynak ve finansman',
      fundingText:
        'NASA İnsan Araştırma Programı uzay uçuşunun sağlık risklerini izliyor ve araştırıyor; Kanada Uzay Ajansı mürettebatın sağlığını ölçen giyilebilir sistemler geliştiriyor. Health Atlas aynı soruna yöneliyor. Bütün bileşenler açık lisanslı olduğu için ajanslar, üniversiteler ve analog görev ekipleri kodu yeniden kullanıp katkı verebilir.',
      sustain: 'Ekonomik sürdürülebilirlik',
      sustainItems: [
        'Eşikler tek dosyada (gösterge kataloğu): ekip hekimi değiştirir, arayüz, analiz, rapor ve asistan aynı dosyadan okur.',
        'NASA verisi değişince yalnızca anlık görüntü yenilenir (npm run nasa:snapshot); kod değişmez.',
        "NASA'nın Dünya'daki analog görevlerinde (HERA habitatı, CHAPEA'da Mars Dune Alpha'da yıl boyu kalan dört kişilik ekip) aynı araç yeniden kullanılabilir.",
      ],
      honesty: 'Bu tablo bir hackathon prototipinin değerlendirmesidir; gerçek maliyet ajansın gereksinimlerine ve onay sürecine göre belirlenir.',
    },

    roadmap: {
      title: 'Sınırlar ve yol haritası',
      desc: 'Bugünkü sınırlar, gerçek kullanımda gerekenler ve uygulamada şimdiden hazır olan kısım.',
      cols: { today: 'Bugün', real: 'Gerçek kullanımda', ready: 'Uygulamada hazır olan' },
      rows: [
        {
          today: 'Mürettebat verisi simülasyondan gelir',
          real: 'Sensör ve tıbbi cihaz verisi içe aktarma katmanından girer',
          ready: 'Veri içe aktarma ekranı (CSV/JSON, sütun eşleme, birim çevirisi); içe aktarılan seri o aralıkta simülasyonun yerine geçer',
        },
        {
          today: 'Kimlik doğrulama yok; rol tarayıcıda seçilir',
          real: 'Sunucuda oturum ve rol denetimi, şifreli depolama',
          ready: 'Bütün işlemler sunucudaki tek RPC katmanından geçer; denetim tek yere eklenir',
        },
        {
          today: 'Asistan çevrimdışı ve kural tabanlı',
          real: 'Dil modeli sunucu üzerinden bağlanır; anahtar tarayıcıya gitmez',
          ready: 'Kriz kuralı ve eylem düğmeleri dil modelinden bağımsız çalışır ve testlidir',
        },
        {
          today: 'Bazı eşikler Health Atlas kuralıdır (kaynakta eşik yok); SpO₂ ve kan şekeri genel klinik eşiklerdir',
          real: 'Eşikleri ekip hekimi belirler',
          ready: 'Eşikler tek dosyada; her bandın dayanağı yazılı ve "NASA verisi" sekmesinde görünür',
        },
        {
          today: 'Uçuş hekimiyle gecikmeli iletişim simüle edilir',
          real: 'Gerçek iletişim hattı (ör. gecikmeye dayanıklı ağ)',
          ready: 'Gecikme ve kesinti mantığı motorda; mesajlar kuyrukta bekler',
        },
        {
          today: 'Tıbbi tanı koymaz',
          real: 'Karar destek aracı olarak onay süreci',
          ready: 'Ekranlarda ve raporda "tanı koymaz" notu',
        },
        {
          today: 'Testler: birim ve bileşen (Vitest), uçtan uca ve erişilebilirlik (Playwright, axe)',
          real: 'Bağımsız klinik doğrulama',
          ready: 'Otomatik test takımı',
        },
      ],
      tests: (unit: number, e2e: number) => `${unit} birim ve bileşen testi, ${e2e} uçtan uca test (son çalıştırmada hepsi geçti)`,
      steps: 'Sonraki üç adım',
      stepItems: [
        "Analog görevde pilot: NASA'nın HERA ya da CHAPEA gibi yalıtım çalışmalarında gerçek ekiple deneme.",
        'Gerçek sensör verisiyle doğrulama ve eşiklerin ekip hekimiyle belirlenmesi.',
        'Güvenlik denetimi ve tıbbi yazılım onayı.',
      ],
    },
  },

  importer: {
    open: 'Veri içe aktar',
    openTip: 'CSV ya da JSON dosyasından ölçüm yükle',
    title: 'Veri içe aktar',
    subtitle: (name: string) => `${name} için ölçüm dosyası yükle. İçe aktarılan değerler kapsadığı aralıkta simülasyonun yerine geçer.`,
    close: 'Kapat',
    steps: ['Dosya', 'Eşleme', 'Önizleme'],
    stepOf: (n: number, total: number, name: string) => `Adım ${n}/${total}: ${name}`,
    choose: 'Dosya seç',
    drop: 'Dosyayı buraya bırak ya da seç (.csv, .json; en fazla 2 MB)',
    sample: 'Örnek dosyalar',
    sampleCsv: 'Nabız örneği (CSV, kurgusal)',
    sampleJson: 'Kan şekeri örneği (JSON, mmol/L, kurgusal)',
    readError: 'Dosya okunamadı.',
    tooBig: 'Dosya 2 MB\'tan büyük.',
    badType: 'Yalnızca .csv ve .json dosyaları yüklenebilir.',
    parseError: 'Dosyada okunabilir satır bulunamadı. CSV\'de ilk satır sütun adları olmalı; JSON bir nesne listesi olmalı.',
    loaded: (name: string, rows: number) => `${name} · ${rows} satır`,
    indicator: 'Gösterge',
    timeColumn: 'Zaman sütunu',
    valueColumn: 'Değer sütunu',
    value2Column: 'İkinci değer sütunu (küçük tansiyon)',
    unit: 'Dosyadaki birim',
    unitSame: (u: string) => `Katalog birimi (${u})`,
    unitNames: { F: '°F (Fahrenheit)', C: '°C', 'mmol/L': 'mmol/L', 'mg/dL': 'mg/dL', min: 'dakika', h: 'saat' } as Record<string, string>,
    dataset: 'Veri seti adı',
    datasetHint: 'Kaynaklar penceresinde bu adla görünür',
    provider: 'Kaynak (kurum)',
    url: 'Bağlantı (isteğe bağlı)',
    astronaut: (name: string) => `Astronot: ${name}`,
    previewTitle: 'İlk 10 satır',
    colTime: 'Zaman',
    colRaw: 'Dosyadaki değer',
    colValue: 'İçe aktarılacak',
    valid: (n: number) => `${n} geçerli satır`,
    invalid: (n: number) => `${n} satır atlanacak`,
    reasons: { time: 'zaman okunamadı', value: 'değer geçersiz ya da aralık dışı' } as Record<string, string>,
    row: (n: number) => `${n}. satır`,
    range: (from: string, to: string) => `Kapsanan aralık: ${from} – ${to}`,
    back: 'Geri',
    next: 'Devam',
    submit: 'İçe aktar',
    importing: 'İçe aktarılıyor',
    done: (n: number, skipped: number) => (skipped ? `${n} kayıt içe aktarıldı (${skipped} satır atlandı)` : `${n} kayıt içe aktarıldı`),
    failed: 'İçe aktarılamadı: geçerli satır yok ya da biçim okunamadı.',
    readOnly: 'İçe aktarma için bir astronotun verisi açık olmalı.',
    by: { astronaut: 'astronot', surgeon: 'uçuş hekimi' } as Record<string, string>,
  },
}
