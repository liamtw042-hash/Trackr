import { useMemo } from 'react'
import { discipline } from '@/lib/insight'
import { streakExpectation } from '@/lib/risk'
import { RULES } from '@/types'
import { Section } from '@/components/ui/Primitives'
import type { Trade } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Streaks, and the one number worth acting on.
//
// Streaks are not predictive and this does not pretend otherwise — five wins
// says nothing about the sixth trade. What a streak is good for is the other
// thing: noticing you are in one, because that is exactly when sizing and
// patience slip.
//
// "Trades since a rule break" is the figure that carries weight, because unlike
// win rate it is entirely under his control.
//
// The run is also priced. A four-loss streak feels like evidence the strategy
// has stopped working; at a 45% win rate over 29 trades it is the single most
// likely longest run there is. Showing the expected run beside the actual one
// is the cheapest way to stop a normal streak being read as a broken system —
// and, in the other direction, to notice when a run really is out of range.
// ─────────────────────────────────────────────────────────────────────────────

function Pip({ won }: { won: boolean }) {
  return (
    <span
      className={`w-1.5 h-4 rounded-[1px] ${won ? 'bg-up/80' : 'bg-down/80'}`}
      aria-hidden="true"
    />
  )
}

export function Discipline({ trades }: { trades: Trade[] }) {
  const d = useMemo(() => discipline(trades), [trades])

  // The recent run, oldest to newest, as a row of pips. Twelve is about as many
  // as reads as a shape rather than a barcode.
  const recent = useMemo(
    () =>
      trades
        .filter((t) => t.status === 'closed' && t.outcome && t.outcome !== 'breakeven')
        .slice(0, 12)
        .reverse(),
    [trades]
  )

  if (d.n === 0) return null

  const onRun = Math.abs(d.current) >= 3
  const breakRule = d.lastBreakRule
    ? RULES.find((r) => r.key === d.lastBreakRule)?.label ?? d.lastBreakRule
    : null

  // Priced against his own win rate, over his own number of trades.
  const streak = streakExpectation(d.wins, d.losses, d.decided)
  const losing = d.current < 0 ? Math.abs(d.current) : 0
  const runOdds = streak.meaningful && losing >= 2 ? streak.probabilityOf(losing) : null

  return (
    <Section title="Discipline">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-x-6">
          <div>
            <div className="text-2xs uppercase tracking-label text-azure-dim mb-1.5">
              Current run
            </div>
            <div className={`font-mono text-figure ${
              d.current > 0 ? 'text-up' : d.current < 0 ? 'text-down' : 'text-ink-400'
            }`}>
              {d.current === 0 ? '—' : `${Math.abs(d.current)}${d.current > 0 ? 'W' : 'L'}`}
            </div>
            <div className="text-2xs text-ink-500 mt-1">
              best {d.longestWin}W · worst {d.longestLoss}L
            </div>
          </div>

          <div>
            <div className="text-2xs uppercase tracking-label text-azure-dim mb-1.5">
              Since a rule break
            </div>
            <div className={`font-mono text-figure ${
              d.sinceBreak === null ? 'text-ink-400'
                : d.sinceBreak >= 10 ? 'text-up'
                : d.sinceBreak <= 2 ? 'text-down'
                : 'text-ink-50'
            }`}>
              {d.sinceBreak === null ? '—' : d.sinceBreak}
            </div>
            <div className="text-2xs text-ink-500 mt-1">
              {d.sinceBreak === null
                ? 'no rules recorded yet'
                : `${d.breaks} break${d.breaks === 1 ? '' : 's'} in ${d.n} trades`}
            </div>
          </div>
        </div>

        {recent.length > 0 && (
          <div>
            <div className="flex items-end gap-[3px]" title="Most recent 12 results, oldest first">
              {recent.map((t) => <Pip key={t.id} won={t.outcome === 'win'} />)}
            </div>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mt-1.5">
              <span className="text-3xs text-ink-600">last {recent.length}, oldest first</span>
              {streak.meaningful && (
                <span className="text-3xs text-ink-500">
                  worst run to expect over {d.decided} trades:{' '}
                  <span className="font-mono text-ink-300">{streak.expectedLongest}</span>
                  {d.longestLoss > 0 && (
                    <>
                      {' '}· yours <span className={`font-mono ${
                        d.longestLoss > streak.expectedLongest + 1.5 ? 'text-down' : 'text-ink-300'
                      }`}>{d.longestLoss}</span>
                    </>
                  )}
                </span>
              )}
            </div>
          </div>
        )}

        <p className="text-2xs text-ink-300 leading-relaxed">
          {onRun && d.current < 0 ? (
            <span className={runOdds !== null && runOdds < 0.2 ? 'text-down' : undefined}>
              {Math.abs(d.current)} losses in a row.
              {runOdds !== null && (
                <>
                  {' '}At your win rate a run this long turns up in{' '}
                  <span className="font-mono">{Math.round(runOdds * 100)}%</span> of
                  {' '}{d.decided}-trade stretches, so it is{' '}
                  {runOdds >= 0.35 ? 'thoroughly ordinary'
                    : runOdds >= 0.15 ? 'well inside normal'
                    : 'on the unusual side'}.
                </>
              )}{' '}
              Nothing about it predicts the next trade — but it is the point at which
              sizing up to “make it back” starts to look reasonable, and that is the
              actual risk.
            </span>
          ) : onRun && d.current > 0 ? (
            <>
              {d.current} wins in a row. The run says nothing about the next trade; the
              thing to watch is whether your size has crept up with it.
            </>
          ) : d.sinceBreak !== null && d.sinceBreak >= 10 ? (
            <>
              {d.sinceBreak} clean trades in a row. This is the number worth protecting —
              it is the only one on this page you control directly.
            </>
          ) : breakRule ? (
            <>
              Last rule broken was <span className="text-ink-100">{breakRule}</span>,{' '}
              {d.sinceBreak} trade{d.sinceBreak === 1 ? '' : 's'} ago.
            </>
          ) : (
            <>Streaks are a prompt to check your sizing, not a signal.</>
          )}
        </p>
      </div>
    </Section>
  )
}
