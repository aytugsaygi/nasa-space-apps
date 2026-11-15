import { ArrowRight, CalendarDays, Check, GlassWater, Plus, Stethoscope, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { Task } from '../core/tasks'
import { useHealth, useQuery } from '../data/health'
import { useAppCommand } from '../lib/appCommands'
import { resolve, useI18n } from '../i18n'
import { ScheduleSheet } from './ScheduleSheet'
import { Tooltip } from './Tooltip'

/**
 * Yapılacaklar: günün rutinleri ve planlı kontroller. Gecikenler en üstte ve "Gecikti" etiketiyle görünür.
 * Su doğrudan buradan eklenir; antrenman, ruh hali ve günlük kendi sayfalarına götürür.
 */
export function TodoCard({ onGo, onMeasure }: { onGo: (page: number) => void; onMeasure: () => void }) {
  const { t, lang } = useI18n()
  const { astronaut, canEdit, mutate } = useHealth()
  const tasks = useQuery('tasks', astronaut ? [astronaut] : null)
  const [title, setTitle] = useState('')
  const [calendar, setCalendar] = useState(false)
  // Asistandan: kontrol takvimi
  useAppCommand('openSchedule', () => setCalendar(true))
  // Takvimdeki geciken kontrol sayısı düğmede görünür (her açılışta değil, görev listesi yenilendikçe)
  const schedule = useQuery('schedule', astronaut ? [astronaut] : null)
  const overdue = schedule?.filter((c) => c.status === 'overdue').length ?? 0
  const done = tasks?.filter((x) => x.done).length ?? 0
  const total = tasks?.length ?? 0

  const add = (e: FormEvent) => {
    e.preventDefault()
    if (!astronaut || !title.trim()) return
    void mutate('addTask', astronaut, title)
    setTitle('')
  }

  return (
    <section id="tour-todo" aria-labelledby="todo-title" className="panel flex size-full min-h-0 flex-col overflow-hidden !rounded-3xl">
      <header className="flex shrink-0 items-baseline justify-between gap-2 px-4 pt-4 pb-2">
        <h2 id="todo-title" className="font-display text-[17px] font-semibold">
          {t.todo.title}
        </h2>
        <span className="ml-auto tabular font-mono text-[13.5px] text-ink-dim">{t.todo.subtitle(done, total)}</span>
        <Tooltip label={t.schedule.open}>
          <button
            type="button"
            id="schedule-button"
            onClick={() => setCalendar(true)}
            aria-label={overdue ? t.schedule.openOverdue(overdue) : t.schedule.open}
            className="relative -my-1 flex size-8 shrink-0 items-center justify-center self-center rounded-lg border border-line text-ink-muted transition-colors hover:border-holo/40 hover:text-holo"
          >
            <CalendarDays size={15} aria-hidden />
            {overdue > 0 && <span className="absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full bg-warn px-1 font-mono text-[11.5px] font-semibold text-void">{overdue}</span>}
          </button>
        </Tooltip>
      </header>
      <ScheduleSheet open={calendar} onClose={() => setCalendar(false)} onGo={onGo} />
      {total > 0 && (
        <div className="mx-4 mb-2 h-1 shrink-0 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
          <div className="h-full rounded-full bg-holo transition-[width] duration-500" style={{ width: `${(done / total) * 100}%` }} />
        </div>
      )}
      <ul data-wheel-scroll className="scroll-thin min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-2">
        {tasks?.map((task) => (
          <TaskRow key={task.key} task={task} canEdit={canEdit} onGo={onGo} onMeasure={onMeasure} />
        ))}
        {tasks && done === total && total > 0 && <li className="px-2 py-3 text-center text-[14.5px] text-ok">{t.todo.allDone}</li>}
      </ul>
      {canEdit && (
        <form onSubmit={add} className="flex shrink-0 gap-2 border-t border-line p-3">
          <label htmlFor="todo-add" className="sr-only">
            {t.todo.add}
          </label>
          <input
            id="todo-add"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.todo.addPlaceholder}
            maxLength={120}
            className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-base/70 px-3 text-[15px] text-ink outline-none placeholder:text-ink-dim focus:border-holo/45"
          />
          <button type="submit" aria-label={t.todo.add} className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-holo/12 text-holo ring-1 ring-holo/40 hover:bg-holo/20">
            <Plus size={17} aria-hidden />
          </button>
        </form>
      )}
      <span className="sr-only" aria-live="polite">
        {lang && t.todo.subtitle(done, total)}
      </span>
    </section>
  )
}

function TaskRow({ task, canEdit, onGo, onMeasure }: { task: Task; canEdit: boolean; onGo: (p: number) => void; onMeasure: () => void }) {
  const { t, lang } = useI18n()
  const { astronaut, mutate } = useHealth()
  const name = resolve(task.title, lang)
  const pct = task.progress ? Math.min(1, task.progress.value / Math.max(1, task.progress.target)) : null
  const toggle = () => astronaut && canEdit && void mutate('setTaskDone', astronaut, task.key, !task.done)
  const autoOnly = task.kind === 'water' || task.kind === 'workout'
  return (
    <li
      data-task={task.kind}
      data-done={task.done || undefined}
      className={`rounded-2xl border px-3 py-2.5 transition-colors ${task.overdue && !task.done ? 'border-warn/40 bg-warn/[0.05]' : 'border-line bg-white/[0.015]'}`}
    >
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          onClick={toggle}
          disabled={!canEdit || autoOnly}
          aria-pressed={task.done}
          aria-label={task.done ? t.todo.markUndone(name) : t.todo.markDone(name)}
          className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg border transition-colors disabled:cursor-default ${
            task.done ? 'border-ok/50 bg-ok/15 text-ok' : 'border-line-strong text-transparent hover:border-holo/50'
          }`}
        >
          <Check size={14} strokeWidth={3} aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <p className={`text-[15px] leading-snug font-medium ${task.done ? 'text-ink-dim line-through decoration-ink-dim/50' : 'text-ink'}`}>{name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13.5px] text-ink-dim">
            {task.due && <span className="tabular font-mono">{task.due}</span>}
            {task.detail && <span>{resolve(task.detail, lang)}</span>}
            {task.overdue && !task.done && <span className="font-semibold text-warn">{t.todo.overdue}</span>}
          </p>
          {pct !== null && (
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
              <div className={`h-full rounded-full ${task.done ? 'bg-ok' : 'bg-holo'}`} style={{ width: `${pct * 100}%` }} />
            </div>
          )}
        </div>
        {/* Satırın eylemi */}
        {task.kind === 'water' && canEdit && astronaut && !task.done && (
          <button
            type="button"
            onClick={() => void mutate('addWater', astronaut, 250)}
            aria-label={t.todo.addWaterLabel}
            className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-holo/10 px-2 text-[13.5px] font-semibold text-holo ring-1 ring-holo/30 hover:bg-holo/15"
          >
            <GlassWater size={13} aria-hidden />
            {t.todo.addWater}
          </button>
        )}
        {task.kind === 'measure' && canEdit && !task.done && (
          <button type="button" onClick={onMeasure} aria-label={t.todo.measureLabel} className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-holo/10 px-2 text-[13.5px] font-semibold text-holo ring-1 ring-holo/30 hover:bg-holo/15">
            <Stethoscope size={13} aria-hidden />
            {t.todo.measure}
          </button>
        )}
        {task.page !== 0 && (
          <button type="button" onClick={() => onGo(task.page)} aria-label={t.todo.goTo(name)} className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line text-ink-muted hover:border-holo/40 hover:text-holo">
            <ArrowRight size={14} aria-hidden />
          </button>
        )}
        {task.customId && canEdit && astronaut && (
          <button type="button" onClick={() => void mutate('removeTask', astronaut, task.customId!)} aria-label={t.todo.remove(name)} className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line text-ink-dim hover:border-crit/40 hover:text-crit">
            <Trash2 size={13} aria-hidden />
          </button>
        )}
      </div>
    </li>
  )
}
