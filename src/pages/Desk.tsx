import { useMemo, useState } from 'react'
import { useOutletContext, Link } from 'react-router-dom'
import { useAuth } from '@/store/AuthContext'
import { useTrades } from '@/store/TradeContext'
import { useHoldings } from '@/store/HoldingsContext'
import { useQuotes } from '@/hooks/useQuotes'
import {
  fmtMoney, fmtSigned, fmtR, fmtDate, valueClass, groupPerformance,
} from '@/lib/calc'
import { estimateEdge, completeness, holdTimes, fmtDuration, ruleCosts } from '@/lib/edge'
import { RULES, type Trade } from '@/types'
import { EquityChart } from '@/components/charts/Charts'
import {
  Section, Stat, HeroStat, StatRow, Empty, Tag, MiniBar,
} from '@/components/ui/Primitives'
import { RulesBadge } from '@/components/trade/RulesChecklist'
import { TradeDetail } from '@/components/trade/TradeDetail'
import type { ShellContext } from '@/components/layout/Shell'

// ─────────────────────────────────────────────────────────────────────────────
// The desk.
//
// Reading order is deliberate and the visual weight follows it:
//
//   1. Do I have an edge?      — hero figure, largest thing on the page
//   2. What's still open?      — the only thing I can still act on
//   3. What's the curve doing? — hero surface
//   4. Everything else         — boxless regions, quiet, drillable
//
// Panels are deliberately unequal in size and treatment. Filling a uniform grid
// with identically-bordered cards is what made the previous version read as a
// wireframe rather than a designed page.
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
    () => trades.filter((t) => t.status === 'closed').slice(0, 7),
    [trades]
  )
  const byPair = useMemo(() => groupPerformance(trades, (t) => t.ticker || null), [trades])

  const edge = useMemo(() => estimateEdge(trades), [trades])
  const gaps = useMemo(() => completeness(trades), [trades])
  const hold = useMemo(() => holdTimes(trades), [trades])
  const costs = useMemo(() => ruleCosts(trades), [trades])

  const anyDollarFigure = useMemo(
    () => costs.some((c) => c.comparable && c.costOfBreaking !== null),
    [costs]
  )

  const portfolioValue = useMemo(
    () =>
      holdings.reduce((sum, h) => {
        const px = quotes[h.code]?.price
        return sum + (px ?? h.avgCost) * h.units
      }, 0),
    [holdings, quotes]
  )

  const balance = profile?.accountBalance ?? 0
  const start = profile?.startingBalance ?? 0
  const peakPairR = Math.max(...byPair.map((p) => Math.abs(p.avgR)), 0.001)

  if (loading) {
    return (
      <div className="space-y-section">
        <div className="skel h-28" />
        <div className="skel h-72" />
      </div>
    )
  }

  if (!trades.length) {
    return (
      <Section title="Trackr" tier="hero">
        <Empty
          title="Nothing logged yet"
          detail="Screenshot a CMC ticket and the numbers fill themselves in, import your history as CSV, or type it in by hand."
          action={
            <div className="flex gap-2">
              <button onClick={openLogTrade} className="btn-primary">Log a trade</button>
              <button onClick={openCsvImport} className="btn-ghost">Import CSV</button>
            </div>
          }
        />
      </Section>
    )
  }

  return (
    <div className="space-y-section">

      {/* ══ 1. THE EDGE QUESTION ═══════════════════════════════════════════════
          Largest element on the page, because it's the thing he most wants to
          know and the thing most easily got wrong by reading a point estimate. */}
      <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_1fr] gap-8 lg:gap-10 items-start">
        <div className="space-y-6">
          <HeroStat
            label="Expectancy"
            value={fmtR(edge.mean)}
            tone={edge.tooFew ? 'neutral' : edge.positive ? 'up' : edge.inconclusive ? 'azure' : 'down'}
            sub={
              edge.tooFew ? (
                <>
                  {edge.n} closed trade{edge.n === 1 ? '' : 's'} with a recorded risk —
                  {' '}{edge.tradesNeeded} more before this means anything.
                </>
              ) : (
                <>
                  95% range <span className="font-mono text-ink-300">{fmtR(edge.lower)}</span> to{' '}
                  <span className="font-mono text-ink-300">{fmtR(edge.upper)}</span> over {edge.n} trades
                </>
              )
            }
          />

          {/* The honest verdict, not the flattering one. */}
          {!edge.tooFew && (
            <p className="edge-note text-xs text-ink-200 leading-relaxed">
              {edge.positive ? (
                <>
                  The whole range sits above zero — on this sample the edge looks real.
                  It is still {edge.n} trades, so treat the size of the edge as rough.
                </>
              ) : edge.upper < 0 ? (
                <>
                  The whole range sits below zero. On this sample the strategy is losing
                  money, and that is unlikely to be bad luck alone.
                </>
              ) : (
                <>
                  The range spans zero, so break-even is still a plausible explanation of
                  these results — a positive average over {edge.n} trades is not yet
                  evidence of an edge.
                  {edge.tradesNeeded !== null && (
                    <> Roughly {edge.tradesNeeded} more trades at this rate would separate them.</>
                  )}
                </>
              )}
            </p>
          )}

          <StatRow cols={2}>
            <Stat
              label="Balance"
              value={fmtMoney(balance, 0)}
              sub={start > 0 ? `${fmtSigned(balance - start, 0)} from ${fmtMoney(start, 0)}` : undefined}
              tone={start > 0 ? (balance >= start ? 'up' : 'down') : 'neutral'}
            />
            <Stat
              label="Realised"
              value={fmtSigned(stats.totalPnl, 0)}
              sub={`${stats.closed} closed · ${stats.open} open`}
              tone={stats.totalPnl >= 0 ? 'up' : 'down'}
            />
          </StatRow>
        </div>

        <Section
          title="Equity"
          meta={`${stats.closed} trades · ${fmtSigned(stats.totalPnl, 0)}`}
          tier="hero"
        >
          <EquityChart trades={trades} startingBalance={start} height={252} />
        </Section>
      </section>

      {/* ══ 2. OPEN — the only actionable thing ═══════════════════════════════ */}
      {open.length > 0 && (
        <Section
          title="Open"
          meta={`${open.length} position${open.length === 1 ? '' : 's'} · ${fmtMoney(
            open.reduce((s, t) => s + (t.riskAmount ?? 0), 0), 0
          )} at risk`}
          tier="surface"
          bodyClass=""
        >
          <table className="tbl">
            <thead>
              <tr>
                <th>Pair</th>
                <th>Dir</th>
                <th>Opened</th>
                <th>Held</th>
                <th className="num">Entry</th>
                <th className="num">Stop</th>
                <th className="num">Risk</th>
                <th>Rules</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {open.map((t) => {
                const heldHours = (Date.now() - new Date(t.tradeDate).getTime()) / 3_600_000
                return (
                  <tr key={t.id} onClick={() => setSelected(t)} className="cursor-pointer">
                    <td className="font-mono text-ink-50 font-medium">{t.ticker}</td>
                    <td className={t.direction === 'long' ? 'text-up' : 'text-down'}>
                      {t.direction === 'long' ? 'LONG' : 'SHORT'}
                    </td>
                    <td className="font-mono text-ink-400">{fmtDate(t.tradeDate)}</td>
                    <td className="font-mono text-ink-300">{fmtDuration(heldHours)}</td>
                    <td className="num text-ink-100">{t.entryPrice ?? '—'}</td>
                    <td className="num text-ink-300">{t.finalStopLoss ?? t.stopLoss ?? '—'}</td>
                    <td className="num text-ink-300">
                      {t.riskAmount !== null ? fmtMoney(t.riskAmount, 0) : '—'}
                    </td>
                    <td><RulesBadge rules={t.rules} /></td>
                    <td className="text-right text-ink-600">›</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Section>
      )}

      {/* ══ 3. WHAT THE JOURNAL CAN'T ANSWER YET ══════════════════════════════
          Only appears when there's a real gap. A closed trade with no rules
          recorded is invisible to every rule comparison, and without saying so
          the analysis looks equally authoritative on 8 trades as on 29. */}
      {gaps.missingRules.length > 0 && (
        <section className="flex flex-wrap items-center gap-x-5 gap-y-2 py-3 px-4 rounded-md bg-azure-wash">
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono text-figure text-azure-bright">
              {gaps.missingRules.length}
            </span>
            <span className="text-xs text-ink-200">
              closed trade{gaps.missingRules.length === 1 ? '' : 's'} with no rules recorded
            </span>
          </div>
          <div className="flex-1 min-w-[8rem] max-w-xs">
            <MiniBar value={gaps.withRules} max={gaps.closed} tone="azure" />
            <span className="text-2xs text-ink-400 mt-1 block">
              {Math.round(gaps.coverage * 100)}% of closed trades feed the rule analysis
            </span>
          </div>
          <Link to="/trades?filter=no-rules" className="btn-primary btn-sm">
            Fill them in
          </Link>
        </section>
      )}

      {/* ══ 4. DIAGNOSTICS — boxless regions, separated by space alone ════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-10 gap-y-section">

        {/* Rule cost — the "does following my rules pay" question, in dollars */}
        <Section
          title="What breaking a rule costs"
          className="lg:col-span-2"
        >
          {costs.every((c) => !c.comparable) ? (
            <p className="text-xs text-ink-400 leading-relaxed max-w-lg">
              Needs at least five trades on each side of a rule before a comparison
              means anything. Record rules on more closed trades and this fills in.
            </p>
          ) : (
            <div className="space-y-3.5">
              {costs.map((c) => {
                const diff =
                  c.comparable && c.followedR !== null && c.brokenR !== null
                    ? c.followedR - c.brokenR
                    : null
                return (
                  <div key={c.rule.key} className="grid grid-cols-[1fr_auto] gap-x-5 items-baseline">
                    <div className="min-w-0">
                      <div className="text-xs text-ink-100 truncate">{c.rule.label}</div>
                      <div className="text-2xs text-ink-500 font-mono mt-0.5">
                        {c.followedN} followed · {c.brokenN} broken
                      </div>
                    </div>
                    <div className="text-right font-mono">
                      {diff === null ? (
                        <span className="text-2xs text-ink-600">too few to compare</span>
                      ) : (
                        <>
                          <div className={`text-xs ${diff > 0 ? 'text-up' : 'text-down'}`}>
                            {fmtR(diff)} <span className="text-ink-500">per trade</span>
                          </div>
                          {c.costOfBreaking !== null && (
                            <div className="text-2xs text-ink-400 mt-0.5">
                              {c.costOfBreaking > 0
                                ? `≈ ${fmtMoney(c.costOfBreaking, 0)} given up`
                                : `≈ ${fmtMoney(-c.costOfBreaking, 0)} gained`}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
              {anyDollarFigure && (
                <p className="hint pt-1">
                  Dollar figures are a counterfactual — those trades valued at your
                  rate when the rule was followed — not a measurement.
                </p>
              )}
            </div>
          )}
        </Section>

        {/* Hold time — the diagnostic a trailing-stop strategy lives or dies on */}
        <Section title="Hold time">
          {hold.winnersMedianHours === null && hold.losersMedianHours === null ? (
            <p className="text-xs text-ink-400 leading-relaxed">
              No closed trade has both an open and a close time recorded yet.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-x-6">
                <div>
                  <div className="text-2xs uppercase tracking-label text-azure-dim mb-1.5">Winners</div>
                  <div className="font-mono text-figure text-up">
                    {fmtDuration(hold.winnersMedianHours)}
                  </div>
                  <div className="text-2xs text-ink-500 mt-1">median · n={hold.winnersN}</div>
                </div>
                <div>
                  <div className="text-2xs uppercase tracking-label text-azure-dim mb-1.5">Losers</div>
                  <div className="font-mono text-figure text-down">
                    {fmtDuration(hold.losersMedianHours)}
                  </div>
                  <div className="text-2xs text-ink-500 mt-1">median · n={hold.losersN}</div>
                </div>
              </div>

              <p className="text-2xs text-ink-300 leading-relaxed">
                {!hold.comparable ? (
                  <>Needs 5+ on both sides before the ratio means much.</>
                ) : hold.ratio !== null && hold.ratio < 1.2 ? (
                  <span className="text-down">
                    Winners are held {hold.ratio.toFixed(1)}× as long as losers. With no
                    fixed target, the trail only pays if winners run considerably
                    further — this suggests they're being cut short.
                  </span>
                ) : (
                  <>
                    Winners run {hold.ratio?.toFixed(1)}× as long as losers, which is what
                    a trailing stop is supposed to produce.
                  </>
                )}
              </p>
            </div>
          )}
        </Section>
      </div>

      {/* ══ 5. RECENT + QUIET SIDEBAR ═════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-10 gap-y-section">
        <Section
          title="Recent"
          className="lg:col-span-2"
          tier="surface"
          bodyClass=""
          action={
            <Link to="/trades" className="text-2xs text-ink-400 hover:text-azure-bright transition-colors">
              All trades ›
            </Link>
          }
        >
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Pair</th>
                <th>Dir</th>
                <th>Held</th>
                <th>Rules</th>
                <th className="num">R</th>
                <th className="num">P&L</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {recent.map((t) => {
                const held = t.exitDate
                  ? (new Date(t.exitDate).getTime() - new Date(t.tradeDate).getTime()) / 3_600_000
                  : null
                return (
                  <tr key={t.id} onClick={() => setSelected(t)} className="cursor-pointer">
                    <td className="font-mono text-ink-400">{fmtDate(t.exitDate ?? t.tradeDate)}</td>
                    <td className="font-mono text-ink-50">{t.ticker}</td>
                    <td className={t.direction === 'long' ? 'text-up' : 'text-down'}>
                      {t.direction === 'long' ? 'L' : 'S'}
                    </td>
                    <td className="font-mono text-ink-400">{fmtDuration(held)}</td>
                    <td><RulesBadge rules={t.rules} /></td>
                    <td className={`num ${valueClass(t.rMultiple)}`}>{fmtR(t.rMultiple)}</td>
                    <td className={`num ${valueClass(t.pnl)}`}>{fmtMoney(t.pnl)}</td>
                    <td>
                      <Tag tone={t.outcome === 'win' ? 'up' : t.outcome === 'loss' ? 'down' : 'neutral'}>
                        {t.outcome ?? '—'}
                      </Tag>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Section>

        <div className="space-y-section">
          <Section
            title="By pair"
            action={
              <Link to="/analysis" className="text-2xs text-ink-400 hover:text-azure-bright transition-colors">
                More ›
              </Link>
            }
          >
            {byPair.length === 0 ? (
              <p className="text-2xs text-ink-500">No closed trades.</p>
            ) : (
              <div className="space-y-2.5">
                {byPair.slice(0, 6).map((row) => (
                  <div key={row.key} className={row.count < 5 ? 'opacity-45' : ''}>
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="font-mono text-2xs text-ink-100">{row.key}</span>
                      <span className="flex items-baseline gap-2 font-mono text-2xs">
                        <span className="text-ink-500">{row.count}</span>
                        <span className={valueClass(row.avgR)}>{fmtR(row.avgR)}</span>
                      </span>
                    </div>
                    <MiniBar
                      value={row.avgR}
                      max={peakPairR}
                      tone={row.avgR >= 0 ? 'up' : 'down'}
                    />
                  </div>
                ))}
                {byPair.some((r) => r.count < 5) && (
                  <p className="hint pt-0.5">Faded rows have under five trades.</p>
                )}
              </div>
            )}
          </Section>

          <Section
            title="ASX"
            meta={holdings.length ? fmtMoney(portfolioValue, 0) : undefined}
            action={
              <Link to="/portfolio" className="text-2xs text-ink-400 hover:text-azure-bright transition-colors">
                Manage ›
              </Link>
            }
          >
            {holdings.length === 0 ? (
              <p className="text-2xs text-ink-500 leading-relaxed">
                No holdings. Long-term ASX positions live here, separate from trading.
              </p>
            ) : (
              <div className="space-y-2">
                {holdings.slice(0, 5).map((h) => {
                  const value = (quotes[h.code]?.price ?? h.avgCost) * h.units
                  const gain = value - h.avgCost * h.units
                  return (
                    <div key={h.id} className="flex items-baseline justify-between font-mono text-2xs">
                      <span className="text-ink-100">{h.code}</span>
                      <span className={valueClass(gain)}>{fmtSigned(gain, 0)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </Section>
        </div>
      </div>

      {/* Broken-rule tally — a flat list, not a chart */}
      {(() => {
        const broken = RULES.map((r) => ({
          rule: r,
          n: trades.filter((t) => t.rules[r.key] === false).length,
        }))
          .filter((x) => x.n > 0)
          .sort((a, b) => b.n - a.n)

        if (!broken.length) return null
        return (
          <Section title="Rules broken">
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              {broken.map(({ rule, n }) => (
                <span key={rule.key} className="flex items-baseline gap-2 text-xs">
                  <span className="font-mono text-down">{n}×</span>
                  <span className="text-ink-300">{rule.label}</span>
                </span>
              ))}
            </div>
          </Section>
        )
      })()}

      <TradeDetail trade={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
