import { ExternalLink, Radiation, ShieldAlert, Satellite, Users, Weight, type LucideIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { INDICATORS, type IndicatorId } from '../core/catalog'
import { HAZARDS, type HazardId } from '../core/hazards'
import { resolve, useI18n } from '../i18n'
import { closeHazards, useHazardsDialog } from '../lib/hazardsDialog'
import { INDICATOR_ICONS } from '../lib/icons'
import { Modal } from './Modal'

const ICONS: Record<HazardId, LucideIcon> = { radiation: Radiation, isolation: Users, distance: Satellite, gravity: Weight, hostile: ShieldAlert }

/**
 * NASA'nın insan uzay uçuşunun 5 tehlikesi ve uygulamada her biriyle ilgili izlenen göstergeler.
 * Göstergeye basınca o göstergenin ayrıntı penceresi açılır. Tehlike verildiyse o kart öne çıkar ve görünür alana kayar.
 */
export function HazardsDialog({ onOpenIndicator }: { onOpenIndicator: (id: IndicatorId) => void }) {
  const { t, lang } = useI18n()
  const { open, focus } = useHazardsDialog()
  const h = t.hazards
  const focused = useRef<HTMLLIElement>(null)

  useEffect(() => {
    if (!open || !focus) return
    const timer = setTimeout(() => focused.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 120)
    return () => clearTimeout(timer)
  }, [open, focus])

  return (
    <Modal open={open} onClose={closeHazards} title={h.title} subtitle={h.subtitle} closeLabel={h.close} icon={<ShieldAlert size={19} aria-hidden />} id="hazards-dialog" width="w-[min(760px,calc(100vw-2rem))]">
      <ul className="flex flex-col gap-3">
        {HAZARDS.map((hz) => {
          const Icon = ICONS[hz.id]
          const isFocus = focus === hz.id
          return (
            <li
              key={hz.id}
              ref={isFocus ? focused : undefined}
              data-hazard={hz.id}
              className={`rounded-xl border p-4 ${isFocus ? 'border-holo/50 bg-holo/[0.07]' : 'border-line bg-white/[0.015]'}`}
            >
              <h3 className="flex items-center gap-2 font-display text-[17px] font-semibold">
                <Icon size={18} className="shrink-0 text-holo" aria-hidden />
                {resolve(hz.name, lang)}
              </h3>
              <p className="mt-1.5 text-[15px] leading-snug text-ink-muted">{resolve(hz.desc, lang)}</p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[14px] text-ink-dim">{h.tracked}</span>
                {hz.indicators.map((id) => {
                  const IIcon = INDICATOR_ICONS[id]
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        closeHazards()
                        onOpenIndicator(id)
                      }}
                      className="flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[14px] text-ink-muted transition-colors hover:border-holo/40 hover:text-holo"
                    >
                      <IIcon size={14} aria-hidden />
                      {resolve(INDICATORS[id].name, lang)}
                    </button>
                  )
                })}
              </div>
              <a href={hz.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[13.5px] text-ink-dim transition-colors hover:text-holo">
                <ExternalLink size={13} aria-hidden />
                {h.more}
              </a>
            </li>
          )
        })}
      </ul>
      <p className="mt-4 text-[13.5px] leading-snug text-ink-dim">{h.note}</p>
    </Modal>
  )
}
