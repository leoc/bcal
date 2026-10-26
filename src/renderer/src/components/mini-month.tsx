import { cn } from '@/lib/utils'

const weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const title = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' })

/** Static month grid that marks `selected` and today. */
export function MiniMonth({ selected }: { selected: Date }) {
  const first = new Date(selected.getFullYear(), selected.getMonth(), 1)
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - ((first.getDay() + 6) % 7))
  const today = new Date().toDateString()
  const days = Array.from(
    { length: 42 },
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
  )
  return (
    <div className="w-56 select-none">
      <div className="mb-2 text-center text-sm font-medium">{title.format(selected)}</div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-xs">
        {weekdays.map((d) => (
          <div key={d} className="text-muted-foreground">
            {d}
          </div>
        ))}
        {days.map((d) => (
          <div
            key={d.toISOString()}
            className={cn(
              'mx-auto flex size-7 items-center justify-center rounded-md',
              d.getMonth() !== selected.getMonth() && 'text-muted-foreground/50',
              d.toDateString() === today && 'font-semibold text-primary underline',
              d.toDateString() === selected.toDateString() &&
                'bg-primary text-primary-foreground no-underline',
            )}
          >
            {d.getDate()}
          </div>
        ))}
      </div>
    </div>
  )
}
