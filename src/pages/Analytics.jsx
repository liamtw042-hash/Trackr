import { useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTrades } from '../context/TradeContext'
import PatternInsights from '../components/dashboard/PatternInsights'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Cell, AreaChart, Area,
  ScatterChart, Scatter, ZAxis, ReferenceLine,
} from 'recharts'

// ─── Shared chart config ──────────────────────────────────────────────────────

const TT = {
  contentStyle: {
    background: '#111827', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '10px', color: '#fff', fontSize: '12px',
  },
  itemStyle: { color: '#fff' },
  cursor: { fill: 'rgba(255,255,255,0.03)' },
}
const TICK = { fill: 'rgba(255,255,255,0.3)', fontSize: 11 }
const GRID = <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const EMOTIONS_MAP = { 1:'😴 Tired', 2:'😐 Neutral', 3:'🙂 Focused', 4:'😤 Eager', 5:'🤯 FOMO' }

function ChartCard({ title, subtitle, children, span = '' }) {
  return (
    <div className={`card p-5 ${span}`}>
      <div className="mb-4">
        <h3 className="section-title">{title}</h3>
        {subtitle && <p className="text-xs text-white/30 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function Empty({ h = 180 }) {
  return (
    <div className={`flex items-center justify-center text-white/20 text-xs`} style={{ height: h }}>
      Not enough data yet
    </div>
  )
}

function SummaryRow({ label, value, color = 'text-white' }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
      <span className="text-sm text-white/45">{label}</span>
      <span className={`text-sm font-bold ${color}`}>{value}</span>
    </div>
  )
}

// ─── Analytics page ───────────────────────────────────────────────────────────

export default function Analytics() {
  const { user, userProfile } = useAuth()
  const { trades } = useTrades()
  const closed = useMemo(() => trades.filter((t) => t.outcome && t.pnl != null), [trades])

  // ── Win rate by asset ──────────────────────────────────────────────────────
  const byAsset = useMemo(() => {
    const m = {}
    closed.forEach((t) => {
      const k = t.assetClass ?? 'other'
      if (!m[k]) m[k] = { name: k.charAt(0).toUpperCase()+k.slice(1), wins: 0, total: 0 }
      m[k].total++
      if (t.outcome === 'win') m[k].wins++
    })
    return Object.values(m).map((d) => ({
      ...d, winRate: Math.round((d.wins / d.total) * 100),
    })).sort((a, b) => b.winRate - a.winRate)
  }, [closed])

  // ── P&L by day of week ─────────────────────────────────────────────────────
  const byDay = useMemo(() => {
    const m = {}
    DAYS.forEach((d) => { m[d] = { name: d, pnl: 0, trades: 0 } })
    closed.forEach((t) => {
      const d = DAYS[new Date(t.tradeDate).getDay()]
      m[d].pnl += t.pnl; m[d].trades++
    })
    return DAYS.map((d) => ({ ...m[d], pnl: parseFloat(m[d].pnl.toFixed(2)) }))
  }, [closed])

  // ── Monthly P&L ────────────────────────────────────────────────────────────
  const byMonth = useMemo(() => {
    const m = {}
    closed.forEach((t) => {
      const d = new Date(t.tradeDate)
      const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      const label = `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
      if (!m[k]) m[k] = { label, pnl: 0, key: k }
      m[k].pnl += t.pnl
    })
    return Object.values(m)
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((d) => ({ ...d, pnl: parseFloat(d.pnl.toFixed(2)) }))
  }, [closed])

  // ── Setup performance ──────────────────────────────────────────────────────
  const bySetup = useMemo(() => {
    const m = {}
    closed.forEach((t) => {
      const k = t.setupType?.trim() || 'Unknown'
      if (!m[k]) m[k] = { name: k, wins: 0, total: 0, rSum: 0 }
      m[k].total++
      if (t.outcome === 'win') m[k].wins++
      m[k].rSum += t.rMultiple ?? 0
    })
    return Object.values(m).map((d) => ({
      ...d,
      winRate: Math.round((d.wins / d.total) * 100),
      avgR: parseFloat((d.rSum / d.total).toFixed(2)),
    })).sort((a, b) => b.winRate - a.winRate).slice(0, 8)
  }, [closed])

  // ── Emotion vs R ──────────────────────────────────────────────────────────
  const emotionScatter = useMemo(() =>
    closed
      .filter((t) => t.emotion && t.rMultiple != null)
      .map((t) => ({ x: t.emotion, y: t.rMultiple, outcome: t.outcome }))
  , [closed])

  // ── Drawdown ──────────────────────────────────────────────────────────────
  const drawdownData = useMemo(() => {
    const sorted = [...closed].sort((a, b) => new Date(a.tradeDate) - new Date(b.tradeDate))
    let running = 0, peak = 0
    return sorted.map((t, i) => {
      running += t.pnl
      peak = Math.max(peak, running)
      const dd = peak > 0 ? parseFloat(((running - peak) / peak * 100).toFixed(2)) : 0
      return {
        i: i + 1,
        date: new Date(t.tradeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        drawdown: dd,
      }
    })
  }, [closed])

  // ── Time of day ───────────────────────────────────────────────────────────
  const byHour = useMemo(() => {
    const m = {}
    for (let h = 0; h < 24; h++) m[h] = { hour: `${h}:00`, pnl: 0, trades: 0 }
    closed.forEach((t) => {
      const h = new Date(t.tradeDate).getHours()
      m[h].pnl += t.pnl; m[h].trades++
    })
    return Object.values(m)
      .filter((d) => d.trades > 0)
      .map((d) => ({ ...d, pnl: parseFloat(d.pnl.toFixed(2)) }))
  }, [closed])

  // ── Summary stats ─────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const wins = closed.filter((t) => t.outcome === 'win')
    const losses = closed.filter((t) => t.outcome === 'loss')
    const totalPnL = closed.reduce((s, t) => s + t.pnl, 0)
    const grossWin = wins.reduce((s, t) => s + t.pnl, 0)
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0))
    const avgWin = wins.length ? grossWin / wins.length : 0
    const avgLoss = losses.length ? grossLoss / losses.length : 0
    const avgR = closed.length ? closed.reduce((s, t) => s + (t.rMultiple ?? 0), 0) / closed.length : 0
    return {
      total: closed.length, wins: wins.length, losses: losses.length,
      winRate: closed.length ? wins.length / closed.length * 100 : 0,
      totalPnL, grossWin, grossLoss,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
      avgWin, avgLoss, avgR,
    }
  }, [closed])

  if (closed.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center py-24 text-center">
        <div className="text-4xl mb-4">📈</div>
        <h3 className="text-lg font-bold text-white mb-2">No closed trades yet</h3>
        <p className="text-white/40 text-sm">Analytics populate once you log and close some trades.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Closed trades', v: summary.total, c: 'text-white' },
          { label: 'Win rate', v: `${summary.winRate.toFixed(1)}%`, c: summary.winRate >= 50 ? 'text-win' : 'text-loss' },
          { label: 'Total P&L', v: `${summary.totalPnL >= 0 ? '+' : ''}$${summary.totalPnL.toFixed(2)}`, c: summary.totalPnL >= 0 ? 'text-win' : 'text-loss' },
          { label: 'Avg R', v: `${summary.avgR >= 0 ? '+' : ''}${summary.avgR.toFixed(2)}R`, c: summary.avgR >= 0 ? 'text-win' : 'text-loss' },
          { label: 'Profit factor', v: summary.profitFactor != null ? summary.profitFactor.toFixed(2) : '∞', c: 'text-accent' },
        ].map(({ label, v, c }) => (
          <div key={label} className="card p-4">
            <div className="text-xs text-white/30 uppercase tracking-wider mb-1">{label}</div>
            <div className={`text-xl font-bold ${c}`}>{v}</div>
          </div>
        ))}
      </div>

      {/* Row 1: Win rate by asset + P&L by day */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Win Rate by Market" subtitle="% of winning trades per asset class">
          {byAsset.length < 1 ? <Empty /> :
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byAsset} margin={{ top:0,right:0,bottom:0,left:-20 }}>
                <XAxis dataKey="name" tick={TICK} axisLine={false} tickLine={false} />
                <YAxis tick={TICK} axisLine={false} tickLine={false} domain={[0,100]} tickFormatter={(v)=>`${v}%`} />
                <Tooltip {...TT} formatter={(v)=>[`${v}%`,'Win Rate']} />
                <Bar dataKey="winRate" radius={[4,4,0,0]}>
                  {byAsset.map((e)=><Cell key={e.name} fill={e.winRate>=50?'#10b981':'#ef4444'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>}
        </ChartCard>

        <ChartCard title="P&L by Day of Week" subtitle="Which days are most profitable">
          {closed.length < 2 ? <Empty /> :
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byDay} margin={{ top:0,right:0,bottom:0,left:-10 }}>
                <XAxis dataKey="name" tick={TICK} axisLine={false} tickLine={false} />
                <YAxis tick={TICK} axisLine={false} tickLine={false} tickFormatter={(v)=>`$${v}`} />
                <Tooltip {...TT} formatter={(v)=>[`$${v}`,'P&L']} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
                <Bar dataKey="pnl" radius={[4,4,0,0]}>
                  {byDay.map((e)=><Cell key={e.name} fill={e.pnl>=0?'#10b981':'#ef4444'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>}
        </ChartCard>
      </div>

      {/* Row 2: Monthly P&L + Drawdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Monthly P&L" subtitle="Net profit/loss per calendar month">
          {byMonth.length < 1 ? <Empty /> :
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byMonth} margin={{ top:0,right:0,bottom:0,left:-10 }}>
                <XAxis dataKey="label" tick={TICK} axisLine={false} tickLine={false} />
                <YAxis tick={TICK} axisLine={false} tickLine={false} tickFormatter={(v)=>`$${v}`} />
                <Tooltip {...TT} formatter={(v)=>[`$${v}`,'P&L']} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
                <Bar dataKey="pnl" radius={[4,4,0,0]}>
                  {byMonth.map((e)=><Cell key={e.label} fill={e.pnl>=0?'#10b981':'#ef4444'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>}
        </ChartCard>

        <ChartCard title="Drawdown" subtitle="% decline from equity peak">
          {drawdownData.length < 2 ? <Empty /> :
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={drawdownData} margin={{ top:0,right:4,bottom:0,left:0 }}>
                <defs>
                  <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                {GRID}
                <XAxis dataKey="date" tick={TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={TICK} axisLine={false} tickLine={false} tickFormatter={(v)=>`${v}%`} width={45} />
                <Tooltip {...TT} formatter={(v)=>[`${v}%`,'Drawdown']} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
                <Area type="monotone" dataKey="drawdown" stroke="#ef4444" strokeWidth={2}
                  fill="url(#ddGrad)" dot={false} activeDot={{ r:4, fill:'#ef4444', strokeWidth:0 }} />
              </AreaChart>
            </ResponsiveContainer>}
        </ChartCard>
      </div>

      {/* Row 3: Setup performance + Emotion vs R */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Setup Type Performance" subtitle="Win rate by setup — sorted best to worst">
          {bySetup.length < 1 ? <Empty /> :
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={bySetup} layout="vertical" margin={{ top:0,right:30,bottom:0,left:0 }}>
                <XAxis type="number" tick={TICK} axisLine={false} tickLine={false} domain={[0,100]} tickFormatter={(v)=>`${v}%`} />
                <YAxis type="category" dataKey="name" tick={TICK} axisLine={false} tickLine={false} width={90} />
                <Tooltip {...TT} formatter={(v,n)=>[n==='winRate'?`${v}%`:`${v}R`, n==='winRate'?'Win Rate':'Avg R']} />
                <Bar dataKey="winRate" radius={[0,4,4,0]}>
                  {bySetup.map((e)=><Cell key={e.name} fill={e.winRate>=50?'#10b981':'#ef4444'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>}
        </ChartCard>

        <ChartCard title="Emotion vs Performance" subtitle="Pre-trade emotion rating vs R multiple outcome">
          {emotionScatter.length < 3 ? <Empty /> :
            <ResponsiveContainer width="100%" height={220}>
              <ScatterChart margin={{ top:10,right:10,bottom:0,left:-20 }}>
                <XAxis dataKey="x" type="number" domain={[0.5,5.5]} tick={TICK} axisLine={false} tickLine={false}
                  tickFormatter={(v)=>({ 1:'😴',2:'😐',3:'🙂',4:'😤',5:'🤯' })[v]??v} ticks={[1,2,3,4,5]} />
                <YAxis dataKey="y" type="number" tick={TICK} axisLine={false} tickLine={false}
                  tickFormatter={(v)=>`${v}R`} />
                <ZAxis range={[40,40]} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
                <Tooltip {...TT} formatter={(v,n)=>[n==='x'?EMOTIONS_MAP[v]??v:`${v}R`, n==='x'?'Emotion':'R Multiple']} />
                <Scatter data={emotionScatter} shape={(props) => {
                  const { cx, cy, payload } = props
                  return <circle cx={cx} cy={cy} r={5} fill={payload.outcome==='win'?'#10b981':'#ef4444'} fillOpacity={0.7} />
                }} />
              </ScatterChart>
            </ResponsiveContainer>}
        </ChartCard>
      </div>

      {/* Row 4: Time of day + Avg win vs loss */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Best Time of Day" subtitle="Cumulative P&L by entry hour">
          {byHour.length < 2 ? <Empty /> :
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byHour} margin={{ top:0,right:0,bottom:0,left:-10 }}>
                <XAxis dataKey="hour" tick={TICK} axisLine={false} tickLine={false} />
                <YAxis tick={TICK} axisLine={false} tickLine={false} tickFormatter={(v)=>`$${v}`} />
                <Tooltip {...TT} formatter={(v,n)=>[n==='pnl'?`$${v}`:v, n==='pnl'?'P&L':'Trades']} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
                <Bar dataKey="pnl" radius={[4,4,0,0]}>
                  {byHour.map((e)=><Cell key={e.hour} fill={e.pnl>=0?'#10b981':'#ef4444'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>}
        </ChartCard>

        <ChartCard title="Win vs Loss Analysis">
          <div className="space-y-1 mt-2">
            <SummaryRow label="Total wins" value={`${summary.wins} trades`} />
            <SummaryRow label="Total losses" value={`${summary.losses} trades`} />
            <SummaryRow label="Average win" value={`+$${summary.avgWin.toFixed(2)}`} color="text-win" />
            <SummaryRow label="Average loss" value={`-$${summary.avgLoss.toFixed(2)}`} color="text-loss" />
            <SummaryRow label="Gross profit" value={`$${summary.grossWin.toFixed(2)}`} color="text-win" />
            <SummaryRow label="Gross loss" value={`$${summary.grossLoss.toFixed(2)}`} color="text-loss" />
            <SummaryRow label="Profit factor"
              value={summary.profitFactor != null ? summary.profitFactor.toFixed(2) : '∞'}
              color={summary.profitFactor != null && summary.profitFactor >= 1.5 ? 'text-win' : 'text-loss'} />
            <SummaryRow label="Win/loss ratio"
              value={summary.avgLoss > 0 ? (summary.avgWin / summary.avgLoss).toFixed(2) : '∞'}
              color="text-accent" />
          </div>
        </ChartCard>
      </div>

      {/* Pattern insights */}
      <PatternInsights trades={trades} userProfile={userProfile} user={user} />
    </div>
  )
}
