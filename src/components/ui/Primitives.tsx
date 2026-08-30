import { forwardRef } from 'react'
import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Containers.
//
// Three deliberately unequal tiers. The previous build wrapped everything in an
// identically-bordered box, which made the border meaningless and the page read
// as a wireframe. Now:
//
//   Region   — no box. Whitespace and the label separate it. The default.
//   Surface  — a background lift, no border. For tables and dense content.
//   Hero     — lift plus one hairline. One or two per screen, no more.
//
// Choosing a tier is choosing how much a thing matters, so it's an explicit
// prop rather than something every caller gets by default.
// ─────────────────────────────────────────────────────────────────────────────

type Tier = 'region' | 'surface' | 'hero'

const TIER_CLASS: Record<Tier, string> = {
  region: 'region',
  surface: 'surface',
  hero: 'surface-hero',
}

export function Section({
  title, meta, action, children, tier = 'region', className = '', bodyClass,
}: {
  title?: ReactNode
  /** Right-aligned supporting figure — a count, a total, a timestamp. */
  meta?: ReactNode
  action?: ReactNode
  children: ReactNode
  tier?: Tier
  className?: string
  bodyClass?: string
}) {
  // A boxed tier needs internal padding; a bare region must not have any, or
  // its content stops aligning with the regions above and below it.
  const pad = bodyClass ?? (tier === 'region' ? '' : 'p-4')

  return (
    <section className={className}>
      {(title || meta || action) && (
        <div className="section-label">
          {title && <h2>{title}</h2>}
          {meta && <span className="meta">{meta}</span>}
          {action && <span className={meta ? '' : 'ml-auto'}>{action}</span>}
        </div>
      )}
      <div className={`${TIER_CLASS[tier]} ${pad}`}>{children}</div>
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
        <p className="text-2xs text-down mt-1.5">{error}</p>
      ) : hint ? (
        <p className="hint mt-1.5">{hint}</p>
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
    <div className={`inline-flex w-full p-0.5 bg-ink-750 rounded gap-0.5 ${className}`}>
      {options.map((opt) => {
        const active = value === opt.value
        const tone =
          opt.tone === 'up' ? 'bg-up/18 text-up'
          : opt.tone === 'down' ? 'bg-down/18 text-down'
          : 'bg-azure/15 text-azure-bright'
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-sm transition-colors duration-100
              ${active ? tone : 'text-ink-400 hover:text-ink-100 hover:bg-ink-800'}`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Figures ─────────────────────────────────────────────────────────────────

type Tone = 'up' | 'down' | 'neutral' | 'azure'

const TONE_TEXT: Record<Tone, string> = {
  up: 'text-up',
  down: 'text-down',
  neutral: 'text-ink-50',
  azure: 'text-azure-bright',
}

/**
 * The hero figure. Reserved for the two or three numbers that actually drive a
 * decision — using it on everything would restore the flat "every panel equal"
 * problem in a different form.
 */
export function HeroStat({
  label, value, sub, tone = 'neutral', title,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: Tone
  title?: string
}) {
  return (
    <div title={title}>
      <div className="sub-label mb-2">{label}</div>
      <div className={`font-mono text-hero font-medium ${TONE_TEXT[tone]}`}>{value}</div>
      {sub && <div className="text-2xs text-ink-400 mt-1.5 leading-relaxed">{sub}</div>}
    </div>
  )
}

/** Standard figure. Boxless — a row of these is separated by spacing alone. */
export function Stat({
  label, value, sub, tone = 'neutral', title,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: Tone
  title?: string
}) {
  return (
    <div title={title} className="min-w-0">
      <div className="text-2xs uppercase tracking-label text-azure-dim mb-1.5 truncate">{label}</div>
      <div className={`font-mono text-figure font-medium ${TONE_TEXT[tone]}`}>{value}</div>
      {sub && <div className="text-2xs text-ink-500 mt-1 truncate">{sub}</div>}
    </div>
  )
}

/**
 * A row of Stats. No border, no dividers — just generous even spacing.
 * Dividers here were a large part of what made the old page feel like a grid
 * of cells rather than a designed layout.
 */
export function StatRow({ children, cols = 4 }: { children: ReactNode; cols?: number }) {
  return (
    <div
      className="grid gap-x-8 gap-y-5"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  )
}

// ─── Tag ─────────────────────────────────────────────────────────────────────

export function Tag({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  const cls =
    tone === 'up' ? 'tag-up' : tone === 'down' ? 'tag-down'
    : tone === 'azure' ? 'tag-azure' : 'tag-neutral'
  return <span className={cls}>{children}</span>
}

// ─── Empty / loading ─────────────────────────────────────────────────────────

export function Empty({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
      <div className="text-sm text-ink-200 font-medium">{title}</div>
      {detail && <p className="text-xs text-ink-400 mt-2 max-w-sm leading-relaxed">{detail}</p>}
      {action && <div className="mt-5">{action}</div>}
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
    <div className="space-y-2 p-1">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-4">
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
      className="fixed inset-0 z-50 bg-ink-950/88 flex items-start justify-center p-4 sm:p-8 overflow-y-auto animate-fade-in"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`w-full ${width} my-auto animate-rise bg-ink-900 rounded-md
                    ring-1 ring-inset ring-ink-700 shadow-2xl shadow-ink-950/60`}
      >
        <header className="flex items-center justify-between gap-3 px-4 h-12 border-b border-ink-800 sticky top-0 z-20 bg-ink-900 rounded-t-md">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink-50 leading-tight truncate">{title}</h2>
            {subtitle && <p className="text-2xs text-ink-400 leading-tight truncate mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-ink-400 hover:text-ink-50 transition-colors p-1 -mr-1 shrink-0 rounded"
            aria-label="Close"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </header>

        <div className="max-h-[calc(100vh-15rem)] overflow-y-auto">{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 px-4 py-3 border-t border-ink-800 rounded-b-md">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}

// ─── Confidence bar ──────────────────────────────────────────────────────────

export function Confidence({ value }: { value: number | undefined }) {
  if (value === undefined) return null
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  const tone = pct >= 80 ? 'bg-up' : pct >= 50 ? 'bg-azure' : 'bg-down'
  return (
    <span className="inline-flex items-center gap-1.5" title={`${pct}% confidence in this reading`}>
      <span className="w-7 h-1 bg-ink-700 rounded-sm overflow-hidden inline-block">
        <span className={`block h-full ${tone}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="text-2xs text-ink-400 font-mono">{pct}</span>
    </span>
  )
}

/**
 * A horizontal magnitude bar used inline in lists. Reads as a sparkline rather
 * than a chart — no axis, no frame, just the proportion.
 */
export function MiniBar({
  value, max, tone = 'azure',
}: {
  value: number
  max: number
  tone?: Tone
}) {
  const pct = max > 0 ? Math.min(100, (Math.abs(value) / max) * 100) : 0
  const fill =
    tone === 'up' ? 'bg-up/70' : tone === 'down' ? 'bg-down/70'
    : tone === 'azure' ? 'bg-azure/60' : 'bg-ink-600'
  return (
    <span className="block h-1 bg-ink-800 rounded-sm overflow-hidden">
      <span className={`block h-full rounded-sm ${fill}`} style={{ width: `${pct}%` }} />
    </span>
  )
}
