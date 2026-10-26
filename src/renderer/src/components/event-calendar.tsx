import {
  type CalendarController,
  type CalendarOptions,
  useCalendarController,
} from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/react/daygrid'
import interactionPlugin from '@fullcalendar/react/interaction'
import listPlugin from '@fullcalendar/react/list'
import multiMonthPlugin from '@fullcalendar/react/multimonth'
import timeGridPlugin from '@fullcalendar/react/timegrid'
import { EventCalendarCloseIcon } from '@/components/event-calendar-icons'
import { EventCalendarToolbar } from '@/components/event-calendar-toolbar'
import { EventCalendarViews } from '@/components/ui/event-calendar-views'
import { cn } from '@/lib/utils'

const plugins = [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, multiMonthPlugin]
const defaultAvailableViews = [
  'dayGridMonth',
  'timeGridWeek',
  'timeGridDay',
  'listWeek',
  'multiMonthYear',
]
const navLinkDayClick = 'timeGridDay'
const navLinkWeekClick = 'timeGridWeek'

export interface EventCalendarProps
  extends Omit<CalendarOptions, 'class' | 'className' | 'headerToolbar' | 'footerToolbar'> {
  className?: string
  /** pass one in to drive the calendar from outside (keymap) */
  controller?: CalendarController
  availableViews?: string[]
  addButton?: {
    isPrimary?: boolean
    text?: string
    hint?: string
    click?: (ev: MouseEvent) => void
  }
}

export function EventCalendar({
  controller: externalController,
  availableViews = defaultAvailableViews,
  addButton,
  className,
  height,
  contentHeight,
  direction,
  plugins: userPlugins = [],
  ...restOptions
}: EventCalendarProps) {
  const internalController = useCalendarController()
  const controller = externalController ?? internalController

  const hasBorderX = !(restOptions.borderlessX ?? restOptions.borderless)
  const hasBorderTop = !(restOptions.borderlessTop ?? restOptions.borderless)
  const hasBorderBottom = !(restOptions.borderlessBottom ?? restOptions.borderless)
  const isHeightAuto = height === 'auto' || contentHeight === 'auto'

  return (
    <div
      className={cn(
        className,
        'flex flex-col bg-background',
        hasBorderX && 'border-x',
        hasBorderTop && 'border-t',
        hasBorderBottom && 'border-b',
        hasBorderTop && hasBorderX && 'rounded-t-lg',
        hasBorderBottom && hasBorderX && 'rounded-b-lg',
        !isHeightAuto && 'overflow-hidden',
      )}
      style={{ height }}
      dir={direction === 'rtl' ? 'rtl' : undefined}
    >
      <EventCalendarToolbar
        className="drag p-4"
        controller={controller}
        availableViews={availableViews}
        addButton={addButton}
      />
      <div className="grow min-h-0">
        <EventCalendarViews
          controller={controller}
          height={isHeightAuto ? 'auto' : height !== undefined ? '100%' : contentHeight}
          initialView={availableViews[0]}
          navLinkDayClick={navLinkDayClick}
          navLinkWeekClick={navLinkWeekClick}
          plugins={[...plugins, ...userPlugins]}
          popoverCloseContent={() => <EventCalendarCloseIcon />}
          {...restOptions}
        />
      </div>
    </div>
  )
}
