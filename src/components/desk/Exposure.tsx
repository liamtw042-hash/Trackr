import { useMemo } from 'react'
import { fmtMoney, fmtPct } from '@/lib/calc'
import { exposure } from '@/lib/insight'
import { Section } from '@/components/ui/Primitives'
import type { Trade } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// What the open book is actually betting on.
//
// A forex position is two currency bets. Long GBP/JPY is long GBP and short
// JPY, so three separate-looking trades — long GBP/JPY, long EUR/JPY, long
// AUD/JPY — are one short-yen bet at triple size, and one yen headline closes
// all three together.
//
// The trades table cannot show this: the thing that matters is not in any
// column, it is what the rows have in common. His rules already say to avoid
// correlated positions; this is the first thing in the app that can tell him
// when he has them.
// ─────────────────────────────────────────────────────────────────────────────

export function Exposure({ trades }: { trades: Trade[] }) {
  const ex = useMemo(() => exposure(trades), [trades])

  if (ex.openCount === 0 || ex.legs.length === 0) return null

  const peak = Math.max(...ex.legs.map((l) => Math.abs(l.net)), 0.01)

  return (
    <Section
      title="Currency exposure"
      meta={`${ex.openCount} open · ${fmtMoney(ex.totalRisk, 0)} at risk`}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] gap-x-10 gap-y-4 items-start">
        <div className="space-y-2">
          {ex.legs.map((leg) => {
            const long = leg.net >= 0
            const width = (Math.abs(leg.net) / peak) * 100
            return (
              <div key={leg.currency} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3">
                <span className="font-mono text-2xs text-ink-100">{leg.currency}</span>

                {/* Long right of centre, short left. A signed bar reads as a
                    direction; two unsigned bars would read as two amounts. */}
                <div className="relative h-3.5 rounded-sm bg-ink-950/60"
                  style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)' }}>
                  <div className="absolute inset-y-0 w-px bg-ink-700" style={{ left: '50%' }} />
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 h-2 rounded-sm ${long ? 'bg-up/70' : 'bg-down/70'}`}
                    style={
                      long
                        ? { left: '50%', width: `${width / 2}%` }
                        : { right: '50%', width: `${width / 2}%` }
                    }
                  />
                </div>

                <span className="flex items-baseline gap-2 font-mono text-2xs tabular">
                  <span className="text-ink-600">{leg.trades.length}×</span>
                  <span className={long ? 'text-up' : 'text-down'}>
                    {long ? 'long' : 'short'} {fmtMoney(Math.abs(leg.net), 0)}
                  </span>
                </span>
              </div>
            )
          })}
        </div>

        <div className="space-y-2.5">
          <div>
            <div className="text-2xs uppercase tracking-label text-azure-dim mb-1.5">
              Biggest single bet
            </div>
            <div className={`font-mono text-figure ${ex.warn ? 'text-down' : 'text-ink-50'}`}>
              {fmtPct(ex.concentration * 100, 0)}
            </div>
            <div className="text-2xs text-ink-500 mt-1">of everything at risk</div>
          </div>

          <p className="text-2xs text-ink-300 leading-relaxed">
            {ex.warn ? (
              <span className="text-down">
                {ex.legs[0].currency} accounts for{' '}
                {fmtPct(ex.concentration * 100, 0)} of your open risk across{' '}
                {ex.legs[0].trades.length} position
                {ex.legs[0].trades.length === 1 ? '' : 's'}. Those are not
                independent trades — one move in {ex.legs[0].currency} takes them
                together, so the real risk is closer to{' '}
                {fmtMoney(Math.abs(ex.legs[0].net), 0)} on a single call.
              </span>
            ) : ex.stacked.length > 0 ? (
              <>
                {ex.stacked.map((l) => l.currency).join(' and ')} appear{' '}
                {ex.stacked.length === 1 ? 'in more than one position' : 'across several positions'},
                but nothing dominates the book. Worth knowing rather than acting on.
              </>
            ) : (
              <>No currency is carrying more than its share. These are independent bets.</>
            )}
          </p>

          <p className="text-3xs text-ink-600 leading-relaxed">
            Every pair is two positions: long GBP/JPY is long GBP and short JPY.
            Opposing trades net off here, so a real hedge shows as zero.
          </p>
        </div>
      </div>
    </Section>
  )
}
