import type { Binding } from '@/lib/keymap'

interface Props {
  bindings: Binding[]
  onClose: () => void
}

export function KeymapHelp({ bindings, onClose }: Props) {
  // one row per action; calendar toggles collapse into a single "1-9" row
  const rows = bindings.filter(
    (b, i) =>
      !b.action.startsWith('group:') && bindings.findIndex((o) => o.action === b.action) === i,
  )
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div className="w-80 rounded-xl border bg-popover p-5 text-popover-foreground shadow-xl">
        <h2 className="mb-3 text-sm font-semibold">Tastenkürzel</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {rows.map((b) => (
            <Row key={b.action} keys={keysFor(bindings, b.action)} description={b.description} />
          ))}
          <Row keys={['1–9']} description="Gruppe solo bzw. an/aus" />
        </dl>
      </div>
    </div>
  )
}

function keysFor(bindings: Binding[], action: string) {
  return bindings.filter((b) => b.action === action).map((b) => label(b.key))
}

function label(key: string) {
  return (
    { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc', Enter: '↵' }[
      key
    ] ?? key
  )
}

function Row({ keys, description }: { keys: string[]; description: string }) {
  return (
    <>
      <dt className="flex gap-1">
        {keys.map((k) => (
          <kbd
            key={k}
            className="min-w-6 rounded border bg-muted px-1.5 text-center font-mono text-xs"
          >
            {k}
          </kbd>
        ))}
      </dt>
      <dd className="text-muted-foreground">{description}</dd>
    </>
  )
}
