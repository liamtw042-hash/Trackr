import { useMemo } from 'react'
import { useTrades } from '../context/TradeContext'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Cell,
} from 'recharts'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const chartTooltipStyle = {
  contentStyle: {
    background: '#111827',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '10px',
    color: '#fff',
    fontSize: '13px',
  },
  itemStyle: { color: '#fff' },
  cursor: { fill: 'rgba(255,255,255,0.03)' },
}

function ChartCard({ title, children, isEmpty }) {
  return (
    <div className="card p-5">
      <h3 className="section-title mb-4">{title}</h3>
      {isEmpty ? (
        <div className="h-40 flex items-center justify-center text-white/20 text-sm">
          Not enough data yet
        </div>
      ) : children}
    </div>
  )
}

export default function Analytics() {
  const { trades } = useTrades()

  const closed = useMemo(() => trades.filter((t) => t.outcome && t.pnl != null), [trades])

  const byAsset = useMemo(() => {
    const map = {}
    closed.forEach((t) => {
      const k = t.assetClass ?? 'other'
      if (!map[k]) map[k] = { name: k, wins: 0, losses: 0, pnl: 0 }
      if (t.outcome === 'win') map[k].wins++
      else if (t.outcome === 'loss') map[k].losses++
      map[k].pnl += t.pnl ?? 0
    })
    return Object.values(map).map((d) => ({
      ...d,
      winRate: d.wins + d.losses > 0 ? (d.wins / (d.wins + d.losses)) * 100 : 0,
      name: d.name.charAt(0).toUpperCase() + d.name.slice(1),
    }))
  }, [closed])

  const byDay = useMemo(() => {
    const map = {}
    DAYS.forEach((d) => { map[d] = { name: d, pnl: 0, count: 0 } })
    closed.forEach((t) => {
      const day = DAYS[new Date(t.tradeDate).getDay()]
      map[day].pnl += t.pnl ?? 0
      map[day].count++
    })
    return DAYS.map((d) => map[d])
  }, [closed])

  const bySetup = useMemo(() => {
    const map = {}
    closed.forEach((t) => {
      const k = t.setupType ?? 'Unknown'
      if (!map[k]) map[k] = { name: k, wins: 0, losses: 0, pnl: 0 }
      if (t.outcome === 'win') map[k].wins++
      else map[k].losses++
      map[k].pnl += t.pnl ?? 0
    })
    return Object.values(map)
      .map((d) => ({
        ...d,
        winRate: d.wins + d.losses > 0 ? (d.wins / (d.wins + d.losses)) * 100 : 0,
      }))
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, 8)
  }, [closed])

  const equityCurve = useMemo(() => {
    const sorted = [...closed].sort((a, b) => new Date(a.tradeDate) - new Date(b.tradeDate))
    let balance = 0
    return sorted.map((t) => {
      balance += t.pnl ?? 0
      return {
        date: new Date(t.tradeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        balance: parseFloat(balance.toFixed(2)),
      }
    })
  }, [closed])

  return (
    <div className="space-y-5 animate-fade-in">
      {closed.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-20 text-center">
          <div className="text-4xl mb-4">📈</div>
          <h3 className="text-lg font-bold text-white mb-2">No data yet</h3>
          <p className="text-white/40 text-sm">Analytics will appear once you add and close some trades.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Equity curve */}
          <div className="card p-5 lg:col-span-2">
            <h3 className="section-title mb-4">Equity Curve</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={equityCurve}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip {...chartTooltipStyle} formatter={(v) => [`$${v}`, 'P&L']} />
                <Line
                  type="monotone"
                  dataKey="balance"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: '#10b981' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Win rate by asset */}
          <ChartCard title="Win Rate by Market" isEmpty={byAsset.length === 0}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byAsset} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip {...chartTooltipStyle} formatter={(v) => [`${v.toFixed(1)}%`, 'Win Rate']} />
                <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
                  {byAsset.map((entry) => (
                    <Cell key={entry.name} fill={entry.winRate >= 50 ? '#10b981' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* P&L by day */}
          <ChartCard title="P&L by Day of Week" isEmpty={closed.length === 0}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byDay} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip {...chartTooltipStyle} formatter={(v) => [`$${v.toFixed(2)}`, 'P&L']} />
                <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                  {byDay.map((entry) => (
                    <Cell key={entry.name} fill={entry.pnl >= 0 ? '#10b981' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Setup performance */}
          <ChartCard title="Setup Type Performance" isEmpty={bySetup.length === 0}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={bySetup} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
                <XAxis type="number" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="name" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                <Tooltip {...chartTooltipStyle} formatter={(v) => [`${v.toFixed(1)}%`, 'Win Rate']} />
                <Bar dataKey="winRate" radius={[0, 4, 4, 0]}>
                  {bySetup.map((entry) => (
                    <Cell key={entry.name} fill={entry.winRate >= 50 ? '#10b981' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Summary stats */}
          <div className="card p-5">
            <h3 className="section-title mb-4">Performance Summary</h3>
            <div className="space-y-3">
              {[
                {
                  label: 'Total closed trades',
                  value: closed.length,
                  color: 'text-white',
                },
                {
                  label: 'Total P&L',
                  value: `${closed.reduce((s, t) => s + (t.pnl ?? 0), 0) >= 0 ? '+' : ''}$${closed.reduce((s, t) => s + (t.pnl ?? 0), 0).toFixed(2)}`,
                  color: closed.reduce((s, t) => s + (t.pnl ?? 0), 0) >= 0 ? 'text-win' : 'text-loss',
                },
                {
                  label: 'Average win',
                  value: `+$${(closed.filter((t) => t.outcome === 'win').reduce((s, t) => s + (t.pnl ?? 0), 0) / Math.max(1, closed.filter((t) => t.outcome === 'win').length)).toFixed(2)}`,
                  color: 'text-win',
                },
                {
                  label: 'Average loss',
                  value: `$${(closed.filter((t) => t.outcome === 'loss').reduce((s, t) => s + (t.pnl ?? 0), 0) / Math.max(1, closed.filter((t) => t.outcome === 'loss').length)).toFixed(2)}`,
                  color: 'text-loss',
                },
                {
                  label: 'Profit factor',
                  value: (() => {
                    const grossWin = closed.filter((t) => t.outcome === 'win').reduce((s, t) => s + (t.pnl ?? 0), 0)
                    const grossLoss = Math.abs(closed.filter((t) => t.outcome === 'loss').reduce((s, t) => s + (t.pnl ?? 0), 0))
                    return grossLoss === 0 ? '∞' : (grossWin / grossLoss).toFixed(2)
                  })(),
                  color: 'text-accent',
                },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <span className="text-white/50 text-sm">{row.label}</span>
                  <span className={`font-bold text-sm ${row.color}`}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
