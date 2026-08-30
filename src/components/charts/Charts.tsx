import { useMemo } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import { equityCurve, fmtMoney, fmtR, round } from '@/lib/calc'
import type { Trade } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Charts.
//
// Deliberately austere: hairline grids, monospace axis labels, a single
// hairline series with a faint fill. The reference is a broker's equity chart,
// not a marketing hero graphic — so no gradients used as decoration, no drop
// shadows, no rounded bar caps, no animation on load.
// ─────────────────────────────────────────────────────────────────────────────

const AXIS = {
  stroke: '#465469',
  fontSize: 10,
  fontFamily: '"IBM Plex Mono", monospace',
}

const TOOLTIP_STYLE = {
  backgroundColor: '#101520',
  border: '1px solid #232B3B',
  borderRadius: 4,
  fontSize: 11,
  fontFamily: '"IBM Plex Mono", monospace',
  padding: '6px 8px',
}

// ─── Equity curve ────────────────────────────────────────────────────────────

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
        className="flex items-center justify-center text-2xs text-ink-500 border border-dashed border-ink-800 rounded-md"
        style={{ height }}
      >
        {data.length === 0
          ? 'No closed trades yet'
          : 'One closed trade — a curve needs at least two'}
      </div>
    )
  }

  const final = data[data.length - 1].equity
  const up = final >= startingBalance
  const colour = up ? '#2FCE72' : '#F2555A'

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
  const pad = Math.max((hi - lo) * 0.12, Math.abs(hi) * 0.01, 1)
  const domain: [number, number] = [lo - pad, hi + pad]
  const useThousands = Math.max(Math.abs(lo), Math.abs(hi)) >= 10000

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colour} stopOpacity={0.16} />
            <stop offset="100%" stopColor={colour} stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid stroke="#161C29" strokeDasharray="0" vertical={false} />
        <XAxis
          dataKey="i"
          tick={AXIS}
          tickLine={false}
          axisLine={{ stroke: '#161C29' }}
          minTickGap={28}
        />
        <YAxis
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          width={56}
          domain={domain}
          // One format for the whole axis. Deciding per tick makes neighbouring
          // labels switch between "9320" and "10.8k", which reads as two scales.
          tickFormatter={(v: number) =>
            useThousands ? `${(v / 1000).toFixed(1)}k` : Math.round(v).toLocaleString('en-AU')
          }
        />

        {startingBalance > 0 && (
          <ReferenceLine y={startingBalance} stroke="#465469" strokeDasharray="3 3" />
        )}
        <ReferenceLine x={peak.i} stroke="#2F3949" strokeDasharray="2 3" />

        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: '#8896AE', fontSize: 10 }}
          cursor={{ stroke: '#465469', strokeWidth: 1 }}
          formatter={(v: number, _n, item) => [
            fmtMoney(v, 0),
            `${item.payload.ticker} ${item.payload.pnl >= 0 ? '+' : ''}${item.payload.pnl}`,
          ]}
          labelFormatter={(i) => `Trade ${i}`}
        />

        <Area
          type="linear"
          dataKey="equity"
          stroke={colour}
          strokeWidth={1.25}
          fill="url(#eqFill)"
          dot={false}
          activeDot={{ r: 2.5, fill: colour, stroke: 'none' }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── R-multiple distribution ─────────────────────────────────────────────────

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
        className="flex items-center justify-center text-2xs text-ink-500 border border-dashed border-ink-800 rounded-md"
        style={{ height }}
      >
        No closed trades with a recorded risk amount
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 4, left: -28, bottom: 0 }}>
        <CartesianGrid stroke="#161C29" vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: '#161C29' }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} allowDecimals={false} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: '#161C29' }}
          formatter={(v: number) => [`${v} trade${v === 1 ? '' : 's'}`, '']}
        />
        <Bar dataKey="count" isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.positive ? '#2FCE72' : d.label === '0R' ? '#64748E' : '#F2555A'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── Horizontal performance bars ─────────────────────────────────────────────

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
    <div className="divide-y divide-ink-800">
      {shown.map((row) => {
        const v = row[metric]
        const width = (Math.abs(v) / peak) * 50
        // Fewer than five trades is not a sample — dim it so it reads as noise.
        const thin = row.count < 5
        return (
          <div key={row.key} className={`flex items-center gap-2 py-1.5 ${thin ? 'opacity-50' : ''}`}>
            <span className="w-16 shrink-0 font-mono text-2xs text-ink-100 truncate" title={row.key}>
              {row.key}
            </span>

            <span className="w-8 shrink-0 font-mono text-2xs text-ink-500 text-right" title={`${row.count} trades`}>
              {row.count}
            </span>

            {/* Bars diverge from a centre line so wins and losses are directly comparable */}
            <div className="flex-1 h-3 relative min-w-[60px]">
              <div className="absolute inset-y-0 left-1/2 w-px bg-ink-800" />
              <div
                className={`absolute inset-y-0 ${v >= 0 ? 'bg-up/75 left-1/2' : 'bg-down/75 right-1/2'}`}
                style={{ width: `${width}%` }}
              />
            </div>

            <span
              className={`w-14 shrink-0 font-mono text-2xs text-right ${
                v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-ink-400'
              }`}
            >
              {metric === 'avgR' ? fmtR(v) : fmtMoney(v, 0)}
            </span>

            <span className="w-9 shrink-0 font-mono text-2xs text-ink-400 text-right">
              {round(row.winRate, 0)}%
            </span>
          </div>
        )
      })}
      {rows.some((r) => r.count < 5) && (
        <p className="hint pt-2">Dimmed rows have fewer than five trades — too few to read.</p>
      )}
    </div>
  )
}
