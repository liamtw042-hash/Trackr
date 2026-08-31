import { useEffect } from 'react'
import { Kbd } from '@/components/ui/Primitives'

// ─────────────────────────────────────────────────────────────────────────────
// The shortcut sheet.
//
// The app had four keyboard paths — N, /, ⌘K and paste-a-screenshot — and no
// way to find out about any of them except being told. A shortcut nobody knows
// exists is the same as one that was never built, and the paste one is the most
// valuable thing in the app.
//
// Bound to `?` because that is where everyone already looks for it, and it
// closes on any key rather than only Escape: nothing here is worth a second
// keystroke to dismiss.
// ─────────────────────────────────────────────────────────────────────────────

interface Item {
  keys: string[]
  label: string
  detail?: string
  /** Rendered as plain text, not key chrome — a click is not a keystroke, and
   *  dressing it as one on a sheet titled "Keyboard" teaches the wrong thing. */
  pointer?: boolean
}

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'Anywhere',
    items: [
      { keys: ['⌘', 'K'], label: 'Jump to a page, a pair or an action', detail: 'works while typing too' },
      { keys: ['N'], label: 'Log a trade' },
      { keys: ['/'], label: 'Ask your journal' },
      { keys: ['?'], label: 'This sheet' },
    ],
  },
  {
    title: 'Logging',
    items: [
      { keys: ['⌘', 'V'], label: 'Paste a CMC screenshot', detail: 'opens the form with the numbers already read' },
      { keys: ['⌘', '↵'], label: 'Save the trade form' },
      { keys: ['Esc'], label: 'Close a dialog' },
    ],
  },
  {
    title: 'Palette & tables',
    items: [
      { keys: ['↑', '↓'], label: 'Move through palette results' },
      { keys: ['↵'], label: 'Open the highlighted result' },
      { keys: ['Click'], label: 'Sort by a column', detail: 'again to reverse it', pointer: true },
      { keys: ['Click'], label: 'Open a row', pointer: true },
    ],
  },
]

export function Shortcuts({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    // Any key closes it. A reference card you have to read the dismissal
    // instructions for has failed at the one thing it does.
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-ink-975/70 backdrop-blur-sm animate-fade-in"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="w-full max-w-2xl rounded-lg bg-ink-850 overflow-hidden animate-rise-sm"
        style={{
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.09), inset 0 0 0 1px rgba(255,255,255,0.07), ' +
            '0 4px 12px rgba(0,0,0,0.5), 0 32px 64px -16px rgba(0,0,0,0.75)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-baseline gap-3 px-4 py-3"
          style={{ boxShadow: 'inset 0 -1px 0 var(--edge)' }}
        >
          <h2 className="text-2xs font-semibold uppercase tracking-label text-azure-dim">
            Keyboard
          </h2>
          <span className="ml-auto text-3xs text-ink-600">any key to close</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-ink-800">
          {GROUPS.map((g) => (
            <div key={g.title} className="px-4 py-3.5">
              <div className="sub-label mb-3">{g.title}</div>
              <div className="space-y-3">
                {g.items.map((item, i) => (
                  <div key={i}>
                    <div className="flex items-center gap-1.5 mb-1">
                      {item.pointer ? (
                        <span className="text-3xs uppercase tracking-label text-ink-500">
                          {item.keys[0]}
                        </span>
                      ) : (
                        item.keys.map((k) => <Kbd key={k}>{k}</Kbd>)
                      )}
                    </div>
                    <div className="text-2xs text-ink-100 leading-snug">{item.label}</div>
                    {item.detail && (
                      <div className="text-3xs text-ink-500 leading-snug mt-0.5">{item.detail}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div
          className="px-4 py-2.5 text-3xs text-ink-500 leading-relaxed"
          style={{ boxShadow: 'inset 0 1px 0 var(--edge-soft)' }}
        >
          The fastest way in is a screenshot: copy a CMC position panel, press{' '}
          <Kbd>⌘</Kbd> <Kbd>V</Kbd> on any page, and the pair, direction, entry, stop
          and size arrive pre-filled for you to confirm.
        </div>
      </div>
    </div>
  )
}
