import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/store/AuthContext'
import { useTrades } from '@/store/TradeContext'
import { fmtMoney, fmtSigned } from '@/lib/calc'
import { LogTrade } from '@/components/trade/LogTrade'
import { CsvImport } from '@/components/trade/CsvImport'
import { AskDrawer } from '@/components/ai/AskDrawer'

const NAV = [
  { to: '/', label: 'Desk', end: true },
  { to: '/trades', label: 'Trades' },
  { to: '/analysis', label: 'Analysis' },
  { to: '/portfolio', label: 'ASX' },
  { to: '/settings', label: 'Settings' },
]

function Mark() {
  return (
    <svg className="w-4 h-4 text-brass" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M1 12.5L4.5 7L8 9.5L11 3.5L15 6" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  )
}

export function Shell() {
  const { profile, logout } = useAuth()
  const { stats, trades } = useTrades()
  const [logOpen, setLogOpen] = useState(false)
  const [csvOpen, setCsvOpen] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  const location = useLocation()

  const balance = profile?.accountBalance ?? 0
  const start = profile?.startingBalance ?? 0
  const change = balance - start
  const openCount = trades.filter((t) => t.status === 'open').length

  return (
    <div className="min-h-screen flex flex-col">

      {/* ── Top bar: identity, live account state, primary actions ────────── */}
      <header className="h-11 border-b border-ink-700 bg-ink-900 flex items-stretch shrink-0 sticky top-0 z-30">
        <div className="flex items-center gap-2 px-3 border-r border-ink-700">
          <Mark />
          <span className="font-semibold text-ink-50 tracking-tight text-sm">Trackr</span>
        </div>

        <nav className="flex items-stretch">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center px-3 text-xs font-medium border-r border-ink-700 transition-colors
                 ${isActive
                   ? 'text-brass-bright bg-ink-850 shadow-[inset_0_-2px_0_0] shadow-brass'
                   : 'text-ink-300 hover:text-ink-50 hover:bg-ink-850'}`
              }
            >
              {item.label}
              {item.to === '/trades' && openCount > 0 && (
                <span className="ml-1.5 text-2xs font-mono text-brass">{openCount}</span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Account state — always visible, because it's the number that matters */}
        <div className="ml-auto flex items-stretch">
          <div className="hidden sm:flex items-center gap-4 px-3 border-l border-ink-700 font-mono text-xs">
            <span className="flex items-baseline gap-1.5">
              <span className="text-2xs uppercase tracking-label text-ink-400">Bal</span>
              <span className="text-ink-50">{fmtMoney(balance, 0)}</span>
            </span>
            {start > 0 && (
              <span className={change >= 0 ? 'text-up' : 'text-down'}>
                {fmtSigned(change, 0)}
              </span>
            )}
            <span className="flex items-baseline gap-1.5">
              <span className="text-2xs uppercase tracking-label text-ink-400">R</span>
              <span className={stats.avgR >= 0 ? 'text-up' : 'text-down'}>
                {stats.avgR >= 0 ? '+' : '−'}{Math.abs(stats.avgR).toFixed(2)}
              </span>
            </span>
          </div>

          <button
            onClick={() => setAskOpen(true)}
            className="px-3 border-l border-ink-700 text-xs text-ink-300 hover:text-ink-50 hover:bg-ink-850 transition-colors"
            title="Ask a question about your journal"
          >
            Ask
          </button>
          <button
            onClick={() => setCsvOpen(true)}
            className="px-3 border-l border-ink-700 text-xs text-ink-300 hover:text-ink-50 hover:bg-ink-850 transition-colors"
            title="Import a CMC CSV export"
          >
            Import
          </button>
          <button
            onClick={() => setLogOpen(true)}
            className="px-4 border-l border-ink-700 bg-brass/15 text-brass-bright text-xs font-medium
                       hover:bg-brass/25 transition-colors"
          >
            Log trade
          </button>
          <button
            onClick={() => void logout()}
            className="px-3 border-l border-ink-700 text-ink-400 hover:text-ink-50 hover:bg-ink-850 transition-colors"
            title="Sign out"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 14H3V2h3M10 11l3-3-3-3M13 8H6" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── Page ──────────────────────────────────────────────────────────── */}
      <main key={location.pathname} className="flex-1 p-3 animate-fade-in">
        <Outlet context={{ openLogTrade: () => setLogOpen(true), openCsvImport: () => setCsvOpen(true) }} />
      </main>

      <LogTrade open={logOpen} onClose={() => setLogOpen(false)} />
      <CsvImport open={csvOpen} onClose={() => setCsvOpen(false)} />
      <AskDrawer open={askOpen} onClose={() => setAskOpen(false)} />
    </div>
  )
}

export interface ShellContext {
  openLogTrade: () => void
  openCsvImport: () => void
}
