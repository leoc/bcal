import type { Attendee, CalendarEvent, CalendarInfo } from '@shared/types'
import { Check, CircleHelp, Clock, ExternalLink, MapPin, Repeat, Users, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatRrule, formatWhen } from '@/lib/format'
import { cn } from '@/lib/utils'

interface Props {
  event?: CalendarEvent
  calendar?: CalendarInfo
  /** show only calendar and time */
  incognito: boolean
  onOpenLink: (url: string) => void
}

export function EventDetails({ event, calendar, incognito, onOpenLink }: Props) {
  // incognito: keep calendar and time, drop everything that may carry names
  const shown =
    event && incognito
      ? {
          ...event,
          title: 'Termin',
          location: undefined,
          description: undefined,
          organizer: undefined,
          attendees: [],
          links: [],
        }
      : event
  return (
    <aside className="flex w-80 shrink-0 flex-col border-l bg-sidebar text-sm">
      <div className="drag h-[72px] shrink-0" />
      {shown ? (
        <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-6 select-text">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: calendar?.color }}
              />
              {calendar?.name}
              {shown.status === 'CANCELLED' && <span className="text-destructive">abgesagt</span>}
            </div>
            <h2 className="text-lg leading-snug font-semibold">{shown.title}</h2>
            <p className="mt-1 text-muted-foreground">{formatWhen(shown)}</p>
          </div>

          {shown.rrule && (
            <Row icon={<Repeat />}>
              <span className="first-letter:uppercase">{formatRrule(shown.rrule)}</span>
            </Row>
          )}
          {shown.location && !/^https?:\/\//.test(shown.location) && (
            <Row icon={<MapPin />}>{shown.location}</Row>
          )}

          {shown.links.length > 0 && (
            <ul className="space-y-1">
              {shown.links.map((link, index) => (
                <li key={link}>
                  <button
                    type="button"
                    onClick={() => onOpenLink(link)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent"
                  >
                    <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{prettyLink(link)}</span>
                    {index === 0 && (
                      <kbd className="rounded border bg-muted px-1.5 font-mono text-[10px]">o</kbd>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {(shown.organizer || shown.attendees.length > 0) && (
            <Row icon={<Users />}>
              <ul className="space-y-1.5">
                {shown.organizer && <Person person={shown.organizer} note="Organisation" />}
                {shown.attendees
                  .filter((a) => a.email !== shown.organizer?.email)
                  .map((a) => (
                    <Person key={a.email ?? a.name} person={a} />
                  ))}
              </ul>
            </Row>
          )}

          {shown.description && (
            <p className="whitespace-pre-wrap break-words text-muted-foreground">
              {shown.description}
            </p>
          )}
        </div>
      ) : (
        <div className="flex-1 px-5 text-muted-foreground">
          Kein Termin ausgewählt. <kbd className="font-mono">j</kbd>/
          <kbd className="font-mono">k</kbd> wählt einen aus.
        </div>
      )}
    </aside>
  )
}

function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-muted-foreground [&_svg]:size-4">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

const statusIcons: Record<string, ReactNode> = {
  ACCEPTED: <Check className="text-emerald-500" />,
  DECLINED: <X className="text-destructive" />,
  TENTATIVE: <CircleHelp className="text-amber-500" />,
}

function Person({ person, note }: { person: Attendee; note?: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={cn('[&_svg]:size-3.5', !person.status && 'invisible')}>
        {statusIcons[person.status ?? ''] ?? <Clock className="text-muted-foreground" />}
      </span>
      <span className="truncate" title={person.email}>
        {person.name ?? person.email}
      </span>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </li>
  )
}

function prettyLink(link: string): string {
  try {
    const url = new URL(link)
    return `${url.host}${url.pathname === '/' ? '' : url.pathname}`
  } catch {
    return link
  }
}
