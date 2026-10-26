import type { CalendarEvent, CalendarInfo } from '@shared/types'
import { useEffect, useState } from 'react'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { formatWhen, toDate } from '@/lib/format'

interface Props {
  open: boolean
  calendars: Map<string, CalendarInfo>
  onSelect: (event: CalendarEvent) => void
  onClose: () => void
}

export function SearchDialog({ open, calendars, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CalendarEvent[]>([])

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    const timer = setTimeout(() => window.api.search(query).then(setResults), 120)
    return () => clearTimeout(timer)
  }, [query])

  const close = () => {
    setQuery('')
    onClose()
  }
  const now = Date.now()

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent showCloseButton={false} className="overflow-hidden p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">Termine suchen</DialogTitle>
        <Command shouldFilter={false} className="[&_[cmdk-input]]:h-12">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Termine suchen: Titel, Ort, Beschreibung"
          />
          <CommandList className="max-h-[60vh]">
            {query.trim() && <CommandEmpty>Keine Treffer</CommandEmpty>}
            {results.map((event) => {
              const calendar = calendars.get(event.calendarId)
              const past = toDate(event.end).getTime() < now
              return (
                <CommandItem
                  key={event.id}
                  value={event.id}
                  onSelect={() => {
                    onSelect(event)
                    close()
                  }}
                  className="gap-3 py-2.5"
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: calendar?.color }}
                  />
                  <div className={past ? 'min-w-0 flex-1 opacity-60' : 'min-w-0 flex-1'}>
                    <div className="truncate">{event.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {formatWhen(event)}
                      {event.rrule && ' · Serie'} · {calendar?.name}
                    </div>
                  </div>
                </CommandItem>
              )
            })}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
