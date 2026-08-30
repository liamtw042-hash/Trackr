import { forwardRef } from 'react'
import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

// ─── Panel ───────────────────────────────────────────────────────────────────

export function Panel({
  title, action, children, className = '', bodyClass = 'panel-body',
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClass?: string
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && (
        <header className="panel-head">
          <h2 className="panel-title">{title}</h2>
          {action}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  )
}

// ─── Form fields ─────────────────────────────────────────────────────────────

export function Field({
  label, hint, error, children, className = '',
}: {
  label: string
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {error ? (
        <p className="text-2xs text-down mt-1">{error}</p>
      ) : hint ? (
        <p className="hint mt-1">{hint}</p>
      ) : null}
    </div>
  )
}

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }
>(function Input({ mono, className = '', ...rest }, ref) {
  return <input ref={ref} {...rest} className={`field ${mono ? 'font-mono' : ''} ${className}`} />
})

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', ...rest } = props
  return <select {...rest} className={`field ${className}`} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = '', ...rest } = props
  return <textarea {...rest} className={`field ${className}`} />
}

// ─── Segmented control ───────────────────────────────────────────────────────

export function Segmented<T extends string>({
  value, onChange, options, className = '',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; tone?: 'up' | 'down' | 'neutral' }[]
  className?: string
}) {
  return (
    <div className={`flex border border-ink-700 divide-x divide-ink-700 ${className}`}>
      {options.map((opt) => {
        const active = value === opt.value
        const tone =
          opt.tone === 'up' ? 'bg-up/15 text-up border-up/40'
          : opt.tone === 'down' ? 'bg-down/15 text-down border-down/40'
          : 'bg-brass/15 text-brass-bright'
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors duration-75
              ${active ? tone : 'bg-transparent text-ink-400 hover:bg-ink-800 hover:text-ink-100'}`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Stat ────────────────────────────────────────────────────────────────────

/**
 * A single figure with its label. Deliberately compact — the point is a wall
 * of readable numbers, not a grid of cards each holding one lonely value.
 */
export function Stat({
  label, value, sub, tone = 'neutral', title,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: 'up' | 'down' | 'neutral' | 'brass'
  title?: string
}) {
  const toneClass =
    tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down'
    : tone === 'brass' ? 'text-brass-bright' : 'text-ink-50'
  return (
    <div className="px-3 py-2.5" title={title}>
      <div className="text-2xs uppercase tracking-label text-ink-400 mb-1">{label}</div>
      <div className={`font-mono text-base font-medium leading-none ${toneClass}`}>{value}</div>
      {sub && <div className="text-2xs text-ink-400 mt-1 font-mono">{sub}</div>}
    </div>
  )
}

/** Stats laid out as a bordered grid — hairlines between, not gaps. */
export function StatRow({ children, cols = 4 }: { children: ReactNode; cols?: number }) {
  return (
    <div
      className="grid divide-x divide-ink-700 border border-ink-700 bg-ink-900"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  )
}

// ─── Tag ─────────────────────────────────────────────────────────────────────

export function Tag({
  tone = 'neutral', children,
}: {
  tone?: 'up' | 'down' | 'neutral' | 'brass'
  children: ReactNode
}) {
  const cls =
    tone === 'up' ? 'tag-up' : tone === 'down' ? 'tag-down'
    : tone === 'brass' ? 'tag-brass' : 'tag-neutral'
  return <span className={cls}>{children}</span>
}

// ─── Empty / loading ─────────────────────────────────────────────────────────

export function Empty({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="text-sm text-ink-200 font-medium">{title}</div>
      {detail && <p className="text-xs text-ink-400 mt-1.5 max-w-sm leading-relaxed">{detail}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Spinner({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
    </svg>
  )
}

export function SkeletonRows({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-ink-800">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-3 px-2 py-2">
          {Array.from({ length: cols }, (_, c) => (
            <div key={c} className="skel h-3 flex-1" style={{ opacity: 1 - r * 0.12 }} />
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── Modal ───────────────────────────────────────────────────────────────────

export function Modal({
  open, onClose, title, subtitle, width = 'max-w-3xl', footer, children,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: ReactNode
  width?: string
  footer?: ReactNode
  children: ReactNode
}) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 bg-ink-950/85 flex items-start justify-center p-4 sm:p-8 overflow-y-auto animate-fade-in"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className={`w-full ${width} panel my-auto animate-rise`}>
        <header className="panel-head sticky top-0 z-20">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink-50 leading-tight truncate">{title}</h2>
            {subtitle && <p className="text-2xs text-ink-400 leading-tight truncate">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-ink-400 hover:text-ink-50 transition-colors p-1 -mr-1 shrink-0"
            aria-label="Close"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </header>

        <div className="max-h-[calc(100vh-14rem)] overflow-y-auto">{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 px-3 py-2.5 border-t border-ink-700 bg-ink-850">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}

// ─── Confidence bar ──────────────────────────────────────────────────────────

/**
 * Shown next to each extracted ticket field. A low bar is a prompt to check
 * that value against the screenshot before saving.
 */
export function Confidence({ value }: { value: number | undefined }) {
  if (value === undefined) return null
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  const tone = pct >= 80 ? 'bg-up' : pct >= 50 ? 'bg-brass' : 'bg-down'
  return (
    <span className="inline-flex items-center gap-1" title={`${pct}% confidence in this reading`}>
      <span className="w-6 h-1 bg-ink-700 overflow-hidden inline-block">
        <span className={`block h-full ${tone}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="text-2xs text-ink-400 font-mono">{pct}</span>
    </span>
  )
}
