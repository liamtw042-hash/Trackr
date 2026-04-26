import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useTrades } from '../context/TradeContext'
import TradeDetailModal from '../components/trades/TradeDetailModal'
import { SkeletonTable } from '../components/shared/SkeletonCard'
import toast from 'react-hot-toast'

const OUTCOME_BADGE = {
  win: 'badge-win',
  loss: 'badge-loss',
  breakeven: 'badge-neutral',
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCSV(trades) {
  const HEADERS = [
    'Date','Ticker','Direction','Asset Class','Timeframe','Setup Type',
    'Entry Price','Exit Price','Stop Loss','Take Profit',
    'Position Size','Risk Amount ($)','Risk (%)','P&L ($)','R Multiple',
    'Outcome','Emotion','Followed Rules','Notes',
  ]

  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

  const rows = trades.map((t) => [
    t.tradeDate ? new Date(t.tradeDate).toLocaleString() : '',
    t.ticker ?? '',
    t.direction ?? '',
    t.assetClass ?? '',
    t.timeframe ?? '',
    t.setupType ?? '',
    t.entryPrice ?? '',
    t.exitPrice ?? '',
    t.stopLoss ?? '',
    t.takeProfit ?? '',
    t.positionSize ?? '',
    t.riskAmount ?? '',
    t.riskPercent ?? '',
    t.pnl ?? '',
    t.rMultiple ?? '',
    t.outcome ?? '',
    t.emotion ?? '',
    t.followedRules != null ? (t.followedRules ? 'Yes' : 'No') : '',
    t.notes ?? '',
  ].map(escape).join(','))

  const csv = [HEADERS.map(escape).join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `trackr_trades_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  toast.success(`Exported ${trades.length} trades to CSV`)
}

// ─── Trade Log ────────────────────────────────────────────────────────────────

export default function TradeLog() {
  const { trades, loading } = useTrades()
  const { setShowAddTrade } = useOutletContext() ?? {}
  const [search, setSearch] = useState('')
  const [filterOutcome, setFilterOutcome] = useState('all')
  const [filterAsset, setFilterAsset] = useState('all')
  const [selectedTrade, setSelectedTrade] = useState(null)

  const filtered = trades.filter((t) => {
    const matchSearch = !search || (t.ticker ?? '').toLowerCase().includes(search.toLowerCase())
    const matchOutcome = filterOutcome === 'all' || t.outcome === filterOutcome
    const matchAsset = filterAsset === 'all' || t.assetClass === filterAsset
    return matchSearch && matchOutcome && matchAsset
  })

  const assetClasses = [...new Set(trades.map((t) => t.assetClass).filter(Boolean))]

  if (loading) return <SkeletonTable rows={6} />

  return (
    <>
      {selectedTrade && (
        <TradeDetailModal trade={selectedTrade} onClose={() => setSelectedTrade(null)} />
      )}

      <div className="space-y-5 animate-fade-in">
        {/* Toolbar */}
        <div className="card p-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-44">
            <div className="relative">
              <svg className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
              <input type="text" placeholder="Search ticker…" value={search}
                onChange={(e) => setSearch(e.target.value)} className="input-field pl-9 py-2" />
            </div>
          </div>

          <select value={filterOutcome} onChange={(e) => setFilterOutcome(e.target.value)}
            className="input-field w-auto py-2 cursor-pointer">
            <option value="all">All outcomes</option>
            <option value="win">Wins</option>
            <option value="loss">Losses</option>
            <option value="breakeven">Breakeven</option>
          </select>

          <select value={filterAsset} onChange={(e) => setFilterAsset(e.target.value)}
            className="input-field w-auto py-2 cursor-pointer">
            <option value="all">All markets</option>
            {assetClasses.map((a) => <option key={a} value={a} className="capitalize">{a}</option>)}
          </select>

          <span className="text-xs text-white/30 font-medium">
            {filtered.length} trade{filtered.length !== 1 ? 's' : ''}
          </span>

          <div className="ml-auto flex items-center gap-2">
            {trades.length > 0 && (
              <button onClick={() => exportCSV(trades)}
                className="btn-secondary text-sm py-2 flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                Export CSV
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-16 text-center">
            <div className="text-4xl mb-4">📋</div>
            <h3 className="text-lg font-bold text-white mb-2">No trades found</h3>
            <p className="text-white/40 text-sm mb-5">
              {trades.length > 0 ? 'No trades match your current filters.' : 'Start logging trades to build your journal.'}
            </p>
            {trades.length === 0 && (
              <button onClick={() => setShowAddTrade?.(true)} className="btn-primary text-sm">
                + Add your first trade
              </button>
            )}
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/2 border-b border-white/5">
                  <tr className="text-white/30 text-xs uppercase tracking-wider">
                    <th className="text-left py-3 px-5 font-medium">Date</th>
                    <th className="text-left py-3 px-4 font-medium">Ticker</th>
                    <th className="text-left py-3 px-4 font-medium">Dir</th>
                    <th className="text-left py-3 px-4 font-medium">Market</th>
                    <th className="text-left py-3 px-4 font-medium">Setup</th>
                    <th className="text-left py-3 px-4 font-medium">Emotion</th>
                    <th className="text-left py-3 px-4 font-medium">Result</th>
                    <th className="text-right py-3 px-4 font-medium">P&L</th>
                    <th className="text-right py-3 px-5 font-medium">R</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filtered.map((trade) => (
                    <tr
                      key={trade.id}
                      onClick={() => setSelectedTrade(trade)}
                      className="hover:bg-white/3 transition-colors cursor-pointer group"
                    >
                      <td className="py-3.5 px-5 text-white/35 font-medium whitespace-nowrap text-xs">
                        {trade.tradeDate
                          ? new Date(trade.tradeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                          : '—'}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-white group-hover:text-accent transition-colors">
                        {trade.ticker ?? '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        {trade.direction ? (
                          <span className={`text-xs font-bold ${trade.direction === 'long' ? 'text-win' : 'text-loss'}`}>
                            {trade.direction === 'long' ? '▲ L' : '▼ S'}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="badge-neutral capitalize text-xs">{trade.assetClass ?? '—'}</span>
                      </td>
                      <td className="py-3.5 px-4 text-white/40 text-xs max-w-[100px] truncate">
                        {trade.setupType ?? '—'}
                      </td>
                      <td className="py-3.5 px-4 text-base">
                        {[, '😴', '😐', '🙂', '😤', '🤯'][trade.emotion ?? 0] ?? '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        {trade.outcome ? (
                          <span className={OUTCOME_BADGE[trade.outcome] ?? 'badge-neutral'}>
                            {trade.outcome.charAt(0).toUpperCase() + trade.outcome.slice(1)}
                          </span>
                        ) : (
                          <span className="text-xs text-gold font-semibold">Open</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-semibold">
                        {trade.pnl != null ? (
                          <span className={trade.pnl >= 0 ? 'text-win' : 'text-loss'}>
                            {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                          </span>
                        ) : <span className="text-white/20">—</span>}
                      </td>
                      <td className="py-3.5 px-5 text-right font-mono text-xs">
                        {trade.rMultiple != null ? (
                          <span className={trade.rMultiple >= 0 ? 'text-win' : 'text-loss'}>
                            {trade.rMultiple >= 0 ? '+' : ''}{trade.rMultiple.toFixed(2)}R
                          </span>
                        ) : <span className="text-white/20">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
