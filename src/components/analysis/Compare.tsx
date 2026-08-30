import { useMemo, useState } from 'react'
import { fmtR, fmtPct, round } from '@/lib/calc'
import { compareGroups, estimateEdge, type GroupComparison } from '@/lib/edge'
import { Section } from '@/components/ui/Primitives'
import type { Trade } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Two-group comparison.
//
// The question a journal exists to answer is "is the thing I changed actually
// better?", and the honest answer has an interval around it. Two averages side
// by side invite the wrong conclusion: +0.47R next to −0.49R looks decisive,
// and at 23 and 30 trades it may or may not be.
//
// So the headline is the DIFFERENCE and its interval, not the two means. If the
// interval clears zero the gap is real; if it straddles zero the page says so
// in those words rather than letting the bigger number imply otherwise.
//
// The maths is the same seeded bootstrap as the rest of edge.ts, deliberately —
// one confidence method in the codebase, so two screens can never disagree
// about the same trades.
// ─────────────────────────────────────────────────────────────────────────────

type Axis = 'setup' | 'direction' | 'session'

const AXES: { key: Axis; label: string; of: (t: Trade) => string | null }[] = [
  { key: 'setup', label: 'Setup', of: (t) => t.setupType.trim() || null },
  { key: 'direction', label: 'Direction', of: (t) => (t.direction === 'long' ? 'Long' : 'Short') },
  {
    key: 'session',
    label: 'Session',
    of: (t) => {
      const d = new Date(t.tradeDate)
      if (Number.isNaN(d.getTime())) return null
      const h = d.getHours()
      // Sydney local hours. Deliberately coarse — three buckets a trader
      // recognises beat 24 that never accumulate enough trades to compare.
      if (h >= 8 && h < 16) return 'Asia'
      if (h >= 16 && h < 24) return 'London'
      return 'New York'
    },
  },
]

export function Compare({ trades }: { trades: Trade[] }) {
  const [axis, setAxis] = useState<Axis>('setup')
  const [a, setA] = useState<string | null>(null)
  const [b, setB] = useState<string | null>(null)

  const active = AXES.find((x) => x.key === axis)!

  const groups = useMemo(() => {
    const map = new Map<string, Trade[]>()
    for (const t of trades) {
      if (t.status !== 'closed' || t.rMultiple === null) continue
      const k = active.of(t)
      if (k === null) continue
      const arr = map.get(k)
      if (arr) arr.push(t)
      else map.set(k, [t])
    }
    return [...map.entries()]
      .map(([key, list]) => ({ key, list, rs: list.map((t) => t.rMultiple as number) }))
      .sort((x, y) => y.list.length - x.list.length)
  }, [trades, active])

  // A selection left pointing at a name that no longer exists renders an empty
  // comparison with no explanation, so both sides fall back to the biggest
  // groups whenever the axis or the underlying data changes.
  const keys = groups.map((g) => g.key)
  const aKey = a !== null && keys.includes(a) ? a : (keys[0] ?? null)
  const bKey =
    b !== null && keys.includes(b) && b !== aKey ? b : (keys.find((k) => k !== aKey) ?? null)

  const aGroup = groups.find((g) => g.key === aKey)
  const bGroup = groups.find((g) => g.key === bKey)
  const cmp = useMemo(
    () => compareGroups(aGroup?.rs ?? [], bGroup?.rs ?? []),
    [aGroup, bGroup]
  )

  if (groups.length < 2) {
    return (
      <Section title="Compare" action={<AxisPicker axis={axis} onChange={setAxis} />}>
        <p className="text-xs text-ink-400 leading-relaxed max-w-[64ch]">
          {groups.length === 0
            ? 'No closed trade carries a value on this axis yet.'
            : `Every closed trade is in one group (“${groups[0].key}”), so there is nothing to compare it against. Tag trades with a setup or strategy name — the CSV importer reads a “Strategy” column — and this becomes a before-and-after.`}
        </p>
      </Section>
    )
  }

  return (
    <Section title="Compare" action={<AxisPicker axis={axis} onChange={setAxis} />}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
          <GroupPicker
            legend="A" groups={groups} value={aKey} disabled={bKey}
            onChange={setA} trades={aGroup?.list ?? []}
          />
          <GroupPicker
            legend="B" groups={groups} value={bKey} disabled={aKey}
            onChange={setB} trades={bGroup?.list ?? []}
          />
        </div>

        <div className="hairline" />

        <Verdict cmp={cmp} aKey={aKey ?? 'A'} bKey={bKey ?? 'B'} />
      </div>
    </Section>
  )
}

function Verdict({ cmp, aKey, bKey }: { cmp: GroupComparison; aKey: string; bKey: string }) {
  if (cmp.tooFew) {
    return (
      <p className="text-xs text-ink-400 leading-relaxed max-w-[64ch]">
        Both sides need at least five closed trades before a comparison means anything.{' '}
        <span className="font-mono text-ink-300">{aKey}</span> has {cmp.aN},{' '}
        <span className="font-mono text-ink-300">{bKey}</span> has {cmp.bN}.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-2xs uppercase tracking-label text-ink-500">Difference</span>
        <span className={`font-mono text-display ${cmp.difference >= 0 ? 'text-up' : 'text-down'}`}>
          {fmtR(cmp.difference)}
        </span>
        <span className="font-mono text-2xs text-ink-400">
          95% {fmtR(cmp.lower)} to {fmtR(cmp.upper)}
        </span>
      </div>

      <IntervalBar lower={cmp.lower} upper={cmp.upper} value={cmp.difference} clear={cmp.conclusive} />

      <p className="text-xs text-ink-200 leading-relaxed max-w-[68ch]">
        {cmp.conclusive ? (
          <>
            <span className="text-ink-50">{cmp.difference >= 0 ? aKey : bKey}</span> is ahead by{' '}
            <span className="font-mono">{fmtR(Math.abs(cmp.difference))}</span> per trade, and the
            whole interval stays on one side of zero — on this data the gap is real rather than a
            run of luck.
          </>
        ) : (
          <>
            A gap of <span className="font-mono">{fmtR(cmp.difference)}</span> is{' '}
            <span className="text-ink-50">not distinguishable from zero</span> here: the interval
            spans it. That is not a finding that the two perform the same — it is that {cmp.aN} and{' '}
            {cmp.bN} trades cannot yet tell them apart.
          </>
        )}
      </p>
    </div>
  )
}

function AxisPicker({ axis, onChange }: { axis: Axis; onChange: (a: Axis) => void }) {
  return (
    <div className="flex surface divide-x divide-ink-800">
      {AXES.map((x) => (
        <button
          key={x.key}
          onClick={() => onChange(x.key)}
          className={`px-2.5 py-1 text-2xs transition-colors duration-90 ${
            axis === x.key
              ? 'bg-azure/15 text-azure-bright'
              : 'text-ink-400 hover:text-ink-100 hover:bg-ink-800'
          }`}
        >
          {x.label}
        </button>
      ))}
    </div>
  )
}

function GroupPicker({
  legend, groups, value, disabled, onChange, trades,
}: {
  legend: string
  groups: { key: string; list: Trade[] }[]
  value: string | null
  disabled: string | null
  onChange: (k: string) => void
  trades: Trade[]
}) {
  const edge = useMemo(() => estimateEdge(trades), [trades])
  const wins = trades.filter((t) => t.outcome === 'win').length
  const pnl = trades.reduce((s, t) => s + (t.pnl ?? 0), 0)

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xs uppercase tracking-label text-ink-600">{legend}</span>
        <select
          className="field !py-1 !text-xs flex-1 min-w-0"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        >
          {groups.map((g) => (
            <option key={g.key} value={g.key} disabled={g.key === disabled}>
              {g.key} ({g.list.length})
            </option>
          ))}
        </select>
      </div>

      <div className={`font-mono text-figure ${edge.mean >= 0 ? 'text-up' : 'text-down'}`}>
        {fmtR(edge.mean)}
      </div>
      <div className="font-mono text-2xs text-ink-500 mt-0.5">
        {edge.tooFew
          ? `${edge.n} trade${edge.n === 1 ? '' : 's'} — too few for an interval`
          : `95% ${fmtR(edge.lower)} to ${fmtR(edge.upper)}`}
      </div>
      <div className="text-2xs text-ink-500 mt-1">
        n={trades.length} · {fmtPct(trades.length ? (wins / trades.length) * 100 : 0, 0)} win ·{' '}
        <span className={pnl >= 0 ? 'text-up/80' : 'text-down/80'}>
          {pnl >= 0 ? '+' : '−'}${Math.abs(round(pnl, 0)).toLocaleString()}
        </span>
        {!edge.tooFew && edge.tradesNeeded !== null && <> · ~{edge.tradesNeeded} more to prove it</>}
      </div>
    </div>
  )
}

/**
 * The interval drawn against zero. A bar that crosses the zero line is the
 * fastest way to read "we can't call this yet" — faster than comparing the
 * signs of two bracketed numbers.
 */
function IntervalBar({
  lower, upper, value, clear,
}: {
  lower: number
  upper: number
  value: number
  clear: boolean
}) {
  const span = Math.max(Math.abs(lower), Math.abs(upper), 0.5) * 1.15
  const pct = (v: number) => round(((v + span) / (span * 2)) * 100, 2)
  const left = pct(Math.min(lower, upper))
  const right = pct(Math.max(lower, upper))

  return (
    <div
      className="relative h-6 rounded bg-ink-950/60 max-w-[560px]"
      style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)' }}
    >
      {/* Zero. The only position on this bar that means anything absolutely. */}
      <div className="absolute inset-y-0 w-px bg-ink-600" style={{ left: '50%' }} />
      <div
        className={`absolute top-1/2 -translate-y-1/2 h-1 rounded-full ${clear ? 'bg-azure' : 'bg-ink-600'}`}
        style={{ left: `${left}%`, width: `${Math.max(right - left, 0.6)}%` }}
      />
      <div
        className={`absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full -ml-[3px] ${
          value >= 0 ? 'bg-up' : 'bg-down'
        }`}
        style={{ left: `${pct(value)}%` }}
      />
    </div>
  )
}
