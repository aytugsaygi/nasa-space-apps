import { ArrowLeft, Check, CircleCheck, Info, Stethoscope } from 'lucide-react'
import { useId, useRef, useState, type FormEvent } from 'react'
import { Sheet } from '../components/Sheet'
import { INDICATORS } from '../core/catalog'
import type { CrewId } from '../core/crew'
import {
  ATTACHMENT_CATEGORIES,
  checkRange,
  CONTACT_SYMPTOMS,
  deepFreeze,
  EXPLANATION_MAX_CHARS,
  presetRange,
  type AttachmentCategoryId,
  type AttachmentSnapshot,
  type ContactSymptom,
  type DoctorRequest,
  type MedicalContact,
  type RangePreset,
} from '../core/doctorContact'
import type { MessageDoc } from '../core/model'
import { useHealth, useQuery } from '../data/health'
import { resolve, useI18n } from '../i18n'
import { setDraft, useDraft } from '../lib/drafts'
import { closeDoctorContact, useDoctorContactOpen } from '../lib/emergencyFlow'
import { fromLocalInput, fullTime, missionZone, toLocalInput } from './checkinFormat'

/*
 * Acil destek → "Hekimle iletişime geç" (docs/wellbeing EM-02, EM-04).
 * Yaz → gözden geçir → gönder. Alıcı yalnızca uygulamada yapılandırılmış tıbbi rollerden seçilir. Belirti zorunlu değildir.
 * Sağlık verisi eki isteğe bağlıdır; hiçbir kategori varsayılan olarak seçili değildir; gerçek kayıt sayıları ve kapsam
 * gösterilir, kayıt yoksa öyle yazılır. Günlük ve check-in notları eklenemez.
 * Gözden geçirilen içerik onaylanınca dondurulur ve olduğu gibi gönderilir. Gönderim yeri uygulamanın veri deposundaki demo
 * giden kutusudur: gerçek bir iletişim hattı yoktur, teslim ya da okundu onayı üretilmez.
 * Kapatınca ve gönderim başarısız olunca yazılanlar korunur.
 */

type Preset = RangePreset | 'custom'

interface ContactDraft {
  recipient: MedicalContact['id'] | null
  symptoms: ContactSymptom[]
  other: boolean
  explanation: string
  categories: AttachmentCategoryId[]
  preset: Preset
  /** Hazır aralıkların hesaplandığı an; kategori ilk seçildiğinde ya da kişi yenileyince belirlenir */
  reference: number | null
  customFrom: string
  customTo: string
}

/** Şimdiki an; yalnızca olay işleyicilerinde (kişi seçim yapınca) okunur */
const currentTime = () => Date.now()

const emptyDraft = (): ContactDraft => ({ recipient: null, symptoms: [], other: false, explanation: '', categories: [], preset: '24h', reference: null, customFrom: '', customTo: '' })

/** Seçimlerden aralık: hazır aralık referans andan geriye, özel aralık görev saatinde okunan alanlardan */
function rangeOf(d: ContactDraft): { from: number; to: number } | null {
  if (d.reference === null) return null
  if (d.preset !== 'custom') return presetRange(d.preset, d.reference)
  return { from: fromLocalInput(d.customFrom), to: fromLocalInput(d.customTo) }
}

/** Uygulama düzeyinde tek yerde çizilir; açılıp kapanması lib/emergencyFlow üzerindendir */
export function DoctorContactSheet({ onOpenMessages, contacts: injected }: { onOpenMessages: () => void; contacts?: readonly MedicalContact[] }) {
  const { t } = useI18n()
  const { astronaut, canEdit } = useHealth()
  const open = useDoctorContactOpen()
  const c = t.mindPage.contact
  return (
    <Sheet open={open} onClose={closeDoctorContact} title={c.title} subtitle={c.subtitle} closeLabel={c.close} icon={<Stethoscope size={19} aria-hidden />} id="doctor-contact" width="w-[min(600px,100vw)]">
      {open && <DoctorContactBody onOpenMessages={onOpenMessages} contacts={injected} astronaut={canEdit ? astronaut : null} />}
    </Sheet>
  )
}

/** Mesaj formu (alıcıları okur); acil durum penceresinin içinde de aynı form kullanılır */
export function DoctorContactBody({ onOpenMessages, contacts: injected, astronaut }: { onOpenMessages: () => void; contacts?: readonly MedicalContact[]; astronaut: CrewId | null }) {
  const { t } = useI18n()
  const fetched = useQuery('doctorContacts', !injected ? [] : null)
  const contacts = injected ?? fetched
  if (!astronaut) return <p className="text-[15.5px] text-ink-muted">{t.mindPage.emergency.surgeon}</p>
  if (contacts === null) return <div className="skeleton h-40 rounded-xl" aria-label={t.mindPage.loading} />
  return <ContactFlow astronaut={astronaut} contacts={contacts} onOpenMessages={onOpenMessages} />
}

function ContactFlow({ astronaut, contacts, onOpenMessages }: { astronaut: CrewId; contacts: readonly MedicalContact[]; onOpenMessages: () => void }) {
  const { t, lang, locale } = useI18n()
  const { backend, mutate } = useHealth()
  const c = t.mindPage.contact
  const ids = useId()
  const draftKey = `contact:${astronaut}`
  const [memo, setMemo] = useDraft(draftKey)
  const draft: ContactDraft = (() => {
    if (memo) {
      try {
        return { ...emptyDraft(), ...(JSON.parse(memo) as Partial<ContactDraft>) }
      } catch {
        /* bozuk taslak */
      }
    }
    // Yapılandırılmış tek alıcı varsa seçili gelir (ekranda görünür, değiştirilebilir)
    return { ...emptyDraft(), recipient: contacts.length === 1 ? contacts[0].id : null }
  })()
  const update = (patch: Partial<ContactDraft>) => setMemo(JSON.stringify({ ...draft, ...patch }))

  const [phase, setPhase] = useState<'compose' | 'review' | 'sent'>('compose')
  const [review, setReview] = useState<DoctorRequest | null>(null)
  const [sent, setSent] = useState<MessageDoc | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)

  const range = rangeOf(draft)
  const rangeError = range && draft.reference !== null ? checkRange(range.from, range.to, draft.reference) : null
  const preview = useQuery('attachmentPreview', draft.categories.length && range && !rangeError ? [astronaut, draft.categories, range.from, range.to, draft.reference!] : null)
  const tooLong = draft.explanation.length > EXPLANATION_MAX_CHARS
  const hasContent = draft.symptoms.length > 0 || draft.other || draft.explanation.trim() !== ''
  const recipient = contacts.find((x) => x.id === draft.recipient) ?? null
  const canReview = !!recipient && hasContent && !tooLong && (draft.categories.length === 0 || (!!range && !rangeError))

  if (contacts.length === 0) {
    return (
      <p role="status" className="flex items-start gap-2 rounded-xl border border-line-strong bg-white/[0.03] p-3 text-[15.5px] leading-snug text-ink">
        <Info size={16} className="mt-0.5 shrink-0 text-holo" aria-hidden />
        {c.noRecipient}
      </p>
    )
  }

  const toggleCategory = (id: AttachmentCategoryId) => {
    const on = draft.categories.includes(id)
    const categories = on ? draft.categories.filter((x) => x !== id) : [...draft.categories, id]
    // Referans an ilk kategori seçilince belirlenir (bir olayın içinde: render saf kalır)
    update({ categories, reference: draft.reference ?? currentTime() })
  }
  const choosePreset = (preset: Preset) => {
    const reference = draft.reference ?? currentTime()
    const base = presetRange('24h', reference)
    update(preset === 'custom' && !draft.customFrom ? { preset, reference, customFrom: toLocalInput(base.from), customTo: toLocalInput(base.to) } : { preset, reference })
  }

  /** Hekime gidecek metin: gözden geçirmede gösterilen ve gönderilen metin aynıdır */
  const composeText = (snap: AttachmentSnapshot | null) => {
    const lines: string[] = []
    if (draft.symptoms.length) lines.push(c.textSymptoms(new Intl.ListFormat(locale, { type: 'conjunction' }).format(draft.symptoms.map((s) => c.symptom[s]))))
    if (draft.other) lines.push(c.textOther)
    if (draft.explanation.trim()) lines.push(draft.explanation.trim())
    if (snap) {
      lines.push(c.textAttachment(`${fullTime(snap.from, locale)} – ${fullTime(snap.to, locale)}`))
      for (const cat of snap.categories) lines.push(`• ${c.textCategory(resolve(INDICATORS[cat.id].name, lang), cat.count)}`)
    }
    return lines.join('\n')
  }

  const toReview = async (e: FormEvent) => {
    e.preventDefault()
    if (!canReview || !backend) return
    setError(null)
    let snap: AttachmentSnapshot | null = null
    if (draft.categories.length && range && draft.reference !== null) {
      try {
        const r = await backend.call('attachmentPreview', astronaut, draft.categories, range.from, range.to, draft.reference)
        if (!r.ok) return setError(c.rangeErrors[r.error])
        // Kayıt olmayan kategoriler eke konmaz (boş ek gönderilmez)
        const categories = r.snapshot.categories.filter((x) => x.count > 0)
        snap = categories.length ? { ...r.snapshot, categories } : null
      } catch {
        return setError(c.failed)
      }
    }
    // Gözden geçirilen içerik dondurulur; istek kimliği bir kez üretilir (yeniden denemede aynısı kullanılır)
    const request: DoctorRequest = deepFreeze({
      requestId: `dr_${crypto.randomUUID().replaceAll('-', '')}`,
      recipient: recipient!.id,
      symptoms: [...draft.symptoms],
      other: draft.other,
      explanation: draft.explanation.trim(),
      text: composeText(snap),
      attachment: snap,
    })
    setReview(request)
    setPhase('review')
  }

  const send = async () => {
    if (!review || sending.current) return
    sending.current = true
    setBusy(true)
    setError(null)
    try {
      const r = await mutate('sendDoctorRequest', astronaut, review)
      if (r?.ok) {
        setSent(r.message)
        setPhase('sent')
        setDraft(draftKey, '')
      } else setError(c.failed)
    } catch {
      setError(c.failed)
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  if (phase === 'sent' && sent) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="flex items-center gap-2 font-display text-[18px] font-semibold text-ink">
          <CircleCheck size={18} className="text-holo" aria-hidden />
          {c.sentTitle}
        </p>
        <ul className="flex flex-col gap-1.5 text-[15.5px] leading-snug text-ink-muted">
          <li>{backend?.mode === 'server' ? c.whereServer : c.whereLocal}</li>
          {sent.queued ? <li>{c.queued}</li> : <li>{c.eta(fullTime(sent.deliverAt, locale))}</li>}
          <li>{c.noAck}</li>
        </ul>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              closeDoctorContact()
              onOpenMessages()
            }}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-holo/10 px-4 text-sm font-medium text-holo ring-1 ring-holo/25 transition-colors hover:bg-holo/15"
          >
            {c.openMessages}
          </button>
          <button
            type="button"
            onClick={closeDoctorContact}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-4 text-sm font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            {c.done}
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'review' && review) {
    return (
      <section aria-labelledby={`${ids}-review`} className="flex flex-col gap-4">
        <h3 id={`${ids}-review`} className="font-display text-[18px] font-semibold">
          {c.reviewTitle}
        </h3>
        <dl className="flex flex-col gap-3 text-[15.5px]">
          <div>
            <dt className="text-[14.5px] text-ink-muted">{c.recipient}</dt>
            <dd className="text-ink">
              {recipient!.name} · {resolve(recipient!.role, lang)}
            </dd>
          </div>
          <div>
            <dt className="text-[14.5px] text-ink-muted">{c.message}</dt>
            <dd className="rounded-xl border border-line bg-white/[0.015] p-3 whitespace-pre-line text-ink" data-review="message">
              {review.text}
            </dd>
          </div>
          <div>
            <dt className="text-[14.5px] text-ink-muted">{c.attachment}</dt>
            <dd data-review="attachment">{review.attachment ? <AttachmentContents snap={review.attachment} /> : <span className="text-ink">{c.noAttachment}</span>}</dd>
          </div>
        </dl>
        <p className="text-[14.5px] leading-snug text-ink-muted">{c.frozen}</p>
        <p className="text-[14.5px] leading-snug text-ink-muted">{c.transportNote}</p>
        {error && (
          <p role="alert" className="rounded-xl border border-line-strong bg-white/[0.03] p-3 text-[15px] text-ink">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-holo/10 px-4 text-sm font-medium text-holo ring-1 ring-holo/25 transition-colors hover:bg-holo/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? c.sending : error ? c.retry : c.send}
          </button>
          <button
            type="button"
            onClick={() => {
              setPhase('compose')
              setError(null)
            }}
            disabled={busy}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-4 text-sm font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowLeft size={16} aria-hidden />
            {c.edit}
          </button>
        </div>
      </section>
    )
  }

  const zone = missionZone(draft.reference ?? 0, locale)
  return (
    <form onSubmit={toReview} className="flex flex-col gap-5" noValidate>
      <p className="text-[14.5px] leading-snug text-ink-muted">{c.transportNote}</p>

      <fieldset>
        <legend className="mb-2 text-[16.5px] font-medium text-ink">{c.recipient}</legend>
        <div className="flex flex-col gap-1.5">
          {contacts.map((x) => (
            <label
              key={x.id}
              className="relative flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 text-[15.5px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink has-[:checked]:border-holo/50 has-[:checked]:bg-holo/10 has-[:checked]:text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-holo"
            >
              <input
                type="radio"
                name={`${ids}-recipient`}
                checked={draft.recipient === x.id}
                onChange={() => update({ recipient: x.id })}
                className="absolute inset-0 size-full cursor-pointer appearance-none rounded-xl opacity-0"
              />
              {x.name} · {resolve(x.role, lang)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-[16.5px] font-medium text-ink">{c.symptoms}</legend>
        <p className="mb-2 text-[14.5px] text-ink-muted">{c.symptomsHint}</p>
        <div className="flex flex-wrap gap-1.5">
          {CONTACT_SYMPTOMS.map((s) => (
            <Chip key={s} label={c.symptom[s]} checked={draft.symptoms.includes(s)} onChange={() => update({ symptoms: draft.symptoms.includes(s) ? draft.symptoms.filter((x) => x !== s) : [...draft.symptoms, s] })} />
          ))}
        </div>
        <div className="mt-2">
          <Chip label={c.other} checked={draft.other} onChange={() => update({ other: !draft.other })} />
        </div>
      </fieldset>

      <div>
        <label htmlFor={`${ids}-explanation`} className="mb-2 block text-[16.5px] font-medium text-ink">
          {c.explanation}
        </label>
        <textarea
          id={`${ids}-explanation`}
          value={draft.explanation}
          onChange={(e) => update({ explanation: e.target.value })}
          rows={3}
          aria-describedby={`${ids}-chars${tooLong ? ` ${ids}-toolong` : ''}`}
          aria-invalid={tooLong || undefined}
          className="w-full resize-y rounded-xl border border-line bg-base/70 px-3 py-2 text-[16px] leading-relaxed text-ink outline-none focus:border-holo/45"
        />
        <p id={`${ids}-chars`} className="tabular mt-1 text-right font-mono text-[14px] text-ink-muted">
          {c.chars(draft.explanation.length, EXPLANATION_MAX_CHARS)}
        </p>
        {tooLong && (
          <p id={`${ids}-toolong`} role="alert" className="text-[15px] text-ink">
            {c.tooLong(EXPLANATION_MAX_CHARS)}
          </p>
        )}
      </div>

      <fieldset>
        <legend className="mb-1 text-[16.5px] font-medium text-ink">{c.attach}</legend>
        <p className="mb-2 text-[14.5px] text-ink-muted">{c.attachHint}</p>
        <div className="flex flex-wrap gap-1.5">
          {ATTACHMENT_CATEGORIES.map((id) => (
            <Chip key={id} label={resolve(INDICATORS[id].name, lang)} checked={draft.categories.includes(id)} onChange={() => toggleCategory(id)} />
          ))}
        </div>
      </fieldset>

      {draft.categories.length > 0 && draft.reference !== null && (
        <section aria-labelledby={`${ids}-range`} className="flex flex-col gap-3 rounded-xl border border-line bg-white/[0.015] p-3.5">
          <h3 id={`${ids}-range`} className="text-[16.5px] font-medium text-ink">
            {c.range}
          </h3>
          <div role="group" aria-label={c.range} className="flex flex-wrap gap-1 rounded-xl border border-line p-1">
            {(['24h', '3d', '7d', 'custom'] as Preset[]).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={draft.preset === p}
                onClick={() => choosePreset(p)}
                className="flex min-h-9 flex-1 items-center justify-center rounded-lg px-3 text-sm text-ink-muted transition-colors hover:bg-white/[0.04] hover:text-ink aria-pressed:bg-holo/12 aria-pressed:text-holo"
              >
                {draft.preset === p && <Check size={14} className="mr-1 shrink-0" aria-hidden />}
                {c.presets[p]}
              </button>
            ))}
          </div>
          <p className="text-[14.5px] leading-snug text-ink-muted">{c.reference(fullTime(draft.reference, locale))}</p>
          <button
            type="button"
            onClick={() => update({ reference: currentTime() })}
            className="flex min-h-9 w-fit items-center rounded-lg border border-line px-2.5 text-[14.5px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            {c.refresh}
          </button>
          {draft.preset === 'custom' && (
            <div className="flex flex-col gap-2">
              <p className="text-[14.5px] text-ink-muted">{c.customHint(zone)}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-[14.5px] text-ink-muted">
                  {c.from}
                  <input
                    type="datetime-local"
                    value={draft.customFrom}
                    onChange={(e) => update({ customFrom: e.target.value })}
                    className="min-h-11 rounded-xl border border-line bg-base/70 px-3 text-[15.5px] text-ink outline-none focus:border-holo/45"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[14.5px] text-ink-muted">
                  {c.to}
                  <input
                    type="datetime-local"
                    value={draft.customTo}
                    onChange={(e) => update({ customTo: e.target.value })}
                    className="min-h-11 rounded-xl border border-line bg-base/70 px-3 text-[15.5px] text-ink outline-none focus:border-holo/45"
                  />
                </label>
              </div>
            </div>
          )}
          {range && !rangeError && (
            <p className="tabular text-[15px] text-ink" data-range="exact">
              {c.exact(fullTime(range.from, locale), fullTime(range.to, locale))}
            </p>
          )}
          {rangeError && (
            <p role="alert" className="text-[15px] text-ink">
              {c.rangeErrors[rangeError]}
            </p>
          )}
          {preview?.ok && (
            <ul className="flex flex-col gap-1.5" aria-label={c.attachment}>
              {preview.snapshot.categories.map((cat) => (
                <li key={cat.id} data-category={cat.id} className="rounded-lg border border-line px-3 py-2 text-[15px]">
                  <span className="font-medium text-ink">{resolve(INDICATORS[cat.id].name, lang)}</span>
                  {cat.count === 0 ? (
                    <span className="block text-ink-muted">{c.noRecords}</span>
                  ) : (
                    <>
                      <span className="tabular block text-ink">{c.count(cat.count)}</span>
                      <span className="block text-ink-muted">{c.coverage(fullTime(cat.first!, locale), fullTime(cat.last!, locale))}</span>
                      <span className="block text-ink-muted">
                        {c.sourceLine(
                          Object.entries(cat.sources)
                            .map(([k, n]) => `${c.sources[k] ?? k} ${n}`)
                            .join(', '),
                        )}
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!hasContent && <p className="text-[15px] text-ink-muted">{c.empty}</p>}
      {error && (
        <p role="alert" className="text-[15px] text-ink">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!canReview}
        className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-holo/10 px-4 text-sm font-medium text-holo ring-1 ring-holo/25 transition-colors hover:bg-holo/15 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {c.review}
      </button>
    </form>
  )
}

/** Seçilebilir çip (onay kutusu): etiketin tamamı tıklanır, odak halkası etikette görünür */
function Chip({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="relative flex min-h-11 cursor-pointer items-center rounded-lg border border-line px-3 text-[15px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink has-[:checked]:border-holo/50 has-[:checked]:bg-holo/10 has-[:checked]:text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-holo">
      <input type="checkbox" checked={checked} onChange={onChange} className="absolute inset-0 size-full cursor-pointer appearance-none rounded-lg opacity-0" />
      {label}
    </label>
  )
}

/** Gönderilecek ekin gerçek içeriği: kategori başına kayıt sayısı, kapsam ve istenirse bütün değerler */
function AttachmentContents({ snap }: { snap: AttachmentSnapshot }) {
  const { t, lang, locale } = useI18n()
  const c = t.mindPage.contact
  const [openId, setOpenId] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-2">
      <p className="tabular text-[15px] text-ink">{c.exact(fullTime(snap.from, locale), fullTime(snap.to, locale))}</p>
      {snap.categories.map((cat) => {
        const name = resolve(INDICATORS[cat.id].name, lang)
        const unit = resolve(INDICATORS[cat.id].unit, lang)
        const open = openId === cat.id
        return (
          <div key={cat.id} data-category={cat.id} className="rounded-lg border border-line px-3 py-2 text-[15px]">
            <span className="font-medium text-ink">{name}</span> <span className="tabular text-ink">{c.count(cat.count)}</span>
            <span className="block text-ink-muted">{c.coverage(fullTime(cat.first!, locale), fullTime(cat.last!, locale))}</span>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : cat.id)}
              className="mt-1 min-h-9 rounded-lg border border-line px-2.5 text-[14.5px] text-ink-muted hover:border-line-strong hover:text-ink"
            >
              {open ? c.hideValues(name) : c.showValues(name)}
            </button>
            {open && (
              <ol className="scroll-thin mt-1 max-h-48 overflow-y-auto font-mono text-[14px] text-ink">
                {cat.points.map((p) => (
                  <li key={`${p.t}-${p.source}`} className="tabular">
                    {fullTime(p.t, locale)} · {p.v2 === undefined ? p.v : `${p.v}/${p.v2}`} {unit}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )
      })}
    </div>
  )
}
