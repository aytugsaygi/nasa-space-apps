# Credits for bundled images

Every curated image shown in the Earth gallery (Wellbeing page, support library), with its source, author and terms. 3D models keep their own licence files in `arayuz/public/models/`; SI-generated media are listed in `SI-DISCLOSURE.md`. Only assets listed here may be shown as curated content. If a source or terms cannot be verified, the asset is not used; the category shows an empty state instead.

Last updated: 2026-11-15.

## Earth gallery

| Category | Assets | Source | Credit shown | Terms shown | Available offline |
|---|---|---|---|---|---|
| Nature | 8 photos (1280 px) + 8 thumbnails (640 px), `arayuz/public/gallery/nature/` (3.2 MB). Listed in `CURATED_EXTRA` in `arayuz/src/core/gallery.ts`. | Wikimedia Commons featured pictures. License, author, date and GPS were read from each file page (`extmetadata`) on 2026-11-15. | Each photographer's name (table below) | The file's own free license (CC0, CC BY or CC BY-SA), linked to creativecommons.org | Yes: bundled with the app and served by it |
| Cities and familiar places | 8 photos + 8 thumbnails, `arayuz/public/gallery/places/` (2.8 MB). Same listing. | Same as Nature | Same as Nature | Same as Nature | Yes: bundled with the app and served by it |
| Earth from orbit | 11 full images + 11 thumbnails, `arayuz/public/data/nasa/epic/` (2.5 MB) and `epic/thumbs/` (88 KB). Listed in `arayuz/public/data/nasa/epic.json` (snapshot retrieved 2026-11-08). | NASA EPIC camera on NOAA's DSCOVR spacecraft. Each image links to its original URL on `epic.gsfc.nasa.gov` (from the snapshot). | "NASA EPIC Team" | "NASA media guidelines" (the same wording the app's credits page already uses for NASA SVS textures) | Yes: bundled with the app and served by it |
| My photos | The crew member's own uploads | The crew member | — | — | Yes: stored only in this browser (IndexedDB) |

### Nature and city photos

The images were resized only (1280 px and 640 px wide JPEG); nothing else was changed. CC BY-SA requires that changed copies keep the same license; the resized copies are shared under the license of the original file.

| Id | Place | Author | License | Commons file page |
|---|---|---|---|---|
| `nature:ossau-lake` | Lake Gentau and Pic du Midi d'Ossau, Pyrenees | Myrabella | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:Gentau_Pic_du_Midi_Ossau.jpg |
| `nature:sils-lake` | Lake Sils, Engadine, Switzerland | Hansueli Krapf | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:2011-08-01_10-31-42_Switzerland_Segl-Maria.jpg |
| `nature:karula-view` | Karula uplands, Estonia | Amadvr | CC BY-SA 3.0 ee | https://commons.wikimedia.org/wiki/File:Karula_vaade.jpg |
| `nature:barycz-valley` | Barycz Valley, Poland | Bartosz Dworski | CC BY-SA 3.0 pl | https://commons.wikimedia.org/wiki/File:Dolina_Baryczy_1.jpg |
| `nature:dulmen-forest` | Forest path, Dülmen, Germany | Dietmar Rabich | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:D%C3%BClmen,_B%C3%B6rnste,_Waldweg_--_2015_--_4649.jpg |
| `nature:synevyr-autumn` | Autumn in Synevyr National Park, Carpathians | Rbrechko | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:21-224-5054_NNP_Synevyr_RB_18.jpg |
| `nature:lake-louise` | Lake Louise, Banff, Canada | Chensiyuan | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:1_lake_louise_pano_2019.jpg |
| `nature:beech-ferns` | Beech trees and ferns, Gullmarsskogen, Sweden | W.carter | CC0 | https://commons.wikimedia.org/wiki/File:Beech_and_ferns_in_Gullmarsskogen.jpg |
| `places:amsterdam-canals` | Amsterdam canals, Netherlands | Diliff | CC BY 2.5 | https://commons.wikimedia.org/wiki/File:Amsterdam_Canals_-_July_2006.jpg |
| `places:blue-mosque-dusk` | Blue Mosque courtyard at dusk, Istanbul | Benh LIEU SONG (Flickr) | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:Blue_Mosque_Courtyard_Dusk_Wikimedia_Commons.jpg |
| `places:atrani-amalfi` | Atrani, Amalfi Coast, Italy | Paolo Costa Baldi | CC BY 3.0 | https://commons.wikimedia.org/wiki/File:Atrani_(Costiera_Amalfitana,_23-8-2011).jpg |
| `places:uchisar-cappadocia` | Uçhisar Castle, Cappadocia | Wolfgang Moroder | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:Castle_U%C3%A7hisar_in_Cappadocia.jpg |
| `places:lower-manhattan` | Lower Manhattan, New York | King of Hearts | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Lower_Manhattan_from_Jersey_City_November_2016_002.jpg |
| `places:singapore-skyline` | Central Singapore at night | Basile Morin | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Skyline_of_the_Central_Business_District_of_Singapore_with_Esplanade_Bridge.jpg |
| `places:nyhavn-sunset` | Sunset at Nyhavn, Copenhagen | Moahim | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:2018_-_Nyhavn_on_sunset.jpg |
| `places:halic-istanbul` | Golden Horn, Istanbul | Arild Vågen | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:Hali%C3%A7_Tersaneleri_Mars_2013.jpg |

Notes:

- Only EPIC entries with a bundled copy (`local` and `localThumb`) are shown. Images that exist only on NASA's server (for example from the live API through `/api/nasa/epic`) are not shown in the gallery, because they would not work offline.
- The gallery says the EPIC images are a bundled snapshot and not live.
- The "Original on NASA's website" link is the only part that needs internet; the UI says so.
- The Cupola views are SI-generated videos (see `SI-DISCLOSURE.md`), so they are not in the gallery.

### Adding curated images

1. Put the file and a thumbnail under `arayuz/public/gallery/`.
2. Add a row here with the source page, credit line and terms, as stated by the source.
3. Add an entry to `CURATED_EXTRA` in `arayuz/src/core/gallery.ts`. `isValidCurated` rejects entries without a local file, an `https` source URL, a credit or terms.

## Personal photos (privacy facts)

- Stored as `Blob`s in IndexedDB database `vitalis-photos`, store `photos`, keyed by photo id with an `astronaut` index. Not in `localStorage`, not as base64.
- Never sent to the server or to anyone, and not analyzed. Favorites of personal photos are stored in the same IndexedDB record, not in the shared data store.
- Files are saved as they are. Metadata (for example EXIF location) is **not** removed, and nothing is encrypted. The UI says this.
- Limits (`PHOTO_LIMITS` in `core/gallery.ts`, shown in the UI): JPEG, PNG, WEBP (checked by file signature, not the extension); up to 8 MB each; up to 40 photos per crew member in this browser.
- Clearing the browser's site data deletes the photos. A private window may have no persistent storage; the UI then says photo storage is unavailable.
