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
import { Kbd } from '@/components/ui/Primitives'

const NAV = [
  { to: '/', label: 'Desk', end: true },
  { to: '/trades', label: 'Trades' },
  { to: '/analysis', label: 'Analysis' },
  { to: '/portfolio', label: 'ASX' },
  { to: '/data', label: 'Data' },
  { to: '/settings', label: 'Settings' },
]

function Mark() {
  return (
    <svg className="w-[18px] h-[18px] text-azure" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M1 12.5L4.5 7L8 9.5L11 3.5L15 6" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * The live account readout. Grouped onto its own plane rather than floated as
 * loose text: these three figures are a single instrument, and giving them an
 * edge is what stops the top bar reading as a row of unrelated words.
 */
function Readout({
  balance, change, showChange, expectancy,
}: {
  balance: number
  change: number
  showChange: boolean
  expectancy: number
}) {
  return (
    <div
      className="hidden lg:flex items-stretch rounded-md bg-ink-900 overflow-hidden"
      style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), inset 0 0 0 1px rgba(255,255,255,0.05)' }}
    >
      <div className="flex flex-col justify-center px-3 py-1">
        <span className="text-3xs uppercase tracking-label text-ink-500 leading-none">Balance</span>
        <span className="font-mono text-xs text-ink-50 leading-none mt-1 tabular">
          {fmtMoney(balance, 0)}
        </span>
      </div>
      {showChange && (
        <div className="flex flex-col justify-center px-3 py-1" style={{ boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.05)' }}>
          <span className="text-3xs uppercase tracking-label text-ink-500 leading-none">Change</span>
          <span className={`font-mono text-xs leading-none mt-1 tabular ${change >= 0 ? 'text-up' : 'text-down'}`}>
            {fmtSigned(change, 0)}
          </span>
        </div>
      )}
      <div className="flex flex-col justify-center px-3 py-1" style={{ boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.05)' }}>
        <span className="text-3xs uppercase tracking-label text-ink-500 leading-none">Expectancy</span>
        <span className={`font-mono text-xs leading-none mt-1 tabular ${expectancy >= 0 ? 'text-up' : 'text-down'}`}>
          {fmtR(expectancy)}
        </span>
      </div>
    </div>
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
  const openCsvImport = useCallback(() => setCsvOpen(true), [])

  // ── Friction reducers ───────────────────────────────────────────────
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

      {/* ── Top bar ────────────────────────────────────────────────────
          A floating plane rather than a ruled strip: translucent ground, a
          blur, and a single highlight along its lower edge so content scrolls
          *under* it instead of colliding with a line. */}
      <header
        className="h-[52px] bg-ink-950/85 backdrop-blur-xl flex items-center gap-1
                   shrink-0 sticky top-0 z-30 px-3"
        style={{ boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-2 pl-1 pr-4">
          <Mark />
          <span className="font-semibold text-ink-50 tracking-tighter text-[15px]">Fills</span>
        </div>

        {/* Nav items are pills. The active one is a raised plane — depth, not a
            rule — which reads instantly at a glance and leaves the accent free
            to do other work. */}
        <nav className="flex items-center gap-0.5 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `relative flex items-center gap-1.5 px-2.5 h-8 rounded text-xs font-medium shrink-0
                 transition-[color,background-color,box-shadow] duration-130 ease-snap
                 ${isActive
                   ? 'text-ink-50 bg-ink-800'
                   : 'text-ink-400 hover:text-ink-100 hover:bg-ink-900'}`
              }
              style={({ isActive }) =>
                isActive
                  ? { boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 0 0 1px rgba(255,255,255,0.06)' }
                  : undefined
              }
            >
              {item.label}
              {item.to === '/trades' && openCount > 0 && (
                <span className="font-mono text-3xs text-azure-bright tabular">{openCount}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Readout
            balance={balance}
            change={change}
            showChange={start > 0}
            expectancy={stats.avgR}
          />

          <button
            onClick={() => setAskOpen(true)}
            className="hidden sm:flex items-center gap-1.5 h-8 px-2.5 rounded text-xs text-ink-400
                       hover:text-ink-50 hover:bg-ink-900 transition-colors duration-90"
            title="Ask your journal  ( / )"
          >
            Ask <Kbd>/</Kbd>
          </button>

          <button
            onClick={openLogTrade}
            className="btn-solid h-8"
            title="Log a trade  ( N )  ·  or just paste a screenshot"
          >
            Log trade
            <span className="hidden sm:inline-flex items-center justify-center min-w-[15px] h-[15px]
                             rounded-sm bg-ink-975/25 text-ink-975 font-mono text-3xs leading-none px-1">
              N
            </span>
          </button>

          <button
            onClick={() => void logout()}
            className="h-8 w-8 grid place-items-center rounded text-ink-500 hover:text-ink-100
                       hover:bg-ink-900 transition-colors duration-90"
            title="Sign out"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 14H3V2h3M10 11l3-3-3-3M13 8H6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </header>

      <main
        key={location.pathname}
        className="flex-1 px-5 lg:px-7 py-7 max-w-[1560px] w-full mx-auto animate-fade-in"
      >
        <Outlet context={{ openLogTrade, openCsvImport }} />
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
