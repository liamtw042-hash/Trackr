import { useMemo } from 'react'
import { fmtR, fmtMoney, fmtPct, valueClass } from '@/lib/calc'
import { byMonth } from '@/lib/insight'
import { Section } from '@/components/ui/Primitives'
import type { Trade } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Months.
//
// Every other view here is per-trade or all-time. Neither shows the thing a
// trader actually feels, which is that some months work and some do not, and
// that the bad ones tend to have a reason — a holiday, a run of forcing it, a
// market that stopped trending.
//
// Empty months are drawn, not skipped. A month with no trades is information:
// it is either discipline or a gap, and collapsing it would put two months
// eight weeks apart side by side as though they were consecutive.
//
// Coloured by total R rather than P&L, so a month traded at half size doesn't
// read as a worse month than it was.
// ─────────────────────────────────────────────────────────────────────────────

export function MonthGrid({ trades }: { trades: Trade[] }) {
  const months = useMemo(() => byMonth(trades), [trades])

  const peak = useMemo(
    () => Math.max(...months.map((m) => Math.abs(m.totalR)), 1),
    [months]
  )

  if (months.length === 0) {
    return (
      <Section title="By month">
        <p className="text-xs text-ink-400">No closed trades yet.</p>
      </Section>
    )
  }

  const best = months.reduce((a, b) => (b.totalR > a.totalR ? b : a))
  const worst = months.reduce((a, b) => (b.totalR < a.totalR ? b : a))
  const traded = months.filter((m) => m.n > 0)
  const green = traded.filter((m) => m.totalR > 0).length

  return (
    <Section
      title="By month"
      meta={`${green} of ${traded.length} months positive`}
    >
      <div className="space-y-3">
        <div className="tbl-wrap">
          <div className="flex gap-1.5 min-w-min pb-1">
            {months.map((m) => {
              const empty = m.n === 0
              // Opacity carries magnitude, hue carries direction. A fixed
              // palette of five greens would imply thresholds that don't exist.
              const strength = empty ? 0 : Math.min(Math.abs(m.totalR) / peak, 1)
              const up = m.totalR >= 0
              return (
                <div
                  key={m.key}
                  className="w-[52px] shrink-0"
                  title={
                    empty
                      ? `${m.label} ${m.year} — no trades`
                      : `${m.label} ${m.year} — ${m.n} trades, ${fmtR(m.totalR)} total, ${fmtMoney(m.pnl, 0)}`
                  }
                >
                  <div
                    className="h-14 rounded-md flex flex-col items-center justify-center gap-0.5 transition-transform duration-90 ease-snap hover:-translate-y-0.5"
                    style={{
                      backgroundColor: empty
                        ? 'rgba(255,255,255,0.02)'
                        : up
                          ? `rgba(47, 206, 114, ${0.1 + strength * 0.42})`
                          : `rgba(242, 85, 90, ${0.1 + strength * 0.42})`,
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), inset 0 0 0 1px rgba(255,255,255,0.04)',
                    }}
                  >
                    {empty ? (
                      <span className="text-3xs text-ink-700">—</span>
                    ) : (
                      <>
                        <span className={`font-mono text-2xs tabular ${up ? 'text-up' : 'text-down'}`}>
                          {fmtR(m.totalR)}
                        </span>
                        <span className="font-mono text-3xs text-ink-200/60">{m.n}</span>
                      </>
                    )}
                  </div>
                  <div className="text-center mt-1">
                    <div className="text-3xs text-ink-400">{m.label}</div>
                    {/* The year only where it changes, so it marks the boundary
                        instead of repeating twelve times. */}
                    {(m.month === 0 || m === months[0]) && (
                      <div className="font-mono text-3xs text-ink-600">{String(m.year).slice(2)}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="hairline" />

        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
          <span className="flex items-baseline gap-2">
            <span className="text-3xs uppercase tracking-label text-ink-500">Best</span>
            <span className="text-2xs text-ink-200">{best.label} {best.year}</span>
            <span className={`font-mono text-2xs ${valueClass(best.totalR)}`}>{fmtR(best.totalR)}</span>
          </span>
          <span className="flex items-baseline gap-2">
            <span className="text-3xs uppercase tracking-label text-ink-500">Worst</span>
            <span className="text-2xs text-ink-200">{worst.label} {worst.year}</span>
            <span className={`font-mono text-2xs ${valueClass(worst.totalR)}`}>{fmtR(worst.totalR)}</span>
          </span>
          <span className="flex items-baseline gap-2">
            <span className="text-3xs uppercase tracking-label text-ink-500">Busiest</span>
            <span className="font-mono text-2xs text-ink-200">
              {Math.max(...months.map((m) => m.n))} trades
            </span>
          </span>
        </div>

        <p className="text-2xs text-ink-400 leading-relaxed max-w-[68ch]">
          Shaded by total R, not dollars, so a month traded at half size is not
          punished for it. {traded.length < 6 ? (
            <>With {traded.length} month{traded.length === 1 ? '' : 's'} on record this is a
            timeline, not yet a pattern.</>
          ) : (
            <>{fmtPct((green / traded.length) * 100, 0)} of your traded months finished positive.</>
          )}
        </p>
      </div>
    </Section>
  )
}
