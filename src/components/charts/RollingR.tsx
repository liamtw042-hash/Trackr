import { useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { fmtR, fmtDate } from '@/lib/calc'
import { rollingExpectancy, type RollingPoint } from '@/lib/risk'
import type { Trade } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Is the edge moving?
//
// Every other expectancy figure in the app is all-time, which cannot answer the
// question people actually ask after a bad fortnight. This draws the trailing
// window against the all-time mean so the two can be read together.
//
// Both lines, always. The window alone is an invitation to read noise as a
// trend — with a ten-trade window a single +3R winner lifts the line by 0.3R
// and holds it there for ten trades, which looks exactly like an improvement.
// The flat-ish all-time line beside it is the correction.
// ─────────────────────────────────────────────────────────────────────────────

const AZURE = '#7FB4E8'
const GRID = '#151B25'
const AXIS = {
  fill: '#6B7A92',
  fontSize: 10,
  fontFamily: '"Geist Mono Variable", "Geist Mono", ui-monospace, monospace',
  letterSpacing: '-0.01em',
}

function Tip({
  active, payload, window,
}: {
  active?: boolean
  payload?: { payload: RollingPoint }[]
  window: number
}) {
  const p = payload?.[0]?.payload
  if (!active || !p) return null
  return (
    <div
      className="rounded-md bg-ink-850/95 backdrop-blur-md px-3 py-2.5 min-w-[150px]"
      style={{
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 0 0 1px rgba(255,255,255,0.07), ' +
          '0 2px 6px rgba(0,0,0,0.45), 0 12px 32px -8px rgba(0,0,0,0.7)',
      }}
    >
      <div className={`font-mono text-sm ${p.window >= 0 ? 'text-up' : 'text-down'}`}>
        {fmtR(p.window)}
      </div>
      <div className="text-3xs uppercase tracking-label text-ink-500 mt-1.5">
        last {window} trades, to #{p.i}
      </div>
      <div className="font-mono text-2xs text-ink-300 mt-1">
        all-time {fmtR(p.cumulative)}
        <span className="text-ink-600"> · {fmtDate(p.date)}</span>
      </div>
    </div>
  )
}

export function RollingR({
  trades, window = 10, height = 170,
}: {
  trades: Trade[]
  window?: number
  height?: number
}) {
  const data = useMemo(() => rollingExpectancy(trades, window), [trades, window])

  const latest = data.length ? data[data.length - 1] : null

  // The full span of the window line, so the axis is not dominated by the
  // flat all-time line and the wobble stays legible.
  const domain = useMemo<[number, number]>(() => {
    if (!data.length) return [-1, 1]
    const vals = data.flatMap((d) => [d.window, d.cumulative])
    const lo = Math.min(...vals, 0)
    const hi = Math.max(...vals, 0)
    const pad = Math.max((hi - lo) * 0.15, 0.1)
    return [lo - pad, hi + pad]
  }, [data])

  if (data.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-2xs text-ink-500 rounded-md bg-ink-950/40 px-4 text-center"
        style={{ height, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)' }}
      >
        Needs {window + 1} closed trades with a recorded risk before a trailing
        window means anything.
      </div>
    )
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 6, right: 6, left: -8, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="i" tick={AXIS} tickLine={false} axisLine={false} dy={4} />
          <YAxis
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            width={46}
            domain={domain}
            tickFormatter={(v: number) => v.toFixed(1)}
          />
          {/* Break-even. The only line on this chart that is not an estimate. */}
          <ReferenceLine y={0} stroke="#39445A" strokeWidth={1} />
          <Tooltip
            content={<Tip window={window} />}
            cursor={{ stroke: '#39445A', strokeWidth: 1 }}
            offset={12}
          />
          {/* linear, not monotone: the mean changes at a close and nowhere
              else, and a spline overshoots its own points — drawing a value
              the window never actually held. Same reason the underwater
              curve is stepped. */}
          <Line
            type="linear"
            dataKey="window"
            stroke={AZURE}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
            activeDot={{ r: 2.5, fill: AZURE, stroke: 'none' }}
          />
          {/* All-time, dashed and quiet: an anchor, not a series to read. */}
          <Line
            type="linear"
            dataKey="cumulative"
            stroke="#6B7A92"
            strokeWidth={1}
            strokeDasharray="3 3"
            dot={false}
            isAnimationActive={false}
            activeDot={false}
          />
        </LineChart>
      </ResponsiveContainer>

      {latest && (
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 mt-2">
          <span className="flex items-baseline gap-1.5">
            <span className="w-3 h-px bg-azure shrink-0 translate-y-[-3px]" aria-hidden="true" />
            <span className="text-3xs uppercase tracking-label text-ink-500">Last {window}</span>
            <span className={`font-mono text-2xs ${latest.window >= 0 ? 'text-up' : 'text-down'}`}>
              {fmtR(latest.window)}
            </span>
          </span>
          <span className="flex items-baseline gap-1.5">
            <span
              className="w-3 h-px shrink-0 translate-y-[-3px]"
              style={{ backgroundImage: 'repeating-linear-gradient(to right, #6B7A92 0 3px, transparent 3px 6px)' }}
              aria-hidden="true"
            />
            <span className="text-3xs uppercase tracking-label text-ink-500">All time</span>
            <span className={`font-mono text-2xs ${latest.cumulative >= 0 ? 'text-up' : 'text-down'}`}>
              {fmtR(latest.cumulative)}
            </span>
          </span>
          <span className="text-2xs text-ink-500">
            {Math.abs(latest.window - latest.cumulative) < 0.25
              ? 'recent trades are running in line with your record'
              : latest.window > latest.cumulative
                ? 'recent trades are running ahead of your record'
                : 'recent trades are running behind your record'}
          </span>
        </div>
      )}
    </div>
  )
}
