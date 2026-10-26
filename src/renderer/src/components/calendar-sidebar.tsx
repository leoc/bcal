import type { CalendarInfo } from '@shared/types'
import { cn } from '@/lib/utils'

interface Props {
  calendars: CalendarInfo[]
  hidden: Set<string>
  onToggle: (id: string) => void
}

export function CalendarSidebar({ calendars, hidden, onToggle }: Props) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="drag flex h-[72px] items-center px-5">
        <span className="text-lg font-semibold tracking-tight">bcal</span>
      </div>
      <div className="px-5 pb-2 text-xs font-medium text-muted-foreground">Kalender</div>
      <ul className="flex-1 overflow-y-auto px-2 pb-4">
        {calendars.map((calendar, index) => {
          const visible = !hidden.has(calendar.id)
          return (
            <li key={calendar.id}>
              <button
                type="button"
                onClick={() => onToggle(calendar.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-left text-sm',
                  'hover:bg-sidebar-accent',
                  !visible && 'text-muted-foreground',
                )}
              >
                <span
                  className="size-3 shrink-0 rounded-[4px] border-2"
                  style={{
                    borderColor: calendar.color,
                    backgroundColor: visible ? calendar.color : 'transparent',
                  }}
                />
                <span className="flex-1 truncate">{calendar.name}</span>
                {index < 9 && (
                  <kbd className="font-mono text-[10px] text-muted-foreground">{index + 1}</kbd>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="border-t px-5 py-3 text-xs text-muted-foreground">
        <kbd className="font-mono">?</kbd> Tastenkürzel
      </div>
    </aside>
  )
}
