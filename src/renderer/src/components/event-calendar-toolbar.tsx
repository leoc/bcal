import { CalendarController } from '@fullcalendar/react'
import { EventCalendarNextIcon, EventCalendarPrevIcon } from '@/components/event-calendar-icons'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

export interface EventCalendarToolbarProps {
  className?: string
  controller: CalendarController
  availableViews: string[]
  addButton?: {
    isPrimary?: boolean
    text?: string
    hint?: string
    click?: (ev: MouseEvent) => void
  }
}

// The keyboard drives the calendar: toolbar controls never take focus, so a
// click leaves no focus ring behind and Enter or the arrows keep their bindings
// instead of pressing the button or switching tabs.
const keepFocus = {
  tabIndex: -1,
  onMouseDown: (event: { preventDefault: () => void }) => event.preventDefault(),
}

export function EventCalendarToolbar({
  className,
  controller,
  availableViews,
  addButton,
}: EventCalendarToolbarProps) {
  const buttons = controller.getButtonState()

  return (
    <div className={cn('flex items-center justify-between flex-wrap gap-3', className)}>
      <div className="flex items-center shrink-0 gap-3">
        {addButton && (
          <Button onClick={addButton.click as any} aria-label={addButton.hint} {...keepFocus}>
            {addButton.text}
          </Button>
        )}
        <Button
          onClick={() => controller.today()}
          aria-label={buttons.today.hint}
          variant="outline"
          {...keepFocus}
        >
          {buttons.today.text}
        </Button>
        <div className="flex items-center">
          <Button
            onClick={() => controller.prev()}
            disabled={buttons.prev.isDisabled}
            aria-label={buttons.prev.hint}
            variant="ghost"
            size="icon"
            {...keepFocus}
          >
            <EventCalendarPrevIcon />
          </Button>
          <Button
            onClick={() => controller.next()}
            disabled={buttons.next.isDisabled}
            aria-label={buttons.next.hint}
            variant="ghost"
            size="icon"
            {...keepFocus}
          >
            <EventCalendarNextIcon />
          </Button>
        </div>
        <div className="text-xl font-semibold tracking-tight">{controller.view?.title}</div>
      </div>
      <Tabs value={controller.view?.type ?? availableViews[0]}>
        <TabsList>
          {availableViews.map((availableView) => (
            <TabsTrigger
              key={availableView}
              value={availableView}
              onClick={() => controller.changeView(availableView)}
              aria-label={buttons[availableView]?.hint}
              {...keepFocus}
            >
              {buttons[availableView]?.text}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}
