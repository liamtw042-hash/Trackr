import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '@/store/AuthContext'
import { useTrades } from '@/store/TradeContext'
import { fmtMoney, fmtR, rMultiple, riskPercentFor, round } from '@/lib/calc'
import { resolveRisk, riskLooksUnconverted, type RateSource } from '@/lib/fx'
import { Section, Spinner, Tag } from '@/components/ui/Primitives'
import type { Trade } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Bulk risk repair.
//
// Every trade imported or logged before the currency fix carries a risk in the
// pair's quote currency. Fixing them one at a time through the trade detail
// works but is 50-odd modals, and the R distribution stays wrong until the last
// one is done.
//
// This finds them, shows exactly what would change, and applies it in one go —
// but only after the numbers have been shown. It writes riskAmount, riskPercent
// and rMultiple, and nothing else: no P&L, no status, no balance movement. The
// account balance is derived from P&L, so repairing risk cannot move money.
// ─────────────────────────────────────────────────────────────────────────────

interface Candidate {
  trade: Trade
  from: number | null
  to: number
  fromR: number | null
  toR: number | null
  source: RateSource
  exact: boolean
}

const SOURCE_LABEL: Record<RateSource, string> = {
  stored: 'broker rate',
  'quoted-in-account': 'no conversion',
  implied: 'from P&L',
  'inverse-base': 'from price',
  unknown: 'unknown',
}

export function RiskAudit() {
  const { profile } = useAuth()
  const { trades, updateTrade } = useTrades()
  const [applying, setApplying] = useState(false)
  const [done, setDone] = useState<number | null>(null)
  const [expanded, setExpanded] = useState(false)

  const balance = profile?.accountBalance ?? null

  const { candidates, unfixable } = useMemo(() => {
    const candidates: Candidate[] = []
    const unfixable: Trade[] = []

    for (const t of trades) {
      const res = resolveRisk({
        ticker: t.ticker,
        direction: t.direction,
        entryPrice: t.entryPrice,
        exitPrice: t.exitPrice,
        positionSize: t.positionSize,
        pnl: t.pnl,
        conversionRate: t.conversionRate,
        stopLoss: t.stopLoss,
      })

      // Only trades whose stored risk is still the raw quote-currency product.
      // A risk the user has already corrected by hand, or one that came in on a
      // Risk $ column, is left alone — this must never overwrite a human's
      // figure with a back-solved one.
      const stale = riskLooksUnconverted({
        storedRisk: t.riskAmount,
        quoteRisk: res.quoteAmount,
        pnl: t.pnl,
      })
      if (!stale) continue

      if (res.amount === null || res.amount <= 0) {
        unfixable.push(t)
        continue
      }

      candidates.push({
        trade: t,
        from: t.riskAmount,
        to: res.amount,
        fromR: t.rMultiple,
        toR: t.status === 'closed' ? rMultiple(t.pnl, res.amount) : null,
        source: res.rate.source,
        exact: res.rate.exact,
      })
    }

    candidates.sort((a, b) => Math.abs(b.to - (b.from ?? 0)) - Math.abs(a.to - (a.from ?? 0)))
    return { candidates, unfixable }
  }, [trades])

  const apply = async () => {
    setApplying(true)
    let ok = 0
    try {
      for (const c of candidates) {
        // Deliberately sequential. A writeBatch would be faster, but a partial
        // failure halfway through a batch leaves no record of how far it got;
        // one at a time means a failure stops with a known count applied.
        await updateTrade(c.trade.id, {
          riskAmount: c.to,
          riskPercent: riskPercentFor(balance, c.to),
          rMultiple: c.trade.status === 'closed' ? rMultiple(c.trade.pnl, c.to) : null,
        })
        ok++
      }
      setDone(ok)
      toast.success(`Repaired ${ok} trade${ok === 1 ? '' : 's'}`)
    } catch (err) {
      console.error(err)
      toast.error(`Stopped after ${ok} — ${err instanceof Error ? err.message : 'write failed'}`)
    } finally {
      setApplying(false)
    }
  }

  if (!candidates.length && !unfixable.length) {
    return (
      <Section title="Risk currency" tier="raised">
        <div>
          <p className="text-xs text-ink-300 leading-relaxed">
            Every trade&rsquo;s risk is in AUD. Nothing to repair.
          </p>
        </div>
      </Section>
    )
  }

  const expectancyNow = avgR(trades.map((t) => t.rMultiple))
  const expectancyAfter = avgR(
    trades.map((t) => {
      const c = candidates.find((x) => x.trade.id === t.id)
      return c ? c.toR : t.rMultiple
    })
  )

  return (
    <Section title="Risk currency" tier="raised">
      <div className="space-y-3">
        <p className="text-xs text-ink-300 leading-relaxed max-w-[62ch]">
          {candidates.length > 0 ? (
            <>
              <span className="font-mono text-ink-50">{candidates.length}</span> trade
              {candidates.length === 1 ? ' has' : 's have'} a risk recorded in the pair&rsquo;s quote
              currency rather than AUD — stop distance times units, never converted. Because R is
              P&amp;L divided by risk, those trades are recording a fraction of the R they actually
              were.
            </>
          ) : (
            <>
              {unfixable.length} trade{unfixable.length === 1 ? ' has' : 's have'} a risk in the wrong
              currency, but nothing here can supply a rate for{' '}
              {unfixable.length === 1 ? 'it' : 'them'}.
            </>
          )}
        </p>

        {candidates.length > 0 && (
          <>
            {/* The headline consequence, stated before the button. Expectancy is
                the number this bug distorts most, so it is the number that
                justifies the repair. */}
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="text-2xs uppercase tracking-label text-ink-500">Expectancy</span>
              <span className={`font-mono text-figure ${expectancyNow >= 0 ? 'text-up/55' : 'text-down/55'}`}>
                {fmtR(expectancyNow)}
              </span>
              <span className="text-ink-600 font-mono text-sm">&rarr;</span>
              <span className={`font-mono text-figure ${expectancyAfter >= 0 ? 'text-up' : 'text-down'}`}>
                {fmtR(expectancyAfter)}
              </span>
              <span className="text-2xs text-ink-500">once these are converted</span>
            </div>

            <div className="hairline" />

            <div className="overflow-x-auto">
              <table className="tbl w-full">
                <thead>
                  <tr>
                    <th>Pair</th>
                    <th className="text-right">Risk now</th>
                    <th className="text-right">Becomes</th>
                    <th className="text-right">R now</th>
                    <th className="text-right">R after</th>
                    <th>Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {(expanded ? candidates : candidates.slice(0, 6)).map((c) => (
                    <tr key={c.trade.id}>
                      <td className="font-mono text-ink-100">{c.trade.ticker}</td>
                      <td className="text-right font-mono text-ink-500 tabular">
                        {c.from?.toLocaleString() ?? '—'}
                      </td>
                      <td className="text-right font-mono text-ink-50 tabular">{fmtMoney(c.to)}</td>
                      <td className="text-right font-mono text-ink-500 tabular">{fmtR(c.fromR)}</td>
                      <td className={`text-right font-mono tabular ${c.toR !== null && c.toR >= 0 ? 'text-up' : 'text-down'}`}>
                        {fmtR(c.toR)}
                      </td>
                      <td>
                        <Tag tone={c.exact ? 'azure' : 'neutral'}>{SOURCE_LABEL[c.source]}</Tag>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {candidates.length > 6 && (
              <button onClick={() => setExpanded((v) => !v)} className="btn-quiet btn-sm">
                {expanded ? 'Show fewer' : `Show all ${candidates.length}`}
              </button>
            )}

            <p className="text-2xs text-ink-400 leading-relaxed max-w-[68ch]">
              Rates marked <span className="text-ink-300">from P&amp;L</span> are back-solved from the
              broker&rsquo;s closing figure and absorb commission, so they land within about a percent
              rather than exactly. That is the difference between −1.01R and −1.00R, not between right
              and wrong. This writes risk, risk % and R only — P&amp;L and your balance are untouched.
            </p>

            <div className="flex items-center gap-2 pt-0.5">
              <button onClick={() => void apply()} disabled={applying} className="btn-primary">
                {applying ? <><Spinner /> Repairing…</> : `Repair ${candidates.length} trade${candidates.length === 1 ? '' : 's'}`}
              </button>
              {done !== null && (
                <span className="text-2xs text-up">Repaired {done}.</span>
              )}
            </div>
          </>
        )}

        {unfixable.length > 0 && (
          <div className="edge-note text-2xs text-ink-300 leading-relaxed py-0.5">
            {unfixable.length} other trade{unfixable.length === 1 ? '' : 's'} (
            <span className="font-mono">
              {[...new Set(unfixable.map((t) => t.ticker))].slice(0, 5).join(', ')}
            </span>
            ) also look unconverted, but there is no P&amp;L or rate to convert with — they are open,
            or the export carried no closing figure. Set the risk on each from the trade detail.
          </div>
        )}
      </div>
    </Section>
  )
}

function avgR(rs: (number | null)[]): number {
  const vals = rs.filter((r): r is number => r !== null)
  return vals.length ? round(vals.reduce((s, r) => s + r, 0) / vals.length, 2) : 0
}
