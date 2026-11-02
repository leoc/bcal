import { CalendarController } from '@fullcalendar/react'
import { PanelLeft, PanelRight } from 'lucide-react'
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
  /** buttons that fold the calendars (left) and details (right) panels */
  panels?: PanelButtons
}

export interface PanelButtons {
  sidebar: boolean
  details: boolean
  onToggle: (name: 'sidebar' | 'details') => void
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
  panels,
}: EventCalendarToolbarProps) {
  const buttons = controller.getButtonState()

  return (
    <div className={cn('flex items-center justify-between flex-wrap gap-3', className)}>
      <div className="flex items-center shrink-0 gap-3">
        {panels && (
          <Button
            onClick={() => panels.onToggle('sidebar')}
            aria-label="Kalender ein/aus (b)"
            title="Kalender ein/aus (b)"
            aria-pressed={panels.sidebar}
            variant="ghost"
            size="icon"
            className={cn(!panels.sidebar && 'text-muted-foreground')}
            {...keepFocus}
          >
            <PanelLeft />
          </Button>
        )}
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
      <div className="flex items-center gap-3">
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
        {panels && (
          <Button
            onClick={() => panels.onToggle('details')}
            aria-label="Details ein/aus (Enter, i)"
            title="Details ein/aus (Enter, i)"
            aria-pressed={panels.details}
            variant="ghost"
            size="icon"
            className={cn(!panels.details && 'text-muted-foreground')}
            {...keepFocus}
          >
            <PanelRight />
          </Button>
        )}
      </div>
    </div>
  )
}
