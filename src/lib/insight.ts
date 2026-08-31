import type { Trade } from '@/types'
import { RULE_KEYS } from '@/types'
import { round, dateOf } from './calc'
import { currenciesOf, ACCOUNT_CURRENCY } from './fx'

// ─────────────────────────────────────────────────────────────────────────────
// Derived views the journal can answer but never surfaced.
//
// Everything here reads trades that are already stored — no new fields, no new
// input. The common thread is that each one answers a question the raw table
// technically contains but no human would extract by eye.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Currency exposure ─────────────────────────────────────────────────────────────────

export interface CurrencyLeg {
  currency: string
  /** Signed AUD risk. Positive = long that currency, negative = short it. */
  net: number
  /** Total risk touching this currency regardless of direction. */
  gross: number
  trades: Trade[]
}

export interface Exposure {
  legs: CurrencyLeg[]
  openCount: number
  totalRisk: number
  /** The single largest one-directional bet, as a share of total open risk. */
  concentration: number
  /** Legs where two or more positions push the same way on one currency. */
  stacked: CurrencyLeg[]
  /** True when a leg is at least this share of everything at risk. */
  warn: boolean
}

const CONCENTRATION_WARN = 0.6

/**
 * What the open book is actually betting on.
 *
 * A forex position is two currency bets, not one: long GBP/JPY is long GBP and
 * short JPY. So three "different" trades — long GBP/JPY, long EUR/JPY, long
 * AUD/JPY — are one short-JPY bet at three times the size, and a single yen
 * headline takes all three out together.
 *
 * The trades table cannot show this, because the thing that matters is not in
 * any column: it is what the rows have in common. His own rules say to avoid
 * correlated positions, and until now nothing in the app could tell him when
 * he had them.
 */
export function exposure(trades: Trade[]): Exposure {
  const open = trades.filter((t) => t.status === 'open')
  const map = new Map<string, CurrencyLeg>()

  const add = (currency: string, signed: number, t: Trade) => {
    // The account currency is the denominator of everything, not a position.
    if (currency === ACCOUNT_CURRENCY) return
    const leg = map.get(currency) ?? { currency, net: 0, gross: 0, trades: [] }
    leg.net += signed
    leg.gross += Math.abs(signed)
    if (!leg.trades.includes(t)) leg.trades.push(t)
    map.set(currency, leg)
  }

  let totalRisk = 0
  for (const t of open) {
    const pair = currenciesOf(t.ticker)
    const risk = t.riskAmount ?? 0
    if (!pair || risk <= 0) continue
    totalRisk += risk
    const sign = t.direction === 'long' ? 1 : -1
    // Long the base, short the quote — and the reverse for a short.
    add(pair.base, risk * sign, t)
    add(pair.quote, -risk * sign, t)
  }

  const legs = [...map.values()]
    .map((l) => ({ ...l, net: round(l.net, 2), gross: round(l.gross, 2) }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))

  const biggest = legs.length ? Math.abs(legs[0].net) : 0
  const concentration = totalRisk > 0 ? biggest / totalRisk : 0

  return {
    legs,
    openCount: open.length,
    totalRisk: round(totalRisk, 2),
    concentration: round(concentration, 3),
    // Two or more positions pointing the same way on one currency is the shape
    // that matters; one position is just a trade.
    stacked: legs.filter((l) => l.trades.length > 1 && Math.abs(l.net) > 0.01),
    warn: concentration >= CONCENTRATION_WARN && open.length > 1,
  }
}

// ─── Streaks and discipline ────────────────────────────────────────────────────────

export interface Discipline {
  /** Positive = consecutive wins, negative = consecutive losses. */
  current: number
  longestWin: number
  longestLoss: number
  /** Closed trades since the most recent trade with a rule marked broken. */
  sinceBreak: number | null
  /** Total trades with at least one rule broken. */
  breaks: number
  lastBreakRule: string | null
  n: number
  /** Wins and losses only. A breakeven is not a result, so it is not counted. */
  wins: number
  losses: number
  /** wins + losses — the sample any win-rate arithmetic is entitled to use. */
  decided: number
}

/**
 * The behavioural loop, as a number.
 *
 * Streaks are not predictive and this does not pretend otherwise — a run of
 * five wins says nothing about the sixth trade. What it is good for is the
 * other thing: noticing you are in a run at all, because that is when position
 * sizing and patience actually slip.
 *
 * "Trades since a rule break" is the figure worth watching, and it is the one
 * a trader can move directly.
 */
export function discipline(trades: Trade[]): Discipline {
  const chron = trades
    .filter((t) => t.status === 'closed')
    .sort((a, b) => dateOf(a).getTime() - dateOf(b).getTime())

  let longestWin = 0
  let longestLoss = 0
  let run = 0
  let wins = 0
  let losses = 0

  for (const t of chron) {
    // Breakevens neither extend nor break a run — they are not a result.
    if (t.outcome === 'breakeven' || t.outcome === null) continue
    const win = t.outcome === 'win'
    if (win) wins++
    else losses++
    run = win ? (run > 0 ? run + 1 : 1) : run < 0 ? run - 1 : -1
    if (run > longestWin) longestWin = run
    if (run < longestLoss) longestLoss = run
  }

  const brokeARule = (t: Trade) => RULE_KEYS.some((k) => t.rules[k] === false)
  const breaks = chron.filter(brokeARule)

  let sinceBreak: number | null = null
  let lastBreakRule: string | null = null
  const lastBreakIndex = chron.map(brokeARule).lastIndexOf(true)
  if (lastBreakIndex >= 0) {
    sinceBreak = chron.length - 1 - lastBreakIndex
    const t = chron[lastBreakIndex]
    lastBreakRule = RULE_KEYS.find((k) => t.rules[k] === false) ?? null
  } else if (chron.some((t) => RULE_KEYS.some((k) => t.rules[k] !== null))) {
    // Rules recorded, none broken — a real streak, not missing data.
    sinceBreak = chron.length
  }

  return {
    current: run,
    longestWin,
    longestLoss: Math.abs(longestLoss),
    sinceBreak,
    breaks: breaks.length,
    lastBreakRule,
    n: chron.length,
    wins,
    losses,
    decided: wins + losses,
  }
}

// ─── Drawdown ────────────────────────────────────────────────────────────────────────

export interface UnderwaterPoint {
  i: number
  date: string
  /** Percent below the running peak. Zero at a new high, negative otherwise. */
  depth: number
  equity: number
  peak: number
}

/**
 * The underwater curve: how far below the previous peak the account has been,
 * at every point.
 *
 * An equity curve flatters — it shows where you ended up. This shows what it
 * took to get there, which is the part that decides whether a system is
 * actually survivable at a given size.
 */
export function underwater(trades: Trade[], startingBalance = 0): UnderwaterPoint[] {
  const closed = trades
    .filter((t) => t.status === 'closed')
    .sort((a, b) => dateOf(a).getTime() - dateOf(b).getTime())

  let equity = startingBalance
  let peak = startingBalance
  const out: UnderwaterPoint[] = []

  closed.forEach((t, i) => {
    equity += t.pnl ?? 0
    if (equity > peak) peak = equity
    out.push({
      i: i + 1,
      date: dateOf(t).toISOString(),
      // Against peak equity, not peak profit: a $500 dip is 5% of a $10k
      // account and 50% of a $1k one, and only the first is survivable.
      depth: peak > 0 ? round(((equity - peak) / peak) * 100, 2) : 0,
      equity: round(equity, 2),
      peak: round(peak, 2),
    })
  })

  return out
}

// ─── Months ──────────────────────────────────────────────────────────────────────────

export interface MonthCell {
  /** YYYY-MM. */
  key: string
  year: number
  month: number
  label: string
  n: number
  wins: number
  totalR: number
  avgR: number
  pnl: number
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Closed trades bucketed by calendar month, oldest first, with empty months in
 * between filled in.
 *
 * The gaps are the point. A month with no trades is information — it is either
 * discipline or a break — and a list that silently skips it turns an eight-week
 * absence into two adjacent cells.
 */
export function byMonth(trades: Trade[]): MonthCell[] {
  const closed = trades
    .filter((t) => t.status === 'closed')
    .sort((a, b) => dateOf(a).getTime() - dateOf(b).getTime())

  if (!closed.length) return []

  const buckets = new Map<string, Trade[]>()
  for (const t of closed) {
    const d = dateOf(t)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const arr = buckets.get(key)
    if (arr) arr.push(t)
    else buckets.set(key, [t])
  }

  const first = dateOf(closed[0])
  const last = dateOf(closed[closed.length - 1])

  const cells: MonthCell[] = []
  const cursor = new Date(first.getFullYear(), first.getMonth(), 1)
  const end = new Date(last.getFullYear(), last.getMonth(), 1)

  while (cursor <= end) {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const key = `${year}-${String(month + 1).padStart(2, '0')}`
    const list = buckets.get(key) ?? []
    const rs = list.map((t) => t.rMultiple).filter((r): r is number => r !== null)
    const totalR = rs.reduce((s, r) => s + r, 0)

    cells.push({
      key,
      year,
      month,
      label: MONTH_NAMES[month],
      n: list.length,
      wins: list.filter((t) => t.outcome === 'win').length,
      totalR: round(totalR, 2),
      avgR: rs.length ? round(totalR / rs.length, 2) : 0,
      pnl: round(list.reduce((s, t) => s + (t.pnl ?? 0), 0), 2),
    })

    cursor.setMonth(cursor.getMonth() + 1)
  }

  return cells
}
