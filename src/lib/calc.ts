import type { Direction, Outcome, Stats, Trade } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Trade arithmetic
//
// A note on P&L: forex CFD P&L depends on the quote currency and the AUD
// conversion at close, which we can't reconstruct from price alone for cross
// pairs. So $ P&L is taken from the broker (CSV or ticket) wherever possible,
// and only estimated when the user is entering by hand.
//
// R-multiple is the primary metric throughout the app precisely because it
// sidesteps all of that: pnl ÷ riskAmount is exact regardless of currency.
// ─────────────────────────────────────────────────────────────────────────────

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

/**
 * Estimated P&L from raw price movement. Correct for pairs quoted in the
 * account currency; an approximation otherwise. Broker figures win when present.
 */
export function estimatePnl(opts: {
  direction: Direction
  entryPrice: number | null
  exitPrice: number | null
  positionSize: number | null
}): number | null {
  const { direction, entryPrice, exitPrice, positionSize } = opts
  if (entryPrice === null || exitPrice === null || positionSize === null) return null
  if (positionSize <= 0) return null
  const move = direction === 'long' ? exitPrice - entryPrice : entryPrice - exitPrice
  return round(move * positionSize, 2)
}

/** How much one R is worth, in price terms. */
export function stopDistance(opts: {
  direction: Direction
  entryPrice: number | null
  stopLoss: number | null
}): number | null {
  const { direction, entryPrice, stopLoss } = opts
  if (entryPrice === null || stopLoss === null) return null
  const dist = direction === 'long' ? entryPrice - stopLoss : stopLoss - entryPrice
  return dist > 0 ? dist : null
}

/** Position size that puts exactly `riskAmount` at risk over the stop distance. */
export function positionSizeFor(opts: {
  direction: Direction
  entryPrice: number | null
  stopLoss: number | null
  riskAmount: number | null
}): number | null {
  const dist = stopDistance(opts)
  const { riskAmount } = opts
  if (dist === null || riskAmount === null || riskAmount <= 0) return null
  return round(riskAmount / dist, 4)
}

export function riskAmountFor(balance: number | null, riskPercent: number | null): number | null {
  if (balance === null || riskPercent === null) return null
  return round((balance * riskPercent) / 100, 2)
}

export function riskPercentFor(balance: number | null, riskAmount: number | null): number | null {
  if (balance === null || riskAmount === null || balance <= 0) return null
  return round((riskAmount / balance) * 100, 2)
}

export function rMultiple(pnl: number | null, riskAmount: number | null): number | null {
  if (pnl === null || riskAmount === null || riskAmount <= 0) return null
  return round(pnl / riskAmount, 2)
}

/**
 * Planned reward-to-risk from entry, stop and target. Returns null when the
 * strategy has no fixed target — which is the normal case here, since the
 * stop is trailed rather than a TP being set.
 */
export function plannedRR(opts: {
  direction: Direction
  entryPrice: number | null
  stopLoss: number | null
  takeProfit: number | null
}): number | null {
  const dist = stopDistance(opts)
  const { direction, entryPrice, takeProfit } = opts
  if (dist === null || takeProfit === null || entryPrice === null) return null
  const reward = direction === 'long' ? takeProfit - entryPrice : entryPrice - takeProfit
  if (reward <= 0) return null
  return round(reward / dist, 2)
}

export function outcomeFromPnl(pnl: number | null): Outcome | null {
  if (pnl === null) return null
  if (pnl > 0.005) return 'win'
  if (pnl < -0.005) return 'loss'
  return 'breakeven'
}

export function round(n: number, dp: number): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

// ─── Aggregates ──────────────────────────────────────────────────────────────

const EMPTY_STATS: Stats = {
  total: 0, open: 0, closed: 0, wins: 0, losses: 0, breakeven: 0,
  winRate: 0, totalPnl: 0, avgR: 0, expectancy: 0, profitFactor: null,
  grossProfit: 0, grossLoss: 0, avgWin: 0, avgLoss: 0,
  bestTrade: 0, worstTrade: 0, maxDrawdown: 0, maxDrawdownPct: 0, currentStreak: 0,
}

export function computeStats(trades: Trade[]): Stats {
  if (!trades.length) return { ...EMPTY_STATS }

  const closed = trades.filter((t) => t.status === 'closed')
  const open = trades.length - closed.length

  if (!closed.length) {
    return { ...EMPTY_STATS, total: trades.length, open }
  }

  const wins = closed.filter((t) => t.outcome === 'win')
  const losses = closed.filter((t) => t.outcome === 'loss')
  const breakeven = closed.filter((t) => t.outcome === 'breakeven')

  const pnls = closed.map((t) => t.pnl ?? 0)
  const totalPnl = pnls.reduce((s, p) => s + p, 0)

  const grossProfit = pnls.filter((p) => p > 0).reduce((s, p) => s + p, 0)
  const grossLoss = Math.abs(pnls.filter((p) => p < 0).reduce((s, p) => s + p, 0))

  // R-multiples are only meaningful where risk was recorded.
  const rs = closed.map((t) => t.rMultiple).filter((r): r is number => r !== null)
  const avgR = rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : 0

  const avgWin = wins.length ? grossProfit / wins.length : 0
  const avgLoss = losses.length ? grossLoss / losses.length : 0
  const winRate = closed.length ? (wins.length / closed.length) * 100 : 0

  // Expectancy in R — the average R you can expect from taking the next trade.
  const expectancy = rs.length ? avgR : 0

  const profitFactor = grossLoss > 0 ? round(grossProfit / grossLoss, 2) : null

  // Drawdown walks the equity curve in trade order (oldest first).
  const chron = [...closed].sort(
    (a, b) => dateOf(a).getTime() - dateOf(b).getTime()
  )
  let equity = 0
  let peak = 0
  let maxDd = 0
  let maxDdPct = 0
  for (const t of chron) {
    equity += t.pnl ?? 0
    if (equity > peak) peak = equity
    const dd = peak - equity
    if (dd > maxDd) {
      maxDd = dd
      maxDdPct = peak > 0 ? (dd / peak) * 100 : 0
    }
  }

  // Streak: consecutive same-outcome closed trades, newest first.
  // Breakevens are skipped rather than breaking a run.
  const newestFirst = [...chron].reverse().filter((t) => t.outcome !== 'breakeven')
  let streak = 0
  if (newestFirst.length) {
    const first = newestFirst[0].outcome
    for (const t of newestFirst) {
      if (t.outcome !== first) break
      streak++
    }
    if (first === 'loss') streak = -streak
  }

  return {
    total: trades.length,
    open,
    closed: closed.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: breakeven.length,
    winRate,
    totalPnl: round(totalPnl, 2),
    avgR: round(avgR, 2),
    expectancy: round(expectancy, 2),
    profitFactor,
    grossProfit: round(grossProfit, 2),
    grossLoss: round(grossLoss, 2),
    avgWin: round(avgWin, 2),
    avgLoss: round(avgLoss, 2),
    bestTrade: pnls.length ? round(Math.max(...pnls), 2) : 0,
    worstTrade: pnls.length ? round(Math.min(...pnls), 2) : 0,
    maxDrawdown: round(maxDd, 2),
    maxDrawdownPct: round(maxDdPct, 2),
    currentStreak: streak,
  }
}

export function dateOf(t: Trade): Date {
  const raw = t.exitDate ?? t.tradeDate
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? new Date(0) : d
}

/** Cumulative P&L by closed trade, oldest first. */
export function equityCurve(
  trades: Trade[],
  startingBalance = 0
): { i: number; date: string; equity: number; pnl: number; ticker: string }[] {
  const closed = trades
    .filter((t) => t.status === 'closed')
    .sort((a, b) => dateOf(a).getTime() - dateOf(b).getTime())

  let equity = startingBalance
  return closed.map((t, i) => {
    equity += t.pnl ?? 0
    return {
      i: i + 1,
      date: dateOf(t).toISOString(),
      equity: round(equity, 2),
      pnl: round(t.pnl ?? 0, 2),
      ticker: t.ticker,
    }
  })
}

/** Group closed trades and summarise each bucket. */
export function groupPerformance<K extends string>(
  trades: Trade[],
  keyOf: (t: Trade) => K | null
): { key: K; count: number; wins: number; pnl: number; avgR: number; winRate: number }[] {
  const buckets = new Map<K, Trade[]>()
  for (const t of trades) {
    if (t.status !== 'closed') continue
    const k = keyOf(t)
    if (k === null) continue
    const arr = buckets.get(k)
    if (arr) arr.push(t)
    else buckets.set(k, [t])
  }

  return [...buckets.entries()]
    .map(([key, list]) => {
      const wins = list.filter((t) => t.outcome === 'win').length
      const pnl = list.reduce((s, t) => s + (t.pnl ?? 0), 0)
      const rs = list.map((t) => t.rMultiple).filter((r): r is number => r !== null)
      return {
        key,
        count: list.length,
        wins,
        pnl: round(pnl, 2),
        avgR: rs.length ? round(rs.reduce((s, r) => s + r, 0) / rs.length, 2) : 0,
        winRate: list.length ? round((wins / list.length) * 100, 1) : 0,
      }
    })
    .sort((a, b) => b.count - a.count)
}

// ─── Formatting ──────────────────────────────────────────────────────────────

export function fmtMoney(n: number | null | undefined, dp = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  const sign = n < 0 ? '-' : ''
  return `${sign}$${Math.abs(n).toLocaleString('en-AU', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  })}`
}

/** Money with an explicit +/- — for anything that represents a change. */
export function fmtSigned(n: number | null | undefined, dp = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  const s = fmtMoney(Math.abs(n), dp)
  return n < 0 ? `−${s.replace('$', '$')}` : `+${s}`
}

export function fmtR(r: number | null | undefined): string {
  if (r === null || r === undefined || !Number.isFinite(r)) return '—'
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(2)}R`
}

export function fmtPct(n: number | null | undefined, dp = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return `${n.toFixed(dp)}%`
}

/** Prices need pair-appropriate precision — JPY crosses use 3dp, others 5dp. */
export function fmtPrice(n: number | null | undefined, ticker?: string): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  const dp = ticker && /JPY$/i.test(ticker) ? 3 : n >= 100 ? 2 : 5
  return n.toFixed(dp)
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-AU', {
    day: '2-digit', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export function valueClass(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n) || n === 0) return 'val-flat'
  return n > 0 ? 'val-up' : 'val-down'
}
