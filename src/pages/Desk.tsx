import { useMemo, useState } from 'react'
import { useOutletContext, Link } from 'react-router-dom'
import { useAuth } from '@/store/AuthContext'
import { useTrades } from '@/store/TradeContext'
import { useHoldings } from '@/store/HoldingsContext'
import { useQuotes } from '@/hooks/useQuotes'
import {
  fmtMoney, fmtSigned, fmtR, fmtPct, fmtDate, valueClass, groupPerformance, round,
} from '@/lib/calc'
import { RULES, ruleScore, type Trade } from '@/types'
import { EquityChart } from '@/components/charts/Charts'
import { Panel, Stat, StatRow, Empty, SkeletonRows, Tag } from '@/components/ui/Primitives'
import { RulesBadge } from '@/components/trade/RulesChecklist'
import { TradeDetail } from '@/components/trade/TradeDetail'
import type { ShellContext } from '@/components/layout/Shell'

// ─────────────────────────────────────────────────────────────────────────────
// The desk: what you need to know in five seconds, with everything drillable.
//
// Reading order is deliberate — open positions first (they're the only thing
// you can still act on), then the account line, then the equity curve, then
// the diagnostic panels.
// ─────────────────────────────────────────────────────────────────────────────

export function Desk() {
  const { profile } = useAuth()
  const { trades, stats, loading } = useTrades()
  const { holdings } = useHoldings()
  const { quotes } = useQuotes(holdings.map((h) => h.code))
  const { openLogTrade, openCsvImport } = useOutletContext<ShellContext>()
  const [selected, setSelected] = useState<Trade | null>(null)

  const open = useMemo(() => trades.filter((t) => t.status === 'open'), [trades])
  const recent = useMemo(
    () => trades.filter((t) => t.status === 'closed').slice(0, 8),
    [trades]
  )

  const byPair = useMemo(() => groupPerformance(trades, (t) => t.ticker || null), [trades])

  // Rule adherence versus outcome — the comparison the journal exists for.
  const adherence = useMemo(() => {
    const closed = trades.filter((t) => t.status === 'closed')
    const scored = closed.map((t) => ({ t, s: ruleScore(t.rules) }))
    const clean = scored.filter((x) => x.s.answered > 0 && x.s.broken.length === 0)
    const broken = scored.filter((x) => x.s.broken.length > 0)
    const unanswered = scored.length - clean.length - broken.length

    const avgR = (list: typeof scored) => {
      const rs = list.map((x) => x.t.rMultiple).filter((r): r is number => r !== null)
      return rs.length ? round(rs.reduce((s, r) => s + r, 0) / rs.length, 2) : null
    }
    const winRate = (list: typeof scored) =>
      list.length ? round((list.filter((x) => x.t.outcome === 'win').length / list.length) * 100, 0) : null

    return {
      clean: { n: clean.length, avgR: avgR(clean), winRate: winRate(clean) },
      broken: { n: broken.length, avgR: avgR(broken), winRate: winRate(broken) },
      unanswered,
      // Below this the two groups can't be meaningfully compared.
      sufficient: clean.length >= 5 && broken.length >= 5,
    }
  }, [trades])

  const portfolioValue = useMemo(
    () =>
      holdings.reduce((sum, h) => {
        const px = quotes[h.code]?.price
        return sum + (px !== null && px !== undefined ? px * h.units : h.avgCost * h.units)
      }, 0),
    [holdings, quotes]
  )

  const balance = profile?.accountBalance ?? 0
  const start = profile?.startingBalance ?? 0

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="skel h-20" />
        <div className="skel h-56" />
      </div>
    )
  }

  if (!trades.length) {
    return (
      <Panel title="Nothing logged yet">
        <Empty
          title="Log your first trade"
          detail="Screenshot a CMC ticket and the numbers fill themselves in, import your history as CSV, or type it in by hand."
          action={
            <div className="flex gap-2">
              <button onClick={openLogTrade} className="btn-primary">Log a trade</button>
              <button onClick={openCsvImport} className="btn-ghost">Import CSV</button>
            </div>
          }
        />
      </Panel>
    )
  }

  return (
    <div className="space-y-3">

      {/* ── Headline numbers ── */}
      <StatRow cols={6}>
        <Stat
          label="Balance"
          value={fmtMoney(balance, 0)}
          sub={start > 0 ? `${fmtSigned(balance - start, 0)} from ${fmtMoney(start, 0)}` : undefined}
          tone={start > 0 ? (balance >= start ? 'up' : 'down') : 'neutral'}
        />
        <Stat
          label="Realised P&L"
          value={fmtSigned(stats.totalPnl, 0)}
          sub={`${stats.closed} closed`}
          tone={stats.totalPnl >= 0 ? 'up' : 'down'}
        />
        <Stat
          label="Expectancy"
          value={fmtR(stats.expectancy)}
          sub="per trade"
          tone={stats.expectancy >= 0 ? 'up' : 'down'}
          title="Average R-multiple across every closed trade with a recorded risk amount"
        />
        <Stat
          label="Win rate"
          value={fmtPct(stats.winRate, 0)}
          sub={`${stats.wins}W ${stats.losses}L${stats.breakeven ? ` ${stats.breakeven}BE` : ''}`}
          tone={stats.winRate >= 50 ? 'up' : 'neutral'}
        />
        <Stat
          label="Profit factor"
          value={stats.profitFactor === null ? '—' : stats.profitFactor.toFixed(2)}
          sub={stats.profitFactor === null ? 'no losses yet' : 'gross won ÷ lost'}
          tone={stats.profitFactor !== null && stats.profitFactor >= 1 ? 'up' : 'down'}
        />
        <Stat
          label="Max drawdown"
          value={fmtMoney(-stats.maxDrawdown, 0)}
          sub={stats.maxDrawdownPct > 0 ? `${stats.maxDrawdownPct.toFixed(0)}% from peak` : '—'}
          tone={stats.maxDrawdown > 0 ? 'down' : 'neutral'}
        />
      </StatRow>

      {/* ── Open positions ── */}
      {open.length > 0 && (
        <Panel
          title={`Open — ${open.length}`}
          bodyClass=""
          action={<span className="text-2xs text-ink-500">Click to close out</span>}
        >
          <table className="tbl">
            <thead>
              <tr>
                <th>Pair</th>
                <th>Dir</th>
                <th>Opened</th>
                <th className="num">Entry</th>
                <th className="num">Stop</th>
                <th className="num">Risk</th>
                <th>Rules</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {open.map((t) => (
                <tr key={t.id} onClick={() => setSelected(t)} className="cursor-pointer">
                  <td className="font-mono text-ink-50 font-medium">{t.ticker}</td>
                  <td className={t.direction === 'long' ? 'text-up' : 'text-down'}>
                    {t.direction === 'long' ? 'LONG' : 'SHORT'}
                  </td>
                  <td className="font-mono text-ink-300">{fmtDate(t.tradeDate)}</td>
                  <td className="num text-ink-100">{t.entryPrice ?? '—'}</td>
                  <td className="num text-ink-300">{t.finalStopLoss ?? t.stopLoss ?? '—'}</td>
                  <td className="num text-ink-300">{t.riskAmount !== null ? fmtMoney(t.riskAmount, 0) : '—'}</td>
                  <td><RulesBadge rules={t.rules} /></td>
                  <td className="text-right text-ink-600">›</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {/* ── Equity + adherence ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Panel
          className="lg:col-span-2"
          title="Equity"
          action={
            <span className="font-mono text-2xs text-ink-400">
              {stats.closed} trades · {fmtSigned(stats.totalPnl, 0)}
            </span>
          }
        >
          <EquityChart trades={trades} startingBalance={start} height={230} />
        </Panel>

        <Panel title="Rules vs outcome">
          {adherence.clean.n === 0 && adherence.broken.n === 0 ? (
            <p className="text-2xs text-ink-400 leading-relaxed">
              No closed trade has its rules recorded yet. Fill them in on a few trades
              and this compares what following your own rules is actually worth.
            </p>
          ) : (
            <div className="space-y-3">
              {([
                ['Followed all', adherence.clean, 'up'],
                ['Broke ≥1 rule', adherence.broken, 'down'],
              ] as const).map(([label, group, tone]) => (
                <div key={label}>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-2xs uppercase tracking-label text-ink-400">{label}</span>
                    <span className="font-mono text-2xs text-ink-500">n={group.n}</span>
                  </div>
                  <div className="flex items-baseline gap-3 font-mono">
                    <span className={`text-base ${tone === 'up' ? 'text-up' : 'text-down'}`}>
                      {group.avgR === null ? '—' : fmtR(group.avgR)}
                    </span>
                    <span className="text-2xs text-ink-400">
                      {group.winRate === null ? '' : `${group.winRate}% win`}
                    </span>
                  </div>
                </div>
              ))}

              <p className="hint pt-1 border-t border-ink-700">
                {adherence.sufficient
                  ? adherence.clean.avgR !== null && adherence.broken.avgR !== null
                    ? adherence.clean.avgR > adherence.broken.avgR
                      ? `Following your rules is worth ${fmtR(adherence.clean.avgR - adherence.broken.avgR)} per trade.`
                      : 'Rule-following is not outperforming here — worth a closer look in Analysis.'
                    : ''
                  : `Too few in one group to compare — needs 5+ on both sides.${
                      adherence.unanswered ? ` ${adherence.unanswered} closed trades have no rules recorded.` : ''
                    }`}
              </p>
            </div>
          )}
        </Panel>
      </div>

      {/* ── Recent + pairs + ASX ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Panel
          className="lg:col-span-2"
          title="Recent"
          bodyClass=""
          action={<Link to="/trades" className="text-2xs text-ink-400 hover:text-brass-bright">All trades ›</Link>}
        >
          {recent.length === 0 ? (
            <SkeletonRows rows={3} />
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Pair</th>
                  <th>Dir</th>
                  <th>Rules</th>
                  <th className="num">R</th>
                  <th className="num">P&L</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {recent.map((t) => (
                  <tr key={t.id} onClick={() => setSelected(t)} className="cursor-pointer">
                    <td className="font-mono text-ink-400">{fmtDate(t.exitDate ?? t.tradeDate)}</td>
                    <td className="font-mono text-ink-50">{t.ticker}</td>
                    <td className={t.direction === 'long' ? 'text-up' : 'text-down'}>
                      {t.direction === 'long' ? 'L' : 'S'}
                    </td>
                    <td><RulesBadge rules={t.rules} /></td>
                    <td className={`num ${valueClass(t.rMultiple)}`}>{fmtR(t.rMultiple)}</td>
                    <td className={`num ${valueClass(t.pnl)}`}>{fmtMoney(t.pnl)}</td>
                    <td>
                      <Tag tone={t.outcome === 'win' ? 'up' : t.outcome === 'loss' ? 'down' : 'neutral'}>
                        {t.outcome ?? '—'}
                      </Tag>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <div className="space-y-3">
          <Panel title="By pair">
            <div className="max-h-52 overflow-y-auto">
              {byPair.length === 0 ? (
                <p className="text-2xs text-ink-500">No closed trades.</p>
              ) : (
                <div className="divide-y divide-ink-800">
                  {byPair.slice(0, 6).map((row) => (
                    <div
                      key={row.key}
                      className={`flex items-center justify-between py-1.5 ${row.count < 5 ? 'opacity-50' : ''}`}
                    >
                      <span className="font-mono text-2xs text-ink-100">{row.key}</span>
                      <div className="flex items-center gap-3 font-mono text-2xs">
                        <span className="text-ink-500">{row.count}</span>
                        <span className={valueClass(row.avgR)}>{fmtR(row.avgR)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Link to="/analysis" className="text-2xs text-ink-400 hover:text-brass-bright mt-2 inline-block">
              Full breakdown ›
            </Link>
          </Panel>

          <Panel
            title="ASX"
            action={<Link to="/portfolio" className="text-2xs text-ink-400 hover:text-brass-bright">Manage ›</Link>}
          >
            {holdings.length === 0 ? (
              <p className="text-2xs text-ink-500 leading-relaxed">
                No holdings yet. Long-term ASX positions live here, separate from trading.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between font-mono">
                  <span className="text-2xs uppercase tracking-label text-ink-400">Value</span>
                  <span className="text-base text-ink-50">{fmtMoney(portfolioValue, 0)}</span>
                </div>
                <div className="divide-y divide-ink-800">
                  {holdings.slice(0, 4).map((h) => {
                    const q = quotes[h.code]
                    const value = (q?.price ?? h.avgCost) * h.units
                    const gain = value - h.avgCost * h.units
                    return (
                      <div key={h.id} className="flex items-center justify-between py-1.5 font-mono text-2xs">
                        <span className="text-ink-100">{h.code}</span>
                        <span className={valueClass(gain)}>{fmtSigned(gain, 0)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>

      {/* Broken-rule tally — a standing prompt, not a chart */}
      {(() => {
        const counts = RULES.map((r) => ({
          rule: r,
          n: trades.filter((t) => t.rules[r.key] === false).length,
        })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n)

        if (!counts.length) return null
        return (
          <Panel title="Most broken rules">
            <div className="flex flex-wrap gap-x-6 gap-y-1.5">
              {counts.map(({ rule, n }) => (
                <span key={rule.key} className="flex items-baseline gap-2 text-2xs">
                  <span className="font-mono text-down">{n}×</span>
                  <span className="text-ink-200">{rule.label}</span>
                </span>
              ))}
            </div>
          </Panel>
        )
      })()}

      <TradeDetail trade={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
