import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useTrades } from '../context/TradeContext'
import toast from 'react-hot-toast'

const OUTCOME_COLORS = {
  win: 'badge-win',
  loss: 'badge-loss',
  breakeven: 'badge-neutral',
}

export default function TradeLog() {
  const { trades, loading, deleteTrade } = useTrades()
  const { setShowAddTrade } = useOutletContext() ?? {}
  const [search, setSearch] = useState('')
  const [filterOutcome, setFilterOutcome] = useState('all')
  const [filterAsset, setFilterAsset] = useState('all')

  const filtered = trades.filter((t) => {
    const matchSearch = !search || (t.ticker ?? '').toLowerCase().includes(search.toLowerCase())
    const matchOutcome = filterOutcome === 'all' || t.outcome === filterOutcome
    const matchAsset = filterAsset === 'all' || t.assetClass === filterAsset
    return matchSearch && matchOutcome && matchAsset
  })

  const assetClasses = [...new Set(trades.map((t) => t.assetClass).filter(Boolean))]

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this trade? This cannot be undone.')) return
    try {
      await deleteTrade(id)
      toast.success('Trade deleted')
    } catch {
      toast.error('Failed to delete trade')
    }
  }

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="card h-16 bg-white/3" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Filters */}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-48">
          <div className="relative">
            <svg className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
            <input
              type="text"
              placeholder="Search by ticker..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pl-9 py-2"
            />
          </div>
        </div>

        <select
          value={filterOutcome}
          onChange={(e) => setFilterOutcome(e.target.value)}
          className="input-field w-auto py-2 cursor-pointer"
        >
          <option value="all">All outcomes</option>
          <option value="win">Wins</option>
          <option value="loss">Losses</option>
          <option value="breakeven">Breakeven</option>
        </select>

        <select
          value={filterAsset}
          onChange={(e) => setFilterAsset(e.target.value)}
          className="input-field w-auto py-2 cursor-pointer"
        >
          <option value="all">All markets</option>
          {assetClasses.map((a) => (
            <option key={a} value={a} className="capitalize">{a}</option>
          ))}
        </select>

        <span className="text-xs text-white/30 font-medium">
          {filtered.length} trade{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Trade table */}
      {filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <div className="text-4xl mb-4">📋</div>
          <h3 className="text-lg font-bold text-white mb-2">No trades yet</h3>
          <p className="text-white/40 text-sm mb-5">
            {trades.length > 0 ? 'No trades match your filters' : 'Start logging your trades to track your performance'}
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
                  <th className="text-left py-3 px-4 font-medium">Direction</th>
                  <th className="text-left py-3 px-4 font-medium">Market</th>
                  <th className="text-left py-3 px-4 font-medium">Setup</th>
                  <th className="text-left py-3 px-4 font-medium">Outcome</th>
                  <th className="text-right py-3 px-4 font-medium">P&L</th>
                  <th className="text-right py-3 px-4 font-medium">R</th>
                  <th className="text-right py-3 px-5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((trade) => (
                  <tr key={trade.id} className="hover:bg-white/2 transition-colors group">
                    <td className="py-3.5 px-5 text-white/40 font-medium whitespace-nowrap">
                      {trade.tradeDate
                        ? new Date(trade.tradeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : '—'}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-white">{trade.ticker ?? '—'}</td>
                    <td className="py-3.5 px-4">
                      {trade.direction ? (
                        <span className={`font-semibold ${trade.direction === 'long' ? 'text-win' : 'text-loss'}`}>
                          {trade.direction === 'long' ? '▲ Long' : '▼ Short'}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="badge-neutral capitalize">{trade.assetClass ?? '—'}</span>
                    </td>
                    <td className="py-3.5 px-4 text-white/50 max-w-[120px] truncate">
                      {trade.setupType ?? '—'}
                    </td>
                    <td className="py-3.5 px-4">
                      {trade.outcome ? (
                        <span className={OUTCOME_COLORS[trade.outcome] ?? 'badge-neutral'}>
                          {trade.outcome.charAt(0).toUpperCase() + trade.outcome.slice(1)}
                        </span>
                      ) : (
                        <span className="badge-neutral text-gold">Open</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-semibold">
                      {trade.pnl != null ? (
                        <span className={trade.pnl >= 0 ? 'text-win' : 'text-loss'}>
                          {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                        </span>
                      ) : <span className="text-white/20">—</span>}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono">
                      {trade.rMultiple != null ? (
                        <span className={trade.rMultiple >= 0 ? 'text-win' : 'text-loss'}>
                          {trade.rMultiple >= 0 ? '+' : ''}{trade.rMultiple.toFixed(2)}R
                        </span>
                      ) : <span className="text-white/20">—</span>}
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <button
                        onClick={() => handleDelete(trade.id)}
                        className="text-white/20 hover:text-loss opacity-0 group-hover:opacity-100 transition-all duration-200 p-1"
                        title="Delete trade"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
