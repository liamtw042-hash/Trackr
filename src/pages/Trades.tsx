import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useTrades } from '@/store/TradeContext'
import { useAuth } from '@/store/AuthContext'
import {
  fmtMoney, fmtR, fmtDateTime, fmtPrice, valueClass, dateOf, computeStats,
} from '@/lib/calc'
import { RULES, ruleScore, type Trade } from '@/types'
import { Panel, Empty, Tag, Input, Select, Stat, StatRow } from '@/components/ui/Primitives'
import { RulesBadge } from '@/components/trade/RulesChecklist'
import { TradeDetail } from '@/components/trade/TradeDetail'
import type { ShellContext } from '@/components/layout/Shell'

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

  const [selected, setSelected] = useState<Trade | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<SortKey>('date')
  const [desc, setDesc] = useState(true)

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase()

    let list = trades.filter((t) => {
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

    /**
     * Nulls always sink to the bottom, whichever way the column is sorted — an
     * open trade with no R yet is missing data, not the worst result. Handled
     * before the flip so the sign reversal doesn't float them back to the top,
     * and without arithmetic on the sentinels (−Infinity minus −Infinity is
     * NaN, which leaves the comparator inconsistent and the order arbitrary).
     */
    const byNumber = (x: number | null, y: number | null): number | null => {
      if (x === null && y === null) return 0
      if (x === null) return 1
      if (y === null) return -1
      return null
    }

    list = [...list].sort((a, b) => {
      let cmp = 0
      switch (sort) {
        case 'pair':
          cmp = a.ticker.localeCompare(b.ticker)
          break
        case 'r': {
          const nulls = byNumber(a.rMultiple, b.rMultiple)
          if (nulls !== null) return nulls
          cmp = (a.rMultiple as number) - (b.rMultiple as number)
          break
        }
        case 'pnl': {
          const nulls = byNumber(a.pnl, b.pnl)
          if (nulls !== null) return nulls
          cmp = (a.pnl as number) - (b.pnl as number)
          break
        }
        default:
          cmp = dateOf(a).getTime() - dateOf(b).getTime()
      }
      return desc ? -cmp : cmp
    })

    return list
  }, [trades, query, filter, sort, desc])

  // Stats reflect the current filter, so narrowing the view answers a question.
  const viewStats = useMemo(
    () => computeStats(filtered, profile?.startingBalance ?? 0),
    [filtered, profile?.startingBalance]
  )

  const toggleSort = (key: SortKey) => {
    if (sort === key) setDesc((d) => !d)
    else { setSort(key); setDesc(true) }
  }

  const SortTh = ({ k, children, num }: { k: SortKey; children: string; num?: boolean }) => (
    <th className={num ? 'num' : ''}>
      <button
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 hover:text-ink-100 transition-colors
          ${sort === k ? 'text-brass-bright' : ''}`}
      >
        {children}
        {sort === k && <span className="text-2xs">{desc ? '▾' : '▴'}</span>}
      </button>
    </th>
  )

  if (loading) return <div className="skel h-96" />

  return (
    <div className="space-y-3">
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

      <Panel
        title={`Trades — ${filtered.length}`}
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
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <SortTh k="date">Date</SortTh>
                  <SortTh k="pair">Pair</SortTh>
                  <th>Dir</th>
                  <th className="num">Entry</th>
                  <th className="num">Stop</th>
                  <th className="num">Exit</th>
                  <th>Rules</th>
                  <th>Setup</th>
                  <SortTh k="r" num>R</SortTh>
                  <SortTh k="pnl" num>P&L</SortTh>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const score = ruleScore(t.rules)
                  return (
                    <tr key={t.id} onClick={() => setSelected(t)} className="cursor-pointer">
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
                          <Tag tone="brass">Open</Tag>
                        ) : (
                          <Tag tone={t.outcome === 'win' ? 'up' : t.outcome === 'loss' ? 'down' : 'neutral'}>
                            {t.outcome ?? '—'}
                          </Tag>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <TradeDetail trade={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
