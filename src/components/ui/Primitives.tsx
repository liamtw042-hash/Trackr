import { forwardRef } from 'react'
import type {
  ReactNode, CSSProperties, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes,
} from 'react'

// ────────────────────────────────────────────────────────────────────────
// Containers.
//
// Four deliberately unequal tiers, each a *plane* rather than a bordered box:
// a background step, a 1px highlight along the top edge, and an ambient
// shadow. Wrapping everything in an identically-bordered rectangle is what
// made the page read as a wireframe; giving every plane the same soft grey
// shadow would replace one flatness with another.
//
//   region  — no plane. Whitespace and the label separate it. The default.
//   surface — one step up. Tables, forms, dense content.
//   raised  — two steps. Sits on top of a surface.
//   hero    — surface plus an accent hairline. One or two per screen.
//
// Choosing a tier is choosing how much a thing matters, so it stays an
// explicit prop rather than something every caller inherits.
// ────────────────────────────────────────────────────────────────────────

type Tier = 'region' | 'surface' | 'raised' | 'hero'

const TIER_CLASS: Record<Tier, string> = {
  region: 'region',
  surface: 'surface',
  raised: 'surface-raised',
  hero: 'surface-hero',
}

export function Section({
  title, meta, action, children, tier = 'region', className = '', bodyClass, tone,
}: {
  title?: ReactNode
  /** Right-aligned supporting figure — a count, a total, a timestamp. */
  meta?: ReactNode
  action?: ReactNode
  children: ReactNode
  tier?: Tier
  className?: string
  bodyClass?: string
  /** Colours the label only. For a destructive region, never the whole plane. */
  tone?: 'danger'
}) {
  // A planed tier needs internal padding; a bare region must not have any, or
  // its content stops aligning with the regions above and below it.
  const pad = bodyClass ?? (tier === 'region' ? '' : 'p-4')

  return (
    <section className={className}>
      {(title || meta || action) && (
        <div className="section-label">
          {title && <h2 className={tone === 'danger' ? '!text-down/85' : undefined}>{title}</h2>}
          {meta && <span className="meta">{meta}</span>}
          {action && <span className={meta ? '' : 'ml-auto'}>{action}</span>}
        </div>
      )}
      <div className={`${TIER_CLASS[tier]} ${pad}`}>{children}</div>
    </section>
  )
}

/**
 * Page header. A page needs one thing at the top that says where you are and
 * how much is here — without it every page opens on an anonymous grid.
 */
export function PageHeader({
  title, lede, meta, action, className = '',
}: {
  title: string
  lede?: ReactNode
  meta?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <header className={`flex items-start gap-6 ${className}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="page-title">{title}</h1>
          {meta && <span className="font-mono text-2xs text-ink-500 tabular">{meta}</span>}
        </div>
        {lede && <p className="text-xs text-ink-300 leading-relaxed mt-2 max-w-2xl">{lede}</p>}
      </div>
      {action && <div className="shrink-0 pt-0.5">{action}</div>}
    </header>
  )
}

// ─── Form fields ────────────────────────────────────────────────────────────

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
        <p className="text-2xs text-down mt-1.5 animate-rise-sm">{error}</p>
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

// ─── Segmented control ──────────────────────────────────────────────────────

export function Segmented<T extends string>({
  value, onChange, options, className = '',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; tone?: 'up' | 'down' | 'neutral' }[]
  className?: string
}) {
  return (
    <div
      className={`inline-flex w-full p-[3px] bg-ink-750 rounded-md gap-0.5 ${className}`}
      style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.35)' }}
    >
      {options.map((opt) => {
        const active = value === opt.value
        const tone =
          opt.tone === 'up' ? 'bg-up/18 text-up'
          : opt.tone === 'down' ? 'bg-down/18 text-down'
          : 'bg-ink-700 text-ink-50'
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex-1 px-2 py-1.5 text-xs font-medium rounded
                        transition-[background-color,color] duration-130 ease-snap
              ${active ? tone : 'text-ink-400 hover:text-ink-100'}`}
            style={active ? { boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 1px 2px rgba(0,0,0,0.35)' } : undefined}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * A described choice, for decisions where a bare toggle would not carry enough
 * information — most importantly the reset mode, where the two options differ
 * by whether the journal survives.
 */
export function OptionCard({
  active, danger, title, detail, onSelect, children,
}: {
  active: boolean
  danger?: boolean
  title: string
  detail: ReactNode
  onSelect: () => void
  children?: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`w-full text-left px-4 py-3.5 rounded-md
                  transition-[background-color,box-shadow,transform] duration-130 ease-snap
                  active:translate-y-px
                  ${active
                    ? danger ? 'bg-down-wash' : 'bg-azure-wash'
                    : 'bg-ink-900 hover:bg-ink-850'}`}
      style={{
        boxShadow: active
          ? danger
            ? 'inset 0 1px 0 rgba(255,128,133,0.16), inset 0 0 0 1px rgba(242,85,90,0.42)'
            : 'inset 0 1px 0 rgba(166,205,242,0.16), inset 0 0 0 1px rgba(127,180,232,0.42)'
          : 'inset 0 1px 0 rgba(255,255,255,0.045), inset 0 0 0 1px rgba(255,255,255,0.045)',
      }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`relative w-3 h-3 rounded-full shrink-0 transition-colors duration-130
            ${active ? (danger ? 'bg-down' : 'bg-azure') : 'bg-ink-700'}`}
        >
          {active && (
            <span className="absolute inset-[3px] rounded-full bg-ink-975" />
          )}
        </span>
        <span className={`text-xs font-semibold tracking-tight ${danger && active ? 'text-down-bright' : 'text-ink-50'}`}>
          {title}
        </span>
      </div>
      <p className="text-2xs text-ink-300 leading-relaxed mt-2 ml-[22px]">{detail}</p>
      {children && <div className="ml-[22px] mt-3">{children}</div>}
    </button>
  )
}

// ─── Figures ───────────────────────────────────────────────────────────────

type Tone = 'up' | 'down' | 'neutral' | 'azure'

const TONE_TEXT: Record<Tone, string> = {
  up: 'text-up',
  down: 'text-down',
  neutral: 'text-ink-50',
  azure: 'text-azure-bright',
}

/**
 * The hero figure. Reserved for the two or three numbers that actually drive a
 * decision — using it everywhere would restore the "every panel equal" problem
 * in a different form. Weight 500 rather than 600: at 36px a heavier weight
 * closes up the counters and reads as shouting.
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
      <div className="sub-label mb-2.5">{label}</div>
      <div className={`font-mono text-hero font-medium ${TONE_TEXT[tone]}`}>{value}</div>
      {sub && <div className="text-2xs text-ink-400 mt-2 leading-relaxed">{sub}</div>}
    </div>
  )
}

/** Standard figure. Planeless — a row of these is separated by spacing alone. */
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
      <div className="text-3xs font-semibold uppercase tracking-label text-azure-dim mb-2 truncate">
        {label}
      </div>
      <div className={`font-mono text-figure font-medium ${TONE_TEXT[tone]}`}>{value}</div>
      {sub && <div className="text-2xs text-ink-500 mt-1.5 truncate">{sub}</div>}
    </div>
  )
}

/**
 * A row of Stats. No dividers — generous even spacing does the separating.
 * Dividers here were a large part of what made the old page feel like a grid
 * of cells rather than a designed layout.
 */
export function StatRow({ children, cols = 4 }: { children: ReactNode; cols?: number }) {
  return (
    <div
      className="stat-row stagger"
      style={{ '--cols': cols } as CSSProperties}
    >
      {children}
    </div>
  )
}

// ─── Tag ──────────────────────────────────────────────────────────────────

export function Tag({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  const cls =
    tone === 'up' ? 'tag-up' : tone === 'down' ? 'tag-down'
    : tone === 'azure' ? 'tag-azure' : 'tag-neutral'
  return <span className={cls}>{children}</span>
}

/** Keyboard hint, styled as a key rather than a text label. */
export function Kbd({ children }: { children: string }) {
  return <kbd className="kbd">{children}</kbd>
}

// ─── Empty / loading ────────────────────────────────────────────────────────

export function Empty({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-in">
      <div className="text-sm text-ink-100 font-semibold tracking-tight">{title}</div>
      {detail && <p className="text-xs text-ink-400 mt-2.5 max-w-sm leading-relaxed">{detail}</p>}
      {action && <div className="mt-6">{action}</div>}
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
    <div className="space-y-2.5 p-1">
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

// ─── Modal ────────────────────────────────────────────────────────────────

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
      className="fixed inset-0 z-50 bg-ink-975/80 backdrop-blur-[3px] flex items-start justify-center
                 p-4 sm:p-8 overflow-y-auto animate-fade-in"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`w-full ${width} my-auto animate-rise bg-ink-900 rounded-lg`}
        style={{
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 0 0 1px rgba(255,255,255,0.06), ' +
            '0 2px 6px rgba(0,0,0,0.45), 0 24px 60px -12px rgba(0,0,0,0.8)',
        }}
      >
        <header
          className="flex items-center justify-between gap-3 px-4 h-[52px] sticky top-0 z-20
                     bg-ink-900/95 backdrop-blur rounded-t-lg"
          style={{ boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.07)' }}
        >
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink-50 leading-tight truncate tracking-tight">{title}</h2>
            {subtitle && <p className="text-2xs text-ink-400 leading-tight truncate mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-ink-400 hover:text-ink-50 hover:bg-ink-800 transition-colors duration-90
                       p-1.5 -mr-1 shrink-0 rounded"
            aria-label="Close"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </header>

        <div className="max-h-[calc(100vh-15rem)] overflow-y-auto">{children}</div>

        {footer && (
          <footer
            className="flex items-center justify-end gap-2 px-4 py-3 rounded-b-lg"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}
          >
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}

// ─── Confidence bar ────────────────────────────────────────────────────────

export function Confidence({ value }: { value: number | undefined }) {
  if (value === undefined) return null
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  const tone = pct >= 80 ? 'bg-up' : pct >= 50 ? 'bg-azure' : 'bg-down'
  return (
    <span className="inline-flex items-center gap-1.5" title={`${pct}% confidence in this reading`}>
      <span className="w-7 h-1 bg-ink-700 rounded-full overflow-hidden inline-block">
        <span
          className={`block h-full ${tone} transition-[width] duration-180 ease-snap`}
          style={{ width: `${pct}%` }}
        />
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
    tone === 'up' ? 'bg-up/75' : tone === 'down' ? 'bg-down/75'
    : tone === 'azure' ? 'bg-azure/65' : 'bg-ink-600'
  return (
    <span className="block h-1 bg-ink-800 rounded-full overflow-hidden">
      <span
        className={`block h-full rounded-full ${fill} transition-[width] duration-180 ease-snap`}
        style={{ width: `${pct}%` }}
      />
    </span>
  )
}
