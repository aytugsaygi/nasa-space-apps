import { CircleCheck, CircleDashed, CircleDot, Clock, Lock, SkipForward, type LucideIcon } from 'lucide-react'
import type { CheckinOutcome, CheckinWindowView } from '../core/checkins'
import { useI18n } from '../i18n'

/*
 * Check-in penceresinin durumu: her zaman ikon + yazı. Sağlık durumu renkleri (ok, warn, crit) kullanılmaz; bunlar yalnızca
 * sağlık durumunu anlatır (AI-PROMPT 3.1). Açık ve ertelenmiş pencere vurgu rengiyle, diğerleri sakin tonla gösterilir.
 */
const ICON: Record<CheckinOutcome, LucideIcon> = { pending: CircleDot, deferred: Clock, saved: CircleCheck, skipped: SkipForward, expired: CircleDashed, upcoming: Lock }
const TONE: Record<CheckinOutcome, string> = {
  pending: 'text-holo',
  deferred: 'text-holo',
  saved: 'text-ink',
  skipped: 'text-ink-muted',
  expired: 'text-ink-muted',
  upcoming: 'text-ink-muted',
}

export function CheckinStatus({ view }: { view: Pick<CheckinWindowView, 'outcome'> }) {
  const { t } = useI18n()
  const Icon = ICON[view.outcome]
  return (
    <span className={`inline-flex items-center gap-1.5 text-[15px] font-medium ${TONE[view.outcome]}`}>
      <Icon size={15} aria-hidden />
      {t.mindPage.outcome[view.outcome]}
    </span>
  )
}
