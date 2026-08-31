import { useMemo } from 'react'
import { fmtPct, fmtMoney } from '@/lib/calc'
import { closedRs, simulateRisk, kelly, typicalRiskPercent } from '@/lib/risk'
import { Section } from '@/components/ui/Primitives'
import type { Trade } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Sizing and survival.
//
// The Desk answers "do I have an edge". This answers the other half, which is
// whether the size it is traded at can survive it — a different question with a
// different answer. A real +0.3R edge still ruins an account risking 8% a
// trade, and that ruin is not bad luck, it is arithmetic.
//
// The figures come from resampling his own closed R-multiples, so the shape of
// the distribution is his: the cluster of −1R stop-outs and the thin tail of
// runners, not a tidy bell curve. Every closed-form risk-of-ruin formula
// assumes something much tidier and is wrong in the flattering direction.
//
// Presented as three rows rather than one, because the useful thing is not the
// number at his current size — it is how fast the number moves when the size
// changes. That is the part nobody has an intuition for.
// ─────────────────────────────────────────────────────────────────────────────

const HORIZON = 100
const MIN_TRADES = 15

function Bar({ p }: { p: number }) {
  // Deliberately not green below a threshold. There is no probability of a 20%
  // drawdown that deserves to be coloured "safe", so the scale runs from quiet
  // to loud and never to reassuring.
  const tone = p >= 0.5 ? 'bg-down/80' : p >= 0.2 ? 'bg-down/45' : 'bg-ink-600'
  return (
    <span className="w-14 h-1 rounded-full bg-ink-800/70 overflow-hidden inline-block" aria-hidden="true">
      <span className={`block h-full rounded-full ${tone}`} style={{ width: `${Math.max(p * 100, 1.5)}%` }} />
    </span>
  )
}

export function Survival({ trades, balance }: { trades: Trade[]; balance: number }) {
  const rs = useMemo(() => closedRs(trades), [trades])
  const typical = useMemo(() => typicalRiskPercent(trades), [trades])

  // His actual size, plus half and double it. Anchoring on what he does rather
  // than on round numbers is what makes the middle row mean something.
  const fractions = useMemo(() => {
    const set = new Set([typical / 2, typical, typical * 2].map((p) => Math.round(p * 100) / 100))
    return [...set].sort((a, b) => a - b)
  }, [typical])

  const rows = useMemo(
    () => fractions.map((pct) => ({ pct, out: simulateRisk(rs, pct / 100, HORIZON) })),
    [fractions, rs]
  )

  const k = useMemo(() => kelly(rs), [rs])
  const current = rows.find((r) => r.pct === typical) ?? rows[Math.floor(rows.length / 2)]

  if (rs.length < MIN_TRADES) {
    return (
      <Section title="Sizing and survival">
        <p className="text-xs text-ink-400 leading-relaxed max-w-[64ch]">
          Needs {MIN_TRADES} closed trades with a recorded risk before resampling
          your results says anything — {rs.length} so far. Until then the shape of
          your R distribution is mostly unknown, and a drawdown projection built
          on it would be a projection of the assumption, not of your trading.
        </p>
      </Section>
    )
  }

  return (
    <Section
      title="Sizing and survival"
      meta={`${HORIZON} trades ahead · resampled from your ${rs.length}`}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] gap-x-10 gap-y-4 items-start">
          <div>
            <div className="text-2xs uppercase tracking-label text-azure-dim mb-1.5">
              Chance of a 20% drawdown
            </div>
            <div className={`font-mono text-figure ${
              current.out.drawdown20 >= 0.5 ? 'text-down'
                : current.out.drawdown20 >= 0.2 ? 'text-ink-50' : 'text-up'
            }`}>
              {fmtPct(current.out.drawdown20 * 100, 0)}
            </div>
            <div className="text-2xs text-ink-500 mt-1">
              over the next {HORIZON} trades at {current.pct}% risk
            </div>
          </div>

          <p className="text-2xs text-ink-300 leading-relaxed max-w-[68ch]">
            {current.out.drawdown20 >= 0.5 ? (
              <span className="text-down">
                At {current.pct}% a run bad enough to take a fifth of the account is
                more likely than not inside {HORIZON} trades. That is not a warning
                about your strategy — it is what this position size does to it.
              </span>
            ) : current.out.drawdown20 >= 0.15 ? (
              <>
                Roughly a {fmtPct(current.out.drawdown20 * 100, 0)} chance of being a
                fifth down at some point in the next {HORIZON} trades. Worth knowing
                in advance, because the moment to decide how you react to a 20%
                drawdown is now and not during one.
              </>
            ) : (
              <>
                At {current.pct}% the account is very unlikely to fall a fifth inside{' '}
                {HORIZON} trades. Small size is what buys the number of trades an
                edge needs to actually show up.
              </>
            )}
          </p>
        </div>

        <div className="hairline" />

        <div className="tbl-wrap max-w-4xl">
          <table className="tbl">
            <thead>
              <tr>
                <th>Risk per trade</th>
                <th className="num">−20%</th>
                <th className="num">−35%</th>
                <th className="num">−50%</th>
                <th className="num">Median after {HORIZON}</th>
                <th className="num">Bad run (5th pct)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ pct, out }) => (
                <tr key={pct} className={pct === typical ? 'bg-azure-wash' : undefined}>
                  <td className="font-mono text-ink-50">
                    {pct}%
                    {pct === typical && (
                      <span className="text-3xs uppercase tracking-label text-azure-dim ml-2">yours</span>
                    )}
                  </td>
                  <td className="num">
                    <span className="inline-flex items-center gap-2 justify-end">
                      <Bar p={out.drawdown20} />
                      <span className="text-ink-100">{fmtPct(out.drawdown20 * 100, 0)}</span>
                    </span>
                  </td>
                  <td className="num text-ink-300">{fmtPct(out.drawdown35 * 100, 0)}</td>
                  <td className={`num ${out.drawdown50 >= 0.1 ? 'text-down' : 'text-ink-400'}`}>
                    {fmtPct(out.drawdown50 * 100, 0)}
                  </td>
                  <td className={`num ${out.medianGrowth >= 1 ? 'text-up' : 'text-down'}`}>
                    {fmtMoney(balance * out.medianGrowth, 0)}
                  </td>
                  <td className="num text-ink-500">
                    {fmtMoney(balance * out.p05Growth, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {k.meaningful && (
          <p className="edge-note text-2xs text-ink-300 leading-relaxed max-w-[70ch]">
            The growth-optimal size on this sample is{' '}
            <span className="font-mono text-ink-100">{fmtPct(k.full * 100, 1)}</span> a
            trade, which is a number to understand and not to trade. Kelly assumes the
            distribution is known; yours is estimated from {rs.length} trades, and an
            over-estimated edge produces an over-sized bet whose losses compound. A
            quarter of it —{' '}
            <span className="font-mono text-ink-100">{fmtPct(k.suggested * 100, 1)}</span>{' '}
            — is the usual practical ceiling, and your {typical}% sits{' '}
            {typical <= k.suggested * 100 ? 'inside it.' : 'above it.'}
          </p>
        )}

        <p className="text-3xs text-ink-600 leading-relaxed max-w-[70ch]">
          4,000 simulated runs per row, each one drawing {HORIZON} trades at random from
          your own closed results, with a fixed seed so the figures do not drift between
          renders. It assumes the next trade looks like the last ones and that trades are
          independent — real trading breaks both, since edges decay and losses cluster
          when the market changes or you tilt. Treat these as the optimistic case.
        </p>
      </div>
    </Section>
  )
}
