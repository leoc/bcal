import { useMemo, useState } from 'react'
import { MiniMonth } from '@/components/mini-month'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { parseGoto } from '@/lib/goto'

const long = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

interface Props {
  open: boolean
  current: Date
  onGoto: (date: Date) => void
  onClose: () => void
}

export function GotoDialog({ open, current, onGoto, onClose }: Props) {
  const [text, setText] = useState('')
  const target = useMemo(() => parseGoto(text), [text])

  const close = () => {
    setText('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent showCloseButton={false} className="gap-4 p-5 sm:max-w-md">
        <DialogTitle className="text-sm font-medium text-muted-foreground">
          Gehe zu Datum
        </DialogTitle>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && target) {
              onGoto(target)
              close()
            }
          }}
          placeholder="morgen, fr, 12.11., kw 45, +3, nächsten Freitag"
          className="h-10 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <div className="flex items-start gap-5">
          <MiniMonth selected={target ?? current} />
          <div className="flex-1 pt-7 text-sm">
            {target ? (
              <>
                <div className="font-medium">{long.format(target)}</div>
                <div className="mt-1 text-muted-foreground">
                  <kbd className="font-mono">↵</kbd> springen
                </div>
              </>
            ) : (
              <div className="text-muted-foreground">
                {text ? 'Nicht erkannt' : 'Datum eingeben'}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
