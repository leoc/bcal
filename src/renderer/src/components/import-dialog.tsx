import type { CalendarInfo, ImportDecision, ImportItem, Partstat } from '@shared/types'
import { Check, Square } from 'lucide-react'
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import { formatWhen } from '@/lib/format'
import { cn } from '@/lib/utils'

const answers: { id: Partstat; label: string }[] = [
  { id: 'ACCEPTED', label: 'Zusagen' },
  { id: 'TENTATIVE', label: 'Vielleicht' },
  { id: 'DECLINED', label: 'Absagen' },
]

const kinds: Record<ImportItem['kind'], string> = {
  new: 'Neu',
  update: 'Update',
  outdated: 'Älter als deine Kopie',
  cancel: 'Absage',
  gone: 'Absage',
}

interface Props {
  item: ImportItem
  /** file name and position, e.g. "invite.ics · 1/2" */
  source: string
  /** calendars to add to, the default first */
  calendars: CalendarInfo[]
  byId: Map<string, CalendarInfo>
  incognito: boolean
  /** the highlighted target calendar, for the preview in the grid */
  onTarget: (calendarId: string | undefined) => void
  onApply: (decision: ImportDecision) => void
  /** Esc: leave this event out */
  onSkip: () => void
}

/**
 * One event of an opened `.ics`: which calendar (new events), my answer
 * (invitations, Tab), events it replaces (removed along, Enter toggles).
 */
export function ImportDialog({
  item,
  source,
  calendars,
  byId,
  incognito,
  onTarget,
  onApply,
  onSkip,
}: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState('')
  const [answer, setAnswer] = useState<Partstat>(
    answers.find((a) => a.id === item.partstat)?.id ?? 'ACCEPTED',
  )
  const [remove, setRemove] = useState(
    () => new Set(item.superseded.filter((s) => s.strong).map((s) => s.event.id)),
  )
  useEffect(() => input.current?.focus(), [])

  const title = (text: string) => (incognito ? 'Termin' : text)
  const targets = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    return calendars.filter((c) => words.every((w) => c.name.toLowerCase().includes(w)))
  }, [calendars, query])

  // the highlighted calendar colors the preview
  useEffect(() => {
    if (item.kind !== 'new') return onTarget(item.existing?.calendarId)
    const id = selected.startsWith('cal:') ? selected.slice(4) : targets[0]?.id
    onTarget(id)
  }, [selected, targets, item, onTarget])

  const decide = (calendarId?: string) =>
    onApply({
      uid: item.uid,
      calendarId,
      partstat: item.invitation ? answer : undefined,
      remove: item.superseded
        .filter((s) => remove.has(s.event.id))
        .map((s) => ({ calendarId: s.event.calendarId, uid: s.event.uid })),
    })

  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      onSkip()
    } else if (e.key === 'Tab' && item.invitation) {
      e.preventDefault()
      const index = answers.findIndex((a) => a.id === answer)
      const step = e.shiftKey ? answers.length - 1 : 1
      setAnswer(answers[(index + step) % answers.length]?.id ?? 'ACCEPTED')
    }
  }

  const where = item.existing && byId.get(item.existing.calendarId)?.name
  const organizer = item.event.organizer?.name ?? item.event.organizer?.email

  return (
    <div className="fixed top-16 left-1/2 z-50 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl">
      <Command
        shouldFilter={false}
        value={selected}
        onValueChange={setSelected}
        onKeyDown={onKeyDown}
        loop
      >
        <div className="border-b px-4 py-3">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span
              className={cn(
                'rounded-md bg-muted px-1.5 py-0.5 font-medium',
                (item.kind === 'cancel' || item.kind === 'gone') && 'text-destructive',
              )}
            >
              {kinds[item.kind]}
            </span>
            <span className="truncate">{source}</span>
          </div>
          <div className="mt-1.5 text-sm font-medium">{title(item.event.title)}</div>
          <div className="text-xs text-muted-foreground">
            {formatWhen(item.event)}
            {organizer && !incognito && ` · von ${organizer}`}
          </div>
          {item.existing &&
            item.kind !== 'cancel' &&
            formatWhen(item.existing) !== formatWhen(item.event) && (
              <div className="mt-0.5 text-xs text-muted-foreground">
                bisher {formatWhen(item.existing)}
              </div>
            )}
          {item.invitation && (
            <div className="mt-2 flex items-center gap-1 text-xs">
              {answers.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAnswer(a.id)}
                  className={cn(
                    'rounded-md border px-2 py-0.5',
                    a.id === answer
                      ? 'border-foreground/30 bg-accent font-medium'
                      : 'text-muted-foreground',
                  )}
                >
                  {a.label}
                </button>
              ))}
              <span className="ml-auto text-[11px] text-muted-foreground">Tab wechselt</span>
            </div>
          )}
        </div>
        {item.kind === 'new' && (
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Kalender suchen …"
            className="h-10 w-full border-b bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground"
          />
        )}
        {item.kind !== 'new' && <input ref={input} className="sr-only" readOnly aria-hidden />}
        <CommandList className="max-h-80">
          {item.kind === 'new' && (
            <CommandGroup heading="Hinzufügen zu">
              {targets.map((calendar) => (
                <CommandItem
                  key={calendar.id}
                  value={`cal:${calendar.id}`}
                  onSelect={() => decide(calendar.id)}
                  className="gap-3"
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: calendar.color ?? 'var(--muted-foreground)' }}
                  />
                  <span className="flex-1">{calendar.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {(item.kind === 'update' || item.kind === 'outdated') && (
            <CommandGroup>
              <CommandItem value="apply" onSelect={() => decide()} className="gap-3">
                <span className="flex-1">
                  {item.kind === 'outdated' ? 'Trotzdem übernehmen' : 'Aktualisieren'}
                  {where && <span className="text-muted-foreground"> in {where}</span>}
                </span>
              </CommandItem>
            </CommandGroup>
          )}
          {item.kind === 'cancel' && (
            <CommandGroup>
              <CommandItem
                value="apply"
                onSelect={() => decide()}
                className="gap-3 text-destructive"
              >
                <span className="flex-1">Aus {where ?? 'dem Kalender'} löschen</span>
              </CommandItem>
            </CommandGroup>
          )}
          {item.kind === 'gone' && (
            <CommandGroup>
              <CommandItem value="skip" onSelect={onSkip}>
                Nicht im Kalender, nichts zu tun
              </CommandItem>
            </CommandGroup>
          )}
          {item.superseded.length > 0 && (
            <CommandGroup heading="Abgelöst: mitlöschen?">
              {item.superseded.map((s) => {
                const on = remove.has(s.event.id)
                const Icon = on ? Check : Square
                return (
                  <CommandItem
                    key={s.event.id}
                    value={`old:${s.event.id}`}
                    onSelect={() =>
                      setRemove((r) => {
                        const next = new Set(r)
                        if (on) next.delete(s.event.id)
                        else next.add(s.event.id)
                        return next
                      })
                    }
                    className="gap-3"
                  >
                    <Icon
                      className={cn('size-4', on ? 'text-destructive' : 'text-muted-foreground')}
                    />
                    <span className={cn('flex-1 truncate', on && 'line-through')}>
                      {title(s.event.title)}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatWhen(s.event)}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          )}
        </CommandList>
        <div className="border-t px-4 py-2 text-[11px] text-muted-foreground">
          ↵ übernehmen{item.superseded.length > 0 && ' · auf Abgelöstem ↵ an/aus'}
          {item.invitation && ' · Tab Antwort'} · Esc überspringen
        </div>
      </Command>
    </div>
  )
}
