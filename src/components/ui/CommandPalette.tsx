import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTrades } from '@/store/TradeContext'
import { fmtMoney, fmtR, fmtDate } from '@/lib/calc'
import type { Trade } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Command palette.
//
// A dense app with six pages and a few dozen trades has a navigation cost that
// does not show up in any single screen: every lookup is a click to a page, a
// filter, then a scan. ⌘K collapses all of that to typing the pair.
//
// Deliberately not a search box on a page. It is modal, it opens over whatever
// you were doing, and it closes on Escape — so it costs nothing to open on a
// guess, which is the only way a shortcut like this actually gets used.
// ─────────────────────────────────────────────────────────────────────────────

interface Item {
  id: string
  label: string
  hint?: string
  group: 'Go to' | 'Actions' | 'Trades'
  /** Extra text matched against the query but not displayed. */
  terms?: string
  right?: string
  tone?: 'up' | 'down'
  run: () => void
}

/**
 * Subsequence match, not substring: "gj" finds "GBP/JPY" and "anl" finds
 * Analysis. Scored so an earlier, tighter match ranks first, which is what
 * makes a two-keystroke query land on the right row.
 */
function score(query: string, target: string): number | null {
  if (!query) return 0
  const q = query.toLowerCase()
  const t = target.toLowerCase()

  const direct = t.indexOf(q)
  if (direct === 0) return 1000
  if (direct > 0) return 700 - direct

  let ti = 0
  let gaps = 0
  let last = -1
  for (const ch of q) {
    const found = t.indexOf(ch, ti)
    if (found === -1) return null
    if (last >= 0) gaps += found - last - 1
    last = found
    ti = found + 1
  }
  return 400 - gaps
}

export function CommandPalette({
  open, onClose, onLogTrade, onImportCsv, onOpenTrade,
}: {
  open: boolean
  onClose: () => void
  onLogTrade: () => void
  onImportCsv: () => void
  onOpenTrade: (t: Trade) => void
}) {
  const navigate = useNavigate()
  const { trades } = useTrades()
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setCursor(0)
    const t = setTimeout(() => inputRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [open])

  const items = useMemo<Item[]>(() => {
    const go = (path: string, label: string, terms?: string): Item => ({
      id: `go:${path}`, label, group: 'Go to', terms,
      run: () => { navigate(path); onClose() },
    })

    const base: Item[] = [
      go('/', 'Desk', 'home dashboard overview edge expectancy'),
      go('/trades', 'Trades', 'list table history'),
      go('/analysis', 'Analysis', 'stats compare rules breakdown'),
      go('/portfolio', 'ASX', 'holdings shares portfolio stocks'),
      go('/data', 'Data', 'backup export reset import csv risk currency'),
      go('/settings', 'Settings', 'profile balance strategy account'),
      {
        id: 'act:log', label: 'Log a trade', hint: 'N', group: 'Actions',
        terms: 'new add entry', run: () => { onLogTrade(); onClose() },
      },
      {
        id: 'act:csv', label: 'Import a CSV', group: 'Actions',
        terms: 'cmc upload history bulk', run: () => { onImportCsv(); onClose() },
      },
      {
        id: 'act:open', label: 'Show open positions', group: 'Actions',
        terms: 'filter running live',
        run: () => { navigate('/trades?filter=open'); onClose() },
      },
      {
        id: 'act:norules', label: 'Trades missing rules', group: 'Actions',
        terms: 'filter incomplete gaps checklist',
        run: () => { navigate('/trades?filter=no-rules'); onClose() },
      },
    ]

    // Open positions first — they are the only rows that are still actionable.
    const ordered = [...trades].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1
      return 0
    })

    const tradeItems: Item[] = ordered.slice(0, 200).map((t) => ({
      id: `trade:${t.id}`,
      label: t.ticker,
      hint: `${t.direction === 'long' ? 'Long' : 'Short'} · ${fmtDate(t.exitDate ?? t.tradeDate)}${
        t.status === 'open' ? ' · open' : ''
      }`,
      group: 'Trades',
      terms: `${t.setupType} ${t.notes} ${t.direction} ${t.outcome ?? 'open'}`,
      right: t.status === 'open' ? 'OPEN' : `${fmtR(t.rMultiple)}  ${fmtMoney(t.pnl, 0)}`,
      tone: t.status === 'open' ? undefined : (t.pnl ?? 0) >= 0 ? 'up' : 'down',
      run: () => { onOpenTrade(t); onClose() },
    }))

    return [...base, ...tradeItems]
  }, [trades, navigate, onClose, onLogTrade, onImportCsv, onOpenTrade])

  const results = useMemo(() => {
    if (!query.trim()) {
      // Nothing typed: show the map, not 200 trades.
      return items.filter((i) => i.group !== 'Trades')
    }
    return items
      .map((i) => {
        const s = Math.max(
          score(query, i.label) ?? -1,
          i.terms ? (score(query, i.terms) ?? -1) - 250 : -1
        )
        return { item: i, s }
      })
      .filter((r) => r.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map((r) => r.item)
  }, [items, query])

  // The cursor must never point past the end after the list shrinks, or Enter
  // silently does nothing.
  useEffect(() => { setCursor(0) }, [query])
  const active = results[Math.min(cursor, Math.max(results.length - 1, 0))]

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [cursor, open, results.length])

  if (!open) return null

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => (results.length ? (c + 1) % results.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => (results.length ? (c - 1 + results.length) % results.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      active?.run()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  let lastGroup = ''

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh] bg-ink-975/70 backdrop-blur-sm animate-fade-in"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-ink-850 overflow-hidden animate-rise-sm"
        style={{
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.09), inset 0 0 0 1px rgba(255,255,255,0.07), ' +
            '0 4px 12px rgba(0,0,0,0.5), 0 32px 64px -16px rgba(0,0,0,0.75)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        <div className="flex items-center gap-2.5 px-3.5" style={{ boxShadow: 'inset 0 -1px 0 var(--edge)' }}>
          <svg className="w-3.5 h-3.5 text-ink-500 shrink-0" viewBox="0 0 16 16" fill="none"
            stroke="currentColor" strokeWidth="1.5">
            <circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a page, a pair, or an action…"
            className="flex-1 bg-transparent border-0 outline-none py-3 text-sm text-ink-50 placeholder:text-ink-500"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="kbd shrink-0">esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[46vh] overflow-y-auto py-1.5">
          {results.length === 0 ? (
            <p className="px-3.5 py-6 text-center text-2xs text-ink-500">
              Nothing matches “{query}”.
            </p>
          ) : (
            results.map((item, i) => {
              const isActive = item === active
              const showGroup = item.group !== lastGroup
              lastGroup = item.group
              return (
                <div key={item.id}>
                  {showGroup && (
                    <div className="px-3.5 pt-2 pb-1 text-3xs uppercase tracking-label text-ink-600">
                      {item.group}
                    </div>
                  )}
                  <button
                    data-active={isActive}
                    onMouseEnter={() => setCursor(i)}
                    onClick={item.run}
                    className={`w-full flex items-center gap-3 px-3.5 py-[7px] text-left transition-colors duration-70 ${
                      isActive ? 'bg-azure/15' : 'hover:bg-ink-800'
                    }`}
                  >
                    <span className={`text-xs shrink-0 ${item.group === 'Trades' ? 'font-mono' : ''} ${
                      isActive ? 'text-ink-50' : 'text-ink-100'
                    }`}>
                      {item.label}
                    </span>
                    {item.hint && (
                      <span className="text-2xs text-ink-500 truncate">{item.hint}</span>
                    )}
                    {item.right && (
                      <span className={`ml-auto font-mono text-2xs shrink-0 tabular ${
                        item.tone === 'up' ? 'text-up' : item.tone === 'down' ? 'text-down' : 'text-azure-bright'
                      }`}>
                        {item.right}
                      </span>
                    )}
                  </button>
                </div>
              )
            })
          )}
        </div>

        <div
          className="flex items-center gap-3 px-3.5 py-2 text-3xs text-ink-600"
          style={{ boxShadow: 'inset 0 1px 0 var(--edge-soft)' }}
        >
          <span className="flex items-center gap-1"><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> move</span>
          <span className="flex items-center gap-1"><kbd className="kbd">↵</kbd> open</span>
          <span className="ml-auto">{results.length} result{results.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  )
}
