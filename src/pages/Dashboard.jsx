import { useAuth } from '../context/AuthContext'
import { useTrades } from '../context/TradeContext'

function StatCard({ label, value, sub, color = 'text-white', icon }) {
  return (
    <div className="card p-5 flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <span className="stat-label">{label}</span>
        {icon && <span className="text-lg opacity-60">{icon}</span>}
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-white/30">{sub}</div>}
    </div>
  )
}

function EmptyState({ name }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-accent" viewBox="0 0 24 24" fill="none">
          <polyline points="3,18 7.5,10.5 12,13.5 16.5,6 21,9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h3 className="text-lg font-bold text-white mb-2">
        Welcome, {name ?? 'Trader'}! 👋
      </h3>
      <p className="text-white/40 max-w-sm text-sm leading-relaxed">
        Your dashboard will come alive once you start adding trades.
        Hit the <strong className="text-white/60">Add Trade</strong> button to log your first trade.
      </p>
      <div className="mt-6 flex items-center gap-2 text-xs text-white/20">
        <div className="w-2 h-2 rounded-full bg-win animate-pulse" />
        AI analysis ready
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user, userProfile } = useAuth()
  const { trades, stats, loading } = useTrades()
  const s = stats()

  const streakLabel = s.currentStreak > 0
    ? `${s.currentStreak} win streak 🔥`
    : s.currentStreak < 0
    ? `${Math.abs(s.currentStreak)} loss streak`
    : 'No active streak'

  const streakColor = s.currentStreak > 0
    ? 'text-win'
    : s.currentStreak < 0
    ? 'text-loss'
    : 'text-white/40'

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 animate-pulse">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="card h-24 bg-white/3" />
        ))}
      </div>
    )
  }

  if (!trades.length) {
    return <EmptyState name={user?.displayName ?? userProfile?.displayName} />
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Losing streak alert */}
      {s.currentStreak <= -3 && (
        <div className="card p-4 border-loss/30 bg-loss/5 flex items-start gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <div className="font-semibold text-loss text-sm mb-1">Streak Protection Active</div>
            <div className="text-white/60 text-sm">
              You've had {Math.abs(s.currentStreak)} consecutive losses. Take a break before your next trade
              and make sure it's an A+ setup that perfectly matches your strategy.
            </div>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Trades"
          value={s.total}
          sub={`${s.wins}W / ${s.losses}L`}
          icon="📊"
        />
        <StatCard
          label="Win Rate"
          value={`${s.winRate.toFixed(1)}%`}
          sub={`${s.closed} closed trades`}
          color={s.winRate >= 50 ? 'text-win' : 'text-loss'}
          icon="🎯"
        />
        <StatCard
          label="Total P&L"
          value={`${s.totalPnL >= 0 ? '+' : ''}$${s.totalPnL.toFixed(2)}`}
          sub={`Avg R: ${s.avgR.toFixed(2)}`}
          color={s.totalPnL >= 0 ? 'text-win' : 'text-loss'}
          icon="💰"
        />
        <StatCard
          label="Account Balance"
          value={`$${(Number(userProfile?.accountBalance ?? 0)).toLocaleString()}`}
          sub={`Started: $${Number(userProfile?.startingBalance ?? 0).toLocaleString()}`}
          icon="🏦"
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
          label="Avg Win"
          value={`+$${s.avgWin.toFixed(2)}`}
          color="text-win"
          icon="✅"
        />
        <StatCard
          label="Current Streak"
          value={streakLabel}
          color={streakColor}
          icon={s.currentStreak > 0 ? '🔥' : s.currentStreak < 0 ? '❄️' : '➖'}
        />
      </div>

      {/* Recent trades */}
      <div className="card p-5">
        <h2 className="section-title mb-4">Recent Trades</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/30 text-xs uppercase tracking-wider">
                <th className="text-left py-2 pr-4 font-medium">Ticker</th>
                <th className="text-left py-2 pr-4 font-medium">Direction</th>
                <th className="text-left py-2 pr-4 font-medium">Market</th>
                <th className="text-left py-2 pr-4 font-medium">Outcome</th>
                <th className="text-right py-2 font-medium">P&L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {trades.slice(0, 10).map((trade) => (
                <tr key={trade.id} className="hover:bg-white/2 transition-colors">
                  <td className="py-3 pr-4 font-semibold text-white">{trade.ticker ?? '—'}</td>
                  <td className="py-3 pr-4">
                    <span className={`font-medium ${trade.direction === 'long' ? 'text-win' : 'text-loss'}`}>
                      {trade.direction ? (trade.direction === 'long' ? '▲ Long' : '▼ Short') : '—'}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="badge-neutral capitalize">{trade.assetClass ?? '—'}</span>
                  </td>
                  <td className="py-3 pr-4">
                    {trade.outcome ? (
                      <span className={
                        trade.outcome === 'win' ? 'badge-win' :
                        trade.outcome === 'loss' ? 'badge-loss' : 'badge-neutral'
                      }>
                        {trade.outcome.charAt(0).toUpperCase() + trade.outcome.slice(1)}
                      </span>
                    ) : (
                      <span className="badge-neutral">Open</span>
                    )}
                  </td>
                  <td className="py-3 text-right font-mono font-semibold">
                    {trade.pnl != null ? (
                      <span className={trade.pnl >= 0 ? 'text-win' : 'text-loss'}>
                        {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-white/30">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
