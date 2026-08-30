import { useMemo } from 'react'
import { discipline } from '@/lib/insight'
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
            <div className="text-3xs text-ink-600 mt-1.5">last {recent.length}, oldest first</div>
          </div>
        )}

        <p className="text-2xs text-ink-300 leading-relaxed">
          {onRun && d.current < 0 ? (
            <span className="text-down">
              {Math.abs(d.current)} losses in a row. Nothing about that predicts the next
              trade — but it is the point at which sizing up to “make it back” starts to
              look reasonable, and that is the actual risk.
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
