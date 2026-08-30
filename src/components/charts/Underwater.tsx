import { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { fmtMoney, fmtPct, round } from '@/lib/calc'
import { underwater } from '@/lib/insight'
import type { Trade } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// The underwater curve.
//
// An equity curve flatters: it shows where you ended up, and every dip is
// something you already survived. This shows the same account from below — how
// far under the previous high water mark it sat, at every point.
//
// It is the chart a system is actually judged by, because the number that
// decides whether a strategy is tradeable at a given size is not the return,
// it is the depth and length of the worst stretch on the way there.
//
// Drawn entirely below zero on purpose. There is no upside on this axis; a
// good period is simply the line touching the top.
// ─────────────────────────────────────────────────────────────────────────────

const DOWN = '#F2555A'
const GRID = '#151B25'
const AXIS = {
  fill: '#6B7A92',
  fontSize: 10,
  fontFamily: '"Geist Mono Variable", "Geist Mono", ui-monospace, monospace',
  letterSpacing: '-0.01em',
}

interface Point {
  i: number
  depth: number
  equity: number
  peak: number
}

function Tip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  const p = payload?.[0]?.payload
  if (!active || !p) return null
  return (
    <div
      className="rounded-md bg-ink-850/95 backdrop-blur-md px-3 py-2.5 min-w-[136px]"
      style={{
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 0 0 1px rgba(255,255,255,0.07), ' +
          '0 2px 6px rgba(0,0,0,0.45), 0 12px 32px -8px rgba(0,0,0,0.7)',
      }}
    >
      <div className={`font-mono text-sm ${p.depth < 0 ? 'text-down' : 'text-up'}`}>
        {p.depth === 0 ? 'at a new high' : `${fmtPct(p.depth, 1)}`}
      </div>
      <div className="text-3xs uppercase tracking-label text-ink-500 mt-1.5">
        after trade {p.i}
      </div>
      <div className="font-mono text-2xs text-ink-300 mt-0.5">
        {fmtMoney(p.equity, 0)} <span className="text-ink-600">vs peak {fmtMoney(p.peak, 0)}</span>
      </div>
    </div>
  )
}

export function Underwater({
  trades, startingBalance = 0, height = 150,
}: {
  trades: Trade[]
  startingBalance?: number
  height?: number
}) {
  const data = useMemo(
    () => underwater(trades, startingBalance),
    [trades, startingBalance]
  )

  const worst = useMemo(
    () => (data.length ? Math.min(...data.map((d) => d.depth)) : 0),
    [data]
  )

  // How long the account has been below its high water mark. The depth gets
  // quoted everywhere; the duration is the half people actually live through.
  const currentRun = useMemo(() => {
    let n = 0
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i].depth >= 0) break
      n++
    }
    return n
  }, [data])

  if (data.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-2xs text-ink-500 rounded-md bg-ink-950/40"
        style={{ height, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)' }}
      >
        Needs a couple of closed trades
      </div>
    )
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 6, right: 6, left: -4, bottom: 0 }}>
          <defs>
            <linearGradient id="uwFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={DOWN} stopOpacity={0.04} />
              <stop offset="100%" stopColor={DOWN} stopOpacity={0.3} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="i" tick={AXIS} tickLine={false} axisLine={false} dy={4} />
          <YAxis
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            width={52}
            domain={[Math.min(worst * 1.15, -1), 0]}
            tickFormatter={(v: number) => `${round(v, 0)}%`}
          />
          <Tooltip content={<Tip />} cursor={{ stroke: '#39445A', strokeWidth: 1 }} offset={12} />
          {/* stepAfter, not a smooth curve: equity changes at a close, and
              interpolating between trades draws a path the account never took. */}
          <Area
            type="stepAfter"
            dataKey="depth"
            stroke={DOWN}
            strokeWidth={1.5}
            fill="url(#uwFill)"
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 2.5, fill: DOWN, stroke: 'none' }}
          />
        </AreaChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 mt-2">
        <span className="flex items-baseline gap-1.5">
          <span className="text-3xs uppercase tracking-label text-ink-500">Deepest</span>
          <span className="font-mono text-2xs text-down">{fmtPct(worst, 1)}</span>
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="text-3xs uppercase tracking-label text-ink-500">Now</span>
          <span className={`font-mono text-2xs ${data[data.length - 1].depth < 0 ? 'text-down' : 'text-up'}`}>
            {data[data.length - 1].depth === 0 ? 'at a high' : fmtPct(data[data.length - 1].depth, 1)}
          </span>
        </span>
        {currentRun > 0 && (
          <span className="flex items-baseline gap-1.5">
            <span className="text-3xs uppercase tracking-label text-ink-500">Underwater for</span>
            <span className="font-mono text-2xs text-ink-200">{currentRun} trades</span>
          </span>
        )}
      </div>
    </div>
  )
}
