import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '@/store/AuthContext'
import { useTrades } from '@/store/TradeContext'
import { findPatterns, aiConfigured, MIN_TRADES_FOR_PATTERNS, type PatternReport } from '@/lib/ai'
import { groupPerformance, fmtR, fmtMoney, fmtPct, round, valueClass } from '@/lib/calc'
import { afterLoss, holdTimes, fmtDuration } from '@/lib/edge'
import { RULES, MISTAKE_LABELS, EMOTIONS, ruleScore } from '@/types'
import { EquityChart, RDistribution, PerformanceBars } from '@/components/charts/Charts'
import { Section, Stat, StatRow, Spinner, Empty, Tag } from '@/components/ui/Primitives'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function Analysis() {
  const { profile } = useAuth()
  const { trades, stats } = useTrades()
  const [report, setReport] = useState<PatternReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [metric, setMetric] = useState<'avgR' | 'pnl'>('avgR')

  const closed = useMemo(() => trades.filter((t) => t.status === 'closed'), [trades])
  const tilt = useMemo(() => afterLoss(trades), [trades])
  const hold = useMemo(() => holdTimes(trades), [trades])

  const byPair = useMemo(() => groupPerformance(trades, (t) => t.ticker || null), [trades])
  const bySetup = useMemo(() => groupPerformance(trades, (t) => t.setupType || null), [trades])
  const byDirection = useMemo(
    () => groupPerformance(trades, (t) => (t.direction === 'long' ? 'Long' : 'Short')),
    [trades]
  )
  const byDay = useMemo(
    () => groupPerformance(trades, (t) => {
      const d = new Date(t.tradeDate)
      return Number.isNaN(d.getTime()) ? null : DAYS[d.getDay()]
    }),
    [trades]
  )
  const byEmotion = useMemo(
    () => groupPerformance(trades, (t) => {
      const e = EMOTIONS.find((x) => x.value === t.emotion)
      return e ? e.label : null
    }),
    [trades]
  )

  /** Per-rule: what happens when this specific rule is followed versus broken. */
  const ruleImpact = useMemo(() => {
    return RULES.map((rule) => {
      const followed = closed.filter((t) => t.rules[rule.key] === true)
      const broken = closed.filter((t) => t.rules[rule.key] === false)

      const avgR = (list: typeof closed) => {
        const rs = list.map((t) => t.rMultiple).filter((r): r is number => r !== null)
        return rs.length ? round(rs.reduce((s, r) => s + r, 0) / rs.length, 2) : null
      }

      return {
        rule,
        followedN: followed.length,
        brokenN: broken.length,
        followedR: avgR(followed),
        brokenR: avgR(broken),
        // Both sides need real numbers before a difference means anything.
        comparable: followed.length >= 5 && broken.length >= 5,
      }
    })
  }, [closed])

  const byMistake = useMemo(() => {
    const counts = new Map<string, { n: number; pnl: number }>()
    for (const t of closed) {
      if (!t.mistake) continue
      const prev = counts.get(t.mistake) ?? { n: 0, pnl: 0 }
      counts.set(t.mistake, { n: prev.n + 1, pnl: prev.pnl + (t.pnl ?? 0) })
    }
    return [...counts.entries()]
      .map(([k, v]) => ({ label: MISTAKE_LABELS[k] ?? k, ...v }))
      .sort((a, b) => b.n - a.n)
  }, [closed])

  const rulesRecorded = useMemo(
    () => closed.filter((t) => ruleScore(t.rules).answered > 0).length,
    [closed]
  )

  const runPatterns = async () => {
    setBusy(true)
    try {
      setReport(await findPatterns(trades, profile))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setBusy(false)
    }
  }

  if (!closed.length) {
    return (
      <Section title="Analysis">
        <Empty
          title="Nothing to analyse yet"
          detail="Close a few trades and this fills with performance by pair, setup, day and rule adherence."
        />
      </Section>
    )
  }

  return (
    <div className="space-y-section">

      <StatRow cols={6}>
        <Stat label="Closed" value={stats.closed} sub={`${stats.open} open`} />
        <Stat label="Expectancy" value={fmtR(stats.expectancy)} sub="per trade" tone={stats.expectancy >= 0 ? 'up' : 'down'} />
        <Stat label="Profit factor" value={stats.profitFactor?.toFixed(2) ?? '—'} tone={stats.profitFactor !== null && stats.profitFactor >= 1 ? 'up' : 'down'} />
        <Stat label="Avg win" value={fmtMoney(stats.avgWin, 0)} sub={`avg loss ${fmtMoney(-stats.avgLoss, 0)}`} tone="up" />
        <Stat label="Gross" value={fmtMoney(stats.grossProfit, 0)} sub={`lost ${fmtMoney(stats.grossLoss, 0)}`} tone="up" />
        <Stat label="Max DD" value={fmtMoney(-stats.maxDrawdown, 0)} sub={fmtPct(stats.maxDrawdownPct, 0)} tone="down" />
      </StatRow>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-10 gap-y-section">
        <Section className="lg:col-span-2" title="Equity">
          <EquityChart trades={trades} startingBalance={profile?.startingBalance ?? 0} height={220} />
        </Section>
        <Section
          title="R distribution"
          action={<span className="text-2xs text-ink-500">where outcomes land</span>}
        >
          <RDistribution trades={trades} height={220} />
        </Section>
      </div>

      {/* ── Rule impact — the core question ── */}
      <Section
        title="What each rule is worth"
        action={
          <span className="text-2xs text-ink-500">
            {rulesRecorded} of {closed.length} closed trades have rules recorded
          </span>
        }
      >
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Rule</th>
                <th className="num">Followed</th>
                <th className="num">Avg R</th>
                <th className="num">Broken</th>
                <th className="num">Avg R</th>
                <th className="num">Difference</th>
              </tr>
            </thead>
            <tbody>
              {ruleImpact.map((r) => {
                const diff =
                  r.comparable && r.followedR !== null && r.brokenR !== null
                    ? round(r.followedR - r.brokenR, 2)
                    : null
                return (
                  <tr key={r.rule.key}>
                    <td className="text-ink-100">{r.rule.label}</td>
                    <td className="num text-ink-300">{r.followedN || '—'}</td>
                    <td className={`num ${valueClass(r.followedR)}`}>
                      {r.followedR === null ? '—' : fmtR(r.followedR)}
                    </td>
                    <td className="num text-ink-300">{r.brokenN || '—'}</td>
                    <td className={`num ${valueClass(r.brokenR)}`}>
                      {r.brokenR === null ? '—' : fmtR(r.brokenR)}
                    </td>
                    <td className="num">
                      {diff === null ? (
                        <span className="text-ink-600" title="Needs 5+ trades on both sides to compare">
                          too few
                        </span>
                      ) : (
                        <span className={valueClass(diff)}>{fmtR(diff)}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="hint mt-2">
          "Too few" means one side has under five trades — a difference drawn from
          less than that is noise, and showing it as a finding would be misleading.
        </p>
      </Section>

      {/* ── Breakdowns ── */}
      <div className="flex items-center gap-2">
        <span className="label mb-0">Measure by</span>
        <div className="flex surface divide-x divide-ink-800">
          {(['avgR', 'pnl'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`px-2.5 py-1 text-2xs transition-colors ${
                metric === m ? 'bg-azure/15 text-azure-bright' : 'text-ink-400 hover:text-ink-100 hover:bg-ink-800'
              }`}
            >
              {m === 'avgR' ? 'Avg R' : 'P&L'}
            </button>
          ))}
        </div>
        <span className="text-2xs text-ink-500">
          Columns: name · trades · {metric === 'avgR' ? 'avg R' : 'P&L'} · win rate
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-10 gap-y-section">
        <Section title="By pair"><PerformanceBars rows={byPair} metric={metric} /></Section>
        <Section title="By direction"><PerformanceBars rows={byDirection} metric={metric} /></Section>
        <Section title="By day"><PerformanceBars rows={byDay} metric={metric} /></Section>
        <Section title="By setup"><PerformanceBars rows={bySetup} metric={metric} /></Section>
        <Section title="By state at entry"><PerformanceBars rows={byEmotion} metric={metric} /></Section>

        <Section title="Mistakes">
          {byMistake.length === 0 ? (
            <p className="text-2xs text-ink-500">None flagged.</p>
          ) : (
            <div className="divide-y divide-ink-800">
              {byMistake.map((m) => (
                <div key={m.label} className="flex items-center justify-between py-1.5">
                  <span className="text-2xs text-ink-100">{m.label}</span>
                  <div className="flex items-center gap-3 font-mono text-2xs">
                    <span className="text-ink-500">{m.n}×</span>
                    <span className={valueClass(m.pnl)}>{fmtMoney(m.pnl, 0)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* ── After a loss: the cheapest available revenge-trading check ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-section">
        <Section title="The trade after a loss">
          {!tilt.comparable ? (
            <p className="text-xs text-ink-400 leading-relaxed">
              {tilt.n} trade{tilt.n === 1 ? '' : 's'} so far followed directly after a
              loss. Needs at least eight before the comparison says anything.
            </p>
          ) : (
            <div className="space-y-section">
              <div className="grid grid-cols-2 gap-x-6">
                <div>
                  <div className="text-2xs uppercase tracking-label text-azure-dim mb-1.5">After a loss</div>
                  <div className={`font-mono text-figure ${valueClass(tilt.avgR)}`}>{fmtR(tilt.avgR)}</div>
                  <div className="text-2xs text-ink-500 mt-1">n={tilt.n}</div>
                </div>
                <div>
                  <div className="text-2xs uppercase tracking-label text-azure-dim mb-1.5">All trades</div>
                  <div className={`font-mono text-figure ${valueClass(tilt.baselineR)}`}>{fmtR(tilt.baselineR)}</div>
                  <div className="text-2xs text-ink-500 mt-1">n={closed.length}</div>
                </div>
              </div>
              <p className="text-2xs text-ink-300 leading-relaxed">
                {tilt.avgR !== null && tilt.baselineR !== null && tilt.avgR < tilt.baselineR - 0.3 ? (
                  <span className="text-down">
                    Trades taken straight after a loss run materially worse than your
                    average. That gap is what revenge trading looks like in the data.
                  </span>
                ) : (
                  <>No meaningful drop-off after a loss on this sample.</>
                )}
              </p>
            </div>
          )}
        </Section>

        <Section title="Hold time">
          {hold.winnersMedianHours === null && hold.losersMedianHours === null ? (
            <p className="text-xs text-ink-400 leading-relaxed">
              No closed trade has both an open and a close time recorded.
            </p>
          ) : (
            <div className="space-y-section">
              <div className="grid grid-cols-2 gap-x-6">
                <div>
                  <div className="text-2xs uppercase tracking-label text-azure-dim mb-1.5">Winners held</div>
                  <div className="font-mono text-figure text-up">{fmtDuration(hold.winnersMedianHours)}</div>
                  <div className="text-2xs text-ink-500 mt-1">median · n={hold.winnersN}</div>
                </div>
                <div>
                  <div className="text-2xs uppercase tracking-label text-azure-dim mb-1.5">Losers held</div>
                  <div className="font-mono text-figure text-down">{fmtDuration(hold.losersMedianHours)}</div>
                  <div className="text-2xs text-ink-500 mt-1">median · n={hold.losersN}</div>
                </div>
              </div>
              {hold.longest.length > 0 && (
                <div className="space-y-1 pt-1">
                  <div className="sub-label mb-1.5">Longest held</div>
                  {hold.longest.map(({ trade: t, hours }) => (
                    <div key={t.id} className="flex items-baseline justify-between font-mono text-2xs">
                      <span className="text-ink-200">{t.ticker}</span>
                      <span className="flex items-baseline gap-x-10 gap-y-section">
                        <span className="text-ink-500">{fmtDuration(hours)}</span>
                        <span className={valueClass(t.rMultiple)}>{fmtR(t.rMultiple)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Section>
      </div>

      {/* ── AI patterns ── */}
      <Section
        title="Pattern analysis"
        action={
          closed.length >= MIN_TRADES_FOR_PATTERNS && aiConfigured() ? (
            <button onClick={() => void runPatterns()} disabled={busy} className="btn-ghost btn-sm">
              {busy ? <><Spinner /> Analysing…</> : report ? 'Re-run' : 'Run analysis'}
            </button>
          ) : null
        }
      >
        {closed.length < MIN_TRADES_FOR_PATTERNS ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1 bg-ink-800">
                <div
                  className="h-full bg-azure"
                  style={{ width: `${Math.min(100, (closed.length / MIN_TRADES_FOR_PATTERNS) * 100)}%` }}
                />
              </div>
              <span className="font-mono text-2xs text-ink-300 shrink-0">
                {closed.length}/{MIN_TRADES_FOR_PATTERNS}
              </span>
            </div>
            <p className="text-xs text-ink-200 leading-relaxed">
              Cross-trade pattern analysis unlocks at {MIN_TRADES_FOR_PATTERNS} closed trades —
              {' '}{MIN_TRADES_FOR_PATTERNS - closed.length} to go.
            </p>
            <p className="hint">
              Below that, any "pattern" found is almost certainly noise: with ten trades,
              a subgroup of three winners looks identical to a real edge. The tables above
              still work now, with sample sizes shown so you can judge them yourself.
            </p>
          </div>
        ) : !aiConfigured() ? (
          <p className="hint">
            Needs <code className="text-azure-bright">VITE_ANTHROPIC_API_KEY</code> in your .env.
          </p>
        ) : !report ? (
          <p className="text-xs text-ink-300 leading-relaxed">
            Compares your winners against your losers across pair, direction, timing,
            state and rule adherence — and says which differences are real and which
            are still too thin to call.
          </p>
        ) : (
          <div className="space-y-section">
            {report.headline && (
              <p className="text-sm text-ink-50 leading-snug border-l-2 border-azure pl-2.5">
                {report.headline}
              </p>
            )}

            {report.findings.map((f, i) => (
              <div key={i} className="surface">
                <div className="px-2.5 py-1.5 bg-ink-850/60 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-ink-50">{f.title}</span>
                  <Tag tone={f.confidence === 'strong' ? 'up' : 'neutral'}>
                    {f.confidence}
                  </Tag>
                </div>
                <p className="px-2.5 py-2 text-xs text-ink-200 leading-relaxed">{f.detail}</p>
              </div>
            ))}

            {report.notEnoughData.length > 0 && (
              <div className="surface">
                <div className="px-2.5 py-1.5 bg-ink-850 text-2xs uppercase tracking-label text-ink-400">
                  Can't answer yet
                </div>
                <ul className="px-2.5 py-2 space-y-1">
                  {report.notEnoughData.map((q, i) => (
                    <li key={i} className="text-xs text-ink-300 leading-relaxed flex gap-1.5">
                      <span className="text-ink-600 shrink-0">·</span>{q}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Section>
    </div>
  )
}
