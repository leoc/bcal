import type { CalendarInfo } from '@shared/types'
import type { Group } from '@/lib/calendars'
import { cn } from '@/lib/utils'

interface Props {
  groups: Group[]
  visible: (calendar: CalendarInfo) => boolean
  onToggle: (calendar: CalendarInfo) => void
}

export function CalendarSidebar({ groups, visible, onToggle }: Props) {
  let index = 0
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="drag flex h-[72px] shrink-0 items-center px-5">
        <span className="text-lg font-semibold tracking-tight">bcal</span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {groups.map((group) => (
          <section key={group.name} className="mb-3">
            <h3 className="px-3 pb-1 text-xs font-medium text-muted-foreground">{group.name}</h3>
            <ul>
              {group.calendars.map((calendar) => {
                const shown = visible(calendar)
                const key = ++index
                return (
                  <li key={calendar.id}>
                    <button
                      type="button"
                      onClick={() => onToggle(calendar)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-left text-sm',
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
                      {key <= 9 && (
                        <kbd className="font-mono text-[10px] text-muted-foreground">{key}</kbd>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
      <div className="border-t px-5 py-3 text-xs text-muted-foreground">
        <kbd className="font-mono">?</kbd> Tastenkürzel
      </div>
    </aside>
  )
}
