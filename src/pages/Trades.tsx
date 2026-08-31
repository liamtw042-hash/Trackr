import { Fragment, useMemo, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { useTrades } from '@/store/TradeContext'
import { useAuth } from '@/store/AuthContext'
import { useTableSort } from '@/hooks/useTableSort'
import {
  fmtMoney, fmtR, fmtDateTime, fmtPrice, valueClass, dateOf, computeStats,
} from '@/lib/calc'
import { RULES, ruleScore, type Trade } from '@/types'
import { Section, Empty, Tag, Input, Select, Stat, StatRow, SortTh } from '@/components/ui/Primitives'
import { RulesBadge } from '@/components/trade/RulesChecklist'
import { TradeDetail } from '@/components/trade/TradeDetail'
import { QuickClose } from '@/components/trade/QuickClose'
import type { ShellContext } from '@/components/layout/Shell'

/** Kept next to the header row below — a stale colSpan silently breaks the
 *  quick-close row's alignment with no error anywhere. */
const TABLE_COLUMNS = 11

type SortKey = 'date' | 'pair' | 'r' | 'pnl'
type Filter = 'all' | 'open' | 'closed' | 'wins' | 'losses' | 'broke-rules' | 'no-rules'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'wins', label: 'Wins' },
  { value: 'losses', label: 'Losses' },
  { value: 'broke-rules', label: 'Broke a rule' },
  { value: 'no-rules', label: 'Rules missing' },
]

export function Trades() {
  const { trades, loading } = useTrades()
  const { profile } = useAuth()
  const { openLogTrade } = useOutletContext<ShellContext>()

  // The filter lives in the URL so the Desk can deep-link straight to the
  // trades that are missing rules — the prompt there is only useful if it lands
  // on the exact set it's talking about.
  const [params, setParams] = useSearchParams()
  const urlFilter = params.get('filter')
  const initialFilter: Filter =
    FILTERS.some((f) => f.value === urlFilter) ? (urlFilter as Filter) : 'all'

  const [selected, setSelected] = useState<Trade | null>(null)
  const [closing, setClosing] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilterState] = useState<Filter>(initialFilter)

  const setFilter = (next: Filter) => {
    setFilterState(next)
    if (next === 'all') params.delete('filter')
    else params.set('filter', next)
    setParams(params, { replace: true })
  }
  const sort = useTableSort<SortKey>('date')

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase()

    const list = trades.filter((t) => {
      if (q && !t.ticker.includes(q) && !t.setupType.toUpperCase().includes(q)
        && !t.notes.toUpperCase().includes(q)) return false

      const score = ruleScore(t.rules)
      switch (filter) {
        case 'open': return t.status === 'open'
        case 'closed': return t.status === 'closed'
        case 'wins': return t.outcome === 'win'
        case 'losses': return t.outcome === 'loss'
        case 'broke-rules': return score.broken.length > 0
        case 'no-rules': return score.answered === 0
        default: return true
      }
    })

    return list
  }, [trades, query, filter])

  // Sorted separately from filtered, so the stats below — which only care about
  // *which* trades are in view, never their order — don't recompute on a
  // header click. Null handling (an open trade has no R yet: missing, not
  // worst) lives in the hook, shared with the ASX table.
  const visible = useMemo(
    () =>
      sort.sortBy(filtered, (t) => {
        switch (sort.key) {
          case 'pair': return t.ticker
          case 'r': return t.rMultiple
          case 'pnl': return t.pnl
          default: return dateOf(t).getTime()
        }
      }),
    [filtered, sort]
  )

  // Stats reflect the current filter, so narrowing the view answers a question.
  const viewStats = useMemo(
    () => computeStats(filtered, profile?.startingBalance ?? 0),
    [filtered, profile?.startingBalance]
  )

  const Th = (k: SortKey, label: string, num = false) => (
    <SortTh active={sort.key === k} desc={sort.desc} onClick={() => sort.toggle(k)} num={num}>
      {label}
    </SortTh>
  )

  if (loading) return <div className="skel h-96" />

  return (
    <div className="space-y-section">
      <StatRow cols={5}>
        <Stat label="Shown" value={filtered.length} sub={`of ${trades.length}`} />
        <Stat
          label="P&L"
          value={fmtMoney(viewStats.totalPnl, 0)}
          tone={viewStats.totalPnl >= 0 ? 'up' : 'down'}
          sub={`${viewStats.closed} closed`}
        />
        <Stat
          label="Avg R"
          value={fmtR(viewStats.avgR)}
          tone={viewStats.avgR >= 0 ? 'up' : 'down'}
        />
        <Stat
          label="Win rate"
          value={viewStats.closed ? `${viewStats.winRate.toFixed(0)}%` : '—'}
          sub={`${viewStats.wins}W ${viewStats.losses}L`}
        />
        <Stat
          label="Best / worst"
          value={fmtMoney(viewStats.bestTrade, 0)}
          sub={fmtMoney(viewStats.worstTrade, 0)}
          tone="neutral"
        />
      </StatRow>

      <Section
        title="Trades"
        meta={`${filtered.length} of ${trades.length}`}
        tier="surface"
        bodyClass=""
        action={
          <div className="flex items-center gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pair, setup, notes…"
              className="!py-1 !text-2xs w-44"
            />
            <Select
              value={filter}
              onChange={(e) => setFilter(e.target.value as Filter)}
              className="!py-1 !text-2xs w-32"
            >
              {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </Select>
          </div>
        }
      >
        {filtered.length === 0 ? (
          <Empty
            title={trades.length ? 'Nothing matches' : 'No trades yet'}
            detail={
              trades.length
                ? 'Try a different filter or clear the search.'
                : 'Log a trade from a CMC screenshot, a CSV import, or by hand.'
            }
            action={
              trades.length
                ? <button onClick={() => { setQuery(''); setFilter('all') }} className="btn-ghost">Clear filters</button>
                : <button onClick={openLogTrade} className="btn-primary">Log a trade</button>
            }
          />
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  {Th('date', 'Date')}
                  {Th('pair', 'Pair')}
                  <th>Dir</th>
                  <th className="num">Entry</th>
                  <th className="num">Stop</th>
                  <th className="num">Exit</th>
                  <th>Rules</th>
                  <th>Setup</th>
                  {Th('r', 'R', true)}
                  {Th('pnl', 'P&L', true)}
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => {
                  const score = ruleScore(t.rules)
                  return (
                    <Fragment key={t.id}>
                    <tr onClick={() => setSelected(t)} className="cursor-pointer">
                      <td className="font-mono text-ink-400">{fmtDateTime(t.exitDate ?? t.tradeDate)}</td>
                      <td className="font-mono text-ink-50 font-medium">{t.ticker}</td>
                      <td className={t.direction === 'long' ? 'text-up' : 'text-down'}>
                        {t.direction === 'long' ? 'L' : 'S'}
                      </td>
                      <td className="num text-ink-200">{fmtPrice(t.entryPrice, t.ticker)}</td>
                      <td className="num text-ink-400">{fmtPrice(t.stopLoss, t.ticker)}</td>
                      <td className="num text-ink-200">{fmtPrice(t.exitPrice, t.ticker)}</td>
                      <td>
                        <span
                          className="inline-flex items-center gap-1"
                          title={
                            score.broken.length
                              ? `Broke: ${score.broken.map((k) => RULES.find((r) => r.key === k)?.label).join(', ')}`
                              : score.answered === 0 ? 'Rules not recorded' : 'All followed'
                          }
                        >
                          <RulesBadge rules={t.rules} />
                        </span>
                      </td>
                      <td className="text-ink-400 max-w-[9rem] truncate">{t.setupType || '—'}</td>
                      <td className={`num ${valueClass(t.rMultiple)}`}>{fmtR(t.rMultiple)}</td>
                      <td className={`num ${valueClass(t.pnl)}`}>{fmtMoney(t.pnl)}</td>
                      <td>
                        {t.status === 'open' ? (
                          // Stops the row's own click handler, which would open
                          // the modal this button exists to avoid.
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setClosing((c) => (c === t.id ? null : t.id))
                            }}
                            className={`btn-sm rounded transition-colors duration-90 ${
                              closing === t.id
                                ? 'bg-ink-700 text-ink-100'
                                : 'bg-azure/15 text-azure-bright hover:bg-azure/25'
                            }`}
                            title="Close this position without opening the full detail"
                          >
                            {closing === t.id ? 'Cancel' : 'Close'}
                          </button>
                        ) : (
                          <Tag tone={t.outcome === 'win' ? 'up' : t.outcome === 'loss' ? 'down' : 'neutral'}>
                            {t.outcome ?? '—'}
                          </Tag>
                        )}
                      </td>
                    </tr>

                    {closing === t.id && (
                      <QuickClose
                        trade={t}
                        colSpan={TABLE_COLUMNS}
                        onDone={() => setClosing(null)}
                        onOpenFull={() => { setClosing(null); setSelected(t) }}
                      />
                    )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <TradeDetail trade={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
