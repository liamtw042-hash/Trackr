import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '@/store/AuthContext'
import { useTrades } from '@/store/TradeContext'
import { findPatterns, aiConfigured, MIN_TRADES_FOR_PATTERNS, type PatternReport } from '@/lib/ai'
import { groupPerformance, fmtR, fmtMoney, fmtPct, round, valueClass } from '@/lib/calc'
import { RULES, MISTAKE_LABELS, EMOTIONS, ruleScore } from '@/types'
import { EquityChart, RDistribution, PerformanceBars } from '@/components/charts/Charts'
import { Panel, Stat, StatRow, Spinner, Empty, Tag } from '@/components/ui/Primitives'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function Analysis() {
  const { profile } = useAuth()
  const { trades, stats } = useTrades()
  const [report, setReport] = useState<PatternReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [metric, setMetric] = useState<'avgR' | 'pnl'>('avgR')

  const closed = useMemo(() => trades.filter((t) => t.status === 'closed'), [trades])

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
      <Panel title="Analysis">
        <Empty
          title="Nothing to analyse yet"
          detail="Close a few trades and this fills with performance by pair, setup, day and rule adherence."
        />
      </Panel>
    )
  }

  return (
    <div className="space-y-3">

      <StatRow cols={6}>
        <Stat label="Closed" value={stats.closed} sub={`${stats.open} open`} />
        <Stat label="Expectancy" value={fmtR(stats.expectancy)} sub="per trade" tone={stats.expectancy >= 0 ? 'up' : 'down'} />
        <Stat label="Profit factor" value={stats.profitFactor?.toFixed(2) ?? '—'} tone={stats.profitFactor !== null && stats.profitFactor >= 1 ? 'up' : 'down'} />
        <Stat label="Avg win" value={fmtMoney(stats.avgWin, 0)} sub={`avg loss ${fmtMoney(-stats.avgLoss, 0)}`} tone="up" />
        <Stat label="Gross" value={fmtMoney(stats.grossProfit, 0)} sub={`lost ${fmtMoney(stats.grossLoss, 0)}`} tone="up" />
        <Stat label="Max DD" value={fmtMoney(-stats.maxDrawdown, 0)} sub={fmtPct(stats.maxDrawdownPct, 0)} tone="down" />
      </StatRow>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Panel className="lg:col-span-2" title="Equity">
          <EquityChart trades={trades} startingBalance={profile?.startingBalance ?? 0} height={220} />
        </Panel>
        <Panel
          title="R distribution"
          action={<span className="text-2xs text-ink-500">where outcomes land</span>}
        >
          <RDistribution trades={trades} height={220} />
        </Panel>
      </div>

      {/* ── Rule impact — the core question ── */}
      <Panel
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
      </Panel>

      {/* ── Breakdowns ── */}
      <div className="flex items-center gap-2">
        <span className="label mb-0">Measure by</span>
        <div className="flex border border-ink-700 divide-x divide-ink-700">
          {(['avgR', 'pnl'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`px-2.5 py-1 text-2xs transition-colors ${
                metric === m ? 'bg-brass/15 text-brass-bright' : 'text-ink-400 hover:text-ink-100 hover:bg-ink-800'
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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <Panel title="By pair"><PerformanceBars rows={byPair} metric={metric} /></Panel>
        <Panel title="By direction"><PerformanceBars rows={byDirection} metric={metric} /></Panel>
        <Panel title="By day"><PerformanceBars rows={byDay} metric={metric} /></Panel>
        <Panel title="By setup"><PerformanceBars rows={bySetup} metric={metric} /></Panel>
        <Panel title="By state at entry"><PerformanceBars rows={byEmotion} metric={metric} /></Panel>

        <Panel title="Mistakes">
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
        </Panel>
      </div>

      {/* ── AI patterns ── */}
      <Panel
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
                  className="h-full bg-brass"
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
            Needs <code className="text-brass-bright">VITE_ANTHROPIC_API_KEY</code> in your .env.
          </p>
        ) : !report ? (
          <p className="text-xs text-ink-300 leading-relaxed">
            Compares your winners against your losers across pair, direction, timing,
            state and rule adherence — and says which differences are real and which
            are still too thin to call.
          </p>
        ) : (
          <div className="space-y-3">
            {report.headline && (
              <p className="text-sm text-ink-50 leading-snug border-l-2 border-brass pl-2.5">
                {report.headline}
              </p>
            )}

            {report.findings.map((f, i) => (
              <div key={i} className="border border-ink-700">
                <div className="px-2.5 py-1.5 bg-ink-850 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-ink-50">{f.title}</span>
                  <Tag tone={f.confidence === 'strong' ? 'up' : 'neutral'}>
                    {f.confidence}
                  </Tag>
                </div>
                <p className="px-2.5 py-2 text-xs text-ink-200 leading-relaxed">{f.detail}</p>
              </div>
            ))}

            {report.notEnoughData.length > 0 && (
              <div className="border border-ink-700">
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
      </Panel>
    </div>
  )
}
