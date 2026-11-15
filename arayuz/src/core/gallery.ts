import type { Doc } from './store'

/*
 * Dünya galerisi (docs/wellbeing GAL-01…GAL-04): dört kategori, seçilmiş (uygulamayla gelen) görseller ve kişinin kendi
 * fotoğrafları. Seçilmiş görseller yalnızca kaynağı ve kullanım koşulu doğrulanmış varlıklardan oluşur; doğrulanmış varlık
 * yoksa kategori dürüst bir boş durum gösterir (uydurma görsel, lisans ya da kaynak yok).
 * Favoriler mürettebat üyesine göre saklanır: seçilmiş görsellerinki bu uygulamanın veri deposunda (galleryFavorites),
 * kişisel fotoğraflarınki yalnızca fotoğrafın kendisiyle birlikte bu tarayıcıda.
 */

export type GalleryCategory = 'nature' | 'places' | 'orbit' | 'mine'
export const GALLERY_CATEGORIES: GalleryCategory[] = ['nature', 'places', 'orbit', 'mine']

/** Uygulamayla gelen, kaynağı doğrulanmış bir görsel */
export interface CuratedImage {
  /** "<kategori kaynağı>:<ad>", ör. "epic:epic_1b_20261106002712" */
  id: string
  category: Exclude<GalleryCategory, 'mine'>
  /** Uygulamayla gelen dosyalar (aynı kaynaktan sunulur; internet gerekmez) */
  src: string
  thumb: string
  /** Çekim zamanı (ISO, UTC) ve görüntünün merkezi */
  takenAt: string
  lat?: number
  lon?: number
  /** Yer adı (Doğa ve Şehirler fotoğraflarında); EPIC görüntülerinde yoktur */
  title?: { tr: string; en: string }
  /** Kaynak: kurum, araç, özgün adres, atıf ve kullanım koşulu (yalnızca doğrulanmış bilgi); termsUrl lisans metnine gider */
  source: { name: string; instrument?: string; url: string; credit: string; terms: string; termsUrl?: string }
}

/**
 * Doğa ile Şehirler ve tanıdık yerler: Wikimedia Commons'ın öne çıkan resimlerinden seçilmiş, serbest lisanslı fotoğraflar
 * (CC0, CC BY, CC BY-SA). Lisans, yazar, çekim tarihi ve konum her dosyanın Commons sayfasından (API) okunup doğrulandı;
 * atıf görüntüleyicide gösterilir. Dosyalar public/gallery altında, görüntüleyici için 1280 px ve küçük resim için 640 px
 * (yalnızca yeniden boyutlandırıldı). Çekim saati bilinmez; yalnızca tarih gösterilir. Liste: kök dizindeki CREDITS.md.
 */
export const CURATED_EXTRA: CuratedImage[] = [
  {
    id: 'nature:ossau-lake',
    category: 'nature',
    src: '/gallery/nature/ossau-lake.jpg',
    thumb: '/gallery/nature/ossau-lake-thumb.jpg',
    takenAt: '2010-07-28T12:00:00Z',
    lat: 42.848,
    lon: -0.4911,
    title: { tr: "Gentau Gölü ve Pic du Midi d'Ossau, Pireneler", en: "Lake Gentau and Pic du Midi d'Ossau, Pyrenees" },
    source: { name: 'Wikimedia Commons', url: "https://commons.wikimedia.org/wiki/File:Gentau_Pic_du_Midi_Ossau.jpg", credit: "Myrabella", terms: "CC BY-SA 3.0", termsUrl: "https://creativecommons.org/licenses/by-sa/3.0" },
  },
  {
    id: 'nature:sils-lake',
    category: 'nature',
    src: '/gallery/nature/sils-lake.jpg',
    thumb: '/gallery/nature/sils-lake-thumb.jpg',
    takenAt: '2011-08-14T12:00:00Z',
    lat: 46.4237,
    lon: 9.754,
    title: { tr: "Sils Gölü, Engadin, İsviçre", en: "Lake Sils, Engadine, Switzerland" },
    source: { name: 'Wikimedia Commons', url: "https://commons.wikimedia.org/wiki/File:2011-08-01_10-31-42_Switzerland_Segl-Maria.jpg", credit: "Hansueli Krapf", terms: "CC BY-SA 3.0", termsUrl: "https://creativecommons.org/licenses/by-sa/3.0" },
  },
  {
    id: 'nature:karula-view',
    category: 'nature',
    src: '/gallery/nature/karula-view.jpg',
    thumb: '/gallery/nature/karula-view-thumb.jpg',
    takenAt: '2009-01-04T12:00:00Z',
    title: { tr: "Karula yaylası, Estonya", en: "Karula uplands, Estonia" },
    source: { name: 'Wikimedia Commons', url: "https://commons.wikimedia.org/wiki/File:Karula_vaade.jpg", credit: "Amadvr", terms: "CC BY-SA 3.0 ee", termsUrl: "https://creativecommons.org/licenses/by-sa/3.0/ee/deed.en" },
  },
  {
    id: 'nature:barycz-valley',
    category: 'nature',
    src: '/gallery/nature/barycz-valley.jpg',
    thumb: '/gallery/nature/barycz-valley-thumb.jpg',
    takenAt: '2015-02-19T12:00:00Z',
    lat: 51.5444,
    lon: 17.3509,
    title: { tr: "Barycz Vadisi, Polonya", en: "Barycz Valley, Poland" },
    source: { name: 'Wikimedia Commons', url: "https://commons.wikimedia.org/wiki/File:Dolina_Baryczy_1.jpg", credit: "Bartosz Dworski", terms: "CC BY-SA 3.0 pl", termsUrl: "https://creativecommons.org/licenses/by-sa/3.0/pl/deed.en" },
  },
  {
    id: 'nature:dulmen-forest',
    category: 'nature',
    src: '/gallery/nature/dulmen-forest.jpg',
    thumb: '/gallery/nature/dulmen-forest-thumb.jpg',
    takenAt: '2017-09-19T12:00:00Z',
    lat: 51.8197,
    lon: 7.2398,
    title: { tr: "Orman yolu, Dülmen, Almanya", en: "Forest path, Dülmen, Germany" },
    source: { name: 'Wikimedia Commons', url: "https://commons.wikimedia.org/wiki/File:D%C3%BClmen,_B%C3%B6rnste,_Waldweg_--_2015_--_4649.jpg", credit: "Dietmar Rabich", terms: "CC BY-SA 4.0", termsUrl: "https://creativecommons.org/licenses/by-sa/4.0" },
  },
  {
    id: 'nature:synevyr-autumn',
    category: 'nature',
    src: '/gallery/nature/synevyr-autumn.jpg',
    thumb: '/gallery/nature/synevyr-autumn-thumb.jpg',
    takenAt: '2017-10-20T12:00:00Z',
    lat: 48.5413,
    lon: 23.5942,
    title: { tr: "Synevyr Milli Parkı'nda sonbahar, Karpatlar", en: "Autumn in Synevyr National Park, Carpathians" },
    source: { name: 'Wikimedia Commons', url: "https://commons.wikimedia.org/wiki/File:21-224-5054_NNP_Synevyr_RB_18.jpg", credit: "Rbrechko", terms: "CC BY-SA 4.0", termsUrl: "https://creativecommons.org/licenses/by-sa/4.0" },
  },
  {
    id: 'nature:lake-louise',
    category: 'nature',
    src: '/gallery/nature/lake-louise.jpg',
    thumb: '/gallery/nature/lake-louise-thumb.jpg',
    takenAt: '2019-06-16T12:00:00Z',
    title: { tr: "Louise Gölü, Banff, Kanada", en: "Lake Louise, Banff, Canada" },
    source: { name: 'Wikimedia Commons', url: "https://commons.wikimedia.org/wiki/File:1_lake_louise_pano_2019.jpg", credit: "Chensiyuan", terms: "CC BY-SA 4.0", termsUrl: "https://creativecommons.org/licenses/by-sa/4.0" },
  },
  {
    id: 'nature:beech-ferns',
    category: 'nature',
    src: '/gallery/nature/beech-ferns.jpg',
    thumb: '/gallery/nature/beech-ferns-thumb.jpg',
    takenAt: '2017-06-09T12:00:00Z',
    lat: 58.3162,
    lon: 11.5107,
    title: { tr: "Kayın ağaçları ve eğrelti otları, Gullmarsskogen, İsveç", en: "Beech trees and ferns, Gullmarsskogen, Sweden" },
    source: { name: 'Wikimedia Commons', url: "https://commons.wikimedia.org/wiki/File:Beech_and_ferns_in_Gullmarsskogen.jpg", credit: "W.carter", terms: "CC0", termsUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en" },
  },
  {
    id: 'places:amsterdam-canals',
    category: 'places',
    src: '/gallery/places/amsterdam-canals.jpg',
    thumb: '/gallery/places/amsterdam-canals-thumb.jpg',
    takenAt: '2006-07-12T12:00:00Z',
    title: { tr: "Amsterdam kanalları, Hollanda", en: "Amsterdam canals, Netherlands" },
    source: { name: 'Wikimedia Commons', url: "https://commons.wikimedia.org/wiki/File:Amsterdam_Canals_-_July_2006.jpg", credit: "Diliff", terms: "CC BY 2.5", termsUrl: "https://creativecommons.org/licenses/by/2.5" },
  },
  {
    id: 'places:blue-mosque-dusk',
    category: 'places',
    src: '/gallery/places/blue-mosque-dusk.jpg',
    thumb: '/gallery/places/blue-mosque-dusk-thumb.jpg',
    takenAt: '2019-10-09T12:00:00Z',
    lat: 41.0057,
    lon: 28.9763,
    title: { tr: "Sultanahmet Camii avlusu akşamüstü, İstanbul", en: "Blue Mosque courtyard at dusk, Istanbul" },
    source: { name: 'Wikimedia Commons', url: "https://commons.wikimedia.org/wiki/File:Blue_Mosque_Courtyard_Dusk_Wikimedia_Commons.jpg", credit: "Benh LIEU SONG (Flickr)", terms: "CC BY-SA 3.0", termsUrl: "https://creativecommons.org/licenses/by-sa/3.0" },
  },
  {
    id: 'places:atrani-amalfi',
    category: 'places',
    src: '/gallery/places/atrani-amalfi.jpg',
    thumb: '/gallery/places/atrani-amalfi-thumb.jpg',
    takenAt: '2011-08-23T12:00:00Z',
    lat: 40.6328,
    lon: 14.6068,
    title: { tr: "Atrani, Amalfi Kıyısı, İtalya", en: "Atrani, Amalfi Coast, Italy" },
    source: { name: 'Wikimedia Commons', url: "https://commons.wikimedia.org/wiki/File:Atrani_(Costiera_Amalfitana,_23-8-2011).jpg", credit: "Paolo Costa Baldi", terms: "CC BY 3.0", termsUrl: "https://creativecommons.org/licenses/by/3.0" },
  },
  {
    id: 'places:uchisar-cappadocia',
    category: 'places',
    src: '/gallery/places/uchisar-cappadocia.jpg',
    thumb: '/gallery/places/uchisar-cappadocia-thumb.jpg',
    takenAt: '2014-04-21T12:00:00Z',
    lat: 38.6309,
    lon: 34.8054,
    title: { tr: "Uçhisar Kalesi, Kapadokya", en: "Uçhisar Castle, Cappadocia" },
    source: { name: 'Wikimedia Commons', url: "https://commons.wikimedia.org/wiki/File:Castle_U%C3%A7hisar_in_Cappadocia.jpg", credit: "Wolfgang Moroder", terms: "CC BY-SA 3.0", termsUrl: "https://creativecommons.org/licenses/by-sa/3.0" },
  },
  {
    id: 'places:lower-manhattan',
    category: 'places',
    src: '/gallery/places/lower-manhattan.jpg',
    thumb: '/gallery/places/lower-manhattan-thumb.jpg',
    takenAt: '2016-11-05T12:00:00Z',
    lat: 40.7271,
    lon: -74.0306,
    title: { tr: "Aşağı Manhattan, New York", en: "Lower Manhattan, New York" },
    source: { name: 'Wikimedia Commons', url: "https://commons.wikimedia.org/wiki/File:Lower_Manhattan_from_Jersey_City_November_2016_002.jpg", credit: "King of Hearts", terms: "CC BY-SA 4.0", termsUrl: "https://creativecommons.org/licenses/by-sa/4.0" },
  },
  {
    id: 'places:singapore-skyline',
    category: 'places',
    src: '/gallery/places/singapore-skyline.jpg',
    thumb: '/gallery/places/singapore-skyline-thumb.jpg',
    takenAt: '2018-06-04T12:00:00Z',
    lat: 1.2892,
    lon: 103.855,
    title: { tr: "Singapur'un merkezi akşam", en: "Central Singapore at night" },
    source: { name: 'Wikimedia Commons', url: "https://commons.wikimedia.org/wiki/File:Skyline_of_the_Central_Business_District_of_Singapore_with_Esplanade_Bridge.jpg", credit: "Basile Morin", terms: "CC BY-SA 4.0", termsUrl: "https://creativecommons.org/licenses/by-sa/4.0" },
  },
  {
    id: 'places:nyhavn-sunset',
    category: 'places',
    src: '/gallery/places/nyhavn-sunset.jpg',
    thumb: '/gallery/places/nyhavn-sunset-thumb.jpg',
    takenAt: '2018-04-28T12:00:00Z',
    lat: 55.6796,
    lon: 12.5913,
    title: { tr: "Nyhavn'da gün batımı, Kopenhag", en: "Sunset at Nyhavn, Copenhagen" },
    source: { name: 'Wikimedia Commons', url: "https://commons.wikimedia.org/wiki/File:2018_-_Nyhavn_on_sunset.jpg", credit: "Moahim", terms: "CC BY-SA 4.0", termsUrl: "https://creativecommons.org/licenses/by-sa/4.0" },
  },
  {
    id: 'places:halic-istanbul',
    category: 'places',
    src: '/gallery/places/halic-istanbul.jpg',
    thumb: '/gallery/places/halic-istanbul-thumb.jpg',
    takenAt: '2013-03-01T12:00:00Z',
    lat: 41.0276,
    lon: 28.9637,
    title: { tr: "Haliç, İstanbul", en: "Golden Horn, Istanbul" },
    source: { name: 'Wikimedia Commons', url: "https://commons.wikimedia.org/wiki/File:Hali%C3%A7_Tersaneleri_Mars_2013.jpg", credit: "Arild Vågen", terms: "CC BY-SA 3.0", termsUrl: "https://creativecommons.org/licenses/by-sa/3.0" },
  },
]

/** Seçilmiş görsel kaydının biçimi: kaynak bilgisi eksik görsel gösterilmez */
export function isValidCurated(img: CuratedImage): boolean {
  return (
    isFavoriteId(img.id) &&
    img.category !== ('mine' as string) &&
    GALLERY_CATEGORIES.includes(img.category) &&
    img.src.startsWith('/') &&
    img.thumb.startsWith('/') &&
    !Number.isNaN(Date.parse(img.takenAt)) &&
    !!img.source?.name &&
    /^https:\/\//.test(img.source.url) &&
    !!img.source.credit &&
    !!img.source.terms
  )
}

/* ---------- Uygulamayla gelen NASA EPIC anlık görüntüsü ---------- */

export interface EpicSnapshot {
  retrieved: string
  images: { image: string; date: string; lat: number; lon: number; url: string; local?: string; localThumb?: string }[]
}

export const EPIC_SOURCE = {
  name: 'NASA EPIC',
  instrument: 'DSCOVR',
  credit: 'NASA EPIC Team',
  terms: 'NASA media guidelines',
}

/** Anlık görüntüden yalnızca dosyası uygulamayla gelen fotoğraflar alınır (uzaktaki adresler çevrimdışı çalışmaz) */
export function epicImages(snapshot: EpicSnapshot | null): CuratedImage[] {
  if (!snapshot) return []
  return snapshot.images
    .filter((e) => e.local && e.localThumb && /^[A-Za-z0-9_-]{1,80}$/.test(e.image))
    .map((e) => ({
      id: `epic:${e.image}`,
      category: 'orbit' as const,
      src: e.local!,
      thumb: e.localThumb!,
      takenAt: `${e.date.replace(' ', 'T')}Z`,
      lat: e.lat,
      lon: e.lon,
      source: { ...EPIC_SOURCE, url: e.url },
    }))
    .filter(isValidCurated)
}

/* ---------- Favoriler ---------- */

export interface GalleryFavoriteDoc extends Doc {
  item: string
}

/** Favori olabilen seçilmiş görsel kimliği; kişisel fotoğraflar sunucuya hiç gitmez */
export const isFavoriteId = (id: unknown): id is string => typeof id === 'string' && /^(epic|nature|places):[A-Za-z0-9_-]{1,80}$/.test(id)
export const favoriteDocId = (astronaut: string, item: string) => `fav_${astronaut}_${item.replace(':', '_')}`

/* ---------- Kişisel fotoğraflar: sınırlar ---------- */

export interface PhotoLimits {
  /** Kabul edilen türler (MIME) ve dosyanın ilk baytlarındaki imzalar */
  types: readonly ('image/jpeg' | 'image/png' | 'image/webp')[]
  maxBytes: number
  maxCount: number
}

export const PHOTO_LIMITS: PhotoLimits = { types: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 8 * 1024 * 1024, maxCount: 40 }
