import { Check, IdCard, Stethoscope, UserRound } from 'lucide-react'
import { useState } from 'react'
import { CREW, CREW_IDS, FLIGHT_SURGEON } from '../core/crew'
import { useHealth } from '../data/health'
import { resolve, useI18n } from '../i18n'
import { PersonalInfo } from './PersonalInfo'
import { Popover } from './Popover'
import { Tooltip } from './Tooltip'

/** Profil seçimi: bir astronot olarak ya da uçuş hekimi olarak giriş */
export function ProfileMenu() {
  const { t, lang } = useI18n()
  const { profile, astronaut, setRole, setSelf } = useHealth()
  const [open, setOpen] = useState(false)
  const [personalOpen, setPersonalOpen] = useState(false)
  const surgeon = profile.role === 'surgeon'
  const name = surgeon ? FLIGHT_SURGEON.name : CREW[profile.self].name
  const role = surgeon ? resolve(FLIGHT_SURGEON.role, lang) : resolve(CREW[profile.self].role, lang)

  return (
    <>
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      label={t.profile.menu}
      width="w-72"
      trigger={
        <Tooltip label={t.profile.menu}>
          <button
            id="tour-profile"
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={`${t.profile.label}: ${name}, ${role}`}
            className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-2.5 text-sm text-ink transition-colors hover:border-line-strong hover:bg-white/[0.03]"
          >
            {surgeon ? <Stethoscope size={17} className="text-holo" aria-hidden /> : <UserRound size={17} className="text-holo" aria-hidden />}
            <span className="hidden max-w-[9rem] truncate font-medium md:inline">{name}</span>
          </button>
        </Tooltip>
      }
    >
      {/* Açık olan astronotun kişisel bilgileri (hekim görüntülerken salt okunur) */}
      {astronaut && (
        <>
          <button
            type="button"
            id="personal-info-button"
            onClick={() => {
              setPersonalOpen(true)
              setOpen(false)
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-white/[0.04]"
          >
            <IdCard size={16} className="shrink-0 text-holo" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-ink">{t.profile.personal}</span>
              <span className="block text-[13.5px] text-ink-dim">{t.profile.personalTip}</span>
            </span>
          </button>
          <div className="my-1 border-t border-line" />
        </>
      )}
      <p className="px-3 pt-2 pb-1 font-mono font-semibold text-[12.5px] tracking-[0.07em] text-ink-dim uppercase">{t.profile.astronaut}</p>
      {CREW_IDS.map((id) => {
        const active = !surgeon && profile.self === id
        return (
          <button
            key={id}
            type="button"
            data-profile={id}
            onClick={() => {
              setSelf(id)
              setRole('astronaut')
              setOpen(false)
            }}
            aria-pressed={active}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-white/[0.04]"
          >
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-ink">{CREW[id].name}</span>
              <span className="block text-[13.5px] text-ink-dim">{resolve(CREW[id].role, lang)}</span>
            </span>
            {active && <Check size={15} className="text-holo" aria-hidden />}
          </button>
        )
      })}
      <div className="my-1 border-t border-line" />
      <button
        type="button"
        data-profile="surgeon"
        onClick={() => {
          setRole('surgeon')
          setOpen(false)
        }}
        aria-pressed={surgeon}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-white/[0.04]"
      >
        <Stethoscope size={16} className="shrink-0 text-holo" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-ink">{FLIGHT_SURGEON.name}</span>
          <span className="block text-[13.5px] text-ink-dim">{t.profile.surgeon}</span>
        </span>
        {surgeon && <Check size={15} className="text-holo" aria-hidden />}
      </button>
    </Popover>
    <PersonalInfo open={personalOpen} onClose={() => setPersonalOpen(false)} />
    </>
  )
}
