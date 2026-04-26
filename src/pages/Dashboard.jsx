import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTrades } from '../context/TradeContext'
import { useMilestones } from '../hooks/useMilestones'
import MorningBriefing from '../components/dashboard/MorningBriefing'
import PatternInsights from '../components/dashboard/PatternInsights'
import EquityCurve from '../components/dashboard/EquityCurve'
import CalendarHeatmap from '../components/dashboard/CalendarHeatmap'
import MilestoneModal from '../components/dashboard/MilestoneModal'

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = 'text-white', icon, trend }) {
  return (
    <div className="card p-5 flex flex-col gap-1.5 hover:border-white/10 transition-colors duration-200">
      <div className="flex items-start justify-between">
        <span className="stat-label">{label}</span>
        {icon && <span className="text-base opacity-50">{icon}</span>}
      </div>
      <div className={`text-2xl font-bold leading-none ${color}`}>{value}</div>
      {(sub || trend != null) && (
        <div className="flex items-center gap-2">
          {sub && <span className="text-xs text-white/25">{sub}</span>}
          {trend != null && (
            <span className={`text-xs font-semibold ${trend >= 0 ? 'text-win' : 'text-loss'}`}>
              {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Streak alert ─────────────────────────────────────────────────────────────

function StreakAlert({ streak }) {
  if (streak > -3) return null
  return (
    <div className="card p-4 border-loss/25 bg-loss/5 flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-loss/10 border border-loss/20 flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-lg">⚠️</span>
      </div>
      <div>
        <div className="font-semibold text-loss text-sm mb-1">
          Streak Protection — {Math.abs(streak)} consecutive losses
        </div>
        <div className="text-white/50 text-sm leading-relaxed">
          Take a break before your next trade. Review your strategy and only enter if you see a
          perfect A+ setup that matches every rule.
        </div>
      </div>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ name, onAddTrade }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-20 h-20 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-6">
        <svg className="w-10 h-10 text-accent" viewBox="0 0 24 24" fill="none">
          <polyline points="3,18 7.5,10.5 12,13.5 16.5,6 21,9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h3 className="text-xl font-bold text-white mb-2">Welcome{name ? `, ${name}` : ''}! 👋</h3>
      <p className="text-white/40 max-w-sm text-sm leading-relaxed mb-6">
        Your dashboard fills with data the moment you log your first trade.
        Hit <strong className="text-white/60">Add Trade</strong> to get started.
      </p>
      <button onClick={onAddTrade} className="btn-primary flex items-center gap-2">
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
        </svg>
        Log your first trade
      </button>
      <div className="mt-8 flex items-center gap-2 text-xs text-white/20">
        <div className="w-1.5 h-1.5 rounded-full bg-win animate-pulse" />
        AI analysis ready — upload a screenshot and let Claude rate your setups
      </div>
    </div>
  )
}

// ─── Recent trades table ──────────────────────────────────────────────────────

function RecentTradesTable({ trades }) {
  if (!trades.length) return null
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-white/25 text-xs uppercase tracking-wider">
            <th className="text-left py-2 pr-4 font-medium">Date</th>
            <th className="text-left py-2 pr-4 font-medium">Ticker</th>
            <th className="text-left py-2 pr-4 font-medium">Dir</th>
            <th className="text-left py-2 pr-4 font-medium">Market</th>
            <th className="text-left py-2 pr-4 font-medium">Setup</th>
            <th className="text-left py-2 pr-4 font-medium">Result</th>
            <th className="text-right py-2 font-medium">P&L</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {trades.slice(0, 8).map((t) => (
            <tr key={t.id} className="hover:bg-white/2 transition-colors">
              <td className="py-3 pr-4 text-white/35 font-medium whitespace-nowrap text-xs">
                {new Date(t.tradeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </td>
              <td className="py-3 pr-4 font-bold text-white">{t.ticker ?? '—'}</td>
              <td className="py-3 pr-4">
                <span className={`text-xs font-semibold ${t.direction === 'long' ? 'text-win' : 'text-loss'}`}>
                  {t.direction === 'long' ? '▲' : t.direction === 'short' ? '▼' : '—'}
                </span>
              </td>
              <td className="py-3 pr-4">
                <span className="badge-neutral capitalize text-xs">{t.assetClass ?? '—'}</span>
              </td>
              <td className="py-3 pr-4 text-white/40 text-xs max-w-[100px] truncate">{t.setupType ?? '—'}</td>
              <td className="py-3 pr-4">
                {t.outcome ? (
                  <span className={t.outcome === 'win' ? 'badge-win' : t.outcome === 'loss' ? 'badge-loss' : 'badge-neutral'}>
                    {t.outcome.charAt(0).toUpperCase() + t.outcome.slice(1)}
                  </span>
                ) : (
                  <span className="text-xs text-gold font-semibold">Open</span>
                )}
              </td>
              <td className="py-3 text-right font-mono font-semibold text-sm">
                {t.pnl != null ? (
                  <span className={t.pnl >= 0 ? 'text-win' : 'text-loss'}>
                    {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}
                  </span>
                ) : <span className="text-white/20">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { setShowAddTrade } = useOutletContext() ?? {}
  const onAddTrade = () => setShowAddTrade?.(true)
  const { user, userProfile } = useAuth()
  const { trades, stats, loading } = useTrades()
  const { pendingMilestone, clearMilestone } = useMilestones(trades, userProfile, user?.uid)

  const s = stats()

  const accountBalance = Number(userProfile?.accountBalance ?? 0)
  const startingBalance = Number(userProfile?.startingBalance ?? accountBalance)

  const pnlVsStart = startingBalance > 0
    ? ((accountBalance - startingBalance) / startingBalance) * 100
    : null

  const streakLabel = s.currentStreak > 0
    ? `${s.currentStreak} win${s.currentStreak !== 1 ? 's' : ''} 🔥`
    : s.currentStreak < 0
    ? `${Math.abs(s.currentStreak)} loss${Math.abs(s.currentStreak) !== 1 ? 'es' : ''} ❄️`
    : '—'

  const streakColor = s.currentStreak > 0 ? 'text-win' : s.currentStreak < 0 ? 'text-loss' : 'text-white/40'

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-20 card bg-white/3" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <div key={i} className="h-24 card bg-white/3" />)}
        </div>
        <div className="h-56 card bg-white/3" />
      </div>
    )
  }

  if (!trades.length) {
    return <EmptyState name={userProfile?.displayName ?? user?.displayName} onAddTrade={onAddTrade} />
  }

  return (
    <>
      <MilestoneModal milestone={pendingMilestone} onClose={clearMilestone} />

      <div className="space-y-5 animate-fade-in">
        {/* Morning briefing */}
        <MorningBriefing trades={trades} userProfile={userProfile} user={user} />

        {/* Streak alert */}
        <StreakAlert streak={s.currentStreak} />

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Trades"
            value={s.total}
            sub={`${s.wins}W / ${s.losses}L / ${s.breakeven}BE`}
            icon="📊"
          />
          <StatCard
            label="Win Rate"
            value={`${s.winRate.toFixed(1)}%`}
            sub={`${s.closed} closed`}
            color={s.winRate >= 50 ? 'text-win' : 'text-loss'}
            icon="🎯"
          />
          <StatCard
            label="Total P&L"
            value={`${s.totalPnL >= 0 ? '+' : ''}$${s.totalPnL.toFixed(2)}`}
            sub={`Avg R: ${s.avgR >= 0 ? '+' : ''}${s.avgR.toFixed(2)}`}
            color={s.totalPnL >= 0 ? 'text-win' : 'text-loss'}
            icon="💰"
          />
          <StatCard
            label="Account Balance"
            value={`$${accountBalance.toLocaleString()}`}
            sub={`Started: $${startingBalance.toLocaleString()}`}
            color="text-white"
            icon="🏦"
            trend={pnlVsStart}
          />
          <StatCard
            label="Best Trade"
            value={`+$${s.bestTrade.toFixed(2)}`}
            color="text-win"
            icon="⭐"
          />
          <StatCard
            label="Worst Trade"
            value={`$${s.worstTrade.toFixed(2)}`}
            color="text-loss"
            icon="📉"
          />
          <StatCard
            label="Avg Win / Loss"
            value={`$${s.avgWin.toFixed(0)}`}
            sub={`Avg loss: $${s.avgLoss.toFixed(0)}`}
            color="text-win"
            icon="⚖️"
          />
          <StatCard
            label="Current Streak"
            value={streakLabel}
            color={streakColor}
            sub={s.closed > 0 ? `${s.closed} closed trades` : undefined}
            icon={s.currentStreak > 0 ? '🔥' : s.currentStreak < 0 ? '❄️' : '➖'}
          />
        </div>

        {/* Equity curve */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title">Equity Curve</h2>
            <span className={`text-sm font-bold ${s.totalPnL >= 0 ? 'text-win' : 'text-loss'}`}>
              {s.totalPnL >= 0 ? '+' : ''}${s.totalPnL.toFixed(2)} total
            </span>
          </div>
          <EquityCurve trades={trades} startingBalance={startingBalance} />
        </div>

        {/* Calendar + Pattern insights */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="card p-5">
            <h2 className="section-title mb-5">Trading Calendar</h2>
            <CalendarHeatmap trades={trades} />
          </div>
          <PatternInsights trades={trades} userProfile={userProfile} user={user} />
        </div>

        {/* Recent trades */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title">Recent Trades</h2>
            <a href="/trades" className="text-xs text-accent hover:text-blue-400 transition-colors font-medium">
              View all →
            </a>
          </div>
          <RecentTradesTable trades={trades} />
        </div>
      </div>
    </>
  )
}
