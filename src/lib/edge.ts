import type { RuleKey, Trade } from '@/types'
import { RULES, ruleScore } from '@/types'
import { round, dateOf } from './calc'

// ─────────────────────────────────────────────────────────────────────────────
// Edge measurement.
//
// The single question this file exists to answer honestly: is there an edge, or
// is this the number of trades where a losing strategy still looks profitable?
//
// A point estimate can't answer that. "Expectancy +0.4R" over 29 trades sounds
// like an edge and is entirely consistent with having none, so every figure here
// comes with the uncertainty attached.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deterministic PRNG (mulberry32). A fixed seed matters here: a bootstrap on
 * Math.random would give a slightly different confidence interval on every
 * render, which would look like the data was changing when it wasn't.
 */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface EdgeEstimate {
  /** Number of closed trades with a recorded R-multiple. */
  n: number
  mean: number
  /** 95% percentile-bootstrap interval around the mean. */
  lower: number
  upper: number
  /** True when the whole interval sits above zero. */
  positive: boolean
  /** True when the interval spans zero — i.e. break-even is still plausible. */
  inconclusive: boolean
  /** Roughly how many trades would be needed to resolve it, or null if resolved. */
  tradesNeeded: number | null
  /** Below this the interval is so wide the estimate is meaningless. */
  tooFew: boolean
}

const MIN_FOR_ESTIMATE = 10
const BOOTSTRAP_SAMPLES = 2000

/**
 * Bootstrap the mean R-multiple. Percentile method — no normality assumption,
 * which matters because a trailing-stop R distribution is heavily right-skewed
 * (a cluster of −1R losses and a thin tail of large winners), so the textbook
 * t-interval would be wrong in exactly the direction that flatters the trader.
 */
export function estimateEdge(trades: Trade[]): EdgeEstimate {
  const rs = trades
    .filter((t) => t.status === 'closed' && t.rMultiple !== null)
    .map((t) => t.rMultiple as number)

  const n = rs.length
  if (n === 0) {
    return { n: 0, mean: 0, lower: 0, upper: 0, positive: false, inconclusive: true, tradesNeeded: MIN_FOR_ESTIMATE, tooFew: true }
  }

  const mean = rs.reduce((s, r) => s + r, 0) / n

  if (n < MIN_FOR_ESTIMATE) {
    return {
      n, mean: round(mean, 2), lower: 0, upper: 0,
      positive: false, inconclusive: true,
      tradesNeeded: MIN_FOR_ESTIMATE - n, tooFew: true,
    }
  }

  const rand = rng(0x5eed)
  const means = new Float64Array(BOOTSTRAP_SAMPLES)
  for (let b = 0; b < BOOTSTRAP_SAMPLES; b++) {
    let sum = 0
    for (let i = 0; i < n; i++) sum += rs[Math.floor(rand() * n)]
    means[b] = sum / n
  }
  means.sort()

  const lower = means[Math.floor(BOOTSTRAP_SAMPLES * 0.025)]
  const upper = means[Math.floor(BOOTSTRAP_SAMPLES * 0.975)]
  const inconclusive = lower <= 0 && upper >= 0

  // The interval narrows with √n, so to pull a boundary to zero you need
  // roughly (current half-width ÷ distance from zero)² times the sample.
  // Rough by construction — presented as an order of magnitude, not a target.
  let tradesNeeded: number | null = null
  if (inconclusive && mean !== 0) {
    const halfWidth = (upper - lower) / 2
    const ratio = halfWidth / Math.abs(mean)
    tradesNeeded = Math.max(5, Math.ceil(n * (ratio * ratio) - n))
    if (tradesNeeded > 500) tradesNeeded = null // honestly: not resolvable soon
  }

  return {
    n,
    mean: round(mean, 2),
    lower: round(lower, 2),
    upper: round(upper, 2),
    positive: lower > 0,
    inconclusive,
    tradesNeeded,
    tooFew: false,
  }
}

// ─── Rule cost ───────────────────────────────────────────────────────────────

export interface RuleCost {
  rule: (typeof RULES)[number]
  followedN: number
  brokenN: number
  followedR: number | null
  brokenR: number | null
  /** Realised dollars on the trades where this rule was broken. */
  brokenPnl: number
  /** What those trades would have returned at the followed-group's average R. */
  counterfactualPnl: number | null
  /** counterfactual − actual. Positive means breaking it cost money. */
  costOfBreaking: number | null
  comparable: boolean
}

/**
 * What each rule is worth, in R and in dollars.
 *
 * The dollar figure is a counterfactual — "these trades at your normal rate"
 * — not a measurement. It's the more motivating number, which is exactly why
 * it needs the sample-size gate: `comparable` is false unless both sides have
 * at least five trades, and the UI must not show a dollar figure without it.
 */
export function ruleCosts(trades: Trade[]): RuleCost[] {
  const closed = trades.filter((t) => t.status === 'closed')

  const avgR = (list: Trade[]): number | null => {
    const rs = list.map((t) => t.rMultiple).filter((r): r is number => r !== null)
    return rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : null
  }

  return RULES.map((rule) => {
    const followed = closed.filter((t) => t.rules[rule.key] === true)
    const broken = closed.filter((t) => t.rules[rule.key] === false)

    const fR = avgR(followed)
    const bR = avgR(broken)
    const brokenPnl = broken.reduce((s, t) => s + (t.pnl ?? 0), 0)
    const comparable = followed.length >= 5 && broken.length >= 5

    // Value each broken trade at its own risk, so a big position and a small
    // one aren't treated as equivalent.
    let counterfactualPnl: number | null = null
    if (comparable && fR !== null) {
      const risked = broken.reduce((s, t) => s + (t.riskAmount ?? 0), 0)
      counterfactualPnl = risked > 0 ? fR * risked : null
    }

    return {
      rule,
      followedN: followed.length,
      brokenN: broken.length,
      followedR: fR === null ? null : round(fR, 2),
      brokenR: bR === null ? null : round(bR, 2),
      brokenPnl: round(brokenPnl, 2),
      counterfactualPnl: counterfactualPnl === null ? null : round(counterfactualPnl, 2),
      costOfBreaking:
        counterfactualPnl === null ? null : round(counterfactualPnl - brokenPnl, 2),
      comparable,
    }
  })
}

// ─── Journal completeness ────────────────────────────────────────────────────

export interface Completeness {
  closed: number
  withRules: number
  missingRules: Trade[]
  missingRisk: Trade[]
  /** 0–1. How much of the rule analysis is actually backed by data. */
  coverage: number
}

/**
 * How much of the journal can actually answer the rule question.
 *
 * A closed trade with no rules recorded is invisible to every comparison on the
 * Analysis page. Without surfacing this, the rule analysis silently rests on a
 * fraction of the data and looks just as authoritative as if it rested on all
 * of it.
 */
export function completeness(trades: Trade[]): Completeness {
  const closed = trades.filter((t) => t.status === 'closed')
  const withRules = closed.filter((t) => ruleScore(t.rules).answered > 0)
  return {
    closed: closed.length,
    withRules: withRules.length,
    missingRules: closed.filter((t) => ruleScore(t.rules).answered === 0),
    // No risk amount means no R-multiple, which excludes the trade from the
    // edge estimate as well as every R-based comparison.
    missingRisk: closed.filter((t) => t.riskAmount === null || t.rMultiple === null),
    coverage: closed.length ? withRules.length / closed.length : 0,
  }
}

// ─── Hold time ───────────────────────────────────────────────────────────────

export interface HoldTime {
  winnersMedianHours: number | null
  losersMedianHours: number | null
  winnersN: number
  losersN: number
  /** winners ÷ losers. Below ~1 suggests winners are being cut short. */
  ratio: number | null
  comparable: boolean
  /** The longest-held trades, to eyeball what a runner actually looks like. */
  longest: { trade: Trade; hours: number }[]
}

function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function holdHours(t: Trade): number | null {
  if (!t.exitDate) return null
  const open = new Date(t.tradeDate).getTime()
  const close = new Date(t.exitDate).getTime()
  if (Number.isNaN(open) || Number.isNaN(close)) return null
  const h = (close - open) / 3_600_000
  return h >= 0 ? h : null
}

/**
 * How long winners are held versus losers.
 *
 * This is the diagnostic that matters most for a trailing-stop strategy with no
 * fixed target: the whole approach depends on winners being allowed to run
 * further than losers. If the median winner is held no longer than the median
 * loser, the trail isn't doing its job — and no other view in the app surfaces
 * that. Median rather than mean because one trade left open over a holiday
 * would drag an average anywhere.
 */
export function holdTimes(trades: Trade[]): HoldTime {
  const closed = trades.filter((t) => t.status === 'closed')

  const withHours = closed
    .map((t) => ({ trade: t, hours: holdHours(t) }))
    .filter((x): x is { trade: Trade; hours: number } => x.hours !== null)

  const winners = withHours.filter((x) => x.trade.outcome === 'win').map((x) => x.hours)
  const losers = withHours.filter((x) => x.trade.outcome === 'loss').map((x) => x.hours)

  const wMed = median(winners)
  const lMed = median(losers)

  return {
    winnersMedianHours: wMed === null ? null : round(wMed, 1),
    losersMedianHours: lMed === null ? null : round(lMed, 1),
    winnersN: winners.length,
    losersN: losers.length,
    ratio: wMed !== null && lMed !== null && lMed > 0 ? round(wMed / lMed, 2) : null,
    comparable: winners.length >= 5 && losers.length >= 5,
    longest: [...withHours].sort((a, b) => b.hours - a.hours).slice(0, 5),
  }
}

/** Compact duration: "3d 4h", "18h", "45m". */
export function fmtDuration(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours)) return '—'
  if (hours < 1) return `${Math.round(hours * 60)}m`
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)}h`
  const d = Math.floor(hours / 24)
  const h = Math.round(hours % 24)
  return h ? `${d}d ${h}h` : `${d}d`
}

// ─── Streak context ──────────────────────────────────────────────────────────

/**
 * Performance immediately after a loss versus overall — the cheapest available
 * check for revenge trading, using data already in the journal.
 */
export function afterLoss(trades: Trade[]): {
  n: number
  avgR: number | null
  baselineR: number | null
  comparable: boolean
} {
  const chron = trades
    .filter((t) => t.status === 'closed')
    .sort((a, b) => dateOf(a).getTime() - dateOf(b).getTime())

  const following: number[] = []
  for (let i = 1; i < chron.length; i++) {
    if (chron[i - 1].outcome === 'loss' && chron[i].rMultiple !== null) {
      following.push(chron[i].rMultiple as number)
    }
  }

  const all = chron.map((t) => t.rMultiple).filter((r): r is number => r !== null)
  const avg = (xs: number[]) => (xs.length ? round(xs.reduce((s, x) => s + x, 0) / xs.length, 2) : null)

  return {
    n: following.length,
    avgR: avg(following),
    baselineR: avg(all),
    comparable: following.length >= 8,
  }
}

export type { RuleKey }
