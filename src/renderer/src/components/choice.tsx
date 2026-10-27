import { type KeyboardEvent, useEffect, useRef } from 'react'
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'

export interface ChoiceOption {
  id: string
  label: string
  hint?: string
  /** red, for deleting */
  destructive?: boolean
}

interface Props {
  title: string
  note?: string
  options: ChoiceOption[]
  onPick: (id: string) => void
  onCancel: () => void
}

/** A question with a few answers where the palette sits: arrows or digits, Enter, Esc. */
export function Choice({ title, note, options, onPick, onCancel }: Props) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => root.current?.focus(), [])

  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
    const index = Number(e.key) - 1
    const option = options[index]
    if (option && /^[1-9]$/.test(e.key)) {
      e.preventDefault()
      onPick(option.id)
    }
  }

  return (
    <div className="fixed top-16 left-1/2 z-50 w-[min(520px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl">
      <Command ref={root} tabIndex={-1} onKeyDown={onKeyDown} loop className="outline-none">
        <div className="border-b px-4 py-3">
          <div className="text-sm font-medium">{title}</div>
          {note && <div className="mt-0.5 text-xs text-muted-foreground">{note}</div>}
        </div>
        <CommandList>
          <CommandGroup>
            {options.map((option, index) => (
              <CommandItem
                key={option.id}
                value={option.id}
                onSelect={() => onPick(option.id)}
                className={cn('gap-3', option.destructive && 'text-destructive')}
              >
                <kbd className="flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                  {index + 1}
                </kbd>
                <span className="flex-1">{option.label}</span>
                {option.hint && (
                  <span className="text-xs text-muted-foreground">{option.hint}</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
        <div className="border-t px-4 py-2 text-[11px] text-muted-foreground">
          ↵ auswählen · Esc abbrechen
        </div>
      </Command>
    </div>
  )
}
