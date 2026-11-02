import { type DayRange, monthGrid, rangePart } from '@/lib/month'
import { cn } from '@/lib/utils'

const weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const title = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' })

interface Props {
  /** the month shown, and the picked day unless `marked` is false */
  selected: Date
  marked?: boolean
  /** days shaded as what the calendar shows, e.g. the visible week (end exclusive) */
  range?: DayRange
  onPick?: (date: Date) => void
  className?: string
}

/** Month grid that marks today like the calendar does and `selected` or `range`. */
export function MiniMonth({ selected, marked = true, range, onPick, className }: Props) {
  const today = new Date().toDateString()
  const days = monthGrid(selected)
  return (
    <div className={cn('w-56 select-none', className)}>
      <div className="mb-2 text-center text-sm font-medium">{title.format(selected)}</div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-xs">
        {weekdays.map((d) => (
          <div key={d} className="text-muted-foreground">
            {d}
          </div>
        ))}
        {days.map((d) => {
          const isToday = d.toDateString() === today
          const isSelected = marked && d.toDateString() === selected.toDateString()
          const part = rangePart(d, range)
          return (
            <div
              key={d.toISOString()}
              onClick={onPick ? () => onPick(d) : undefined}
              className={cn(
                'flex h-7 items-center justify-center',
                part.inside && 'bg-foreground/8',
                part.first && 'rounded-s-md',
                part.last && 'rounded-e-md',
                onPick && 'cursor-pointer',
              )}
            >
              <span
                className={cn(
                  'flex size-6 items-center justify-center rounded-full',
                  d.getMonth() !== selected.getMonth() && 'text-muted-foreground/50',
                  onPick && !isToday && 'hover:bg-foreground/10',
                  isToday && 'bg-primary font-semibold text-primary-foreground',
                  isSelected &&
                    'font-semibold ring-2 ring-foreground ring-offset-1 ring-offset-popover',
                )}
              >
                {d.getDate()}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
