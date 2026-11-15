import { IdCard } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { INDICATORS } from '../core/catalog'
import { PERSONAL_IDS, PROFILE_LIMITS, type Profile } from '../core/personal'
import { SOURCES } from '../core/sources'
import { num } from '../core/tx'
import { useHealth } from '../data/health'
import { resolve, useI18n } from '../i18n'
import { Sheet } from './Sheet'

type Field = 'age' | 'heightCm' | 'weightKg'
const FIELDS: Field[] = ['age', 'heightCm', 'weightKg']

/**
 * Kişisel bilgiler (D-10, U-04): yaş, boy ve kilo görev öncesi kayıtlı gelir ve değiştirilebilir. Vücut kitle indeksi
 * CDC'ye göre hesaplanır. Yaşamsal değerlerin normali kişiden kişiye değiştiği için (MedlinePlus) genel aralığın yanında
 * kişinin kendi verisinden "kişisel normal" hesaplanır; profil değişince bu normal yeniden öğrenilir.
 */
export function PersonalInfo({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const { snapshot } = useHealth()
  const profile = snapshot?.profile
  return (
    <Sheet open={open} onClose={onClose} title={t.personal.title} subtitle={profile ? profile.name : undefined} closeLabel={t.personal.close} icon={<IdCard size={18} />} id="personal-info">
      {/* Form, başka bir astronota geçilince baştan kurulur */}
      {profile && snapshot ? <Body key={profile.astronaut} profile={profile} /> : <p className="text-sm text-ink-dim">{t.vital.loading}</p>}
    </Sheet>
  )
}

function Body({ profile }: { profile: Profile }) {
  const { t, lang, locale } = useI18n()
  const { astronaut, canEdit, snapshot, mutate } = useHealth()
  const [form, setForm] = useState<Record<Field, string>>({ age: String(profile.age), heightCm: String(profile.heightCm), weightKg: String(profile.weightKg) })
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<'saved' | 'invalid' | null>(null)
  const parsed = Object.fromEntries(FIELDS.map((f) => [f, Number(form[f].replace(',', '.'))])) as Record<Field, number>
  const valid = FIELDS.every((f) => form[f].trim() !== '' && parsed[f] >= PROFILE_LIMITS[f][0] && parsed[f] <= PROFILE_LIMITS[f][1])
  const changed = FIELDS.some((f) => parsed[f] !== profile[f])
  const personal = snapshot?.personal

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!astronaut || !valid || !changed) return
    setSaving(true)
    const r = await mutate('updateProfile', astronaut, parsed)
    setSaving(false)
    setResult(r?.ok ? 'saved' : 'invalid')
  }

  return (
    <div className="space-y-5">
      <form onSubmit={(e) => void submit(e)} className="space-y-3" aria-label={t.personal.formLabel}>
        <div className="grid grid-cols-3 gap-2">
          {FIELDS.map((f) => {
            const [lo, hi] = PROFILE_LIMITS[f]
            const bad = form[f].trim() !== '' && !(parsed[f] >= lo && parsed[f] <= hi)
            return (
              <label key={f} className="block">
                <span className="text-[14.5px] text-ink-muted">{t.personal.fields[f]}</span>
                <span className="mt-1 flex items-baseline gap-1.5 rounded-xl border border-line bg-base/70 px-3 focus-within:border-holo/50">
                  <input
                    name={f}
                    inputMode="decimal"
                    value={form[f]}
                    disabled={!canEdit}
                    onChange={(e) => {
                      setForm((s) => ({ ...s, [f]: e.target.value }))
                      setResult(null)
                    }}
                    aria-invalid={bad || undefined}
                    aria-describedby={`personal-hint-${f}`}
                    className="tabular min-h-10 w-full min-w-0 bg-transparent font-mono text-[17px] text-ink outline-none disabled:text-ink-muted"
                  />
                  <span className="text-[14px] text-ink-dim">{t.personal.units[f]}</span>
                </span>
                <span id={`personal-hint-${f}`} className={`mt-1 block text-[13px] ${bad ? 'text-warn' : 'text-ink-dim'}`}>
                  {t.personal.range(num(lo, lang), num(hi, lang))}
                </span>
              </label>
            )
          })}
        </div>
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!valid || !changed || saving}
              className="flex min-h-10 items-center justify-center gap-2 rounded-xl bg-holo/15 px-4 text-sm font-medium text-holo ring-1 ring-holo/30 transition-colors hover:bg-holo/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t.personal.save}
            </button>
            {result && (
              <span role="status" className={`text-[14px] ${result === 'saved' ? 'text-ok' : 'text-warn'}`}>
                {result === 'saved' ? t.personal.saved : t.personal.invalid}
              </span>
            )}
            <span className="text-[13.5px] text-ink-dim">
              {profile.edited && profile.changedAt
                ? t.personal.editedAt(new Date(profile.changedAt).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))
                : t.personal.defaults}
            </span>
          </div>
        ) : (
          <p className="text-[14px] text-ink-dim">{t.personal.readOnly}</p>
        )}
      </form>

      {/* Vücut kitle indeksi (CDC) */}
      <section className="rounded-xl border border-line bg-white/[0.015] p-3.5">
        <h3 className="font-mono font-semibold text-[13.5px] tracking-[0.07em] text-ink-dim uppercase">{t.personal.bmiTitle}</h3>
        <p className="mt-1 flex items-baseline gap-2">
          <span data-bmi className="tabular font-mono text-[24px] font-medium text-ink">
            {num(profile.bmi, lang, 1)}
          </span>
          <span className="text-[14.5px] text-ink-dim">kg/m²</span>
          <span className="text-[15.5px] text-ink">· {t.personal.bmiCategory[profile.bmiCategory]}</span>
        </p>
        <p className="mt-1 text-[14px] leading-snug text-ink-muted">{t.personal.bmiNote}</p>
        <a href={SOURCES.cdcBmi.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[13px] text-ink-dim underline decoration-line-strong underline-offset-2 hover:text-holo">
          {t.alerts.source}: {SOURCES.cdcBmi.org} · {SOURCES.cdcBmi.title}
        </a>
      </section>

      {/* Kişisel normal (U-04) */}
      <section className="rounded-xl border border-line bg-white/[0.015] p-3.5" data-personal-normal>
        <h3 className="font-mono font-semibold text-[13.5px] tracking-[0.07em] text-ink-dim uppercase">{t.personal.normalTitle}</h3>
        <ul className="mt-2 space-y-1.5">
          {personal &&
            PERSONAL_IDS.map((id) => {
              const pn = personal[id]
              const d = INDICATORS[id].digits
              return (
                <li key={id} className="flex flex-wrap items-baseline justify-between gap-x-3 text-[15.5px]">
                  <span className="text-ink">{resolve(INDICATORS[id].name, lang)}</span>
                  <span className="tabular font-mono text-ink">
                    {num(pn.low, lang, d)}–{num(pn.high, lang, d)} <span className="text-[14px] text-ink-dim">{resolve(INDICATORS[id].unit, lang)}</span>
                  </span>
                  <span className="w-full text-[13.5px] text-ink-dim">
                    {pn.basis === 'data' ? t.personal.basisData(pn.days) : t.personal.basisBaseline} · {t.personal.general}: {resolve(INDICATORS[id].range, lang)}
                  </span>
                </li>
              )
            })}
        </ul>
        <p className="mt-3 text-[14px] leading-snug text-ink-muted">{t.personal.explain}</p>
        <a href={SOURCES.mpVitals.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[13px] text-ink-dim underline decoration-line-strong underline-offset-2 hover:text-holo">
          {t.alerts.source}: {SOURCES.mpVitals.org}
        </a>
      </section>
    </div>
  )
}
