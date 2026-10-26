import type { CalendarInfo } from '@shared/types'
import { EyeOff } from 'lucide-react'
import type { Group } from '@/lib/calendars'
import { cn } from '@/lib/utils'

interface Props {
  groups: Group[]
  visible: (calendar: CalendarInfo) => boolean
  incognito: boolean
  onToggle: (calendar: CalendarInfo) => void
}

export function CalendarSidebar({ groups, visible, incognito, onToggle }: Props) {
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
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {groups.map((group, index) => (
          <section key={group.name} className="mb-3">
            <h3 className="flex items-center px-3 pb-1 text-xs font-medium text-muted-foreground">
              <span className="flex-1">{group.name}</span>
              {index < 9 && (
                <kbd
                  className="font-mono text-[10px]"
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
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
      <div className="border-t px-5 py-3 text-xs text-muted-foreground">
        <kbd className="font-mono">0</kbd> alle · <kbd className="font-mono">?</kbd> Tastenkürzel
      </div>
    </aside>
  )
}
