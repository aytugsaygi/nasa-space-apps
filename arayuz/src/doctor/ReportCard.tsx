import { ArrowDownRight, ArrowRight, ArrowUpRight, FileText, Printer, Send } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { INDICATORS } from '../core/catalog'
import { bodyPart } from '../core/coach'
import { CREW, ENVIRONMENTS } from '../core/crew'
import { num } from '../core/tx'
import { useHealth, useQuery } from '../data/health'
import { resolve, useI18n } from '../i18n'
import { useAppCommand } from '../lib/appCommands'
import { clearMessageFocus, focusMessage, useMessageFocus } from '../lib/messageFocus'
import { STATUS_META } from '../lib/status'
import { flushSync } from 'react-dom'
import { PrintReport } from './PrintReport'

/** Gecikmeyi okunur yazar: 600 ms → "0,6 sn", 12 dk → "12 dk" */
function delayText(ms: number, lang: 'tr' | 'en') {
  if (ms < 60_000) return `${num(ms / 1000, lang, 1)} ${lang === 'tr' ? 'sn' : 's'}`
  return `${Math.round(ms / 60_000)} ${lang === 'tr' ? 'dk' : 'min'}`
}

/**
 * Rapor ve uçuş hekimi: dönem raporu (sade anlatım ya da hekim görünümü), PDF olarak kaydetme, hekime gönderme ve
 * hekimle mesajlaşma. Mesajlar görev ortamına göre gecikmeyle ulaşır (Mars'ta 3-22 dk arası gösterilir, demo 12 dk; kavuşumda kesinti).
 */
export function ReportCard() {
  const { t } = useI18n()
  const { astronaut } = useHealth()
  const [tab, setTab] = useState<'report' | 'messages'>('report')
  // Asistandan: rapor sekmesi
  useAppCommand('openReport', () => setTab('report'))
  /* Bir mesaj açılmak istendiyse (bildirimden ya da rapor gönderilince) Mesajlar sekmesine geçilir */
  const focus = useMessageFocus()
  const [handled, setHandled] = useState<number | null>(null)
  if (focus && focus.astronaut === astronaut && handled !== focus.nonce) {
    setHandled(focus.nonce)
    setTab('messages')
  }
  return (
    <section id="tour-report" aria-labelledby="report-title" className="panel flex size-full min-h-0 flex-col gap-3 overflow-hidden !rounded-3xl p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="report-title" className="flex items-center gap-2 font-display text-[18px] font-semibold">
          <FileText size={17} className="text-holo" aria-hidden />
          {t.doctor.reportTitle}
        </h2>
        <div role="tablist" aria-label={t.doctor.reportTitle} className="flex rounded-xl border border-line p-1">
          {(['report', 'messages'] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className="min-h-8 rounded-lg px-2.5 text-[14px] text-ink-muted aria-selected:bg-holo/12 aria-selected:text-holo">
              {k === 'report' ? t.doctor.tabReport : t.doctor.tabMessages}
            </button>
          ))}
        </div>
      </header>
      {tab === 'report' ? <Report /> : <Messages />}
    </section>
  )
}

/** Referans bandı: "60–100", tansiyonda "90–120 / 60–80" */
function refText(ref: { low: number; high: number; low2?: number; high2?: number }, lang: 'tr' | 'en', digits: number) {
  const f = (v: number) => num(v, lang, digits)
  return ref.low2 !== undefined && ref.high2 !== undefined ? `${f(ref.low)}–${f(ref.high)} / ${f(ref.low2)}–${f(ref.high2)}` : `${f(ref.low)}–${f(ref.high)}`
}

function Report() {
  const { t, lang, locale } = useI18n()
  const { astronaut, canEdit, mutate } = useHealth()
  const [days, setDays] = useState(7)
  const [view, setView] = useState<'doctor' | 'plain'>('doctor')
  const rep = useQuery('report', astronaut ? [astronaut, days] : null)
  const comm = useQuery('comm', [])
  const name = astronaut ? CREW[astronaut].name : ''
  const [printedAt, setPrintedAt] = useState(() => Date.now())
  // Yazdırma sayfası güncel saatle çizilir, sonra tarayıcının yazdırma penceresi açılır (orada "PDF olarak kaydet")
  const print = () => {
    flushSync(() => setPrintedAt(Date.now()))
    window.print()
  }

  const send = async () => {
    if (!astronaut || !rep) return
    const lines = rep.rows.map((r) => `${resolve(INDICATORS[r.id].name, 'tr')}: ${r.latest ?? '—'}${r.latest2 !== undefined ? `/${r.latest2}` : ''} ${resolve(INDICATORS[r.id].unit, 'tr')} (${r.status}; ref. ${refText(r.ref, 'tr', INDICATORS[r.id].digits)})`)
    const msg = await mutate('sendMessage', astronaut, `${t.doctor.reportText(name, days)}\n${lines.join('\n')}`, 'report')
    if (!msg) return
    toast(t.doctor.sent(new Date(msg.deliverAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })), { duration: 4000 })
    // Gönderilen rapor Mesajlar sekmesinde vurgulanır; hekime ulaşınca sağ altta hekimin bildirimi çıkar
    focusMessage({ astronaut, id: msg.id, reply: false })
  }

  const TrendIcon = { up: ArrowUpRight, down: ArrowDownRight, flat: ArrowRight }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div role="group" aria-label={t.doctor.period} className="flex rounded-xl border border-line p-1">
          {[7, 30].map((d) => (
            <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)} className="min-h-8 rounded-lg px-2.5 text-[14px] text-ink-muted aria-pressed:bg-holo/12 aria-pressed:text-holo">
              {t.doctor.days(d)}
            </button>
          ))}
        </div>
        <div role="group" aria-label={t.doctor.viewDoctor} className="flex rounded-xl border border-line p-1">
          {(['doctor', 'plain'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className="min-h-8 rounded-lg px-2.5 text-[14px] whitespace-nowrap text-ink-muted aria-pressed:bg-holo/12 aria-pressed:text-holo">
              {v === 'doctor' ? t.doctor.viewDoctor : t.doctor.viewAstronaut}
            </button>
          ))}
        </div>
      </div>

      <div id="health-report" data-wheel-scroll className="scroll-thin min-h-0 flex-1 overflow-y-auto rounded-xl border border-line p-3">
        <p className="font-display text-[15.5px] font-semibold">{t.doctor.reportText(name, days)}</p>
        <p className="text-[13px] text-ink-dim">{t.doctor.generated(new Date().toLocaleString(locale))}</p>
        {view === 'plain' && rep && (
          <p className="mt-2 text-[14.5px] leading-snug text-ink-muted">
            {t.doctor.plain.intro(name.split(' ').pop() ?? name)} {rep.rows.filter((r) => r.status !== 'normal').length === 0 ? t.doctor.plain.good : ''}
          </p>
        )}
        <div className="mt-2 overflow-x-auto">
        <table className="w-full text-[13.5px] [&_td]:px-0.5 [&_th]:px-0.5 [&_th]:whitespace-nowrap">
          <thead>
            <tr className="text-left text-ink-dim">
              <th className="py-1 font-normal">{t.doctor.colIndicator}</th>
              <th className="py-1 text-right font-normal">{t.doctor.colLatest}</th>
              {view === 'doctor' && <th className="py-1 text-right font-normal">{t.doctor.colAvg}</th>}
              {view === 'doctor' && <th className="py-1 text-right font-normal">{t.doctor.colRange}</th>}
              <th className="py-1 pl-2 text-right font-normal">{t.doctor.colRef}</th>
              <th className="py-1 pl-2 text-right font-normal">{t.doctor.colTrend}</th>
            </tr>
          </thead>
          <tbody>
            {rep?.rows
              .filter((r) => view === 'doctor' || ['hr', 'bp', 'spo2', 'temp', 'glucose', 'sleep', 'mood', 'exercise', 'water'].includes(r.id))
              .map((r) => {
                const ind = INDICATORS[r.id]
                const st = STATUS_META[r.status]
                const Icon = TrendIcon[r.trend]
                const f = (v: number) => num(v, lang, ind.digits)
                return (
                  <tr key={r.id} className="border-t border-line">
                    <td className="py-1.5 text-ink">
                      <span className={`mr-1.5 inline-block size-1.5 rounded-full`} style={{ background: st.hex }} aria-hidden />
                      {resolve(ind.name, lang)}
                      {/* Birim adın altında: dar kartta referans sütununa yer kalsın */}
                      {view === 'doctor' && <span className="block pl-3 text-[12px] leading-tight text-ink-dim">{resolve(ind.unit, lang)}</span>}
                    </td>
                    <td className={`tabular py-1.5 text-right font-mono ${r.status === 'normal' ? 'text-ink' : st.text}`}>
                      {r.latest === null ? '—' : r.latest2 !== undefined ? `${f(r.latest)}/${f(r.latest2)}` : f(r.latest)}
                      {r.partial && <span className="ml-1 font-sans text-[12px] text-ink-dim">{t.doctor.todaySoFar}</span>}
                    </td>
                    {view === 'doctor' && <td className="tabular py-1.5 text-right font-mono text-ink-muted">{r.stats ? f(r.stats.avg) : '—'}</td>}
                    {view === 'doctor' && <td className="tabular py-1.5 text-right font-mono whitespace-nowrap text-ink-dim">{r.stats ? `${f(r.stats.min)}–${f(r.stats.max)}` : '—'}</td>}
                    <td data-ref className="tabular py-1.5 pl-2 text-right font-mono text-ink-muted">{refText(r.ref, lang, ind.digits)}</td>
                    <td className="py-1.5 pl-2 text-right text-ink-muted">
                      <span className="inline-flex items-center gap-0.5" title={t.doctor.trend[r.trend]}>
                        <Icon size={13} aria-hidden />
                        <span className="sr-only">{t.doctor.trend[r.trend]}</span>
                      </span>
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-snug text-ink-dim">{t.doctor.refNote}</p>
        <p className="mt-3 font-mono font-semibold text-[12.5px] tracking-[0.07em] text-ink-dim uppercase">{t.doctor.complaints}</p>
        <ul className="mt-1 text-[14px] text-ink">
          {rep && rep.complaints.length === 0 && <li className="text-ink-dim">{t.doctor.none}</li>}
          {rep?.complaints.map((c) => (
            <li key={c.id}>
              {t.hologram.symptoms[c.symptom]} · {resolve(bodyPart(c.region, c.side), lang)} · {c.severity}/10 · {t.complaintSave.status[c.status]}
            </li>
          ))}
        </ul>
        <p className="mt-3 font-mono font-semibold text-[12.5px] tracking-[0.07em] text-ink-dim uppercase">{t.doctor.alerts}</p>
        <ul className="mt-1 text-[14px] text-ink">
          {rep && rep.findings.length === 0 && <li className="text-ink-dim">{t.doctor.none}</li>}
          {rep?.findings.map((f) => (
            <li key={f.key}>
              <span className={STATUS_META[f.level === 'bilgi' ? 'normal' : f.level].text}>{t.alertLevel[f.level]}</span> · {resolve(f.title, lang)}
            </li>
          ))}
        </ul>
      </div>

      {rep && <PrintReport rep={rep} view={view} generatedAt={printedAt} />}
      <div className="flex shrink-0 flex-wrap gap-2">
        <button type="button" onClick={print} className="flex min-h-9 items-center gap-1.5 rounded-xl border border-line-strong px-3 text-[14px] text-ink hover:border-holo/40">
          <Printer size={14} aria-hidden />
          {t.doctor.print}
        </button>
        {canEdit && (
          <button type="button" onClick={() => void send()} className="flex min-h-9 items-center gap-1.5 rounded-xl bg-holo/12 px-3 text-[14px] font-semibold text-holo ring-1 ring-holo/35 hover:bg-holo/20">
            <Send size={14} aria-hidden />
            {t.doctor.send}
          </button>
        )}
        {comm && <span className="ml-auto self-center text-[13px] text-ink-dim">{t.doctor.envNames[comm.environment]}</span>}
      </div>
    </div>
  )
}

function Messages() {
  const { t, lang, locale } = useI18n()
  const { astronaut, canEdit, profile, snapshot, mutate } = useHealth()
  const list = useQuery('messages', astronaut ? [astronaut] : null)
  const comm = useQuery('comm', [])
  const [text, setText] = useState('')
  const surgeon = profile.role === 'surgeon'
  const input = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  /* Açılması istenen mesaj: görünür olana kadar kaydırılır, birkaç saniye vurgulanır; cevap isteniyorsa yazı alanına odaklanılır */
  const focus = useMessageFocus()
  const target = focus && focus.astronaut === astronaut ? focus : null
  const found = !!target && !!list?.some((m) => m.id === target.id)
  useEffect(() => {
    if (!target || !found) return
    // Liste kendi içinde kaydırılır (sayfa kaymaz); mesaj listenin üstüne gelir
    const ul = listRef.current
    const el = ul?.querySelector(`[data-msg="${target.id}"]`)
    if (ul && el) ul.scrollTo({ top: ul.scrollTop + el.getBoundingClientRect().top - ul.getBoundingClientRect().top - 2, behavior: 'smooth' })
    // Cevap yazılacaksa yazı alanı ekrana getirilir ve odaklanılır (hekim görünümünde kart ekranın altında kalabilir)
    // (sayfa geçişi bitsin diye kısa bir beklemeyle)
    const reveal = setTimeout(() => {
      if (!target.reply) return
      input.current?.focus({ preventScroll: true })
      input.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 450)
    const timer = setTimeout(() => clearMessageFocus(target.nonce), 4000)
    return () => {
      clearTimeout(reveal)
      clearTimeout(timer)
    }
  }, [target, found])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!astronaut || !text.trim()) return
    void mutate('sendMessage', astronaut, text, 'message', surgeon ? 'surgeon' : undefined)
    setText('')
    // Liste yeniden eskiye sıralıdır: gönderilen mesaj en üstte görünsün
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const blackout = !!snapshot?.comm.blackout
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div role="group" aria-label={t.doctor.environment} className="flex rounded-xl border border-line p-1">
          {ENVIRONMENTS.map((env) => (
            <button key={env} type="button" aria-pressed={comm?.environment === env} onClick={() => void mutate('setEnvironment', env)} className="min-h-8 rounded-lg px-2 text-[13.5px] whitespace-nowrap text-ink-muted aria-pressed:bg-holo/12 aria-pressed:text-holo">
              {t.doctor.envNames[env].split(' (')[0]}
            </button>
          ))}
        </div>
        {snapshot && <span className={`text-[13.5px] ${blackout ? 'text-warn' : 'text-ink-dim'}`}>{blackout
              ? t.doctor.blackout
              : snapshot.comm.rangeMs
                ? t.doctor.delayRange(`${Math.round(snapshot.comm.rangeMs[0] / 60_000)}–${delayText(snapshot.comm.rangeMs[1], lang)}`, delayText(snapshot.comm.delayMs, lang))
                : t.doctor.delay(delayText(snapshot.comm.delayMs, lang))}</span>}
      </div>
      <ul ref={listRef} data-wheel-scroll className="scroll-thin min-h-0 flex-1 space-y-1.5 overflow-y-auto p-0.5">
        {list && list.length === 0 && <li className="py-4 text-center text-[14px] text-ink-dim">{t.doctor.noMessages}</li>}
        {list?.map((m) => {
          const mine = surgeon ? m.from === 'surgeon' : m.from === astronaut
          const who = m.from === 'surgeon' ? t.doctor.fromSurgeon : m.from === 'system' ? t.doctor.fromSystem : mine ? t.doctor.you : CREW[m.from as keyof typeof CREW]?.name
          return (
            <li
              key={m.id}
              data-msg={m.id}
              data-highlight={target?.id === m.id || undefined}
              className={`rounded-xl border px-3 py-2 transition-shadow duration-500 data-highlight:ring-2 data-highlight:ring-holo/60 ${mine ? 'ml-6 border-holo/30 bg-holo/[0.06]' : 'mr-6 border-line'}`}
            >
              <p className="flex justify-between gap-2 text-[12.5px] text-ink-dim">
                <span>{who}</span>
                <span>{m.delivered ? t.doctor.delivered : m.queued ? t.doctor.queued : t.doctor.inTransit(new Date(m.deliverAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }))}</span>
              </p>
              <p className="mt-0.5 text-[14px] leading-snug whitespace-pre-line text-ink">{m.i18n ? resolve(m.i18n, lang) : m.text}</p>
            </li>
          )
        })}
      </ul>
      {(canEdit || surgeon) && (
        <form onSubmit={submit} className="flex shrink-0 gap-2">
          <label htmlFor="msg-text" className="sr-only">
            {surgeon && astronaut ? t.doctor.messageTo(CREW[astronaut].name) : t.doctor.messagePlaceholder}
          </label>
          <input ref={input} id="msg-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={surgeon && astronaut ? t.doctor.messageTo(CREW[astronaut].name) : t.doctor.messagePlaceholder} maxLength={2000} className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-base/70 px-3 text-[14.5px] text-ink outline-none placeholder:text-ink-dim focus:border-holo/45" />
          <button type="submit" disabled={!text.trim()} className="flex h-10 items-center gap-1.5 rounded-xl bg-holo px-3 text-[14.5px] font-semibold text-void disabled:opacity-35">
            <Send size={14} aria-hidden />
            {t.doctor.sendMessage}
          </button>
        </form>
      )}
    </div>
  )
}
