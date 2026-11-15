import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useHealth } from '../data/health'
import { useAppCommand } from '../lib/appCommands'
import { useI18n } from '../i18n'
import { MindTrainingDialog } from './MindTraining'
import { ReactionTest } from './ReactionTest'
import { VideoTile } from './VideoTile'

/*
 * Zihinsel sağlık sayfasının sağ üstü: "Kendini tanı". Dört videolu kutu, ikişerli iki sıra:
 * - Zihin egzersizleri: uçuşta yavaşlayan üç beceri için üç kısa egzersiz (ortada cam pencere; mind/MindTraining.tsx)
 * - Görüş testi ve Tutarlılık testi: henüz yok; kutu yerini tutar, düğme yerine "Yakında" yazar
 * - Tepki testi: yorgunluğu ölçen kısa dikkat testi (tam ekran açılır; yalnızca astronot)
 * Kayıtlarım check-in bölümünün başlığındadır; günlük yazmak destek kütüphanesindedir; acil destek üst çubuktadır.
 */
export function MindActionsCard({ active = false }: { active?: boolean }) {
  const { t } = useI18n()
  const { canEdit } = useHealth()
  const [open, setOpen] = useState<'mindGames' | 'reaction' | null>(null)
  // Asistandan: zihin egzersizleri ya da tepki testi doğrudan açılır
  useAppCommand('openMindGames', () => setOpen('mindGames'))
  useAppCommand('openReaction', () => canEdit && setOpen('reaction'))
  const close = () => setOpen(null)
  const a = t.mindPage.actions
  const l = t.mindPage.library

  return (
    <section id="tour-knowyourself" aria-labelledby="actions-title" className="panel @container flex size-full min-h-0 flex-col gap-3 overflow-hidden !rounded-3xl p-5">
      <header>
        <h2 id="actions-title" className="flex items-center gap-2 font-display text-[18px] font-semibold">
          <Sparkles size={17} className="text-holo" aria-hidden />
          {a.title}
        </h2>
        <p className="mt-0.5 text-[14.5px] leading-snug text-ink-muted">{a.desc}</p>
      </header>
      <ul aria-labelledby="actions-title" className="scroll-thin grid min-h-0 flex-1 auto-rows-[minmax(8.5rem,1fr)] grid-cols-2 gap-3 overflow-y-auto" data-wheel-scroll>
        <VideoTile
          id="tour-mindgames"
          video="mind-games"
          active={active}
          title={l.mindGames.title}
          desc={a.mindGamesDesc}
          meta={l.mindGames.duration}
          action={{ label: l.openShort, ariaLabel: l.open(l.mindGames.title), onClick: () => setOpen('mindGames') }}
        />
        <VideoTile video="vision-test" active={active} title={a.vision} desc={a.visionDesc} soon={a.soon} data-soon />
        <VideoTile
          video="reaction-test"
          active={active}
          title={t.reaction.title}
          desc={canEdit ? a.reactionDesc : a.surgeonOnly}
          meta={a.reactionDuration}
          action={{ label: l.openShort, ariaLabel: l.open(t.reaction.title), onClick: () => setOpen('reaction'), disabled: !canEdit }}
        />
        <VideoTile video="consistency-test" active={active} title={a.consistency} desc={a.consistencyDesc} soon={a.soon} data-soon />
      </ul>

      <MindTrainingDialog open={open === 'mindGames'} onClose={close} />
      <ReactionTest open={open === 'reaction'} onClose={close} />
    </section>
  )
}
