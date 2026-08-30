import type { Direction } from '@/types'
import { round } from './calc'

// ─────────────────────────────────────────────────────────────────────────────
// Currency conversion for forex CFDs.
//
// The bug this exists to kill: risk per trade was `|entry − stop| × units`.
// That product is denominated in the pair's QUOTE currency, not the account
// currency. It is the AUD risk only when the pair is quoted in AUD.
//
//   EUR/AUD   quote is AUD          →  correct as-is
//   NZD/JPY   quote is JPY          →  out by the JPY→AUD rate, about 112x
//   EUR/USD   quote is USD          →  out by the USD→AUD rate, about 1.5x
//
// R-multiple is pnl ÷ risk and is the primary metric in this app, so a risk in
// the wrong currency does not look like an error — it looks like a number. A
// JPY trade that lost a full R records −0.01R and quietly drags expectancy,
// every rule comparison and the whole R distribution toward zero.
//
// There is no FX feed here, and adding one would make historical trades depend
// on today's rates, which is worse than useless. Instead this resolves the rate
// from what is already known about the trade, and is explicit about how good
// each answer is. Nothing is ever applied silently: the caller shows the
// resolution and the user decides.
// ─────────────────────────────────────────────────────────────────────────────

export const ACCOUNT_CURRENCY = 'AUD'

/** Split GBPJPY / GBP/JPY / "GBP/JPY - Cash" into its two currencies. */
export function currenciesOf(ticker: string): { base: string; quote: string } | null {
  const s = (ticker || '').toUpperCase()
  const slashed = s.match(/\b([A-Z]{3})\s*[/-]\s*([A-Z]{3})\b/)
  if (slashed) return { base: slashed[1], quote: slashed[2] }
  const bare = s.replace(/[^A-Z]/g, '')
  if (bare.length === 6) return { base: bare.slice(0, 3), quote: bare.slice(3) }
  return null
}

export type RateSource =
  /** Stored on the trade — from the broker's export or typed in by hand. */
  | 'stored'
  /** Pair is quoted in the account currency, so the rate is exactly 1. */
  | 'quoted-in-account'
  /** Back-solved from the broker's realised P&L against the price move. */
  | 'implied'
  /** Account currency is the base, so the rate is 1 ÷ price. */
  | 'inverse-base'
  /** Nothing here can determine it. */
  | 'unknown'

export interface RateResolution {
  /** Quote currency → account currency. Multiply a quote-currency figure by it. */
  rate: number | null
  source: RateSource
  /** True when the rate is the real one, not an approximation. */
  exact: boolean
  /** One line, written for the person reading the trade. */
  explain: string
  quote: string | null
}

export interface TradeFxInput {
  ticker: string
  direction: Direction
  entryPrice: number | null
  exitPrice: number | null
  positionSize: number | null
  pnl: number | null
  conversionRate: number | null
}

/**
 * Work out what one unit of the quote currency is worth in AUD, in descending
 * order of trust. Each branch says how confident it is, because the difference
 * between "CMC told us" and "we divided two numbers" matters to whether the
 * user should accept the correction.
 */
export function resolveRate(t: TradeFxInput): RateResolution {
  const pair = currenciesOf(t.ticker)
  const quote = pair?.quote ?? null

  // 1. An explicit rate always wins. CMC puts one on the closing row of its
  //    export, and it is the exact figure used to settle the trade.
  if (t.conversionRate !== null && t.conversionRate > 0) {
    return {
      rate: t.conversionRate,
      source: 'stored',
      exact: true,
      quote,
      explain: quote
        ? `Using the recorded ${quote}→${ACCOUNT_CURRENCY} rate of ${t.conversionRate}.`
        : `Using the recorded conversion rate of ${t.conversionRate}.`,
    }
  }

  // 2. Quoted in the account currency: no conversion happens at all.
  if (quote === ACCOUNT_CURRENCY) {
    return {
      rate: 1,
      source: 'quoted-in-account',
      exact: true,
      quote,
      explain: `${t.ticker} is quoted in ${ACCOUNT_CURRENCY}, so no conversion applies.`,
    }
  }

  // 3. Back-solve from the broker's own P&L. The price move times units is the
  //    result in the quote currency; the broker's figure is the same result in
  //    AUD, so their ratio is the rate that was actually applied.
  //
  //    Slightly low, because a stored P&L is usually net of commission and
  //    holding costs while the price move is gross. On a normal trade that is
  //    a fraction of a percent — good enough to fix a 112x error, not good
  //    enough to present as exact.
  const move = priceMove(t)
  if (move !== null && t.positionSize !== null && t.pnl !== null) {
    const quoteResult = move * Math.abs(t.positionSize)
    if (Math.abs(quoteResult) > 1e-9 && Math.abs(t.pnl) > 1e-9) {
      const implied = Math.abs(t.pnl) / Math.abs(quoteResult)
      // A ratio that disagrees in sign means the P&L is not this trade's
      // price move — a partial fill, a correction, or a mis-mapped column.
      // Better to admit we don't know than to invent a negative rate.
      if (implied > 0 && Number.isFinite(implied) && sameSign(t.pnl, quoteResult)) {
        return {
          rate: round(implied, 6),
          source: 'implied',
          exact: false,
          quote,
          explain: quote
            ? `Back-solved from the closing P&L: about ${round(implied, 6)} ${ACCOUNT_CURRENCY} per ${quote}. Close, but it absorbs commission, so treat it as approximate.`
            : 'Back-solved from the closing P&L, so it absorbs commission. Approximate.',
        }
      }
    }
  }

  // 4. Account currency is the base (AUD/USD, AUD/JPY): the price IS the
  //    AUD→quote rate, so its reciprocal converts back. Uses the exit price
  //    when there is one, since that is when settlement happened.
  if (pair?.base === ACCOUNT_CURRENCY) {
    const px = t.exitPrice ?? t.entryPrice
    if (px !== null && px > 0) {
      return {
        rate: round(1 / px, 6),
        source: 'inverse-base',
        exact: false,
        quote,
        explain: `${t.ticker} is quoted the other way round, so the rate is 1 ÷ ${px}. Uses the trade's own price, not the rate at settlement.`,
      }
    }
  }

  return {
    rate: null,
    source: 'unknown',
    exact: false,
    quote,
    explain: quote
      ? `No ${quote}→${ACCOUNT_CURRENCY} rate is available for this trade. Enter the risk in ${ACCOUNT_CURRENCY} yourself.`
      : `No conversion rate is available for this trade.`,
  }
}

function sameSign(a: number, b: number): boolean {
  return (a >= 0 && b >= 0) || (a < 0 && b < 0)
}

function priceMove(t: TradeFxInput): number | null {
  if (t.entryPrice === null || t.exitPrice === null) return null
  return t.direction === 'long' ? t.exitPrice - t.entryPrice : t.entryPrice - t.exitPrice
}

/** Stop distance × units, in the quote currency. The unconverted figure. */
export function riskInQuoteCurrency(t: {
  entryPrice: number | null
  stopLoss: number | null
  positionSize: number | null
}): number | null {
  if (t.entryPrice === null || t.stopLoss === null || t.positionSize === null) return null
  const dist = Math.abs(t.entryPrice - t.stopLoss)
  if (dist <= 0) return null
  return round(dist * Math.abs(t.positionSize), 2)
}

export interface RiskResolution {
  /** Risk in the account currency, or null when it can't be determined. */
  amount: number | null
  /** The same figure before conversion, for showing the difference. */
  quoteAmount: number | null
  rate: RateResolution
  /** True when conversion actually changes the number. */
  converted: boolean
}

/**
 * The risk this trade actually carried, in AUD. This is the figure R should be
 * measured against, and the one the importer and the trade detail both offer.
 */
export function resolveRisk(
  t: TradeFxInput & { stopLoss: number | null }
): RiskResolution {
  const quoteAmount = riskInQuoteCurrency(t)
  const rate = resolveRate(t)
  const amount =
    quoteAmount !== null && rate.rate !== null ? round(quoteAmount * rate.rate, 2) : null
  return {
    amount,
    quoteAmount,
    rate,
    converted: amount !== null && quoteAmount !== null && Math.abs(amount - quoteAmount) > 0.01,
  }
}

/**
 * Does a stored risk look like it was never converted?
 *
 * True when it still equals the raw quote-currency product AND that product is
 * a different order of magnitude from the money that actually moved. Both
 * halves are needed: the first alone would flag every correctly-risked AUD
 * pair, and the second alone would flag a genuinely oversized trade.
 */
export function riskLooksUnconverted(t: {
  storedRisk: number | null
  quoteRisk: number | null
  pnl: number | null
}): boolean {
  const { storedRisk, quoteRisk, pnl } = t
  if (storedRisk === null || quoteRisk === null || quoteRisk <= 0) return false
  if (Math.abs(storedRisk - quoteRisk) > 0.01) return false
  if (pnl === null || Math.abs(pnl) < 1e-9) return false
  const ratio = quoteRisk / Math.abs(pnl)
  return ratio > 5 || ratio < 0.2
}
