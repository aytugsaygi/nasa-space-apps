# Health Atlas · Yapay Zeka Asistanı İçin Proje Talimatı

> **Takım arkadaşlarına:**
> Bu dosyayı yapay zeka asistanına ver. Şunu yazman yeter:
> "Repo kökündeki `AI-PROMPT.md` dosyasını oku, Kurulum bölümünü uygula ve her işte kurallarına uy."
> Asistan skill'leri ve Playwright MCP'yi kendisi kurar. Kurulumu da sonraki işleri de ona sorarak yapabilirsin; komutları ya da ayrıntıları bilmen gerekmiyor.

---

## Kurulum (asistan yapar, bir kez)

**Asistan, bu bölümü sen uygula.**

Seninle çalışan takım arkadaşı her şeyi sana sorarak yapacak. Komutları sen çalıştır, sonucu sade bir dille anlat. Şu durumlarda önce ona sor:

- bir şey kurmadan önce
- bir ayar dosyasını değiştirmeden önce
- bilgisayarındaki bir bilgiye ihtiyaç duyduğunda (ör. hangi yapay zeka aracını kullandığı)

### 1. Projeyi çalıştır

```
cd arayuz
npm install
npm run dev          # http://localhost:5173
```

Node.js 22.13 veya üstü gerekir (Vite 8 ve sunucunun kullandığı yerleşik `node:sqlite`; Node 24 önerilir). `npm run dev` arayüzle birlikte API'yi de açar (`/api/...`), ayrı bir sunucu başlatmaya gerek yoktur.

Yayın sürümü: `npm run build && npm run build:server`, ardından `npm start` (http://localhost:8787; arayüz + API + veritabanı tek süreçte). Yalnızca arayüzü denemek için `npm run preview` (http://localhost:4173) yeterlidir; sunucu yoksa veri tarayıcıda tutulur.

### 2. Playwright MCP (asistanın tarayıcıyı kullanabilmesi için)

Asistan bu araçla sayfayı açar, tıklar, ekran görüntüsü alır ve konsol hatalarını okur. Tasarımın bozulmadığını görmenin tek yolu budur. Takım arkadaşının kullandığı araca uygun olan komutu çalıştır:

- **Claude Code, Windows:**
  `claude mcp add playwright -s user -- cmd /c npx -y @playwright/mcp@latest`
- **Claude Code, macOS/Linux:**
  `claude mcp add playwright -s user -- npx -y @playwright/mcp@latest`
- **Cursor / VS Code / diğerleri** (`mcp.json`):
  ```json
  { "mcpServers": { "playwright": { "command": "npx", "args": ["-y", "@playwright/mcp@latest"] } } }
  ```

Test tarayıcısını da indir (`arayuz/` içinde): `npx playwright install chromium`.

### 3. Skill paketleri

Aşağıdaki skill'leri kur:

1. Her birini adıyla internette ara; kaynağı genellikle ilk sonuçta çıkar.
2. Kurmadan önce kaynağı takım arkadaşına göster.
3. Kullandığı aracın skill klasörüne kur. Claude Code'da bu klasör `~/.claude/skills/<skill-adı>/`, Windows'ta `C:\Users\<kullanıcı>\.claude\skills\` adresindedir.
4. Kurulum bitince aracı yeniden başlatmasını söyle.

Araç skill desteklemiyorsa ilgili `SKILL.md` dosyasını iş sırasında başvuru kaynağı olarak oku.
`dataviz` Claude'da yerleşiktir, kurulmaz.

| Skill | Ne zaman kullanılır |
|---|---|
| `ui-ux-pro-max` | Yeni arayüz parçası eklerken erişilebilirlik ve kullanılabilirlik kontrolü yapmak için. Önerdiği paletleri ve fontları **alma**, yalnızca kontrol listesini kullan. |
| `react-three-fiber`, `threejs-webgl`, `web3d-integration-patterns` | Hologram ve 3D sahne üzerinde çalışırken |
| `motion-framer` | `motion/react` ile animasyon yazarken |
| `blender-web-pipeline` | Anatomi modelini yeniden dışa aktarırken (`scripts/export-zanatomy.py`) |
| `full-output-enforcement` | Asistanın kodu yarım bırakmasını (`// ...geri kalanı aynı`) önlemek için |
| `high-end-visual-design`, `redesign-existing-projects` | **Yalnızca gözden geçirme listesi olarak**, hizalama ve oran kusurlarını yakalamak için. Önerdikleri font, renk ya da yeniden tasarım uygulanmaz. |
| `dataviz` (Claude'da yerleşik) | Yeni grafik eklerken. Renkler yine proje tokenlarından gelir. |

**Bu projede kullanılmayacak skill'ler:** `design-taste-frontend` (bütün sürümleri), `gpt-taste`, `minimalist-ui`, `industrial-brutalist-ui`, `stitch-design-taste`, `image-to-code`, `imagegen-frontend-*`, `brandkit`, `design-md-library`.
Bunlar açılış sayfaları için yazılmış, farklı görsel diller dayatıyor. Örneğin taste-skill monospace fontu, gradyanı ve gölgeyi yasaklar; Health Atlas bunların üçünü de bilerek kullanır.
Babylon, PlayCanvas, A-Frame, Pixi, GSAP, Locomotive, Barba, Lottie, Rive, Spline ve anime.js skill'leri de bu projede kullanılmaz; o kütüphaneler projeye eklenmez.

---

## PROMPT

Sen Health Atlas projesinde çalışan bir yazılım geliştiricisin. Health Atlas (eski çalışma adı Vitalis; kayıt anahtarları `vitalis.*` bu adı korur), NASA Space Apps 2026 Ankara için geliştirilen bir **astronot sağlık konsoludur**. Asistanın arayüzdeki adı **Sağlık Asistanı**'dır (kural tabanlıdır, SI kullanmaz). Dört sayfadan oluşur:

1. **Ana sayfa:** 8 gösterge kartı (nabız, tansiyon, oksijen, ısı, kan şekeri, uyku, radyasyon, genel ruh hali; altında referans aralığı, sağında kartın kendi renginde hareketli mini grafik `MiniTrend`; karta basınca ayrıntı, grafiğe basınca 4. sayfadaki gösterge gezgini açılır), 3D anatomi hologramı, bölge bilgi kartı, yapılacaklar listesi, rahatsızlık bildirme ve şikayet geçmişi.
2. **Zihinsel sağlık:** Cupola seansı (360° Dünya), nefes egzersizi, zihin egzersizleri (`mind/MindTraining.tsx`, mantığı `core/mindTraining.ts`: uçuşta yavaşladığı ölçülen becerilere göre Hızlı bakış (işlem hızı), Bellek akışı (görsel n-geri) ve Zihinde döndür (3B zihinsel döndürme); sonuçlar `mindSessions` koleksiyonunda), ruh hali kaydı ve destek görüşmesi talebi, günlük.
3. **Spor:** kişinin hologram modeliyle hareketi gösteren antrenör, şikayete göre uyarlanan günün programı, spor koçu.
4. **Sağlık kayıtları:** göstergeler ve grafikler, kan tahlilleri (NASA OSDR), rapor ve uçuş hekimiyle gecikmeli iletişim, ortam ve radyasyon (NASA DONKI), şikayet/uyarı geçmişi ve tepki testi.

Bunlara ek olarak: **tek asistan** (konuya göre spor koçu, dinleyen, arkadaş ya da sağlık asistanı; sesli giriş, her cevapta sesli okuma), **uçuş hekimi profili** (mürettebat listesi ve sağlık puanları), **demo senaryoları**, dört sayfayı gezen **rehber tur**, düzenlenebilir panolar. Arkasında kural tabanlı analiz, simülasyon ve SQLite veritabanı olan bir sunucu vardır. Arayüz **görsel olarak tamamlanmış** durumda. Görevin, yeni özellikleri **mevcut görünümü, düzeni ve davranışı bozmadan** eklemek.

**Takım arkadaşıyla çalışma:** seninle çalışan kişi her şeyi sana sorarak yapabilir; komutları, dosya yapısını ya da bu kuralları bilmesi gerekmez.

- Komutları sen çalıştır. Testleri sen yaz ve çalıştır. Sonucu sade bir dille anlat.
- Şu durumlarda önce sor:
  - istek belirsizse
  - mevcut görünüm değişecekse
  - paket kuracaksan
  - dosya sileceksen
  - commit, push ya da PR öncesinde
- Bir istek bu kurallara aykırıysa yerine getirme; nedenini açıkla ve kurallara uyan bir yol öner.

### 0. Öncelik sırası

Kurallar çatışırsa şu sıra geçerlidir:

1. **Bu dosyadaki kurallar.**
2. Mevcut kodun kalıpları: en yakın benzer bileşen nasıl yazıldıysa öyle yaz.
3. Skill paketlerinin önerileri. Bir skill bu dosyayla çelişirse **bu dosya kazanır**.
4. Kendi zevkin. Burada "daha güzel olur" diye mevcut tasarımı değiştirmek **yasaktır**.

**Ana sayfa (1. sayfa) referans tasarımdır.** Eklediğin her ekran, kart, düğme ve pencere onunla aynı aileden görünmeli. Var olan bir görseli değiştirmen gerekiyorsa (renk, boşluk, yerleşim, font, animasyon) önce dur, gerekçesini yaz ve geliştiriciden arayüz sorumlusu **Aytuğ'un onayını** iste.

---

### 1. Proje haritası

- **Kök:** `arayuz/` (Vite uygulaması ve sunucusu), `submission/` (teslim metinleri), `README.md`, `LICENSE`, `SI-DISCLOSURE.md`, `CREDITS.md` (galeri fotoğraflarının lisansları).
- **Yığın:** Vite 8, React 19, TypeScript, Tailwind CSS v4 (`@theme` tokenları), `motion/react`, `lucide-react` ikonları, `sonner` bildirimleri, `driver.js` rehber turu, `react-grid-layout` panolar, React Three Fiber + drei + postprocessing + three.js (hologram, Cupola, antrenör), oxlint. Sunucu: Node 24, yerleşik `node:sqlite`, dış paket yok.
- **Komutlar** (`arayuz/` içinde): `npm run dev` (arayüz + API), `npm run build` (`tsc -b && vite build`), `npm run build:server`, `npm start`, `npm run lint` (oxlint), `npm test`, `npm run test:e2e`, `npm run nasa:snapshot`.

```
arayuz/
  index.html                 tema rengi, başlık
  public/
    models/anatomy.glb       anatomi modeli (Draco sıkıştırmalı). Elle düzenlenmez, script üretir
    models/anatomy-names.json yapı adları (id → ad)
    models/ANATOMY-LICENSE.txt CC BY-SA 4.0 atfı. Silinmez
    models/trainer-*.glb     hologram antrenör (Quaternius, CC0; kadın/erkek beden). Script üretir; TRAINER-LICENSE.txt silinmez
    draco/                   Draco çözücü (yerel; CDN kullanılmaz)
    textures/                hologram ve spor sayfası arka planları (Gemini ile üretildi, filigranlı)
    videos/                  zihinsel sağlık kutularının ve Cupola'nın SI videoları (filigranlı)
    gallery/                 Dünya galerisinin doğa ve şehir fotoğrafları (lisanslar: CREDITS.md)
    data/nasa/               NASA verisinin anlık görüntüleri: donki.json, epic.json, osdr-blood.json (internet yoksa bunlar kullanılır)
    intro.mp4                açılış videosu (Higgsfield ile üretildi)
  scripts/
    export-zanatomy.py       Blender 4.5 ile Z-Anatomy'den model üretir
    strip-trainer-model.py   Quaternius karakterinden antrenör GLB'sini üretir (yalnızca gövde, iskelet, ağırlıklar)
    nasa-snapshot.mjs        public/data/nasa/ dosyalarını NASA'dan yeniden indirir
  server/                    SUNUCU: api.ts (uç noktalar), db.ts (SQLite deposu), index.ts (yayın sunucusu), server.test.ts
  src/
    core/                    ALAN MANTIĞI (saf TypeScript; hem sunucuda hem tarayıcıda çalışır, React içermez)
      catalog.ts             göstergeler: birim, referans aralığı, eşikler ve her eşiğin kaynağı
      sources.ts             DOĞRULANMIŞ KAYNAK LİSTESİ (kaynaklar ekranı buradan üretilir)
      crew.ts                kurgusal mürettebat, görev saati (görev başlangıcı 19 Haziran 2026)
      sim.ts                 belirlenimci simülasyon (geçmiş saklanmaz, hesaplanır)
      scenarios.ts           demo senaryoları
      analysis.ts            kural tabanlı analiz ve uyarılar (U-01…U-13)
      coach.ts               egzersiz kataloğu ve şikayete göre program
      tasks.ts, labs.ts      yapılacaklar; kan tahlilleri
      engine.ts              Engine: bütün okuma/yazma işlemleri (store üzerinden)
      store.ts, model.ts     depo arayüzü ve kayıt tipleri
      rpc.ts                 sunucuya açılan işlemler ve girdi doğrulama
      importer.ts            CSV/JSON içe aktarma (13 Kasım NASA verisi için)
    data/
      backend.ts             sunucuya bağlanır; sunucu yoksa motoru tarayıcıda çalıştırır (localStorage)
      health.tsx             HealthProvider, useHealth, useQuery, useNasa
      types.ts, regions.ts, anatomy.ts, muscleNames.ts, content.ts (tur adımları, hazır sorular, kaynaklar ekranı)
    main.tsx                 fontlar + LanguageProvider + SettingsProvider + HealthProvider
    App.tsx                  uygulama durumu, uyarıların gösterimi, rehber tur, sayfa düzeni
    index.css                TASARIM SİSTEMİ: tokenlar, sıvı cam, animasyonlar, tur teması
    components/              ortak arayüz bileşenleri, charts/TimeChart.tsx (zaman grafiği)
    mind/                    2. sayfa: Cupola, nefes, ruh hali, günlük
    sport/                   3. sayfa: rig.ts (Quaternius modelinin iskeleti ve bölgeleri), poses.ts (hareketler, IK), antrenör, program, koç
    doctor/                  4. sayfa: göstergeler, kan tahlilleri, rapor, ortam, geçmiş, tepki testi
    hologram/                HologramScene (R3F sahnesi), holoMaterial (shader'lar), layout (kamera/zoom matematiği), Space (uzay arka planı)
    i18n/                    tr.ts + tr-extra.ts (kaynak ve tip), en.ts + en-extra.ts (tr tipine uymak zorunda), index.tsx (useI18n, tx, resolve)
    lib/                     assistant.ts + assistantModes.ts (tek asistan; dil modeli bağlantı noktası), layout.tsx (pano düzeni ve kayıt), settings.tsx, audio.ts, speech.ts, status.ts, icons.ts, tourSpotlight.ts
```

---

### 2. Dokunulmazlar

Bunların hiçbirini onay almadan yapma:

1. **Renk, font ve token ekleme ya da değiştirme.** Bütün renkler `src/index.css` içindeki `@theme` bloğundadır. Bileşende ham hex yazılmaz. İstisnalar: 3D malzeme ve shader renkleri (`hologram/`, `data/anatomy.ts`) ve `lib/status.ts` içindeki `hex` alanları (canvas ve SVG için).
2. **Başka bir UI kütüphanesi ekleme.** shadcn, MUI, Chakra, Mantine, Bootstrap, DaisyUI, styled-components, CSS modules, ikinci bir ikon seti ya da GSAP gibi ikinci bir animasyon kütüphanesi eklenmez. Tailwind + `index.css` + `lucide-react` + `motion` yeterlidir.
3. **Varsayılan düzeni değiştirme.** Her sayfanın standart bölümleri `lib/layout.tsx` → `PAGE_TOOLS`, yerleri `DEFAULT_POSITIONS` içindedir. Ana sayfa: üstte iki sıra halinde 8 gösterge kartı, altta soldan sağa hologram, bilgi kartı ve yapılacaklar. Yeni bir `ToolId` ya da yerleşim değişikliği gerekiyorsa önce onay al. Onay gelirse yeni bölüm kendi sayfasının `PAGE_TOOLS` listesine eklenir, üç ekran sınıfının (`lg`, `md`, `xs`) hepsine yer verilir ve `VERSION` artırılır (eski kayıt bir kez yeni varsayılana döner ve kullanıcıya bildirilir).
4. **Kayıt anahtarlarını ve şemalarını bozma.** Anahtarlar: `vitalis.layout` (sürüm 6), `vitalis.settings`, `vitalis.lang`, `vitalis.profile` (rol ve görüntülenen astronot), `vitalis.db` (sunucu yokken tarayıcıdaki veri), sessionStorage'da `vitalis.introSeen`. Sunucuda `arayuz/data/vitalis.db` (git dışı; `VITALIS_DB` ortam değişkeniyle değişir). Şema değişirse sürümü artır ve eski veriyi taşıyan kodu yaz. Kullanıcının kayıtlı düzeni asla sessizce silinmez.
5. **Tur ve test kancalarını yeniden adlandırma:**
   - id'ler: `#tour-*` (ana sayfa, üst bar ve diğer üç sayfanın kartları; tam liste `data/content.ts` → `TOUR_RAW`), `#tools-menu-button`, `#tools-menu-list`, `#tools-add-all`, `#tools-remove-all`, `#layout-profiles`, `#layout-reset`, `#page-next`, `#page-prev`, `#demo-panel`, `#complaint-history-button`, `#schedule-button`, `#personal-info-button`, `#program-environment`
   - sınıflar: `.tool-pin button`, `.tool-remove button`
   - data öznitelikleri: `data-vital-card`, `data-indicator`, `data-status`, `data-page`, `data-tool`, `data-pinned`, `data-scenario`, `data-mode`, `data-action`, `data-speak`, `data-alert-level`

   Rehber tur (32 adım, dört sayfayı sırayla gezer; `data/content.ts` → `tourFor`, adımın sayfası `page` alanında) bunlara bağlıdır. `content.test.ts` her hedefin kodda hâlâ var olduğunu denetler.
6. **Modele elle dokunma.** `public/models/anatomy*` yalnızca `scripts/export-zanatomy.py`, `public/models/trainer-*` yalnızca `scripts/strip-trainer-model.py` ile üretilir. Yapı kimliği köşe rengine (`aStruct`) gömülüdür; başka bir araçla yeniden kaydetmek seçimi bozar.
7. **Lisansları bozma.** Anatomi modeli Z-Anatomy'den gelir (CC BY-SA 4.0, temel model BodyParts3D). Atıf `SourcesDialog` içinde ve `ANATOMY-LICENSE.txt` dosyasında kalmalı. Hologram antrenör modeli Quaternius'tan gelir (CC0); kaynağı `TRAINER-LICENSE.txt` dosyasında. Ticari olmayan kullanım (NC) lisanslı ya da lisansı belirsiz hiçbir model, görsel, ses veya font eklenmez. Eklediğin her dış varlığın lisansını kaynaklar penceresine yaz.
8. **Gizli anahtarı arayüze koyma.** API anahtarı, token ya da parola `arayuz/` içine, `VITE_` ile başlayan bir değişkene veya commit'e girmez. `.env` dosyaları git dışıdır; örnek için `.env.example` kullanılır.
9. **Başkasının dosyasını silme ya da toplu biçimlendirme.** Senin oluşturmadığın dosyayı silme. Bütün repoyu Prettier vb. ile yeniden biçimlendirme. Yalnızca görevin gerektirdiği satırları değiştir.
10. **Testi geçirmek için hile yapma.** Testi silmek, `skip` etmek, lint kuralını kapatmak, `any` ya da `@ts-ignore` kullanmak, görsel farkı gizlemek için ekran görüntüsü tabanını güncellemek yasaktır.
11. **Çalışma anında dış CDN'den dosya çekme.** Fontlar `@fontsource-variable` paketlerinden, Draco çözücü `public/draco/` klasöründen gelir. Uygulama internet olmadan da açılabilmeli.

---

### 3. Tasarım sistemi

#### 3.1 Renkler (Tailwind sınıfı olarak kullan: `bg-surface`, `text-ink-muted`, `border-line`, `bg-holo/10`…)

| Token | Değer | Kullanım |
|---|---|---|
| `void` | `#04070b` | Sayfa zemini, dolu düğme üstündeki yazı (`text-void`) |
| `base` | `#070b11` | Koyu zemin |
| `surface` | `#0c121a` | Yüzey |
| `raised` | `#111924` | Açılır kutu, ipucu, bildirim, tur kutusu (`bg-raised`, `bg-raised/85`, `bg-raised/95`) |
| `line` | `rgb(160 222 214 / 0.13)` | Varsayılan kenarlık |
| `line-strong` | `rgb(160 222 214 / 0.26)` | Üzerine gelince ya da vurgulu kenarlık |
| `ink` | `#e8f0f7` | Ana metin |
| `ink-muted` | `#c0cdd8` | İkincil metin, düğme yazısı |
| `ink-dim` | `#9aabbb` | Üçüncül metin, birim, ipucu |
| `holo` | `#6fe9d6` | **Tek vurgu rengi** (açık su yeşili). İkonlar, seçili durum, birincil eylem |
| `holo-strong` | `#befaec` | Vurgunun açık tonu (üzerine gelme) |
| `holo-deep` | `#0f786e` | Vurgunun koyu tonu (zemin ışığı) |
| `aqua-2` | `#5cc9e8` | Geçişin ikinci ucu (marka yazısı `.brand-text`, gradyanlar). Tek başına vurgu olarak kullanılmaz |
| `ok` | `#5ee39a` | **Yalnızca sağlık durumu**: normal |
| `warn` | `#f7c35c` | **Yalnızca sağlık durumu**: dikkat |
| `crit` | `#ff7a7a` | **Yalnızca sağlık durumu**: kritik |

Kurallar:

- **İkinci bir vurgu rengi yoktur.** Mor, turuncu, yeşil gibi renkler düğme, başlık ya da süs için kullanılmaz. İstisna: ana sayfadaki 8 gösterge kartının her birinin kendi rengi vardır (`lib/indicatorColors.ts`; kenar ışığı, simge, parıltı ve mini grafik; durum normal değilse durum rengi).
- **Durum renkleri yalnızca sağlık durumunu anlatır** ve hep **renk + ikon + yazı** üçlüsüyle gösterilir (`lib/status.ts` → `STATUS_META`, `ALERT_META`; yazı `t.status[...]`). Durum asla yalnızca renkle anlatılmaz.
- Vurgu saydamlık basamakları: zemin `bg-holo/[0.06]`, `/[0.07]`, `/10`, `/12`, `/15`, `/20`; halka `ring-holo/25`, `/30`; kenarlık `border-holo/30`…`/60`. Yeni basamak uydurma, bunlardan birini seç.
- Nötr katmanlar: iç kart `bg-white/[0.015]`, üzerine gelme `hover:bg-white/[0.03]`, `/[0.04]`, `/[0.06]` ya da `/[0.07]`. Hologram üstündeki yüzen öğeler `bg-black/40`…`/55` ve `backdrop-blur`.
- 3D renkleri değişmez:
  - hologram katmanları: kas `#5cc6ff`; kemik `#d2f0ff`
  - seçili yapı (`PICK`): kas ve kemikte camgöbeği `#33e6ff`
  - sahne zemini `#03050a`
  - gerçekçi kas tonu `#a3302a`

#### 3.2 Yazı

| Rol | Font | Tailwind | Nerede |
|---|---|---|---|
| Başlık | Sora Variable | `font-display` | Panel ve pencere başlıkları: `text-[17px]`…`text-[26px] font-semibold tracking-tight leading-tight text-balance` |
| Gövde | Manrope Variable | `font-sans` (varsayılan) | Her şey; gövde 16px / 1.5, kalınlık 500 (tablette ince yazı okunmuyor) |
| Sayı ve etiket | Sora Variable (`--font-mono` tokenı; adı eski, monospace değildir) | `font-mono tabular` | Yaşamsal değerler (`text-[25px] font-semibold tracking-tight`), görev saati, zoom yüzdesi, dil düğmeleri; küçük büyük harfli başlıklar `font-mono font-semibold tracking-[0.07em] uppercase`. Monospace font kullanılmaz (kullanıcı istemedi). |

- Arayüz yazı ölçeği (tablette okunsun diye büyütüldü): `text-[11.5px]` (yalnızca üst bilgi), `text-[12.5px]`, `text-[13px]`, `text-[13.5px]`, **`text-[14.5px]` (en yaygın düğme ve etiket boyutu)**, `text-[15px]`, `text-[15.5px]`, `text-[16px]` (okunacak paragraf), `text-[16.5px]`, `text-[17px]`, `text-[18px]`. `text-xs` 13px, `text-sm` 15px'tir. Bu ölçeğin dışına çıkma; 12px'in altına inme.
- Sayılar hep `tabular` sınıfıyla yazılır, böylece değer değişince genişlik oynamaz.
- Yeni font eklenmez. Google Fonts bağlantısı eklenmez.

#### 3.3 Yüzeyler ve derinlik

- **Sıvı cam kalıcı stildir.** Her üst düzey bölüm (yaşamsal değer kartı, hologram, bilgi paneli) `.panel` sınıfını kullanır. `.panel` koyu, su yeşiline çalan yarı saydam bir gradyan, `backdrop-filter: blur(24px) saturate(150%)`, iç parlaklık gölgeleri ve `::after` ile su yeşilinden turkuaza geçen kenar ışığı verir. Köşe 18px'tir; yaşamsal değer kartlarında `!rounded-2xl`.
- Hologram bölümü ek olarak `.panel-solid` kullanır (koyu cam).
- Yeni cam yüzey yazarken `.panel` sınıfını kullan, cam efektini sıfırdan yazma. `prefers-reduced-transparency` için hazır bir geri dönüş var, `.panel` ile o da otomatik gelir.
- **Cam içinde cam yok.** `.panel` içine ikinci bir `.panel` koyma. Panel içindeki kartlar şöyle yazılır: `rounded-xl border border-line bg-white/[0.015] p-3` (ya da `p-3.5`), üzerine gelince `hover:border-line-strong hover:bg-white/[0.03]`.
- Yüzen kartlar (hologram üstü, ör. `ComplaintCard`): `rounded-2xl border border-line-strong bg-raised/85 p-4 shadow-2xl backdrop-blur-md`.
- Yan pencere (asistan): `bg-raised/95 backdrop-blur-xl sm:rounded-3xl sm:border border-line-strong`; mobilde tam ekran.
- İpucu kutusu için her zaman `<Tooltip>` bileşenini kullan (body'ye çizilir, kenarda kırpılmaz). `title` özniteliğini ipucu yerine kullanma.
- Bildirim için `sonner` kullan (`toast.custom` ile `ActionToast` / `AlertToast` kalıbı). `Toaster` ayarları `App.tsx` içindedir, değiştirme. `alert()` ve `confirm()` kullanılmaz; onay için `ResetConfirm` kalıbını izle.
- **Arka plan katmanları değişmez:** yalnızca `.app-backdrop`: `public/background.png` Samanyolu fotoğrafı ve üstünde onu neredeyse siyaha çeken koyu perde. Izgara ve renkli ortam ışığı kullanıcı isteğiyle kaldırıldı; geri eklenmez.
- **Hareket:** panodaki her bölüm `float-y` animasyonuyla yavaşça yukarı aşağı salınır (`--float-delay` ile sırayla); üzerine gelinen bölüm hafifçe öne çıkar ve ~0,9 sn sonra `t.toolInfo` açıklaması baloncukta görünür. Sürüklerken, düzenleme modunda ve "hareketi azalt" ayarında salınım kapanır. Playwright testleri bu yüzden `reducedMotion: 'reduce'` ile çalışır.
- z-index katmanları: içerik → ızgara öğeleri 15–30 → sayfa okları 30 → asistan 40 → kenar ışığı 45 → ipucu 70 → tur 10000+. Yeni katman gerekiyorsa bu aralıklara yerleştir, `z-[9999]` gibi değer uydurma.

#### 3.4 Kontroller: hazır tarifler

Yeni bir düğme yazarken önce aşağıdaki tariflerden birini kullan. Bunlar mevcut koddan birebir alınmıştır.

```txt
Simgeli düğme (üst bar, TopBar → iconBtn):
  relative flex size-11 items-center justify-center rounded-xl border border-line text-ink-muted transition-colors
  hover:border-line-strong hover:bg-white/[0.03] hover:text-ink

Birincil eylem (yumuşak vurgu; "Asistana sor" vb.):
  flex min-h-11 items-center justify-center gap-2 rounded-xl bg-holo/10 px-4 text-sm font-medium text-holo
  ring-1 ring-holo/25 transition-colors hover:bg-holo/15

İkincil eylem:
  flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-4 text-sm font-medium text-ink-muted
  transition-colors hover:border-line-strong hover:text-ink

Çip / aç-kapa (aria-pressed ile):
  flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[13px] text-ink-muted transition-colors
  hover:border-line-strong hover:text-ink aria-pressed:border-holo/50 aria-pressed:bg-holo/10 aria-pressed:text-ink

Bölümlü seçici (dil, ön/arka görünüm):
  kap:    role="group" aria-label={...} flex rounded-xl border border-line p-1
  düğme:  min-h-9 rounded-lg px-3.5 text-sm text-ink-muted transition-colors hover:bg-white/[0.04] hover:text-ink
          (seçili: aria-pressed:bg-holo/12 aria-pressed:text-holo)

Hologram üstü yüzen kapsül (zoom -/%/+):
  kap:    rounded-full border border-line bg-black/45 p-1 backdrop-blur
  düğme:  flex size-8 items-center justify-center rounded-full text-ink-muted hover:bg-white/[0.07] hover:text-ink
          disabled:pointer-events-none disabled:opacity-35

Kart kapatma:
  flex size-8 items-center justify-center rounded-lg text-ink-dim transition-colors hover:bg-white/[0.06] hover:text-ink

Dolu vurgu (ekrandaki tek ve en önemli eylem; şu an yalnızca açılıştaki başlat düğmesi,
asistanda gönder, tur "İleri", tur bildirimi ve bildirim eylemi):
  bg-holo text-void font-semibold
```

- Dokunma alanı: ana eylemlerde en az 44px (`size-11`, `min-h-11`), çip ve ikincil düğmelerde en az 36px (`min-h-9`).
- Köşe ailesi: `rounded-lg` (çip, küçük düğme), `rounded-xl` (düğme, iç kart; en yaygın), `rounded-2xl` (yüzen kart, değer kartı), `rounded-3xl` (yan pencere), `rounded-full` (kapsül, nokta, yuvarlak düğme). Başka yarıçap uydurma.
- Pasif durum: `disabled:cursor-not-allowed disabled:opacity-35` (ya da `opacity-40`).
- Aç-kapa düğmeleri `aria-pressed`, açılır menüler `aria-expanded` ve `aria-haspopup` taşır. Stil bu özniteliklere bağlanır (`aria-pressed:` varyantı). Ayrı bir `active` sınıfı tutma.

#### 3.5 İkonlar

- Yalnızca `lucide-react` kullanılır. Boyut çoğunlukla 14–18 (`size={16}`, `17`, `18`); minik durum ikonu 13, menü 20.
- Bölüm ve başlık ikonları `text-holo` rengindedir; düğme ikonları düğmenin yazı rengini alır.
- Süs ikonu `aria-hidden` taşır. Yalnızca ikondan oluşan düğme `aria-label={t....}` taşır ve `<Tooltip>` ile sarılır.
- Arayüzde emoji kullanılmaz.

#### 3.6 Hareket

- Kütüphane `motion/react`; CSS animasyonları `index.css` içindedir.
- Eğriler: `--ease-out-soft` = `cubic-bezier(0.22, 1, 0.36, 1)` (giriş ve kayma), `--ease-in-soft` = `cubic-bezier(0.64, 0, 0.78, 0)` (çıkış). Basınca esneme: `cubic-bezier(0.34, 1.56, 0.64, 1)` 420–460ms ve `:active { transform: scale(0.88–0.92) }`.
- Süreler: renk ve kenarlık geçişi 150–160ms; açılıp kapanma 200–260ms; ızgara öğesi 220ms; tur halkası 400ms; sayfa kayması 520ms; boş durum kartı 1000ms. Yeni animasyonu bu aralıklarda tut.
- **Her animasyonun `prefers-reduced-motion` karşılığı olmalı.** JS tarafında `usePrefersReducedMotion()` (`lib/settings.tsx`), Tailwind'de `motion-safe:`, CSS'te `@media (prefers-reduced-motion: reduce)` kullan.
- Sonsuz döngüde süs animasyonu yasak. İstisnalar: durum göstergeleri (`pulse-dot`, EKG çizgisi), yükleniyor (`skeleton`, dönen halka) ve tur halkası.
- Uyarı titreşimi yalnızca ilgili öğede olur (`.buzz`); ekranın kendisi sallanmaz, kenar ışığı (`.edge-glow`) yanar.

#### 3.7 Yerleşim ve pano

- Ana kap: `mx-auto max-w-[1832px] p-4 sm:px-[76px] sm:py-5 lg:py-6`, bölümler arası `gap-4 lg:gap-5`. Yandaki 76 px boşluk sayfa oklarına ayrılmıştır; oklar içeriğin üstüne binmez (telefonda oklar alt köşelerdedir).
- Ekran sınıfları: `lg` ≥ 1024px, `md` ≥ 640px, `xs` < 640px (Tailwind `sm` ve `lg` eşikleriyle aynı).
- Pano (`react-grid-layout`): sütun sayısı `COLS = { lg: 20, md: 6, xs: 2 }`, boşluk `MARGIN` 14 ya da 12 px. Geniş ekranda 26 satır ekrana sığacak şekilde satır yüksekliği hesaplanır.
- Varsayılan `lg` yerleşimi (ana sayfa):
  - gösterge kartları: 8 kart × (5 sütun × 3 satır), iki sıra
  - hologram: x 0, 8 × 20; bilgi kartı: x 8, 7 × 20; yapılacaklar: x 15, 5 × 20
  - diğer sayfaların yerleşimi aynı dosyada; her sayfa geniş ekranda 26 satırı tam doldurur
- **Dört yan yana sayfa** vardır (ana sayfa, zihinsel sağlık, spor, sağlık kayıtları); arayüz ana sayfada açılır. Sayfalar oklar (`.page-arrow`) ve noktalar (`.page-dots`) ile değişir. Etkin olmayan sayfa `inert` taşır, bir ekran yüksekliğine kırpılır ve `data-page` özniteliği vardır. Ekranda görünen öğeyi ararken `[data-page][inert]` içindekileri sayma (rehber tur ve spot ışığı bu kurala göre yazıldı).
- Bir uyarı ya da asistan başka bir sayfayı gösteriyorsa sayfa değişir (`setActivePage`); kullanıcıyı yeni bir pencereye götürme.
- Bölüm davranışları değişmez: sabitle (iğne), basılı tutarak kaldır (X), sabitlenmemişken kesik çizgili kenar ve sürükleme, nokta matrisi, başka bölümün üstüne bırakınca kırmızı uyarı, geri alma bildirimi, 3 profil, roketli sıfırlama onayı.
- Yatay kaydırma çubuğu hiçbir genişlikte çıkmaz (`overflow-x: clip`). `scrollbar-gutter: stable` ayarını kaldırma.
- Dar bileşenlerde container query kullanılır. Örnek: yaşamsal değer kartı `@container` ve `@min-[13.5rem]:` ile daralınca durum yazısını gizler, yazı ekran okuyucuda kalır.

#### 3.8 Metin ve ton

- Türkçe arayüz kısa, düz, cümle düzeninde yazılır: yalnızca ilk harf büyük, ünlem yok. Düğmede emir kipi kullanılır ("Asistana sor", "Katmanlara ayır").
- Sayı, tarih ve yüzde `Intl` ile ve `useI18n().locale` kullanılarak biçimlenir (TR'de ondalık virgül, "%100"). Elle `toFixed` + string birleştirme yapılmaz.
- Değer ile birim arasında boşluk ve ayrı stil olur (değer `text-ink`, birim `text-[13px] text-ink-dim`).
- Sağlık içeriği:
  - mürettebat ve değerleri kurgusaldır (simülasyon); gerçek NASA verisi ayrıca ve kaynağıyla gösterilir
  - her bilgi bir kaynağa bağlanır (bkz. bölüm 7.3); kaynağı olmayan eşik `basis: 'vitalis'` diye işaretlenir ve arayüzde "Health Atlas kuralı" olarak, açıklama notuyla görünür
  - asistan teşhis koymaz
  - kriz belirtisinde her zaman önce bir insana yönlendirir (`planAnswer` ve `offlineAnswer` içindeki kriz kontrolü en başta kalır)
- Görev dilinde "uçuş cerrahı" değil **"uçuş hekimi"** yazılır (İngilizcede "flight surgeon").

#### 3.9 Erişilebilirlik

- Metin kontrastı en az 4.5:1 (tokenlar buna göre seçildi). `ink-dim` rengini küçük ve önemli metinde kullanma.
- Odak halkası global olarak tanımlıdır (`:focus-visible` → 2px `holo`). Kaldırma, `outline-none` yazıyorsan yerine bir odak stili koy.
- Her etkileşimli öğeye klavyeyle ulaşılır. Esc açık olanı kapatır. Sekme sırası mantıklıdır. Gizli içerik `inert` taşır.
- Dinamik içerikte `aria-live="polite"` kullan (asistan cevabı, rahatsızlık kartı). Gruplarda `role="group"` ve `aria-label` kullan.
- Ekran okuyucuya özel metin için `sr-only` kullan.
- `prefers-reduced-motion` ve `prefers-reduced-transparency` tercihlerinin ikisi de desteklenir.

---

### 4. İki dil (TR/EN), sabit metin yasak

- Arayüzde görünen **her** metin (düğme, ipucu, `aria-label`, hata, boş durum, bildirim, tur) iki dilde olur.
- Arayüz metinleri `src/i18n/tr.ts` dosyasına yazılır; bu dosya `Dict` tipinin kaynağıdır. Yeni sayfaların metinleri `tr-extra.ts` içindedir ve `tr.ts`'ye eklenir. İngilizcesi `en.ts` / `en-extra.ts` dosyalarına yazılır; `en: Dict` olduğu için eksik anahtar derlemeyi kırar. Kullanım: `const { t, lang, locale } = useI18n()`.
- `src/core/` React'e bağlı olmadığı için `useI18n` kullanamaz: oradaki metinler `core/tx.ts` → `tx('Türkçe', 'English')` çiftleriyle yazılır, sayılar `num(value, lang, digits)` ile biçimlenir.
- Değişken içeren metin fonksiyon olarak yazılır, ör. `complaintQuestion: (muscle, symptom) => ...`. Metin string birleştirme ile kurulmaz.
- Veri metinleri (bölgeler, uyarılar, tur adımları, asistan cevapları) `tx('Türkçe', 'English')` çiftleriyle yazılır, `resolve()` / `useContent()` ile seçilir.
- Kas adları Türkçe arayüzde `muscleNameTr()` ile çevrilir (431 kasın tamamı). Yeni yapı eklenirse çevirisini de ekle.
- Dil değişince `document.title` ve `<html lang>` güncellenir; bunu bozma.
- Kontrol: iki dilde de ekranı gez. EN'de Türkçe, TR'de İngilizce kelime kalmamalı.

---

### 5. Hologram ve 3D

- **Bileşenler:**
  - `components/HologramStage.tsx`: kontroller ve etkileşim
  - `hologram/HologramScene.tsx`: R3F sahnesi, katmanlar, kamera
  - `hologram/holoMaterial.ts`: hologram ve gerçekçi shader'lar
  - `hologram/layout.ts`: kamera ve zoom matematiği
  - `hologram/Space.tsx`: tamamen shader ile üretilen uzay arka planı
- **Görünümler:**
  - Birleşik görünüm hologramdır: bölgeye tıklanınca bilgi paneli açılır; ön ve arka görünüm var; yatay sürükleme döndürür.
  - Modelde üç görünüm vardır: hologram (bölgelere ayrılmış dış yüzey), kas sistemi ve iskelet sistemi. "Katmanlara ayır" kas ve iskelet sistemini gerçekçi malzemeyle yan yana gösterir (`LAYER_ORDER = ['muscles', 'bones']`). Deri katmanı ve kalp-damar sistemi kullanıcı isteğiyle kaldırıldı; dış yüzey yalnızca hologram görünümünde kullanılır. Kalp-damar katmanı `anatomy.glb` ve `anatomy-names.json` dosyalarından da çıkarıldı (`scripts/strip-glb-layer.mjs`; kas ve kemik verisi bayt bayt korunur). Geri ekleme.
  - Bir katman seçilince diğeri geriye çekilip kaybolur ve tıklanamaz.
  - Görünüm kontrollerinde (hologramın altındaki satır) yalnızca düğmeler bulunur; yönerge metni ekleme.
  - Seçilen yapı vurgu rengiyle boyanır ve hafifçe parlar (`uSelectStruct`, `uPick`, `uTime`); bilgi kartı açılır.
- **Yakınlaştırma:**
  - Fare tekerleği yalnızca imleç 3D alandayken ve bölüm sabitliyken çalışır; imlecin gösterdiği noktaya yakınlaşır (`zoomAt`, %100–%500, `ZOOM_MIN`/`ZOOM_MAX`).
  - 3D alanın üstüne konan kaydırılabilir katmanlar (ör. rahatsızlık kartı) `data-wheel-scroll` özniteliği taşır; tekerlek orada katmanı kaydırır, hologramı yakınlaştırmaz.
  - Bu katmanlar 3D alanın dışına taşmaz: üstte başlık satırının, altta zoom kapsülünün arasında kalır. İçerik uzarsa yalnızca liste kısmı kayar; eylem düğmeleri görünür kalır.
  - Yakınlaşmışken dikey sürükleme ya da sağ/orta tuş görüntüyü kaydırır (`panBy`; kayma çerçeveyle sınırlıdır).
  - Dokunmatikte iki parmak, klavyede `+ - 0` ve oklar çalışır. Sağ altta `- / % / +` kapsülü vardır.
- **Rahatsızlık bildir:** kas ve iskelet sistemini yan yana açar; kullanıcı bir figüre (ya da karttaki düğmeye) tıklayarak sistemi seçer → bir ya da birden çok kas veya kemik seçer (en fazla 10) → belirti seçer → şiddet (0-10) ve not → "Kaydet ve asistana sor". Şikayet veritabanına kaydedilir (`ComplaintDoc.muscles` ya da `bones`); spor programı buna göre değişir, koç ertesi gün sorar, şikayet geçmişinde görünür.
  - Kas belirtileri: ağrı, kramp, gerginlik, uyuşma, güçsüzlük. Kemik belirtileri: kırık şüphesi, çatlak şüphesi, ağrı, darbe, şişlik, diğer (`BONE_SYMPTOMS`). Kemikte durum kişinin kendi sözleriyle yazılır; "Diğer"de zorunludur.
  - Kırık ve çatlak her zaman "şüphe" olarak bildirilir (tanıyı hekim koyar). Şüphe, şiddetten bağımsız olarak kritik uyarıdır ve hekime gider (`analysis.ts`).
  - Karttaki X ve "Rahatsızlık bildir" düğmesi modu kapatır: seçim temizlenir, hologram görünümüne dönülür, yakınlaştırma sıfırlanır. Şikayet geçmişi düğmesi (`#complaint-history-button`) "Rahatsızlık bildir" düğmesinin hemen yanındadır.
  - Kart açıkken figür kartın soluna kayar (`frameShift`); yan yana görünümde iki figür kartın solundaki genişliğe sığar (`cameraDistance(mode, aspect, fit)`). Kartın genişliği alana göre değişir (`cardWidthFor`): geniş alanda 320, ana sayfadaki hologramda 248 px; telefonda kart alanı kaplar. Dar kartta yakınlaştırma kapsülü kart açıkken gizlenir. Kartın başlığı ve X kaymaz; yalnızca gövde kayar.
  - Yapıya tıklamak onu seçime ekler, yeniden tıklamak çıkarır. Kartta yapılar bölgelere göre çip olarak görünür (X ile çıkarılır, "Tümünü kaldır"). Seçilenlerin hepsi 3D'de vurgulanır (gerçekçi malzemedeki `uSelectMask` dokusu).
  - Asistan (`lib/assistant.ts`): kaslarda `musclesAnswer` (aynı bölge tek değerlendirme, farklı bölgeler ayrı rapor; bölge yorumları `REGION_NOTE`), kemiklerde `boneAnswer`. Kemik ilk yardım adımları MedlinePlus "Broken bone" sayfasına dayanır (`mpBrokenBone`).
  - Kemik adları Türkçe arayüzde `data/boneNames.ts` ile çevrilir (kaslar `data/muscleNames.ts`).
- **Performans:**
  - Hedef 60 fps. Mevcut üçgen bütçesi: kas 560 bin, kemik 300 bin; aşma.
  - `dpr={[1, 1.75]}` ve Bloom ayarlarını değiştirme. Gölge ve ağır son işlem efekti ekleme.
  - **Bilinen sorun:** model yüklendikten hemen sonra tarayıcı yaklaşık 3 saniye kilitleniyor (model tıklamaya hazırlanırken). Bunu kötüleştirme; düzeltmek ayrı bir iştir.
  - Oluşturduğun geometri, malzeme ve dokuyu temizle (`dispose`). Seçim için `Bvh` kullanılır.
  - Her karede React state güncelleme; `useFrame` içinde ref kullan.
- **Model güncelleme:** `scripts/export-zanatomy.py` dosyasını Blender 4.5 ile çalıştır:
  ```
  blender -b --disable-autoexec Startup.blend --python export-zanatomy.py -- <glb> <names.json> <TA2.csv>
  ```
  Z-Anatomy dosyaları Aytuğ'da. Çıktı GLB'nin boyutu ~3 MB civarında kalmalı.

---

### 6. Kod kuralları

- **TypeScript:** `any`, `as unknown as`, `@ts-ignore` yok. `import type` kullan (`verbatimModuleSyntax` açık). Kullanılmayan değişken bırakma (`noUnusedLocals`).
- **Biçim** (mevcut dosyalarla aynı): 2 boşluk girinti, **noktalı virgül yok**, tek tırnak, çok satırlı yapılarda sondaki virgül, satır ~140 karakter.
- **React:**
  - Fonksiyon bileşenleri ve hook'lar kullanılır. Paylaşılan durum `App.tsx` içinde tutulur, alta prop olarak iner. Alta geçen fonksiyonlar `useCallback` ile sarılır.
  - Effect içinde senkron `setState` yapma (lint uyarır). Türetilebilen değeri state'te tutma.
  - Animasyon karesinde değişen değerler ref'te tutulur.
- **Stil:**
  - Önce Tailwind sınıfları kullanılır.
  - Birden çok yerde tekrar eden ya da Tailwind ile yazılamayan stil `index.css` dosyasına, ne işe yaradığını anlatan **Türkçe yorumla** eklenir.
  - Satır içi `style` yalnızca hesaplanan değerler için kullanılır (konum, CSS değişkeni).
- **Yorumlar:** Türkçe yazılır ve "ne"yi değil "neden"i anlatır. Mevcut JSDoc tarzını izle.
- **Adlandırma:** bileşen dosyaları `PascalCase.tsx`, yardımcılar `camelCase.ts`. Bölge ve durum kimlikleri Türkçedir (`bas`, `gogus`, `normal`, `dikkat`, `kritik`); bunları çevirme.
- **Bağımlılıklar:** gerekmedikçe paket ekleme. Eklersen nedenini PR'da yaz. Özellik PR'ında ana sürüm yükseltmesi yapma. `package-lock.json` dosyasını commit'le.
- **Hata ve yükleniyor durumları:** yükleniyor için `.skeleton` sınıfı ya da `HologramStage` içindeki dönen halka kalıbı kullanılır. Hata mesajı iki dilli ve sakin olur; mümkünse yeniden deneme düğmesi eklenir. Konsola `console.log` bırakılmaz.

**Referans bileşenler.** Yeni bir şey yazmadan önce en yakınını aç ve kalıbını izle:

| Ne yazıyorsun | Örnek al |
|---|---|
| Kart, değer gösterimi | `VitalCard.tsx` |
| Sayfa kartı (başlık, içerik, alt eylem) | `TodoCard.tsx`, `mind/BreathingCard.tsx`, `sport/ProgramCard.tsx` |
| Zaman grafiği (gün/hafta/ay, aralık bandı, ipucu) | `charts/TimeChart.tsx`, `IndicatorDrawer.tsx` |
| Sağdan açılan çekmece | `Sheet.tsx` |
| Veri okuma/yazma | `useQuery` / `useHealth().mutate` (`data/health.tsx`); örnek `TodoCard.tsx` |
| Panel içeriği, iç kart, birincil/ikincil düğme, trend grafiği | `RegionPanel.tsx`, `Sparkline.tsx` |
| Çip, bölümlü seçici, yüzen kapsül, yüzen kart | `HologramStage.tsx` (`ComplaintCard`) |
| Üst bar düğmesi, açılır kutu | `TopBar.tsx`, `Popover.tsx` |
| Yan pencere, akışlı cevap | `ChatPanel.tsx` |
| Çekmece menü | `ToolsMenu.tsx` |
| Onay penceresi | `ResetConfirm.tsx`, `SourcesDialog.tsx` |
| İpucu | `Tooltip.tsx` |
| Bildirim | `ActionToast.tsx`, `AlertToast.tsx`, `TourToast.tsx` |

---

### 7. Sunucu, veri ve kaynak kuralları

#### 7.1 Mimari

- **Alan mantığı tek yerde:** bütün iş kuralları `src/core/` içindedir (saf TypeScript, React ve tarayıcı API'si yok). Aynı kod hem sunucuda hem tarayıcıda çalışır. Bu yüzden `core/` içinde `window`, `localStorage`, `fetch` ya da React kullanma.
- **Sunucu:** `arayuz/server/`. Geliştirmede Vite eklentisi olarak çalışır (`vite.config.ts` → `vitalisApi`), yayında `server/index.ts` tek süreçte arayüzü ve API'yi sunar. Veri `node:sqlite` ile `docs(collection, id, astronaut, ts, data)` tablosunda tutulur (`server/db.ts`).
- **Uç noktalar:** `GET /api/health`, `POST /api/rpc/:ad` (gövde `{ "args": [...] }`), `POST /api/import`, `GET /api/nasa/donki` ve `GET /api/nasa/epic` (canlı, 30 dk önbellek; internet yoksa `public/data/nasa/` anlık görüntüsü).
- **Yeni işlem eklemek:** önce `core/engine.ts` içine yöntem, sonra `core/rpc.ts` → `RPC` tablosuna girdi doğrulamasıyla birlikte kayıt. Arayüz `useQuery('ad', [args])` ile okur, `useHealth().mutate('ad', ...args)` ile yazar. Uç nokta elle yazılmaz.
- **Sunucu yoksa:** `data/backend.ts` motoru tarayıcıda çalıştırır (`localStorage` → `vitalis.db`). `?backend=local` adresi bunu zorlar; e2e testleri bunu kullanır.
- **Simülasyon belirlenimcidir:** geçmiş değerler saklanmaz, `core/sim.ts` aynı an için hep aynı değeri hesaplar. Yalnızca olaylar (ölçüm, şikayet, senaryo, günlük vb.) saklanır. Elle girilen ya da içe aktarılan ölçüm, kapsadığı zaman aralığında simülasyonun yerine geçer.
- **Analiz kural tabanlıdır** (`core/analysis.ts`): her uyarı nedenini sayılarla söyler, ne yapılacağını ve kaynağını gösterir. Aynı durum değişmedikçe tekrar uyarılmaz. Kritik uyarı uçuş hekimine kendiliğinden mesaj olarak gider. Kural eklerken test ekle (`core/*.test.ts`).
- **Görev ortamı** (`core/crew.ts` → `ENVIRONMENTS`: istasyon, Orion, Ay üssü, Mars üssü) bütün mürettebat için ortaktır. İletişim gecikmesini (`COMM_DELAY_MS`) ve günlük egzersiz programını (`core/coach.ts` → `ENV_PLANS`) belirler. İstasyonda ~120 dk ARED/T2/CEVIS, Orion'da 30 dk uçan tekerlek; Ay ve Mars üssünde NASA programı olmadığı için plan "varsayım" diye işaretlidir. Ortam değişince program yeniden kurulur, yapılmış hareketlerin işareti korunur.
- **Kişisel normal ve profil** (`core/personal.ts`): yaş, boy ve kilo görev öncesi değerlerle gelir, astronot değiştirebilir (`updateProfile`, `profiles` koleksiyonu). Kişisel normal son 14 günün verisinden hesaplanır (ortanca ± 2,5 sapma; antrenman saatlerinde nabız yükselişi uyarı sayılmaz). Profil değişince o andan sonraki verilerle yeniden öğrenilir. Kaynaklar yaşa ya da kiloya göre sayısal aralık vermediği için genel aralıklar değiştirilmez; bunun için sayı uydurma.
- **Kritik bildirim** (D-06, `engine.notifyCritical`): mürettebat arkadaşlarına anında, uçuş hekimine iletişim gecikmesiyle gider. Arkadaşın ekranında bir kez gösterilir (`tick` → `incoming`); hekim görüntülerken "gösterildi" sayılmaz.
- **Başlangıç durumu (fabrika ayarı):** temiz kurulumda ve "Başlangıç durumuna dön" (`engine.resetDemo`) sonrasında bütün mürettebatın değerleri normal aralıktadır; hiçbir bölgede sorun yoktur, yalnızca gün içi bilgi notları (su, egzersiz) olabilir. Mürettebatın karakter değerleri (`core/crew.ts` → `baseline`, `traits`) bu yüzden normal aralıkta tutulur; tansiyon yükselmesi, uyku borcu, antrenman kaçırma gibi sorunlar yalnızca demo menüsünden oluşturulur. Değerleri değiştirirsen 60 günlük taramayla hiçbir dikkat/kritik uyarı çıkmadığını doğrula (`core.test.ts` → sıfırlama testi).
  - Sıfırlama bütün mürettebat için ölçümleri, şikayetleri, senaryoları, mesajları, su ve ruh hali kayıtlarını, yapılacakları, günlüğü, asistan sohbetlerini, profili ve görev ortamını siler. İçe aktarılan veri setleri ve onların ölçümleri korunur. Mürettebatın geçmiş şikayetleri "geçti" olarak yeniden yazılır.
  - Nabız bağlama göre değerlendirilir: planlı antrenmanda yüksek, uykuda düşük nabız "dikkat" sayılmaz (kritik eşikler, elle girilen ölçüm ve nabzı değiştiren demo senaryosu hariç).
- **Demo menüsü:** "Bölgede sorun oluştur" bölümünde bölge, taraf, sorun (ağrı, kramp, uyuşma, güçsüzlük, darbe, şişlik, kırık/çatlak şüphesi) ve şiddet seçilir; sisteme demo kaynaklı bir şikayet olarak girer (hologram, uyarı, bilgi kartı, koç ve hekim tepki verir).
- **Demo düğmeleri:** bir senaryoya yeniden basılınca, durum hâlâ sürse bile ilgili uyarı yeniden bildirilir (`engine.forgetScenarioAlerts`). Gerçek veride aynı durum tekrar uyarılmaz. Uyarı bildirimi `alert:<anahtar>` kimliğiyle açılır; aynı uyarı yeniden gelirse eskisinin yerine geçer, üst üste yığılmaz.
- **Mesaj bildirimleri** (`components/MessageNotifier.tsx`): astronot ile uçuş hekimi arasındaki rapor ve mesajlar alıcıya ulaşınca (iletişim gecikmesinden sonra) sağ altta, sağdan kayarak bildirim çıkar. Bildirime basınca alıcının hesabına geçilir: hekime giden raporda hekim rolü ve o astronot, hekimin cevabında astronotun kendi hesabı. Ardından rapor ve mesaj kartının Mesajlar sekmesi açılır, mesaj vurgulanır ve cevap alanına odaklanılır (`lib/messageFocus.ts`). Bir mesaj bir kez bildirilir (`vitalis.inboxSeen`); ilk açılışta eski mesajlar bildirilmez. Sistemin otomatik uyarı mesajları bu bildirimleri kullanmaz.
  - Yalnızca uygulama açıkken (açılış ekranı bittikten sonra) ulaşan mesajlar kayarak çıkar. Uygulama kapalıyken ya da açılış sürerken ulaşanlar okunmamış listesinde bekler (`lib/inbox.ts`): zil düğmesinin listesinde "Okunmamış mesajlar" bölümünde görünür. Açılış bitince zilin altında "Okunmamış bildirimlerin var" kutusu çıkar.
  - Aynı kural uyarılar için de geçerlidir: oturumun ilk güncellemesindeki ve açılış sürerken gelen uyarılar bildirim olarak açılmaz, listeye yazılır. Gün içi bilgi notları okunmamış sayılmaz; yalnızca dikkat ve kritik uyarılar kutuda sayılır.
- Rapor gönderilince kart Mesajlar sekmesine geçer ve gönderilen rapor vurgulanır.
- **Kontrol takvimi** (`core/tasks.ts` → `scheduleFor`): haftalık tepki testi, psikolojik görüşme ve kan örneği günleri (`labs.ts` → `DRAW_DAYS`; kan tahlili kartıyla aynı kaynak).
- **13 Kasım NASA verisi:** `core/importer.ts` CSV/JSON dosyasını sütun eşlemesi ve birim çevirisiyle (°F→°C, mmol/L→mg/dL, dk→sa) içeri alır, her kayda veri setinin adını yazar. Veri setinin adı, kaynağı (`provider`) ve bağlantısı Kaynaklar ekranında listelenir (VM-10). Şu an arayüzde dosya yükleme ekranı yok; `POST /api/import` ile yapılır. Yeni bir gösterge gerekiyorsa `core/catalog.ts` içine kaynağıyla eklenir.

#### 7.2 Asistan ve dil modeli

- Asistan şu an çevrimdışı ve kural tabanlıdır: `lib/assistantModes.ts` → `planAnswer(soru, bağlam, kaydedebilir)` rolü seçer (koç, dinleyen, arkadaş, sağlık) ve eylem düğmeleri döner (şikayeti kaydet, dünkü şikayete cevap, sayfaya git, su ekle). İlk yardım ve hologram soruları `lib/assistant.ts` → `offlineAnswer` ile cevaplanır.
- Bilgi veren cevaplar kaynak taşır (P-04): `planAnswer` cevabın türüne göre `sources` ekler (ilk yardım → MedlinePlus, moral ve kriz → TB-016, koç → ortamın egzersiz kaynakları, gösterge → aralığın kaynağı). Gündelik sohbette kaynak yoktur.
- **Dil modeli bağlanınca** yalnızca cevap metni değişir: `buildPrompt(bağlam, rol)` sistem istemini hazırlar; istek **sunucu üzerinden** gider. Eylem düğmeleri ve kriz kontrolü aynı kalır; bağlantı koparsa çevrimdışı cevaba dönülür.
- **Gizli bilgiler:** LLM ve servis anahtarları yalnızca sunucunun ortam değişkenlerinde durur. `.env.example` commit'lenir, `.env` asla commit'lenmez. `VITE_` ile başlayan değişkene anahtar konmaz (tarayıcıya gider).
- Sağlık verisi kişiseldir: log'a ham sağlık verisi ya da anahtar yazılmaz. Günlük ve dinleyen rolündeki konuşmalar (`private: true`) hekim görünümünde gösterilmez.
- **Bilinen sınır:** kimlik doğrulama henüz yok; rol (`vitalis.profile`) tarayıcıda seçilir ve gizlilik arayüz düzeyindedir. Gerçek kullanımda sunucuya oturum ve rol denetimi eklenmelidir.

#### 7.3 Veri kaynakları (kesin kural)

- **Veri mümkün olduğunca NASA'dan alınır:** OSDR (kan tahlili aralıkları ve Inspiration4 verisi), DONKI (uzay havası), EPIC (Dünya fotoğrafları), SVS (Dünya dokuları), OCHMO teknik özetleri ve HRP sayfaları (eşikler, egzersiz, radyasyon sınırı).
- **Açıp içeriğini doğrulamadığın hiçbir kaynağı ekleme.** Bağlantının açıldığını ve kullandığın sayının o sayfada yazdığını gör. Doğrulanmamış kaynak, uydurma makale ya da "genel bilgi" kaynak gösterilmez.
- Doğrulanan kaynak `core/sources.ts` → `SOURCES` listesine başlık, kurum, adres, tarih ve uygulamada nerede kullanıldığıyla (TR/EN) eklenir. Kaynaklar ekranı bu listeden kendiliğinden oluşur; ayrıca elle yazılmaz.
- Görsel ve yazılım varlıklarının lisansı `data/content.ts` → `SOURCES_RAW` içinde, yapay zeka kullanımı `AI_USE` içinde yazılır.
- NASA verisinin anlık görüntülerini yenilemek için `npm run nasa:snapshot`; dosyanın içindeki `retrieved` tarihi arayüzde görünür.

---

### 8. Testler (zorunlu)

**Kural:** Eklenen ya da değiştirilen her şey testle birlikte gelir. Testi olmayan iş bitmiş sayılmaz.

| Değişiklik | Zorunlu testler |
|---|---|
| Backend (uç nokta, servis, veri işleme) | Backend birim + entegrasyon (API) testleri + sözleşme testi |
| Arayüz mantığı (hook, yardımcı, hesap) | Vitest birim testi |
| Arayüz bileşeni ya da etkileşim | Vitest + Testing Library bileşen testi **ve** Playwright e2e testi |
| Görsel değişiklik ya da yeni ekran | Yukarıdakiler + Playwright görsel karşılaştırma (onaylı taban) |
| Arayüz + backend birlikte | Hepsi. E2E testi backend'i `page.route` ile taklit eder; ayrıca gerçek yerel backend'e karşı en az bir entegrasyon testi yazılır |
| Hata düzeltme | Düzeltmeden önce kırmızı, sonra yeşil olan bir regresyon testi |

#### 8.1 Altyapı (kurulu)

Test altyapısı repoda hazır. Yeniden kurma; mevcut dosyaları kullan ve genişlet.

| Komut (`arayuz/` içinde) | Ne yapar |
|---|---|
| `npm test` | Vitest birim ve bileşen testleri (jsdom, birkaç saniye) |
| `npm run test:watch` | Vitest, dosya değiştikçe yeniden çalışır |
| `npm run test:e2e` | Playwright uçtan uca testleri. Geliştirme sunucusu çalışmıyorsa kendisi başlatır (yaklaşık 1,5 dakika) |
| `npx playwright test --ui` | Testleri görsel arayüzde adım adım izler |
| `npm run test:e2e:update -- e2e/gorsel.spec.ts` | Görsel tabanları günceller. Yalnızca onaylı görsel değişiklikten sonra kullanılır |

İlk kurulumda test tarayıcısını indir: `npx playwright install chromium`.

| Dosya | İçerik |
|---|---|
| `vitest.config.ts`, `src/test/setup.ts` | Vitest ayarı. jsdom'da olmayan `matchMedia` ve `ResizeObserver` taklitleri, her testten sonra temizlik |
| `src/test/render.tsx` | `renderWithProviders(ui, { lang })` (dil + ayarlar + tarayıcı motoruyla `HealthProvider`) ve `dictFor(lang)` |
| `server/server.test.ts` | Sunucu testleri (Node ortamı, geçici SQLite dosyası) |
| `src/**/*.test.ts(x)` | Birim ve bileşen testleri (kaynağın yanında) |
| `playwright.config.ts` | Ekran boyutları, tam Chromium, görsel karşılaştırma eşiği |
| `e2e/fixtures.ts` | Ortak başlangıç: `test`, `expect`, `open()`, `activePage()`, `tool()`, `hologram()`, `waitForHologram()` |
| `e2e/*.spec.ts` | Uçtan uca testler |
| `e2e/gorsel.css`, `e2e/gorsel.spec.ts-snapshots/` | Görsel karşılaştırmada gizlenen öğeler ve onaylı tabanlar |
| `tsconfig.test.json` | Test dosyalarının tip denetimi (`npm run build` testleri de denetler) |

**CI henüz yok.** Eklenirse her PR'da şu adımlar çalışır: `npm ci`, `npm run lint`, `npm run build`, `npm test`, `npx playwright install --with-deps chromium`, `npm run test:e2e`. Hata olursa `playwright-report` artefakt olarak yüklenir. Backend varsa backend testleri ayrı bir iş olarak çalışır.

#### 8.2 Arayüz birim ve bileşen testleri (Vitest)

- Test dosyası kaynağın yanına yazılır: `src/**/x.test.ts(x)`. Vitest fonksiyonları açıkça içe aktarılır (`import { describe, expect, it } from 'vitest'`).
- Bileşenler `renderWithProviders()` ile çizilir. Metinler `dictFor(lang)` sözlüğünden alınır, teste gömülmez. Her bileşen testi iki dilde çalışır (`describe.each(['tr', 'en'] as const)`; örnek: `VitalCard.test.tsx`).
- **WebGL jsdom'da yoktur.** Vitest'te `<Canvas>` / `HologramScene` çizilmez; 3D'nin mantığı ayrı test edilir (`hologram/layout.test.ts`), davranışı Playwright'ta.
- Dosya okurken yolu `resolve(process.cwd(), ...)` ile kur; jsdom'da `import.meta.url` bir dosya yolu değildir.
- Bekleme içeren kodda gerçek süre beklenmez: `vi.useFakeTimers()` + `vi.runAllTimersAsync()` (örnek: akışlı asistan cevabı, `lib/assistant.test.ts`).
- Ağ isteği `vi.stubGlobal('fetch', ...)` ile taklit edilir (örnek: `RegionPanel.test.tsx`).
- `core/` testleri sabit bir anla çalışır (`new Engine(new MemoryStore(), () => NOW)`); gerçek saate bağlı test yazma. Örnek: `core/core.test.ts`.
- Mevcut testler (bunlara benzer yaz):
  - `core/core.test.ts`, `core/modules.test.ts`: eşikler, simülasyon, analiz, koç programı, demo senaryolarının uyarıları, kan tahlilleri, içe aktarma ve birim çevirisi
  - `server/server.test.ts`: uç noktalar, girdi doğrulama, kalıcılık
  - `hologram/layout.test.ts`: zoom sınırları, imleçteki noktanın sabit kalması, kaydırma sınırı
  - `lib/layout.test.tsx`: dört sayfanın varsayılan düzeni, çakışmazlık, kayıt, bozuk kayıt, profiller, sıfırla/geri al, eski sürümün bir kez sıfırlanması
  - `lib/assistant.test.ts`, `lib/assistantModes.test.ts`: akış, kriz önceliği, ilk yardım, metinden şikayet çıkarma (Türkçe ekler dahil), rol seçimi, koçun dünkü şikayeti sorması, iki dil
  - `mind/*.test.ts`: nefes zamanlaması, Cupola yörüngesi, iyi oluş hesapları
  - `i18n/i18n.test.tsx`: TR/EN anahtar eşliği, boş metin, İngilizcede Türkçe karakter kalmaması
  - `data/anatomy.test.ts`: 431 kasın Türkçe adı, yapı bilgisi
  - `data/content.test.ts`: turun dört sayfayı sırayla gezmesi ve **her tur hedefinin kodda hâlâ var olması**, doğrulanmış kaynakların bütünlüğü, bölgeler
  - `components/*.test.tsx`: VitalCard, Tooltip, TopBar, RegionPanel

#### 8.3 Uçtan uca testler (Playwright)

- **Ekran boyutları:**
  - `masaustu-1440` bütün testleri çalıştırır.
  - `laptop-1280`, `tablet-768` ve `mobil-390` yalnızca `duyarli.spec.ts` ile `gorsel.spec.ts` dosyalarını çalıştırır. Yeni bir ekran boyutu denetimi `duyarli.spec.ts` dosyasına yazılır.
- **Tarayıcı:** Testler tam Chromium ile çalışır (`channel: 'chromium'`); ekran kartı varsa 3D sahne onunla çizilir. CI'da ekran kartı olmadığı için yazılımla çizilir (`--use-angle=swiftshader`).
- **Her test `open(page)` ile başlar, `page.goto` kullanma.**
  - `open`, açılış videosunu atlar, dili sabitler ve uygulamayı `?backend=local` ile açar: her test kendi temiz verisiyle çalışır, geliştirme sunucusunun veritabanına dokunulmaz.
  - Uyarı metinleri teste gömülmez: beklenen uyarı aynı motor Node'da çalıştırılarak bulunur (örnek: `uyarilar.spec.ts` → `expected()`).
  - 3D model yüklenince tarayıcının ~3 saniyelik meşgul döneminin bitmesini bekler. Bu dönemde yapılan tıklama ve basılı tutma gecikir.
- **Metinleri teste gömme:**
  - Etiketleri `t` fixture'ından al (`t.hologram.zoomIn`). İngilizce test için `test.use({ lang: 'en' })` yaz.
  - Veri metinleri için kaynak modülü içe aktar (`tourFor`, `regionsFor`, `INDICATORS`, `SCENARIOS`, `PAGE_TOOLS`).
- **Seçiciler:**
  - Öncelik `getByRole` + erişilebilir ad. Ardından kalıcı id ve data öznitelikleri (`#tour-*`, `[data-tool="hologram"]`, `[data-vital-card]`).
  - Tailwind sınıfına bağlı seçici yazma.
  - Ad bir başka adın parçasıysa `exact: true` kullan ("Yakınlaştır" ile "Yakınlaştırmayı sıfırla" çakışır).
- **Otomatik kontroller** (`fixtures.ts`, her testte): konsolda `error` ya da `pageerror` yok, sayfa yatayda taşmıyor.
- **Sabit süre bekleme (`waitForTimeout`) yazma; uygulamanın durumunu bekle.**
  - Örnek: basılı tutarak kaldırmada fare, bölüm kalkana kadar bırakılmaz.
  - Örnek: animasyon sürerken ölçüm ya da tarama yapılmaz.
  - Figüre tıklamak gibi geçişe bağlı işlerde `expect(...).toPass()` ile yeniden dene (örnek: `rahatsizlik.spec.ts`).
- **Yeni bir özellik için en az şu senaryolar yazılır:**
  - mutlu yol
  - TR ve EN
  - yalnızca klavye
  - mobil 390px
  - hata durumu (`page.route` ile backend 500 / zaman aşımı)
  - sayfa yenilenince kalıcı olması gereken her şey
- **Erişilebilirlik:**
  - Yeni ekran ve pencereleri `erisilebilirlik.spec.ts` dosyasındaki taramaya ekle; `serious` ya da `critical` ihlal kalmamalı.
  - Dosyadaki `KNOWN_ISSUES` listesi henüz düzeltilmemiş bilinen ihlalleri tutar. Bu listeye yeni madde eklemek yasaktır; düzeltilen madde listeden çıkarılır.

**Mevcut davranışlar için regresyon paketi (yazıldı, her zaman yeşil kalmalı):**

1. `acilis.spec.ts`: açılış ekranı, atla, oturumda bir kez, `?intro`; kaynaklar penceresinde CC BY-SA 4.0 atfı ve açılışı yeniden oynatma
2. `duzen.spec.ts`:
   - ana sayfa varsayılan düzeni (8 gösterge kartı; hologram, bilgi kartı ve yapılacaklar soldan sağa; hepsi sabit)
   - sayfa okları dört sayfayı gezer, her sayfa kendi bölümleriyle gelir, inert yan sayfalar
   - menüden gizle/göster ve yenilemede kalıcılık, sabitleme
   - basılı tutarak kaldırma
   - profiller, sıfırlama onayı ve geri alma
   - bir sayfanın bütün bölümlerini kaldırma ve standart düzenle geri getirme
3. `dil.spec.ts`: TR ↔ EN, `<html lang>`, başlık, yenilemede kalıcılık, İngilizce sayı biçimi
4. `tur.spec.ts`: bütün adımlar TR ve EN; her adımda doğru sayfa açık, hedef ekranda, vurgu şerit değil ve `scrollX === 0`; başka sayfadan başlatılan tur ana sayfadan başlar
5. `hologram.spec.ts`:
   - 3D alanda tekerlekle yakınlaştırma, düğmeler, `+ - 0`, %500 sınırı
   - sabitlenmemiş bölümde tekerlek çalışmaz
   - katmanlar ve tek katman, bölge kartı, ön/arka görünüm
6. `rahatsizlik.spec.ts`: kas seç → belirti → asistan cevabı; aynı bölgeden çoklu seçim (tek rapor), farklı bölgeler (ayrı raporlar, TR/EN); kas çıkarma ve Tümünü kaldır; çok kasta kartın 3D alana sığması ve tekerleğin listeyi kaydırması (yakınlaştırmaması); kart kapatma ve katman değişince modun kapanması. Figürdeki tıklama noktaları alan yüksekliğine göre ölçeklenir (`REF_HEIGHT`).
7. `uyarilar.spec.ts`: demo menüsünden senaryolar (su, nabız, sağ elde darbe; demo klavye kısayolları kaldırıldı), uyarının nedeni ve yapılacağı, nabız kartının durumu, kritik bölge kartı ve hekime bildirim, bildirim geçmişi, senaryo ve sıfırlama
   - Görsel testler (`gorsel.spec.ts`) ve saate duyarlı testler tarayıcı saatini sabitler (`page.clock.setFixedTime`): simülasyon günün saatine göre uyarı üretir.
   - `mesajlar.spec.ts`: pilot rapor gönderir → hekim bildirimden açıp cevaplar → pilot bildirimden cevabı açar; bildirim X ile kapanır
8. `asistan.spec.ts`: akışlı cevap ve sağ alttaki sesli okuma düğmesi, kriz yönlendirmesi, sohbette anlatılan şikayetin kaydedilip spor programını değiştirmesi, rol seçimi ve spor sayfasında koç karşılaması, Esc ile kapanma, bilgi kartından soru, İngilizce cevap
9. `erisilebilirlik.spec.ts`: axe taraması (ana sayfa, menü, asistan, kaynaklar), klavye odağı
10. `duyarli.spec.ts`: dört ekran boyutunda bölümlerin sığması, düğme boyutları, dar ekranda bölge kartı
11. `yenilikler.spec.ts`: ortama göre program, kişisel bilgiler ve kişisel normal, kontrol takvimi, veri kaynağı, kan tahlili geçmişi, rapor referans sütunu, mürettebat uyarısı, içe aktarılan veri setleri, asistan kaynakları

#### 8.4 Görsel karşılaştırma (tasarımın bozulmadığının kanıtı)

- **Kapsam:** `e2e/gorsel.spec.ts`, 1. sayfanın dört ekran boyutunda TR ve EN görüntüsünü onaylı tabanla karşılaştırır (8 görüntü).
- **Gizlenen öğeler:** her açılışta ya da saatle değişen öğeler `e2e/gorsel.css` ile gizlenir: 3D sahne, görev saati, gösterge kartlarının değeri, durumu ve alt satırı, yapılacaklar listesinin içeriği, bildirim ve takvim rozetleri. Kartların çerçevesi, adı, birimi ve yerleşimi, 3D sahnenin üstündeki başlık, açı, zoom kapsülü ve ipucu karşılaştırılır. Yeni bir değişken öğe eklersen onu da bu dosyaya ekle.
- **Eşik sıkıdır:** `maxDiffPixels: 150`, `threshold: 0.05`.
  - Aynı makinede iki çekim arasında fark 0 pikseldir.
  - Durum renginin yeşilden sarıya dönmesi (~1700 piksel) ve üst bar düğmesinin köşesinin bir kademe küçülmesi (~1000 piksel) yakalanır.
- **Tabanlar Aytuğ'un Windows bilgisayarında üretildi** (`-win32.png`).
  - Font çizimi işletim sistemine göre değiştiği için macOS ve Linux'ta taban yoktur; orada görsel test atlanır.
  - Başka bir Windows bilgisayarda, dokunulmamış `main` üzerinde fark çıkarsa tabanı güncelleme; geliştiriciye ve Aytuğ'a bildir.
- **Taban yalnızca bilerek yapılan ve onaylanan görsel değişiklikte güncellenir:** `npm run test:e2e:update -- e2e/gorsel.spec.ts`. PR'da eski ve yeni görüntü yan yana konur, Aytuğ onaylar. Beklenmeyen fark çıktıysa tabanı güncelleme, kodu düzelt.

#### 8.5 Backend testleri

- **Python (FastAPI vb.):** `pytest` + `httpx` / `TestClient`, kapsam için `pytest-cov`.
- **Node:** `vitest` + `supertest`.
- **Birim testleri:** iş mantığı, doğrulama, sınır değerleri (normal, dikkat ve kritik eşikleri).
- **Entegrasyon testleri:** her uç nokta için başarılı yanıt, hatalı girdi (422/400), bulunamadı (404), sunucu hatası, zaman aşımı. Akışlı uç noktada parçaların sırayla geldiği ve akışın düzgün kapandığı test edilir.
- **Sözleşme testleri:** yanıt JSON'u `types.ts` ile birebir aynı şemayı sağlar (ortak JSON Schema ya da pydantic/zod modeli). Alan adları ve durum değerleri (`normal`, `dikkat`, `kritik`) değişmez.
- **Güvenlik testleri:** kriz cümlesinde insana yönlendirme; anahtarın ve ham sağlık verisinin yanıtta ya da log'da görünmemesi.
- **Testlerde dış servis çağrılmaz:** LLM ve harici API'ler taklit edilir. Testler internetsiz çalışır, gerçek anahtar gerektirmez.

---

### 9. Her görevde izleyeceğin adımlar

1. **Oku:** bu dosya, `README.md`, ilgili bileşenler ve "Referans bileşenler" listesindeki en yakın örnek. Etkilenecek dosyaları listele.
2. **Planla:** ne yapacağını 3–6 maddede geliştiriciye söyle. Mevcut bir görsel değişecekse burada dur ve onay iste.
3. **Önce fotoğraf çek:** Playwright MCP ile `http://localhost:5173` adresini aç (açılışı atlamak için sessionStorage'a `vitalis.introSeen = '1'` yaz). Etkilenecek alanın ekran görüntüsünü 1440 ve 390 genişlikte al.
4. **Uygula:** en küçük değişiklikle, mevcut kalıplarla, iki dilde yaz.
5. **Test yaz:** bölüm 8'deki tabloya göre birim, bileşen, e2e ve gerekiyorsa backend testlerini ekle.
6. **Çalıştır:** `npm run lint`, `npm run build`, `npm test`, `npm run test:e2e` (ve backend testleri). Hepsi yeşil olmalı.
7. **Gözle kontrol et:** Playwright MCP ile şu genişliklerde, TR ve EN'de ekran görüntüsü al:
   - 1440×900
   - 1280×800
   - 768×1024
   - 390×844

   Önceki görüntülerle karşılaştır ve şunlara bak:
   - Boşluklar eşit mi, kenarlar ve yazı satırları hizalı mı?
   - Köşe yarıçapları ve yükseklikler komşularıyla aynı mı?
   - Metin kesiliyor, taşıyor ya da iki satıra düşüyor mu?
   - Odak halkası görünüyor mu?
   - Konsolda hata var mı?

   Değişiklik ana sayfadaysa rehber turu baştan sona oynat.
8. **Raporla:**
   - ne değişti ve hangi dosyalar
   - çalıştırılan komutlar ve sonuçları
   - önce/sonra ekran görüntüleri
   - açık kalan riskler

### 10. Git ve iş akışı

- `main` dalına doğrudan commit atılmaz. Her iş kendi dalında yapılır (`ozellik/kisa-ad`, `duzeltme/kisa-ad`) ve PR ile birleştirilir. Asla `main` dalına force push yapılmaz.
- Commit'ler küçük ve tek konulu olur. Mesaj Türkçe, kısa başlık + gerekirse madde madde açıklama.
- Commit'lenmeyecekler: `node_modules/`, `dist/`, `.env*` (yalnızca `.env.example` commit'lenir), `.playwright-mcp/`, `test-results/`, `playwright-report/`, `coverage/`.
- Başkasının açık PR'ındaki dosyada büyük değişiklik yapacaksan önce haber ver. `App.tsx`, `index.css`, `tr.ts` ve `en.ts` çakışmaya en açık dosyalardır.
- PR açıklamasında şunlar bulunur:
  - ne ve neden
  - ekran görüntüleri (TR + EN, masaüstü + mobil)
  - test komutlarının çıktısı
  - yeni bağımlılıklar ve lisansları
  - görsel değişiklik varsa onay notu

### 11. Bitti sayılmadan önce kontrol listesi

- [ ] Mevcut görünüm ve düzen değişmedi (ya da değişiklik onaylandı ve görsel taban bilerek güncellendi)
- [ ] Yeni renk, font, yarıçap, gölge ya da UI kütüphanesi eklenmedi; bileşenlerde ham hex yok
- [ ] Bütün yeni metinler `tr.ts` ve `en.ts` dosyalarında ya da `tx()` ile; iki dilde gezildi
- [ ] Klavye ile kullanılabiliyor, `aria-*` etiketleri `t.*` üzerinden geliyor, odak halkası görünüyor
- [ ] `prefers-reduced-motion` ve dar ekran (390px) kontrol edildi; yatay kaydırma yok
- [ ] Tur id'leri, data öznitelikleri ve kayıt anahtarları korunuyor; tur dört sayfada baştan sona sorunsuz
- [ ] Eklenen her bilgi ve eşik doğrulanmış bir kaynağa bağlı (`core/sources.ts`) ya da açıkça "Health Atlas kuralı" olarak işaretli
- [ ] Birim, bileşen, e2e ve backend testleri yazıldı ve geçiyor; görsel karşılaştırma yeşil
- [ ] `npm run lint` ve `npm run build` hatasız; konsolda hata yok
- [ ] Gizli anahtar yok; yeni varlıkların lisansı uygun ve kaynaklar penceresine yazıldı
- [ ] Hologram 60 fps civarında; üçgen bütçesi aşılmadı; oluşturulan 3D kaynaklar temizleniyor
