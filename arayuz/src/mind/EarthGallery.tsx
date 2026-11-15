import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, HardDrive, ImageOff, ImagePlus, MapPin, Star, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { GLASS_EASE as EASE, GlassDialog } from '../components/GlassDialog'
import { CURATED_EXTRA, epicImages, GALLERY_CATEGORIES, PHOTO_LIMITS, type CuratedImage, type EpicSnapshot, type GalleryCategory, type PhotoLimits } from '../core/gallery'
import { useHealth, useQuery } from '../data/health'
import { useI18n } from '../i18n'
import { defaultPhotoStore, PhotoStoreFailure, validatePhoto, type PhotoMeta, type PhotoRecord, type PhotoStore } from '../lib/photoStore'
import { usePrefersReducedMotion } from '../lib/settings'
import { formatCoords } from './wellbeing'

/*
 * Dünya galerisi (docs/wellbeing GAL-01…GAL-04), check-in ile aynı cam pencerede: Doğa, Şehirler ve tanıdık yerler,
 * Yörüngeden Dünya, Fotoğraflarım.
 * - Seçilmiş görseller yalnızca uygulamayla gelen ve kaynağı doğrulanmış varlıklardır: Doğa ve Şehirler için Wikimedia
 *   Commons'ın öne çıkan resimlerinden serbest lisanslı fotoğraflar (core/gallery CURATED_EXTRA), Yörüngeden Dünya için NASA
 *   EPIC anlık görüntüsü. Her görselin yazarı, lisansı ve özgün kaynağı görüntüleyicide yazar.
 * - Izgara: ilk görsel büyük, diğerleri yuvarlak köşeli karolar; üstüne gelince görsel hafifçe büyür, altta yer adı belirir.
 * - Görüntüleyici: büyük görsel; Geri, Önceki, Sonraki (ok tuşları da), konum yazısı, favori, kaynak ve küçük resim şeridi.
 *   Otomatik slayt gösterisi yoktur.
 * - Fotoğraflarım isteğe bağlıdır ve yalnızca bu tarayıcıda (IndexedDB) saklanır; gönderilmez, incelenmez.
 * - Favoriler mürettebat üyesine göre saklanır.
 */

type Item =
  | { kind: 'curated'; key: string; img: CuratedImage; alt: string; title: string; caption: string; src: string; thumb: string }
  | { kind: 'photo'; key: string; meta: PhotoMeta; alt: string; title: string; caption: string; src: string; thumb: string }

const loadBundledEpic = async (): Promise<EpicSnapshot> => {
  const r = await fetch(`${import.meta.env.BASE_URL}data/nasa/epic.json`)
  if (!r.ok) throw new Error(String(r.status))
  return (await r.json()) as EpicSnapshot
}

const newPhotoId = () => `ph_${crypto.randomUUID().replaceAll('-', '')}`
const MB = 1024 * 1024

/** Destek kütüphanesindeki "Başlat" ile açılan pencere */
export function GalleryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const l = t.mindPage.library
  return (
    <GlassDialog open={open} onClose={onClose} id="gallery-sheet" title={l.gallery.title} subtitle={t.mindPage.gallery.offline} closeLabel={l.close}>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-6 pt-5 pb-6 sm:px-10 sm:pb-8">
        <EarthGallery />
      </div>
    </GlassDialog>
  )
}

export function EarthGallery({
  photoStore = defaultPhotoStore(),
  loadEpic = loadBundledEpic,
  decode,
  limits = PHOTO_LIMITS,
}: {
  photoStore?: PhotoStore
  loadEpic?: () => Promise<EpicSnapshot>
  decode?: (b: Blob) => Promise<{ width: number; height: number }>
  limits?: PhotoLimits
}) {
  const { t, lang, locale } = useI18n()
  const g = t.mindPage.gallery
  const { astronaut, canEdit, mutate } = useHealth()
  const reduced = usePrefersReducedMotion()
  const ids = useId()
  const [category, setCategory] = useState<GalleryCategory>('nature')
  const [viewing, setViewing] = useState<number | null>(null)
  const [notice, setNotice] = useState<{ kind: 'status' | 'alert'; lines: string[] } | null>(null)
  const openedFrom = useRef<string | null>(null)
  const grid = useRef<HTMLUListElement>(null)
  const backButton = useRef<HTMLButtonElement>(null)

  /* ---------- Seçilmiş görseller ---------- */

  const [epic, setEpic] = useState<EpicSnapshot | null>(null)
  // Uygulamanın kendi dosyaları da yüklenemeyebilir (sunucuya ulaşılamıyor): boş kategori gibi gösterilmez
  const [epicState, setEpicState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    loadEpic()
      .then((s) => {
        if (!live) return
        setEpic(s)
        setEpicState('ok')
      })
      .catch(() => live && setEpicState('error'))
    return () => {
      live = false
    }
  }, [loadEpic, attempt])
  const [brokenImage, setBrokenImage] = useState<string | null>(null)
  // Küçük resmi yüklenemeyen karolar (ör. uygulama önbelleğe almadan ağ kesildiyse); sessizce boş karo gösterilmez
  const [brokenThumbs, setBrokenThumbs] = useState<ReadonlySet<string>>(() => new Set())
  const [thumbAttempt, setThumbAttempt] = useState(0)
  const markThumbBroken = (key: string) => setBrokenThumbs((s) => (s.has(key) ? s : new Set(s).add(key)))
  const retryThumbs = () => {
    setBrokenThumbs(new Set())
    setThumbAttempt((n) => n + 1)
  }
  const dateFmt = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }), [locale])
  const dateTimeFmt = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }), [locale])
  const curated = useMemo(() => [...epicImages(epic), ...CURATED_EXTRA], [epic])
  const favorites = useQuery('galleryFavorites', astronaut ? [astronaut] : null)
  const favSet = useMemo(() => new Set(favorites ?? []), [favorites])

  /* ---------- Kişisel fotoğraflar ---------- */

  const mineAllowed = !!astronaut && canEdit
  const [photos, setPhotos] = useState<PhotoRecord[] | null>(null)
  const [storeError, setStoreError] = useState(false)
  const urls = useRef(new Map<string, string>())
  const reloadPhotos = async () => {
    if (!mineAllowed) return setPhotos([])
    try {
      setPhotos(await photoStore.list(astronaut!))
      setStoreError(false)
    } catch {
      setPhotos([])
      setStoreError(true)
    }
  }
  useEffect(() => {
    void reloadPhotos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [astronaut, mineAllowed, photoStore])
  // Nesne adresleri (blob:) fotoğraf başına bir kez açılır; fotoğraf silinince ya da galeri kapanınca bırakılır
  const urlFor = (p: PhotoRecord) => {
    let u = urls.current.get(p.id)
    if (!u) {
      u = URL.createObjectURL(p.blob)
      urls.current.set(p.id, u)
    }
    return u
  }
  useEffect(() => {
    const map = urls.current
    return () => {
      for (const u of map.values()) URL.revokeObjectURL(u)
      map.clear()
    }
  }, [])

  /* ---------- Gösterilen liste ---------- */

  const place = (lat?: number, lon?: number) => (lat !== undefined && lon !== undefined ? formatCoords(lat, lon, lang) : '')
  const items: Item[] =
    category === 'mine'
      ? (photos ?? []).map((p) => {
          const src = urlFor(p)
          return { kind: 'photo', key: p.id, meta: p, alt: g.mine.alt(p.name, dateFmt.format(p.addedAt)), title: p.name, caption: dateFmt.format(p.addedAt), src, thumb: src }
        })
      : curated
          .filter((c) => c.category === category)
          .map((c) => {
            const date = dateFmt.format(Date.parse(c.takenAt))
            // Doğa ve şehir fotoğraflarının yer adı var; EPIC görüntüleri tarih ve konumla anlatılır
            return c.title
              ? { kind: 'curated', key: c.id, img: c, alt: g.photoAlt(c.title[lang], c.source.credit), title: c.title[lang], caption: date, src: c.src, thumb: c.thumb }
              : { kind: 'curated', key: c.id, img: c, alt: g.epicAlt(date, place(c.lat, c.lon)), title: g.epicTitle, caption: `${date} · ${place(c.lat, c.lon)}`, src: c.src, thumb: c.thumb }
          })
  const isFavorite = (it: Item) => (it.kind === 'photo' ? it.meta.favorite : favSet.has(it.img.id))
  const current = viewing !== null ? items[viewing] : null

  const chooseCategory = (c: GalleryCategory) => {
    setCategory(c)
    setViewing(null)
    setNotice(null)
  }
  const open = (i: number) => {
    openedFrom.current = items[i].key
    setNotice(null)
    setViewing(i)
  }
  const back = () => setViewing(null)
  // Görüntüleyici açılınca odak Geri'ye; kapanınca açılan küçük resme döner
  useEffect(() => {
    if (viewing !== null) backButton.current?.focus()
    else if (openedFrom.current) grid.current?.querySelector<HTMLElement>(`[data-item="${CSS.escape(openedFrom.current)}"]`)?.focus()
    // Yalnızca açılıp kapanınca
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewing === null])

  const go = (d: -1 | 1) => setViewing((v) => (v === null ? v : Math.min(items.length - 1, Math.max(0, v + d))))
  const onViewerKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'ArrowLeft') go(-1)
    else if (e.key === 'ArrowRight') go(1)
    else return
    e.preventDefault()
  }

  const toggleFavorite = async (it: Item) => {
    const on = !isFavorite(it)
    try {
      if (it.kind === 'photo') {
        await photoStore.setFavorite(astronaut!, it.meta.id, on)
        await reloadPhotos()
      } else {
        const r = await mutate('setGalleryFavorite', astronaut!, it.img.id, on)
        if (!r?.ok) throw new Error('favorite')
      }
    } catch {
      setNotice({ kind: 'alert', lines: [g.favoriteFailed] })
    }
  }

  /* ---------- Yükleme ve silme ---------- */

  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const upload = async (files: File[]) => {
    if (!files.length || !mineAllowed) return
    setBusy(true)
    const errors: string[] = []
    let added = 0
    let count = photos?.length ?? 0
    const mb = Math.round(limits.maxBytes / MB)
    for (const f of files) {
      const v = await validatePhoto(f, { count, limits, decode })
      if (!v.ok) {
        errors.push(v.error === 'size' ? g.mine.errors.size(f.name, mb) : v.error === 'count' ? g.mine.errors.count(f.name, limits.maxCount) : g.mine.errors[v.error](f.name))
        continue
      }
      try {
        await photoStore.add({ id: newPhotoId(), astronaut: astronaut!, name: f.name.slice(0, 120), type: v.type, size: f.size, addedAt: Date.now(), width: v.width, height: v.height, favorite: false, blob: f })
        added++
        count++
      } catch (e) {
        const reason = e instanceof PhotoStoreFailure ? e.reason : 'unavailable'
        errors.push(reason === 'quota' ? g.mine.errors.quota(f.name) : g.mine.errors.unavailable)
        // Yer kalmadıysa ya da kayıt yoksa sonraki dosyalar da yazılamaz
        break
      }
    }
    await reloadPhotos()
    setBusy(false)
    setNotice(errors.length ? { kind: 'alert', lines: [...(added ? [g.mine.added(added)] : []), ...errors] } : { kind: 'status', lines: [g.mine.added(added)] })
  }

  const [confirming, setConfirming] = useState(false)
  const confirmButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (confirming) confirmButton.current?.focus()
  }, [confirming])
  const remove = async (it: Extract<Item, { kind: 'photo' }>) => {
    try {
      await photoStore.remove(astronaut!, it.meta.id)
    } catch {
      setConfirming(false)
      setNotice({ kind: 'alert', lines: [g.mine.deleteFailed] })
      return
    }
    const u = urls.current.get(it.meta.id)
    if (u) URL.revokeObjectURL(u)
    urls.current.delete(it.meta.id)
    setConfirming(false)
    openedFrom.current = null
    setViewing(null)
    await reloadPhotos()
    setNotice({ kind: 'status', lines: [g.mine.deleted] })
  }
  useEffect(() => setConfirming(false), [viewing])

  const typeNames = limits.types.map((x) => x.replace('image/', '').toUpperCase()).join(', ')
  // Cam düğmeler: oval, ince çerçeve; basınca hafifçe çöker
  const glassButton =
    'flex min-h-11 items-center justify-center gap-2 rounded-full bg-white/[0.05] px-4 text-[14.5px] font-medium text-ink ring-1 ring-white/12 backdrop-blur-md transition-[background-color,transform,opacity] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/[0.1] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35'

  return (
    <div className="flex flex-col gap-5" data-category={category}>
      {/* Kategoriler: oval sekmeler */}
      <fieldset className="min-w-0">
        <legend className="sr-only">{g.categoriesLabel}</legend>
        <div className="flex flex-wrap gap-1.5">
          {GALLERY_CATEGORIES.map((c) => {
            const checked = category === c
            return (
              <label
                key={c}
                className={`group/cat relative flex min-h-11 cursor-pointer items-center rounded-full px-4 text-[15px] font-medium transition-colors duration-500 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-holo ${checked ? 'text-ink' : 'text-ink-muted hover:text-ink'}`}
              >
                <span
                  aria-hidden
                  className={`pointer-events-none absolute inset-0 rounded-full transition-opacity duration-500 ${checked ? 'bg-gradient-to-r from-holo/[0.28] via-holo/[0.1] to-white/[0.04] opacity-100 ring-1 ring-holo/30' : 'opacity-100 ring-1 ring-white/10 group-hover/cat:bg-white/[0.05]'}`}
                />
                <input type="radio" name={`${ids}-category`} checked={checked} onChange={() => chooseCategory(c)} className="absolute inset-0 size-full cursor-pointer appearance-none rounded-full opacity-0" />
                <span className="pointer-events-none relative">{g.categories[c]}</span>
              </label>
            )
          })}
        </div>
      </fieldset>

      {notice && (
        <div role={notice.kind} className={`rounded-2xl px-4 py-3 text-[15px] leading-snug ring-1 ${notice.kind === 'alert' ? 'bg-warn/[0.06] text-ink ring-warn/30' : 'bg-white/[0.03] text-ink-muted ring-white/10'}`}>
          {notice.lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      )}

      {current ? (
        /* ---------- Görüntüleyici ---------- */
        <section aria-label={g.viewer.label} onKeyDown={onViewerKey} className="flex flex-col gap-4" data-viewer={current.key}>
          <div className="relative overflow-hidden rounded-[1.75rem] bg-black shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div key={current.key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.35, ease: EASE }}>
                {brokenImage === current.key ? (
                  <p role="status" className="flex h-[min(48dvh,470px)] items-center justify-center px-6 text-center text-[15.5px] text-ink-muted">
                    {g.imageFailed}
                  </p>
                ) : (
                  <img src={current.src} alt={current.alt} onError={() => setBrokenImage(current.key)} className="h-[min(48dvh,470px)] w-full object-contain" />
                )}
              </motion.div>
            </AnimatePresence>

            {/* Üstte: Geri ve sıra; altta: başlık ve tarih (koyulaşan geçiş üzerinde) */}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-gradient-to-b from-black/55 to-transparent p-3 sm:p-4">
              <button ref={backButton} type="button" onClick={back} className={`pointer-events-auto ${glassButton}`}>
                <ArrowLeft size={16} strokeWidth={1.75} aria-hidden />
                {g.viewer.back}
              </button>
              <p className="tabular rounded-full bg-black/40 px-3 py-1 font-mono text-[13px] text-ink backdrop-blur" aria-live="polite">
                {g.viewer.position(viewing! + 1, items.length)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={viewing === 0}
              aria-label={g.viewer.previous}
              title={g.viewer.previous}
              className={`absolute top-1/2 left-3 -translate-y-1/2 !px-0 ${glassButton} size-12`}
            >
              <ChevronLeft size={20} strokeWidth={1.75} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              disabled={viewing === items.length - 1}
              aria-label={g.viewer.next}
              title={g.viewer.next}
              className={`absolute top-1/2 right-3 -translate-y-1/2 !px-0 ${glassButton} size-12`}
            >
              <ChevronRight size={20} strokeWidth={1.75} aria-hidden />
            </button>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-4 pt-14 sm:p-5 sm:pt-16">
              <div className="min-w-0">
                <p className="truncate font-display text-[20px] font-semibold tracking-tight md:text-[24px]">{current.title}</p>
                <p className="mt-0.5 truncate text-[14px] text-ink-muted">{current.caption}</p>
              </div>
              {astronaut && (current.kind === 'photo' || canEdit) && (
                <button
                  type="button"
                  onClick={() => void toggleFavorite(current)}
                  aria-pressed={isFavorite(current)}
                  className={`pointer-events-auto shrink-0 ${glassButton} aria-pressed:bg-holo/20 aria-pressed:text-holo aria-pressed:ring-holo/40`}
                >
                  <Star size={16} strokeWidth={1.75} aria-hidden className={isFavorite(current) ? 'fill-current' : ''} />
                  {isFavorite(current) ? g.unfavorite : g.favorite}
                </button>
              )}
            </div>
          </div>

          {/* Küçük resim şeridi: aynı kategorideki görsellere atlar */}
          {items.length > 1 && (
            <div className="scroll-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-hidden>
              {items.map((it, i) => (
                <button
                  key={it.key}
                  type="button"
                  tabIndex={-1}
                  onClick={() => setViewing(i)}
                  className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-xl transition-[opacity,transform] duration-500 ${i === viewing ? 'opacity-100 ring-2 ring-holo' : 'opacity-55 ring-1 ring-white/10 hover:opacity-100'}`}
                >
                  <img src={it.thumb} alt="" loading="lazy" className="size-full object-cover" draggable={false} />
                </button>
              ))}
            </div>
          )}

          {current.kind === 'curated' ? (
            <section aria-label={g.source.title} className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[14px] leading-snug text-ink-muted" data-source>
              <h3 className="sr-only">{g.source.title}</h3>
              <span className="font-medium text-ink">{current.img.source.instrument ? g.source.by(current.img.source.name, current.img.source.instrument) : current.img.source.name}</span>
              <span>{current.img.title ? g.source.date(dateFmt.format(Date.parse(current.img.takenAt))) : g.source.taken(dateTimeFmt.format(Date.parse(current.img.takenAt)))}</span>
              {current.img.lat !== undefined && current.img.lon !== undefined && current.img.title && (
                <span className="flex items-center gap-1">
                  <MapPin size={13} strokeWidth={1.75} aria-hidden />
                  {place(current.img.lat, current.img.lon)}
                </span>
              )}
              <span>{g.source.credit(current.img.source.credit)}</span>
              <span>
                {current.img.source.termsUrl ? (
                  <a href={current.img.source.termsUrl} target="_blank" rel="noreferrer" className="underline decoration-white/25 underline-offset-2 hover:text-holo">
                    {g.source.terms(current.img.source.terms)}
                  </a>
                ) : (
                  g.source.terms(current.img.source.terms)
                )}
              </span>
              <span className="flex items-center gap-1.5">
                <HardDrive size={13} strokeWidth={1.75} aria-hidden className="text-holo" />
                {g.offline}
              </span>
              <a href={current.img.source.url} target="_blank" rel="noreferrer" className="inline-flex min-h-6 items-center gap-1 text-holo underline-offset-2 hover:underline">
                {current.img.title ? g.source.originalCommons : g.source.original}
                <ExternalLink size={13} aria-hidden />
              </a>
            </section>
          ) : (
            <div className="flex flex-wrap items-center gap-3 text-[14.5px]">
              <p className="flex items-center gap-1.5 text-ink-muted">
                <HardDrive size={14} aria-hidden className="text-holo" />
                {g.mine.stored}
              </p>
              {confirming ? (
                <div role="alertdialog" aria-label={g.mine.delete} aria-describedby={`${ids}-confirm`} className="flex flex-wrap items-center gap-2">
                  <p id={`${ids}-confirm`} className="text-ink">
                    {g.mine.confirmDelete}
                  </p>
                  <button type="button" onClick={() => setConfirming(false)} className={glassButton}>
                    {g.mine.cancel}
                  </button>
                  <button
                    ref={confirmButton}
                    type="button"
                    onClick={() => void remove(current)}
                    className="flex min-h-11 items-center gap-2 rounded-full bg-crit/10 px-4 text-sm font-medium text-crit ring-1 ring-crit/40 transition-colors hover:bg-crit/20"
                  >
                    <Trash2 size={15} aria-hidden />
                    {g.mine.confirm}
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirming(true)} className={`${glassButton} ml-auto`}>
                  <Trash2 size={15} strokeWidth={1.75} aria-hidden />
                  {g.mine.delete}
                </button>
              )}
            </div>
          )}
        </section>
      ) : (
        /* ---------- Izgara ---------- */
        <>
          {category === 'orbit' && epic && <p className="text-[14.5px] text-ink-muted">{g.snapshot(dateFmt.format(Date.parse(epic.retrieved)))}</p>}
          {(category === 'nature' || category === 'places') && <p className="text-[14px] leading-snug text-ink-dim">{g.curatedNote}</p>}
          {category === 'mine' && (
            <div className="flex flex-col gap-2 rounded-[1.5rem] bg-white/[0.025] p-5 text-[15px] leading-snug ring-1 ring-white/[0.08]" data-mine-intro>
              <p className="text-ink">{g.mine.intro}</p>
              <p className="text-ink-muted">{g.mine.asIs}</p>
              <p className="text-ink-muted" data-limits>
                {g.mine.limits(typeNames, Math.round(limits.maxBytes / MB), limits.maxCount)}
              </p>
              {mineAllowed && (
                <>
                  <input
                    ref={fileInput}
                    type="file"
                    accept={limits.types.join(',')}
                    multiple
                    hidden
                    data-photo-input
                    onChange={(e) => {
                      const files = [...(e.target.files ?? [])]
                      e.target.value = ''
                      void upload(files)
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    disabled={busy || storeError}
                    className="mt-1 flex min-h-11 w-fit items-center gap-2 rounded-full bg-holo px-5 text-[15px] font-semibold text-void shadow-[0_10px_40px_-14px_var(--color-holo)] transition-transform active:scale-[0.97] disabled:opacity-50"
                  >
                    <ImagePlus size={16} aria-hidden />
                    {g.mine.add}
                  </button>
                </>
              )}
              {storeError && <p role="alert">{g.mine.errors.unavailable}</p>}
            </div>
          )}

          {category === 'orbit' && epicState !== 'ok' ? (
            epicState === 'loading' ? (
              <p className="text-[15px] text-ink-muted">{g.loading}</p>
            ) : (
              <div role="alert" className="flex flex-col gap-3 rounded-[1.5rem] bg-white/[0.025] px-5 py-5 text-[15.5px] text-ink ring-1 ring-white/[0.08]">
                <p>{g.loadFailed}</p>
                <button
                  type="button"
                  onClick={() => {
                    setEpicState('loading')
                    setAttempt((n) => n + 1)
                  }}
                  className={`${glassButton} w-fit`}
                >
                  {g.retry}
                </button>
              </div>
            )
          ) : category === 'mine' && photos === null ? (
            <p className="text-[15px] text-ink-muted">{g.mine.loading}</p>
          ) : items.length === 0 ? (
            <p className="rounded-[1.5rem] px-5 py-8 text-center text-[15.5px] leading-snug text-ink-muted ring-1 ring-white/[0.08] ring-inset" data-empty>
              {category === 'mine' ? g.mine.empty : g.emptyCurated}
            </p>
          ) : (
            <>
              {category !== 'mine' && items.some((it) => brokenThumbs.has(it.key)) && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] bg-white/[0.025] px-5 py-4 text-[15.5px] text-ink ring-1 ring-white/[0.08]">
                  <p>{g.loadFailed}</p>
                  <button type="button" onClick={retryThumbs} className={glassButton}>
                    {g.retry}
                  </button>
                </div>
              )}
              <ul ref={grid} aria-label={g.gridLabel(g.categories[category])} className="grid auto-rows-[9.5rem] grid-cols-2 gap-3 sm:auto-rows-[11rem] sm:grid-cols-3 lg:grid-cols-4">
                {items.map((it, i) => (
                  <motion.li
                    key={it.key}
                    className={`relative ${i === 0 && items.length > 2 ? 'col-span-2 row-span-2' : ''}`}
                    initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: reduced ? 0 : Math.min(i, 10) * 0.04, ease: EASE }}
                  >
                    <button
                      type="button"
                      onClick={() => open(i)}
                      aria-label={g.open(it.alt)}
                      data-item={it.key}
                      className="group/tile relative block size-full overflow-hidden rounded-[1.35rem] bg-black shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-holo"
                    >
                      {brokenThumbs.has(it.key) && (
                        <span aria-hidden className="absolute inset-0 flex items-center justify-center bg-white/[0.03] text-ink-dim">
                          <ImageOff size={26} strokeWidth={1.5} />
                        </span>
                      )}
                      <img
                        key={thumbAttempt}
                        src={it.thumb}
                        alt=""
                        loading="lazy"
                        onError={() => markThumbBroken(it.key)}
                        className={`size-full object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.32,0.72,0,1)] group-hover/tile:scale-[1.05] group-focus-visible/tile:scale-[1.05] ${brokenThumbs.has(it.key) ? 'invisible' : ''}`}
                        draggable={false}
                      />
                      {/* Altta yer adı: büyük karoda hep, diğerlerinde üstüne gelince */}
                      <span
                        className={`pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-start bg-gradient-to-t from-black/75 via-black/30 to-transparent p-3 pt-10 text-left transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${i === 0 && items.length > 2 ? 'opacity-100' : 'translate-y-1 opacity-0 group-hover/tile:translate-y-0 group-hover/tile:opacity-100 group-focus-visible/tile:translate-y-0 group-focus-visible/tile:opacity-100'}`}
                        aria-hidden
                      >
                        <span className={`font-display leading-tight font-semibold text-ink ${i === 0 && items.length > 2 ? 'text-[20px] md:text-[22px]' : 'line-clamp-2 text-[14.5px]'}`}>{it.title}</span>
                        <span className="mt-0.5 text-[12.5px] text-ink-muted">{it.caption}</span>
                      </span>
                    </button>
                    {isFavorite(it) && (
                      <span className="pointer-events-none absolute top-2.5 right-2.5 flex size-8 items-center justify-center rounded-full bg-black/55 text-holo backdrop-blur" data-favorite>
                        <Star size={14} className="fill-current" aria-hidden />
                        <span className="sr-only">{g.favoriteMark}</span>
                      </span>
                    )}
                  </motion.li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  )
}
