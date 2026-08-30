import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '@/store/AuthContext'
import { useTrades } from '@/store/TradeContext'
import { fmtMoney, fmtSigned, fmtR } from '@/lib/calc'
import { imageFromClipboard } from '@/lib/images'
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
    <svg className="w-4 h-4 text-azure" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M1 12.5L4.5 7L8 9.5L11 3.5L15 6" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Keyboard hint, styled as a key rather than a text label. */
function Key({ children }: { children: string }) {
  return (
    <kbd className="px-1 py-px rounded-sm bg-ink-800 text-ink-400 font-mono text-[10px] leading-none">
      {children}
    </kbd>
  )
}

export function Shell() {
  const { profile, logout } = useAuth()
  const { stats, trades } = useTrades()
  const [logOpen, setLogOpen] = useState(false)
  const [csvOpen, setCsvOpen] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  const [pastedTicket, setPastedTicket] = useState<File | null>(null)
  const location = useLocation()

  const balance = profile?.accountBalance ?? 0
  const start = profile?.startingBalance ?? 0
  const change = balance - start
  const openCount = trades.filter((t) => t.status === 'open').length

  const openLogTrade = useCallback(() => setLogOpen(true), [])

  // ── Friction reducers ─────────────────────────────────────────────────────
  // Two ways into the log form without reaching for the mouse. Logging is the
  // thing that decides whether this app gets used at all, so the path from
  // "trade filled on CMC" to "logged" is kept as short as it can be.

  // `N` opens the form from anywhere. Ignored while typing, so it never
  // swallows a keystroke meant for a text field.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const typing =
        el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' ||
        el?.tagName === 'SELECT' || el?.isContentEditable
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        setLogOpen(true)
      } else if (e.key === '/') {
        e.preventDefault()
        setAskOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Pasting a screenshot anywhere in the app opens the log form with the ticket
  // already loaded and extracting — screenshot, Cmd+V, confirm, done.
  useEffect(() => {
    if (logOpen) return // the form has its own paste handler once it's open
    const handler = (e: ClipboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return
      const file = imageFromClipboard(e)
      if (!file) return
      e.preventDefault()
      setPastedTicket(file)
      setLogOpen(true)
      toast.success('Reading pasted ticket…')
    }
    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [logOpen])

  const closeLog = useCallback(() => {
    setLogOpen(false)
    setPastedTicket(null)
  }, [])

  return (
    <div className="min-h-screen flex flex-col">

      {/* ── Top bar ──────────────────────────────────────────────────────────
          A single hairline under the bar is the only chrome border on the page.
          Nav state is marked by an underline in the accent, not by a box. */}
      <header className="h-12 border-b border-ink-800 bg-ink-950/95 backdrop-blur-sm
                         flex items-stretch shrink-0 sticky top-0 z-30">
        <div className="flex items-center gap-2 pl-4 pr-6">
          <Mark />
          <span className="font-semibold text-ink-50 tracking-tight text-sm">Trackr</span>
        </div>

        <nav className="flex items-stretch gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `relative flex items-center px-3 text-xs font-medium transition-colors
                 ${isActive
                   ? 'text-ink-50 after:absolute after:inset-x-3 after:bottom-0 after:h-px after:bg-azure'
                   : 'text-ink-400 hover:text-ink-100'}`
              }
            >
              {item.label}
              {item.to === '/trades' && openCount > 0 && (
                <span className="ml-1.5 text-2xs font-mono text-azure">{openCount}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-stretch gap-1 pr-2">
          {/* Live account state — the numbers worth having permanently visible */}
          <div className="hidden md:flex items-center gap-5 px-4 font-mono text-xs">
            <span className="flex items-baseline gap-1.5">
              <span className="text-2xs uppercase tracking-label text-ink-500">Bal</span>
              <span className="text-ink-50">{fmtMoney(balance, 0)}</span>
            </span>
            {start > 0 && (
              <span className={change >= 0 ? 'text-up' : 'text-down'}>{fmtSigned(change, 0)}</span>
            )}
            <span className="flex items-baseline gap-1.5">
              <span className="text-2xs uppercase tracking-label text-ink-500">Exp</span>
              <span className={stats.avgR >= 0 ? 'text-up' : 'text-down'}>{fmtR(stats.avgR)}</span>
            </span>
          </div>

          <button
            onClick={() => setAskOpen(true)}
            className="flex items-center gap-1.5 px-2.5 text-xs text-ink-400 hover:text-ink-50 transition-colors"
            title="Ask your journal  ( / )"
          >
            Ask <Key>/</Key>
          </button>
          <button
            onClick={() => setCsvOpen(true)}
            className="px-2.5 text-xs text-ink-400 hover:text-ink-50 transition-colors"
            title="Import a CMC CSV export"
          >
            Import
          </button>
          <button
            onClick={openLogTrade}
            className="my-2 flex items-center gap-2 px-3 rounded bg-azure/12 text-azure-bright
                       text-xs font-medium hover:bg-azure/20 transition-colors"
            title="Log a trade  ( N )  ·  or just paste a screenshot"
          >
            Log trade <Key>N</Key>
          </button>
          <button
            onClick={() => void logout()}
            className="px-2.5 text-ink-500 hover:text-ink-100 transition-colors"
            title="Sign out"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 14H3V2h3M10 11l3-3-3-3M13 8H6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </header>

      <main key={location.pathname} className="flex-1 px-5 py-6 max-w-[1600px] w-full mx-auto animate-fade-in">
        <Outlet context={{ openLogTrade, openCsvImport: () => setCsvOpen(true) }} />
      </main>

      <LogTrade open={logOpen} onClose={closeLog} initialTicket={pastedTicket} />
      <CsvImport open={csvOpen} onClose={() => setCsvOpen(false)} />
      <AskDrawer open={askOpen} onClose={() => setAskOpen(false)} />
    </div>
  )
}

export interface ShellContext {
  openLogTrade: () => void
  openCsvImport: () => void
}
