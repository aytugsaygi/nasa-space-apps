import { LibraryBig } from 'lucide-react'
import { useState } from 'react'
import { useHealth } from '../data/health'
import { useAppCommand } from '../lib/appCommands'
import { useI18n } from '../i18n'
import { BreathingDialog } from './BreathingBreak'
import { BREATHING_SESSION_CONFIG } from './breathing'
import { orList } from './checkinFormat'
import { GalleryDialog } from './EarthGallery'
import { CupolaDialog } from './CupolaLook'
import { JournalDialog } from './JournalDialog'
import { type MindVideo } from './VideoBackdrop'
import { VideoTile } from './VideoTile'

/*
 * Destek kütüphanesi (docs/wellbeing SUP-01…SUP-07): dört öğe, her biri ayrı bir akış ve kendi videosunun önünde.
 * - Cupola: uzaydan Dünya'ya bakış; kişi bakış yönünü değiştirir (CupolaLook, CUP-01…CUP-04); nefes rehberi yoktur (iki akış birleştirilmez)
 * - Nefes egzersizi: cam pencerede adım adım nefes molası (BreathingDialog; süre, ortam sesi, geçiş tıkı; açılınca hiçbir şey başlamaz)
 * - Dünya galerisi: dört kategori, uygulamayla gelen kaynaklı görseller ve isteğe bağlı kişisel fotoğraflar (EarthGallery, GAL-01…GAL-04)
 * - Günlük yaz: kısa not; notlar Kayıtlarım'da durur, hekim görünümünde gösterilmez (yalnızca astronot yazar)
 * Zihin egzersizleri sağ üstteki "Kendini tanı" bölümündedir.
 * Başlat öğeyi tam ekran açar (yan panel değil); sol üstteki Geri ya da Esc ile dönülür, odak Başlat düğmesine döner.
 * Kullanım sayılmaz, puanlanmaz.
 */

type ItemId = 'cupola' | 'breathing' | 'gallery' | 'journal'
const ITEMS: { id: ItemId; video: MindVideo; tourId?: string }[] = [
  { id: 'cupola', video: 'cupola' },
  { id: 'breathing', video: 'breathing', tourId: 'tour-breathing' },
  { id: 'gallery', video: 'gallery' },
  { id: 'journal', video: 'journal' },
]

export function SupportLibraryCard({ active = false }: { reducedMotion?: boolean; active?: boolean }) {
  const { t, locale } = useI18n()
  const { canEdit } = useHealth()
  const l = t.mindPage.library
  const [open, setOpen] = useState<ItemId | null>(null)
  // Asistandan: Cupola, nefes egzersizi, Dünya galerisi ya da günlük doğrudan açılır
  useAppCommand('openLibrary', (c) => setOpen(c.item))
  useAppCommand('openJournal', () => canEdit && setOpen('journal'))
  const close = () => setOpen(null)
  const duration: Record<ItemId, string> = {
    breathing: l.durations(orList(BREATHING_SESSION_CONFIG.durationsMin, locale)),
    cupola: l.cupola.duration,
    gallery: l.gallery.duration,
    journal: l.journal.duration,
  }

  return (
    <section id="tour-cupola" aria-labelledby="library-title" className="panel @container flex size-full min-h-0 flex-col gap-3 overflow-hidden !rounded-3xl p-5">
      <header>
        <h2 id="library-title" className="flex items-center gap-2 font-display text-[18px] font-semibold">
          <LibraryBig size={17} className="text-holo" aria-hidden />
          {l.title}
        </h2>
        <p className="mt-0.5 text-[14.5px] leading-snug text-ink-muted">{l.desc}</p>
      </header>

      <ul aria-labelledby="library-title" className="scroll-thin grid min-h-0 flex-1 auto-rows-[minmax(12.5rem,1fr)] gap-3 overflow-y-auto @min-[34rem]:grid-cols-2 @min-[60rem]:grid-cols-4" data-wheel-scroll>
        {ITEMS.map(({ id, video, tourId }) => {
          // Günlüğe yalnızca astronot yazar; hekim görünümünde düğme kapalıdır
          const locked = id === 'journal' && !canEdit
          return (
            <VideoTile
              key={id}
              id={tourId}
              data-library-item={id}
              video={video}
              active={active}
              title={l[id].title}
              desc={locked ? t.mindPage.actions.surgeonOnly : l[id].desc}
              meta={duration[id]}
              action={{ label: l.openShort, ariaLabel: l.open(l[id].title), onClick: () => setOpen(id), disabled: locked }}
            />
          )
        })}
      </ul>

      <CupolaDialog open={open === 'cupola'} onClose={close} />
      <BreathingDialog open={open === 'breathing'} onClose={close} />
      <GalleryDialog open={open === 'gallery'} onClose={close} />
      <JournalDialog open={open === 'journal'} onClose={close} />
    </section>
  )
}
