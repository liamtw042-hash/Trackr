import { useMemo } from 'react'
import type { ReactNode } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceDot, Cell,
} from 'recharts'
import { equityCurve, fmtMoney, fmtR, round } from '@/lib/calc'
import type { Trade } from '@/types'

// ────────────────────────────────────────────────────────────────────────
// Charts.
//
// The reference is a modern broker's terminal, not a marketing hero graphic
// and not a stock Recharts render. Three things do most of that work:
//
//   1. The tooltip is a real component on a real plane — background step, top
//      highlight, ambient shadow — instead of Recharts' default bordered
//      rectangle with a stacked list of `name : value` pairs.
//   2. The axis furniture recedes. No axis lines, no vertical grid, ticks in
//      the mono at 10px in a dim colour. The data is the only thing at full
//      contrast.
//   3. The series is drawn once, revealed left to right, and then left alone.
//      The fill is a fade of the P&L colour — the affordance every equity
//      chart uses to read direction at a glance, not decoration.
// ────────────────────────────────────────────────────────────────────────

const UP = '#2FCE72'
const DOWN = '#F2555A'
const GRID = '#151B25'
const AXIS_TEXT = '#6B7A92'
const RULE = '#39445A'

const AXIS = {
  fill: AXIS_TEXT,
  fontSize: 10,
  fontFamily: '"Geist Mono Variable", "Geist Mono", ui-monospace, monospace',
  letterSpacing: '-0.01em',
}

/** A tooltip on its own plane, laid out as a figure with a caption. */
function Card({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-md bg-ink-850/95 backdrop-blur-md px-3 py-2.5 min-w-[128px]"
      style={{
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 0 0 1px rgba(255,255,255,0.07), ' +
          '0 2px 6px rgba(0,0,0,0.45), 0 12px 32px -8px rgba(0,0,0,0.7)',
      }}
    >
      {children}
    </div>
  )
}

interface TipPoint {
  i: number
  equity: number
  pnl: number
  ticker: string
}

function EquityTip({ active, payload }: { active?: boolean; payload?: { payload: TipPoint }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const positive = d.pnl >= 0
  return (
    <Card>
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${positive ? 'bg-up' : 'bg-down'}`} />
        <span className="text-3xs uppercase tracking-label text-ink-400">Trade {d.i}</span>
      </div>
      <div className="font-mono text-sm text-ink-50 mt-1.5 tabular">{fmtMoney(d.equity, 0)}</div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="font-mono text-2xs text-ink-300">{d.ticker}</span>
        <span className={`font-mono text-2xs tabular ${positive ? 'text-up' : 'text-down'}`}>
          {positive ? '+' : ''}{round(d.pnl, 2)}
        </span>
      </div>
    </Card>
  )
}

// ─── Equity curve ───────────────────────────────────────────────────────────

export function EquityChart({
  trades, startingBalance = 0, height = 220,
}: {
  trades: Trade[]
  startingBalance?: number
  height?: number
}) {
  const data = useMemo(
    () => equityCurve(trades, startingBalance),
    [trades, startingBalance]
  )

  if (data.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-2xs text-ink-500 rounded-md bg-ink-950/40"
        style={{ height, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)' }}
      >
        {data.length === 0
          ? 'No closed trades yet'
          : 'One closed trade — a curve needs at least two'}
      </div>
    )
  }

  const last = data[data.length - 1]
  const up = last.equity >= startingBalance
  const colour = up ? UP : DOWN

  // Peak marker, so drawdown is visible rather than implied.
  const peak = data.reduce((best, d) => (d.equity > best.equity ? d : best), data[0])

  // Never zero-base the axis. An account that ran 10,000 → 14,283 plotted from
  // zero spends most of the panel on empty space and flattens the shape that
  // matters. Fit the axis to the data (including the starting line) with a
  // small margin, the way a broker's equity chart does.
  const values = data.map((d) => d.equity)
  if (startingBalance > 0) values.push(startingBalance)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = Math.max((hi - lo) * 0.14, Math.abs(hi) * 0.01, 1)
  const domain: [number, number] = [lo - pad, hi + pad]
  const useThousands = Math.max(Math.abs(lo), Math.abs(hi)) >= 10000

  return (
    // The curve is revealed left to right on mount — the one direction the data
    // actually runs in — then never animates again. Recharts' own animation is
    // off; a clip on the container is smoother and does not re-fire on hover.
    <div className="animate-draw-in" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colour} stopOpacity={0.22} />
              <stop offset="55%" stopColor={colour} stopOpacity={0.06} />
              <stop offset="100%" stopColor={colour} stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke={GRID} strokeDasharray="0" vertical={false} />
          <XAxis
            dataKey="i"
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            minTickGap={34}
            dy={4}
          />
          <YAxis
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            width={56}
            domain={domain}
            // One format for the whole axis. Deciding per tick makes
            // neighbouring labels switch between "9320" and "10.8k", which
            // reads as two scales.
            tickFormatter={(v: number) =>
              useThousands ? `${(v / 1000).toFixed(1)}k` : Math.round(v).toLocaleString('en-AU')
            }
          />

          {startingBalance > 0 && (
            <ReferenceLine y={startingBalance} stroke={RULE} strokeDasharray="2 4" />
          )}
          <ReferenceLine x={peak.i} stroke={RULE} strokeDasharray="1 4" />

          <Tooltip
            content={<EquityTip />}
            cursor={{ stroke: RULE, strokeWidth: 1, strokeDasharray: '2 3' }}
            offset={14}
          />

          <Area
            type="linear"
            dataKey="equity"
            stroke={colour}
            strokeWidth={1.75}
            strokeLinejoin="round"
            strokeLinecap="round"
            fill="url(#eqFill)"
            dot={false}
            activeDot={{ r: 3, fill: colour, stroke: '#0C1017', strokeWidth: 2 }}
            isAnimationActive={false}
          />

          {/* Where the curve currently stands. A single emphasised point reads
              faster than making the reader trace the line to its end. */}
          <ReferenceDot
            x={last.i}
            y={last.equity}
            r={3}
            fill={colour}
            stroke="#0C1017"
            strokeWidth={2}
            isFront
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── R-multiple distribution ────────────────────────────────────────────────

function BucketTip({
  active, payload, label,
}: {
  active?: boolean
  payload?: { payload: { count: number } }[]
  label?: string | number
}) {
  if (!active || !payload?.length) return null
  const n = payload[0].payload.count
  return (
    <Card>
      <div className="text-3xs uppercase tracking-label text-ink-400">{String(label)}</div>
      <div className="font-mono text-sm text-ink-50 mt-1 tabular">
        {n} <span className="text-2xs text-ink-400">trade{n === 1 ? '' : 's'}</span>
      </div>
    </Card>
  )
}

/**
 * Where the outcomes actually land. For a trailing-stop strategy this is the
 * chart that matters most: it shows whether the big winners are big enough to
 * pay for the cluster of −1R losses.
 */
export function RDistribution({ trades, height = 160 }: { trades: Trade[]; height?: number }) {
  const data = useMemo(() => {
    const rs = trades
      .filter((t) => t.status === 'closed' && t.rMultiple !== null)
      .map((t) => t.rMultiple as number)

    if (!rs.length) return []

    const buckets = [
      { label: '<−2R', min: -Infinity, max: -2 },
      { label: '−2R', min: -2, max: -1.5 },
      { label: '−1R', min: -1.5, max: -0.5 },
      { label: '0R', min: -0.5, max: 0.5 },
      { label: '+1R', min: 0.5, max: 1.5 },
      { label: '+2R', min: 1.5, max: 2.5 },
      { label: '+3R', min: 2.5, max: 3.5 },
      { label: '>3R', min: 3.5, max: Infinity },
    ]

    return buckets.map((b) => ({
      label: b.label,
      count: rs.filter((r) => r >= b.min && r < b.max).length,
      positive: b.min >= 0.5,
    }))
  }, [trades])

  if (!data.length) {
    return (
      <div
        className="flex items-center justify-center text-2xs text-ink-500 rounded-md bg-ink-950/40"
        style={{ height, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)' }}
      >
        No closed trades with a recorded risk amount
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 6, left: -26, bottom: 0 }} barCategoryGap="26%">
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} dy={4} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={46} allowDecimals={false} />
        <Tooltip content={<BucketTip />} cursor={{ fill: 'rgba(255,255,255,0.035)' }} offset={12} />
        {/* A 2px cap, not a pill: enough to lose the mechanical corner, far
            short of the rounded bars of a marketing chart. */}
        <Bar dataKey="count" radius={[2, 2, 0, 0]} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.positive ? UP : d.label === '0R' ? '#4A5769' : DOWN} fillOpacity={0.88} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── Horizontal performance bars ───────────────────────────────────────────

/**
 * Performance by some grouping (pair, setup, day). Bars are drawn in CSS rather
 * than a chart library because at this size a library adds axes and padding
 * that fight the density we want, and the sample size has to sit alongside
 * every bar — a 100% win rate on two trades must not look like a signal.
 */
export function PerformanceBars({
  rows, metric = 'avgR', maxRows = 10,
}: {
  rows: { key: string; count: number; wins: number; pnl: number; avgR: number; winRate: number }[]
  metric?: 'avgR' | 'pnl'
  maxRows?: number
}) {
  const shown = useMemo(
    () => [...rows].sort((a, b) => b[metric] - a[metric]).slice(0, maxRows),
    [rows, metric, maxRows]
  )

  if (!shown.length) {
    return <p className="text-2xs text-ink-500 py-3">Not enough closed trades to break down.</p>
  }

  const peak = Math.max(...shown.map((r) => Math.abs(r[metric])), 0.001)

  return (
    <div>
      {shown.map((row) => {
        const v = row[metric]
        const width = (Math.abs(v) / peak) * 50
        // Fewer than five trades is not a sample — dim it so it reads as noise.
        const thin = row.count < 5
        return (
          <div
            key={row.key}
            className={`flex items-center gap-2.5 py-2 transition-opacity duration-130 ${thin ? 'opacity-45' : ''}`}
            style={{ boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.032)' }}
          >
            <span className="w-16 shrink-0 font-mono text-2xs text-ink-100 truncate" title={row.key}>
              {row.key}
            </span>

            <span className="w-8 shrink-0 font-mono text-2xs text-ink-500 text-right tabular" title={`${row.count} trades`}>
              {row.count}
            </span>

            {/* Bars diverge from a centre line so wins and losses are directly comparable */}
            <div className="flex-1 h-2.5 relative min-w-[60px]">
              <div className="absolute inset-y-0 left-1/2 w-px bg-ink-700" />
              <div
                className={`absolute inset-y-0 rounded-[1px] transition-[width] duration-180 ease-snap
                  ${v >= 0 ? 'bg-up/80 left-1/2' : 'bg-down/80 right-1/2'}`}
                style={{ width: `${width}%` }}
              />
            </div>

            <span
              className={`w-14 shrink-0 font-mono text-2xs text-right tabular ${
                v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-ink-400'
              }`}
            >
              {metric === 'avgR' ? fmtR(v) : fmtMoney(v, 0)}
            </span>

            <span className="w-9 shrink-0 font-mono text-2xs text-ink-400 text-right tabular">
              {round(row.winRate, 0)}%
            </span>
          </div>
        )
      })}
      {rows.some((r) => r.count < 5) && (
        <p className="hint pt-2.5">Dimmed rows have fewer than five trades — too few to read.</p>
      )}
    </div>
  )
}
