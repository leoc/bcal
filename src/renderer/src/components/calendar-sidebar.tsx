import type { CalendarInfo, SyncStatus } from '@shared/types'
import { AlertCircle, Check, EyeOff, RefreshCw } from 'lucide-react'
import { MiniMonth } from '@/components/mini-month'
import type { Group } from '@/lib/calendars'
import { type DayRange, shadeFor } from '@/lib/month'
import { cn } from '@/lib/utils'

interface Props {
  groups: Group[]
  visible: (calendar: CalendarInfo) => boolean
  incognito: boolean
  onToggle: (calendar: CalendarInfo) => void
  /** what the calendar shows: its month in the mini month, a week or day shaded */
  current?: DayRange
  onPickDate?: (date: Date) => void
  sync?: SyncStatus
  onSync?: () => void
}

const keyClass =
  'inline-flex h-4 min-w-4 items-center justify-center rounded border bg-background px-1 font-mono text-[10px] leading-none text-muted-foreground'

export function CalendarSidebar({
  groups,
  visible,
  incognito,
  onToggle,
  current,
  onPickDate,
  sync,
  onSync,
}: Props) {
  const shaded = shadeFor(current)
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="drag flex h-[72px] shrink-0 items-center gap-2 px-5">
        <span className="text-lg font-semibold tracking-tight">bcal</span>
        {incognito && (
          <span className="flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            <EyeOff className="size-3" /> Inkognito
          </span>
        )}
      </div>
      {current && (
        <MiniMonth
          className="mx-auto mb-4 shrink-0"
          selected={current.start}
          marked={false}
          range={shaded}
          onPick={onPickDate}
        />
      )}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {groups.map((group, index) => (
          <section key={group.name} className="mb-3">
            <h3 className="flex items-center px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <span className="flex-1">{group.name}</span>
              {index < 9 && (
                <kbd
                  className={keyClass}
                  title={group.toggle ? 'Gruppe an/aus' : 'Nur diese Gruppe'}
                >
                  {group.toggle ? `±${index + 1}` : index + 1}
                </kbd>
              )}
            </h3>
            <ul>
              {group.calendars.map((calendar) => {
                const shown = visible(calendar)
                return (
                  <li key={calendar.id}>
                    <button
                      type="button"
                      tabIndex={-1}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onToggle(calendar)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-left text-sm transition-colors',
                        'hover:bg-sidebar-accent',
                        !shown && 'text-muted-foreground',
                      )}
                    >
                      <span
                        className="size-3 shrink-0 rounded-[4px] border-2"
                        style={{
                          borderColor: calendar.color,
                          backgroundColor: shown ? calendar.color : 'transparent',
                        }}
                      />
                      <span className="flex-1 truncate">{calendar.name}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
      {sync && onSync && <SyncLine status={sync} onSync={onSync} />}
      <div className="flex items-center gap-1.5 border-t px-5 py-3 text-xs text-muted-foreground">
        <kbd className={keyClass}>0</kbd> alle
        <span className="px-1">·</span>
        <kbd className={keyClass}>?</kbd> Tastenkürzel
      </div>
    </aside>
  )
}

const clock = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })

/** How the last pimsync run went; a click (or S) syncs now. */
function SyncLine({ status, onSync }: { status: SyncStatus; onSync: () => void }) {
  const when = status.at ? clock.format(new Date(status.at)) : undefined
  const text = status.running
    ? 'Synchronisiere …'
    : status.ok === false
      ? `Sync fehlgeschlagen${when ? ` · ${when}` : ''}`
      : status.ok
        ? `Sync ${when} · ${status.summary}`
        : 'Noch nicht synchronisiert'
  const Icon = status.running
    ? RefreshCw
    : status.ok === false
      ? AlertCircle
      : status.ok
        ? Check
        : RefreshCw
  return (
    <button
      type="button"
      tabIndex={-1}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onSync}
      title={status.error ?? 'Jetzt synchronisieren (S)'}
      className={cn(
        'mx-2 mb-2 flex items-center gap-2 rounded-md px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-sidebar-accent',
        status.ok === false && !status.running && 'text-destructive',
      )}
    >
      <Icon className={cn('size-3.5 shrink-0', status.running && 'animate-spin')} />
      <span className="truncate">{text}</span>
    </button>
  )
}
