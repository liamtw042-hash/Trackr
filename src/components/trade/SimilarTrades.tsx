import { useMemo } from 'react'
import { useTrades } from '@/store/TradeContext'
import { fmtR, fmtMoney, fmtDate, valueClass, round } from '@/lib/calc'
import type { Trade } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Your record on this kind of trade.
//
// The detail view is where a trade gets judged, and until now it was the one
// screen in the app with no history on it at all — you rate a GBP/JPY long
// entirely on how this one felt, with the other five sitting two clicks away on
// a page you have to go and ask.
//
// Two groupings, because they answer different questions: the pair says whether
// this instrument has ever worked for you, the setup says whether the idea has.
// A trade can be good on one and bad on the other, and that is worth seeing.
//
// The current trade is excluded from its own comparison. Including it would let
// a single big winner tell you that you are good at the thing you just did.
// ─────────────────────────────────────────────────────────────────────────────

const MIN_TO_MEAN_ANYTHING = 4

interface Record {
  label: string
  kind: string
  n: number
  wins: number
  losses: number
  avgR: number | null
  pnl: number
  recent: Trade[]
}

function summarise(label: string, kind: string, list: Trade[]): Record {
  const rs = list.map((t) => t.rMultiple).filter((r): r is number => r !== null)
  return {
    label,
    kind,
    n: list.length,
    wins: list.filter((t) => t.outcome === 'win').length,
    losses: list.filter((t) => t.outcome === 'loss').length,
    avgR: rs.length ? round(rs.reduce((s, r) => s + r, 0) / rs.length, 2) : null,
    pnl: round(list.reduce((s, t) => s + (t.pnl ?? 0), 0), 2),
    recent: list.slice(0, 5),
  }
}

function Row({ rec, thisR }: { rec: Record; thisR: number | null }) {
  const thin = rec.n < MIN_TO_MEAN_ANYTHING
  return (
    <div className={thin ? 'opacity-55' : undefined}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-baseline gap-2 min-w-0">
          <span className="text-3xs uppercase tracking-label text-ink-500 shrink-0">{rec.kind}</span>
          <span className="font-mono text-2xs text-ink-100 truncate">{rec.label}</span>
        </span>
        <span className="flex items-baseline gap-3 font-mono text-2xs shrink-0">
          <span className="text-ink-500">{rec.wins}W {rec.losses}L</span>
          <span className={valueClass(rec.avgR)}>{fmtR(rec.avgR)}</span>
          <span className={valueClass(rec.pnl)}>{fmtMoney(rec.pnl, 0)}</span>
        </span>
      </div>

      {/* The last five, oldest first — enough to see a shape, not a barcode. */}
      {rec.recent.length > 0 && (
        <div className="flex items-center gap-2 mt-1.5">
          <span className="flex items-end gap-[3px]">
            {[...rec.recent].reverse().map((t) => (
              <span
                key={t.id}
                title={`${fmtDate(t.exitDate ?? t.tradeDate)} · ${fmtR(t.rMultiple)}`}
                className={`w-1.5 h-3.5 rounded-[1px] ${
                  t.outcome === 'win' ? 'bg-up/80'
                    : t.outcome === 'loss' ? 'bg-down/80' : 'bg-ink-600'
                }`}
              />
            ))}
          </span>
          <span className="text-3xs text-ink-600">
            {thin
              ? `only ${rec.n} before this one`
              : thisR !== null && rec.avgR !== null
                ? thisR >= rec.avgR
                  ? 'this trade beat that average'
                  : 'this trade came in under that average'
                : `last ${rec.recent.length}, oldest first`}
          </span>
        </div>
      )}
    </div>
  )
}

export function SimilarTrades({ trade }: { trade: Trade }) {
  const { trades } = useTrades()

  const { pair, setup } = useMemo(() => {
    const others = trades.filter(
      (t) => t.id !== trade.id && t.status === 'closed'
    )
    const setupKey = trade.setupType.trim().toLowerCase()

    return {
      pair: summarise(
        trade.ticker,
        'Pair',
        others.filter((t) => t.ticker === trade.ticker)
      ),
      setup: setupKey
        ? summarise(
            trade.setupType.trim(),
            'Setup',
            others.filter((t) => t.setupType.trim().toLowerCase() === setupKey)
          )
        : null,
    }
  }, [trades, trade])

  if (pair.n === 0 && (!setup || setup.n === 0)) {
    return (
      <div>
        <div className="label">Your record here</div>
        <p className="hint">
          First closed {trade.ticker} trade
          {trade.setupType.trim() ? ` and first "${trade.setupType.trim()}"` : ''} —
          nothing to compare it against yet.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="label">Your record here</div>
      <div className="surface px-2.5 py-2.5 space-y-3">
        {pair.n > 0 && <Row rec={pair} thisR={trade.rMultiple} />}
        {setup && setup.n > 0 && <Row rec={setup} thisR={trade.rMultiple} />}
        <p className="text-3xs text-ink-600 leading-relaxed">
          Closed trades only, this one excluded. Faded rows have under{' '}
          {MIN_TO_MEAN_ANYTHING} behind them, which is a history rather than a rate.
        </p>
      </div>
    </div>
  )
}
