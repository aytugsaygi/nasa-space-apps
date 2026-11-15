import { Image as ImageIcon, Maximize2, Minimize2, Play, Volume2, VolumeX } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { GLASS_EASE as EASE, GlassDialog } from '../components/GlassDialog'
import { resolve, useI18n } from '../i18n'
import { startWhiteNoise } from '../lib/audio'
import { useInteraction } from '../lib/interaction'
import { usePrefersReducedMotion } from '../lib/settings'
import { CUPOLA_SESSIONS, type SessionId } from './wellbeing'

/*
 * Destek kütüphanesindeki Cupola (docs/wellbeing CUP-01…CUP-04): Uluslararası Uzay İstasyonu'nun Cupola penceresinden
 * Dünya'ya bakış, check-in ile aynı cam pencerede. Dört manzara (gün doğumu, Sahra ve Nil, Hint Okyanusu, gece ışıkları)
 * birer videodur.
 * - Pencere büyük bir sahne gösterir; kontroller sahnenin altında yüzen cam bir çubuktadır (manzara, video / durağan
 *   görüntü, ses, tam ekran). "Tam ekran" aynı sayfada pencereyi bütün ekrana yayar; arkadaki sayfa hafif bulanık görünür.
 *   Tam ekranda fare ve klavye kullanılmayınca çubuk solar; fareyi oynatmak ya da Tab kullanmak geri getirir. Esc önce tam
 *   ekrandan çıkar, sonra pencereyi kapatır.
 * - Videolar yapay zekâ ile üretilmiştir (sol üstte görünür "AI GENERATED" filigranı); gerçek ya da canlı ISS görüntüsü
 *   değildir. Kamera sabittir; yalnızca Dünya yavaşça kayar. Her video yarı hıza yavaşlatılmış ve sonu başına yumuşak bir
 *   geçişle bağlanmıştır: sessiz ve kesintisiz döngüde oynar, bitmez.
 * - Durağan görüntü: aynı videonun filigranlı tek karesi; hiçbir şey hareket etmez. Cihaz hareketi azaltmayı istiyorsa
 *   varsayılandır; video yüklenemezse kendiliğinden gösterilir (boş hata ekranı yok).
 * - Ses: açılışta sessiz; isteğe bağlı beyaz gürültü. Çıkışta ses durur.
 * - Nefes molasıyla birleştirilmez (SUP-02).
 * Videolar ve kareler uygulamayla birlikte gelir; internet bağlantısı gerekmez.
 */

type Mode = 'video' | 'still'
type Audio = 'silent' | 'whiteNoise'
type Fallback = 'videoError' | 'reduced' | null

const base = `${import.meta.env.BASE_URL}videos/cupola/`
const videoSrc = (id: SessionId) => `${base}${id}.mp4`
const stillSrc = (id: SessionId) => `${base}${id}.jpg`
/** Tam ekranda çubuk bu kadar hareketsizlikten sonra solar */
const IDLE_MS = 3000

/** Pencere: destek kütüphanesindeki "Başlat" ile açılır */
export function CupolaDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang } = useI18n()
  const reduced = usePrefersReducedMotion()
  const l = t.mindPage.library
  const [expanded, setExpanded] = useState(false)
  const [scene, setScene] = useState<SessionId>('sahara')
  const sceneTitle = useMemo(() => resolve(CUPOLA_SESSIONS, lang).find((s) => s.id === scene)!.title, [lang, scene])
  // Pencere kapanınca tam ekran sıfırlanır
  useEffect(() => {
    if (!open) setExpanded(false)
  }, [open])
  return (
    <GlassDialog
      open={open}
      // Esc ve arka plana basmak önce tam ekrandan çıkar
      onClose={() => (expanded ? setExpanded(false) : onClose())}
      id="cupola-sheet"
      title={l.cupola.title}
      subtitle={sceneTitle}
      closeLabel={l.close}
      expanded={expanded}
    >
      <CupolaLook reducedMotion={reduced} expanded={expanded} onToggleExpand={() => setExpanded((v) => !v)} onScene={setScene} />
    </GlassDialog>
  )
}

export function CupolaLook({
  reducedMotion,
  expanded = false,
  onToggleExpand,
  onScene,
}: {
  reducedMotion: boolean
  expanded?: boolean
  onToggleExpand?: () => void
  onScene?: (id: SessionId) => void
}) {
  const { t, lang } = useI18n()
  const c = t.mindPage.cupola
  const ids = useId()
  const sessions = useMemo(() => resolve(CUPOLA_SESSIONS, lang), [lang])
  const [mode, setMode] = useState<Mode>(() => (reducedMotion ? 'still' : 'video'))
  const [videoFailed, setVideoFailed] = useState<SessionId | null>(null)
  const [sessionId, setSessionId] = useState<SessionId>('sahara')
  const [audio, setAudio] = useState<Audio>('silent')
  const [audioFailed, setAudioFailed] = useState(false)
  const [stillBroken, setStillBroken] = useState<SessionId | null>(null)
  const [barVisible, setBarVisible] = useState(true)
  const canPlay = videoFailed !== sessionId
  const effective: Mode = canPlay ? mode : 'still'
  const fallback: Fallback = !canPlay ? 'videoError' : reducedMotion && mode === 'still' ? 'reduced' : null
  const title = sessions.find((s) => s.id === sessionId)!.title
  // Cupola açıkken otomatik içerik (ör. check-in sorusu) açılmaz
  useInteraction('library', true)

  const chooseScene = (id: SessionId) => {
    setSessionId(id)
    onScene?.(id)
  }

  // Ses yalnızca seçilince çalar; seçim değişince ya da çıkışta durur
  const stopNoise = useRef<(() => void) | null>(null)
  const chooseAudio = (a: Audio) => {
    setAudio(a)
    stopNoise.current?.()
    stopNoise.current = null
    setAudioFailed(false)
    if (a !== 'whiteNoise') return
    stopNoise.current = startWhiteNoise()
    if (!stopNoise.current) setAudioFailed(true)
  }
  useEffect(() => () => stopNoise.current?.(), [])

  // Video sessiz ve döngüde; görünür olunca oynar. Tarayıcı kendiliğinden oynatmayı engellerse kare görünür kalır.
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = video.current
    if (!v || effective !== 'video') return
    v.muted = true
    void v.play().catch(() => {})
  }, [effective, sessionId])

  // Tam ekranda çubuk, hareketsizlikte solar; hareket ya da tuş geri getirir. Tam ekran dışında hep görünür.
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wake = () => {
    setBarVisible(true)
    if (idle.current) clearTimeout(idle.current)
    if (expanded) idle.current = setTimeout(() => setBarVisible(false), IDLE_MS)
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    wake()
    return () => {
      if (idle.current) clearTimeout(idle.current)
    }
    // yalnızca tam ekran değişince yeniden kurulur
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded])

  const barHidden = expanded && !barVisible

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-3 px-6 pt-4 pb-5 sm:px-10 sm:pb-7" data-cupola-mode={effective} data-expanded={expanded}>
      {fallback && (
        <p role="status" className="shrink-0 text-[14.5px] leading-snug text-ink-muted" data-fallback={fallback}>
          {c.fallback[fallback]}
        </p>
      )}

      {/* Sahne: büyük, yuvarlak köşeli; kontroller altında yüzen cam çubukta */}
      <div
        className="group/stage relative min-h-[260px] flex-1 overflow-hidden rounded-[1.75rem] bg-[#010205] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08),0_30px_80px_-40px_rgb(0_0_0/0.9)]"
        onPointerMove={wake}
        onPointerDown={wake}
        onKeyDown={wake}
      >
        <AnimatePresence initial={false}>
          <motion.div
            key={`${effective}-${sessionId}`}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.6, ease: EASE }}
          >
            {effective === 'video' ? (
              <video
                ref={video}
                src={videoSrc(sessionId)}
                poster={stillSrc(sessionId)}
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                aria-label={c.videoLabel(title)}
                onError={() => setVideoFailed(sessionId)}
                // Filigran sol üstte: görüntü sol üste yaslanır, taşan kısım sağdan ve alttan kırpılır
                className="size-full object-cover object-left-top"
                data-video={sessionId}
              />
            ) : stillBroken === sessionId ? (
              <p role="alert" className="flex size-full items-center justify-center p-8 text-center text-[15.5px] text-ink-muted">
                {c.stillFailed}
              </p>
            ) : (
              <img src={stillSrc(sessionId)} alt={c.stillAlt(title)} onError={() => setStillBroken(sessionId)} className="size-full object-cover object-left-top" draggable={false} data-still={sessionId} />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Alttan hafif koyulaşma: çubuk her görüntüde okunur */}
        <div aria-hidden className={`pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/60 to-transparent transition-opacity duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${barHidden ? 'opacity-0' : 'opacity-100'}`} />

        {/* Yüzen kontrol çubuğu */}
        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center sm:bottom-4">
          <div
            data-cupola-bar
            data-hidden={barHidden || undefined}
            role="group"
            aria-label={c.setupLabel}
            className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-x-1 gap-y-1 rounded-[1.75rem] bg-black/45 p-1.5 ring-1 ring-white/12 backdrop-blur-xl transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] focus-within:translate-y-0 focus-within:opacity-100 data-[hidden]:pointer-events-none data-[hidden]:translate-y-3 data-[hidden]:opacity-0 data-[hidden]:focus-within:pointer-events-auto sm:flex-nowrap sm:rounded-full"
          >
            <Pills<SessionId> legend={c.scene} name={`${ids}-scene`} value={sessionId} onChange={chooseScene} options={sessions.map((s) => ({ value: s.id, label: s.title, text: true }))} />
            <Divider />
            <Pills<Mode>
              legend={c.mode}
              name={`${ids}-mode`}
              value={effective}
              onChange={setMode}
              options={[
                { value: 'video', label: c.modes.video, icon: <Play size={16} strokeWidth={1.75} aria-hidden />, disabled: !canPlay },
                { value: 'still', label: c.modes.still, icon: <ImageIcon size={16} strokeWidth={1.75} aria-hidden /> },
              ]}
            />
            <Divider />
            <Pills<Audio>
              legend={c.audio}
              name={`${ids}-audio`}
              value={audio}
              onChange={chooseAudio}
              options={[
                { value: 'silent', label: c.audioModes.silent, icon: <VolumeX size={16} strokeWidth={1.75} aria-hidden /> },
                { value: 'whiteNoise', label: c.audioModes.whiteNoise, icon: <Volume2 size={16} strokeWidth={1.75} aria-hidden /> },
              ]}
            />
            {onToggleExpand && (
              <>
                <Divider />
                <button
                  type="button"
                  onClick={onToggleExpand}
                  aria-pressed={expanded}
                  title={expanded ? c.exitFullscreen : c.fullscreen}
                  className="group/fs flex min-h-10 items-center gap-2 rounded-full px-3.5 text-[14.5px] font-medium text-ink-muted transition-[background-color,color,transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/10 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-holo active:scale-95"
                >
                  {expanded ? <Minimize2 size={16} strokeWidth={1.75} aria-hidden /> : <Maximize2 size={16} strokeWidth={1.75} aria-hidden />}
                  <span className="sr-only md:not-sr-only">{expanded ? c.exitFullscreen : c.fullscreen}</span>
                </button>
              </>
            )}
          </div>
        </div>

        {audioFailed && (
          <p role="status" className="absolute bottom-20 left-1/2 w-max max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-full bg-black/55 px-4 py-1.5 text-center text-[14px] text-ink-muted backdrop-blur">
            {c.audioUnavailable}
          </p>
        )}
      </div>

      <p className="shrink-0 text-[13px] leading-snug text-ink-dim" data-credit>
        {c.credit}
      </p>
    </div>
  )
}

function Divider() {
  return <span aria-hidden className="mx-1 hidden h-6 w-px shrink-0 bg-white/12 sm:block" />
}

/** Yüzen çubuktaki radyo grubu: oval, seçili olan sağa doğru solan vurguyla; etiket yoksa yalnızca simge (ad ekran okuyucuya ve ipucuna) */
function Pills<T extends string>({
  legend,
  name,
  value,
  onChange,
  options,
}: {
  legend: string
  name: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; icon?: ReactNode; text?: boolean; disabled?: boolean }[]
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{legend}</legend>
      <div className="flex flex-wrap items-center justify-center gap-0.5">
        {options.map((o) => {
          const checked = value === o.value
          return (
            <label
              key={o.value}
              title={o.label}
              className={`group/pill relative flex min-h-10 cursor-pointer items-center justify-center rounded-full text-[14.5px] font-medium transition-colors duration-500 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-45 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-holo ${o.text ? 'px-3.5' : 'size-10'} ${checked ? 'text-ink' : 'text-ink-muted hover:text-ink'}`}
            >
              <span
                aria-hidden
                className={`pointer-events-none absolute inset-0 rounded-full bg-gradient-to-r from-holo/[0.3] via-holo/[0.12] to-white/[0.04] transition-opacity duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${checked ? 'opacity-100' : 'opacity-0 group-hover/pill:opacity-100 group-hover/pill:from-white/10 group-hover/pill:via-white/5'}`}
              />
              <input type="radio" name={name} checked={checked} disabled={o.disabled} onChange={() => onChange(o.value)} className="absolute inset-0 size-full cursor-pointer appearance-none rounded-full opacity-0" />
              {o.icon && <span className="pointer-events-none relative">{o.icon}</span>}
              <span className={o.text ? 'pointer-events-none relative whitespace-nowrap' : 'sr-only'}>{o.label}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
