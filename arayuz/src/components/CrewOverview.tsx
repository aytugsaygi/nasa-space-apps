import { ArrowLeft, ArrowRight, Inbox, Send, ShieldCheck, Siren, Stethoscope } from 'lucide-react'
import { CREW, type CrewId } from '../core/crew'
import type { Status } from '../core/catalog'
import { useHealth, useQuery } from '../data/health'
import { resolve, useI18n } from '../i18n'
import { STATUS_META } from '../lib/status'
import { missionTime } from '../mind/checkinFormat'
import { Tooltip } from './Tooltip'

/**
 * Uçuş hekiminin ilk ekranı: mürettebatın adı, rolü ve genel sağlık puanı. Bir isme tıklayınca o astronotun gördüğü
 * arayüz salt okunur açılır. Altta mürettebattan gelen bildirimler listelenir: en üstte acil durumlar (sürüyor ya da
 * kapatıldı; basınca o astronotun arayüzü açılır), altında kritik bildirimler (iletişim gecikmesiyle).
 */
export function CrewOverview() {
  const { t, lang, locale } = useI18n()
  const { view } = useHealth()
  const crew = useQuery('crewOverview', [])
  const inbox = useQuery('messages', [])
  const emergencies = useQuery('activeEmergencies', []) ?? []
  const sos = t.mindPage.sos

  return (
    <main id="crew-overview" className="flex flex-1 flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-mono font-semibold text-[13.5px] tracking-[0.07em] text-ink-dim uppercase">
            <Stethoscope size={14} className="text-holo" aria-hidden />
            {t.profile.surgeon}
          </p>
          <h1 className="mt-1 font-display text-[26px] font-semibold tracking-tight">{t.crew.title}</h1>
          <p className="text-[15.5px] text-ink-muted">{t.crew.subtitle(4)}</p>
        </div>
        <Tooltip label={t.crew.scoreHelp} wide align="end">
          <span tabIndex={0} className="cursor-help text-[14.5px] text-ink-dim underline decoration-dotted underline-offset-4">
            {t.crew.score}
          </span>
        </Tooltip>
      </header>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(crew ?? []).map((c) => {
          const st = STATUS_META[c.overall]
          const StIcon = st.icon
          return (
            <li key={c.id}>
              <button
                type="button"
                data-crew={c.id}
                onClick={() => view(c.id)}
                aria-label={`${t.crew.open(c.name)}. ${t.crew.score}: ${c.score}. ${t.status[c.overall]}.`}
                className={`panel flex w-full flex-col gap-4 !rounded-3xl p-5 text-left transition-colors hover:border-holo/40 focus-visible:ring-2 focus-visible:ring-holo/60 ${c.overall !== 'normal' ? `ring-1 ${st.ring}` : ''}`}
              >
                <div className="flex items-center gap-4">
                  <ScoreRing score={c.score} status={c.overall} />
                  <div className="min-w-0">
                    <p className="font-display text-[18px] font-semibold">{c.name}</p>
                    <p className="text-[14.5px] text-ink-dim">{resolve(c.role, lang)}</p>
                    <p className={`mt-1 flex items-center gap-1 text-[14px] font-medium ${st.text}`}>
                      <StIcon size={13} aria-hidden />
                      {t.status[c.overall]}
                    </p>
                  </div>
                </div>
                <p className="min-h-10 text-[14.5px] leading-snug text-ink-muted">{c.topFinding ? resolve(c.topFinding.title, lang) : t.crew.noFindings}</p>
                <div className="flex flex-wrap gap-1.5 text-[13.5px]">
                  <span className="rounded-full border border-line px-2 py-0.5 text-ink-muted">{t.crew.findings(c.findings)}</span>
                  <span className="rounded-full border border-line px-2 py-0.5 text-ink-muted">{t.crew.complaints(c.complaints)}</span>
                  <span className="flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-ink-muted">
                    <ShieldCheck size={12} aria-hidden />
                    {t.crew.fitness[c.fitness]}
                  </span>
                </div>
              </button>
            </li>
          )
        })}
      </ul>

      <section aria-labelledby="inbox-title" className="panel !rounded-3xl p-5">
        <h2 id="inbox-title" className="flex items-center gap-2 font-display text-[17px] font-semibold">
          <Inbox size={17} className="text-holo" aria-hidden />
          {t.crew.inbox}
        </h2>
        <ul className="mt-3 divide-y divide-line">
          {emergencies.map((r) => {
            const ended = r.endedAt !== undefined
            const note = r.notes?.at(-1)?.text
            const name = CREW[r.sender].name
            const state = ended ? sos.bellEnded(missionTime(r.endedAt!, locale)) : sos.bellActive(missionTime(r.ts, locale))
            return (
              <li key={r.requestId} data-emergency={ended ? 'ended' : 'active'} className="py-1.5">
                <button
                  type="button"
                  onClick={() => view(r.sender)}
                  aria-label={`${t.mindPage.assist.inboxTitle(name)}. ${state}. ${sos.bellOpen(name)}`}
                  className={`group flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${ended ? 'hover:bg-white/[0.03]' : 'bg-crit/[0.07] ring-1 ring-crit/30 hover:bg-crit/[0.11]'}`}
                >
                  <span className={`relative mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ring-1 ${ended ? 'bg-holo/10 text-holo ring-holo/30' : 'bg-crit/15 text-crit ring-crit/40'}`}>
                    {!ended && <span aria-hidden className="absolute inset-0 animate-ping rounded-full ring-1 ring-crit/40 motion-reduce:hidden" />}
                    {ended ? <ShieldCheck size={15} aria-hidden /> : <Siren size={15} aria-hidden />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-ink">{t.mindPage.assist.inboxTitle(name)}</span>
                    <span className={`block text-[13.5px] ${ended ? 'text-ink-dim' : 'text-crit'}`}>{state}</span>
                    {note && <span className="mt-0.5 line-clamp-2 block text-[14px] leading-snug text-ink-muted italic">{t.mindPage.assist.inboxNote(note)}</span>}
                  </span>
                  <ArrowRight size={15} className="mt-2 shrink-0 text-ink-dim transition-transform group-hover:translate-x-0.5" aria-hidden />
                </button>
              </li>
            )
          })}
          {emergencies.length === 0 && (inbox ?? []).filter((m) => m.to === 'surgeon').length === 0 && <li className="py-4 text-center text-[14.5px] text-ink-dim">{t.crew.inboxEmpty}</li>}
          {(inbox ?? [])
            .filter((m) => m.to === 'surgeon')
            .slice(0, 12)
            .map((m) => (
              <li key={m.id} className="flex items-start gap-3 py-2.5">
                <Send size={14} className={`mt-1 shrink-0 ${m.kind === 'alert' ? 'text-crit' : 'text-holo'}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] text-ink">
                    <span className="font-semibold">{CREW[m.astronaut as CrewId]?.name}</span> · {m.i18n ? resolve(m.i18n, lang) : m.text}
                  </p>
                  <p className="text-[13.5px] text-ink-dim">
                    {new Date(m.ts).toLocaleString(locale, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })} ·{' '}
                    {m.delivered ? t.crew.delivered : m.queued ? t.crew.queued : t.crew.pending(new Date(m.deliverAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }))}
                  </p>
                </div>
              </li>
            ))}
        </ul>
      </section>
    </main>
  )
}

/** Puan halkası: yüzde ve durum rengi (yazı ve simgeyle birlikte kullanılır) */
export function ScoreRing({ score, status, size = 64 }: { score: number; status: Status; size?: number }) {
  const r = size / 2 - 5
  const c = 2 * Math.PI * r
  return (
    <span className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }} aria-hidden>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(150 196 230 / 0.14)" strokeWidth={5} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={STATUS_META[status].hex} strokeWidth={5} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <span className="tabular absolute font-mono text-[17px] font-semibold">{score}</span>
    </span>
  )
}

/** Hekim bir astronotun arayüzünü görüntülerken üstte duran şerit: kim görüntüleniyor, diğer mürettebata geçiş */
export function ViewingBanner() {
  const { t, lang } = useI18n()
  const { profile, view } = useHealth()
  const crew = useQuery('crewOverview', [])
  if (profile.role !== 'surgeon' || !profile.viewing) return null
  return (
    <div id="viewing-banner" className="flex flex-wrap items-center gap-2 rounded-2xl border border-holo/30 bg-holo/[0.06] px-3 py-2">
      <button type="button" onClick={() => view(null)} className="flex min-h-9 items-center gap-1.5 rounded-xl border border-line-strong px-3 text-[14.5px] font-medium text-ink hover:border-holo/40">
        <ArrowLeft size={14} aria-hidden />
        {t.profile.backToCrew}
      </button>
      <p className="text-[14.5px] text-ink-muted">
        <span className="font-semibold text-ink">{t.profile.viewing(CREW[profile.viewing].name)}</span> · {t.profile.readOnly}
      </p>
      <div className="ml-auto flex flex-wrap gap-1.5" role="group" aria-label={t.crew.title}>
        {(crew ?? []).map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => view(c.id)}
            aria-pressed={profile.viewing === c.id}
            className="flex min-h-9 items-center gap-2 rounded-xl border border-line px-2.5 text-[14px] text-ink-muted transition-colors hover:text-ink aria-pressed:border-holo/45 aria-pressed:bg-holo/10 aria-pressed:text-holo"
          >
            <span className={`size-2 rounded-full`} style={{ background: STATUS_META[c.overall].hex }} aria-hidden />
            {c.name}
            <span className="tabular font-mono">{c.score}</span>
            <span className="sr-only">{resolve(c.role, lang)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
