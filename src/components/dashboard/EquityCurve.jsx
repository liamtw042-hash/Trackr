import { useMemo } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts'

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const val = payload[0].value
  return (
    <div className="card px-3 py-2 text-xs border-white/10">
      <div className="text-white/50 mb-1">{label}</div>
      <div className={`font-bold text-sm ${val >= 0 ? 'text-win' : 'text-loss'}`}>
        {val >= 0 ? '+' : ''}${val.toFixed(2)}
      </div>
    </div>
  )
}

export default function EquityCurve({ trades, startingBalance = 0 }) {
  const data = useMemo(() => {
    const closed = trades
      .filter((t) => t.outcome && t.pnl != null)
      .sort((a, b) => new Date(a.tradeDate) - new Date(b.tradeDate))

    if (!closed.length) return []

    let running = 0
    return closed.map((t) => {
      running += t.pnl
      return {
        date: new Date(t.tradeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        balance: parseFloat((startingBalance + running).toFixed(2)),
        pnl: parseFloat(running.toFixed(2)),
      }
    })
  }, [trades, startingBalance])

  if (!data.length) {
    return (
      <div className="h-48 flex items-center justify-center text-white/20 text-sm">
        Equity curve will appear after your first closed trade
      </div>
    )
  }

  const lastPnL = data[data.length - 1].pnl
  const color = lastPnL >= 0 ? '#10b981' : '#ef4444'
  const gradId = lastPnL >= 0 ? 'gradGreen' : 'gradRed'

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
          width={52}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={startingBalance} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
        <Area
          type="monotone"
          dataKey="balance"
          stroke={color}
          strokeWidth={2.5}
          fill={`url(#${gradId})`}
          dot={false}
          activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
