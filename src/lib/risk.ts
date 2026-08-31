import { round } from './calc'
import type { Trade } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Survival: sizing, drawdown and losing runs.
//
// The rest of the app answers "do I have an edge". It has never answered the
// other half, which is whether the size you trade it at can survive it. Those
// are different questions with different answers: a strategy with a real +0.3R
// edge will still wipe out an account risking 8% a trade, and the wipe-out is
// not bad luck, it is arithmetic.
//
// Everything here resamples HIS OWN closed R-multiples rather than assuming a
// distribution. That matters for the same reason the confidence intervals are
// a bootstrap: a trailed stop produces a cluster of −1R losses and a thin right
// tail, and every closed-form formula for risk of ruin assumes something much
// tidier than that. Resampling keeps the real shape, skew and all.
//
// What it assumes, and does not hide: that the next trade is drawn from the
// same distribution as the last ones, independently. Real trading violates both
// — edges decay, and losses cluster when the market changes character or when
// you tilt. So these are the odds for a version of you who keeps trading
// exactly as the record says, which is the optimistic case.
// ─────────────────────────────────────────────────────────────────────────────

const PATHS = 4000
const SEED = 0x5eed // same seed as edge.ts, so figures never drift between renders

/** mulberry32 — small, fast, and identical across browsers, unlike Math.random. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function closedRs(trades: Trade[]): number[] {
  return trades
    .filter((t) => t.status === 'closed' && t.rMultiple !== null)
    .map((t) => t.rMultiple as number)
}

// ─── Drawdown risk ─────────────────────────────────────────────────────────────────

export interface RiskOutcome {
  /** Fraction of the account risked per trade, e.g. 0.01. */
  fraction: number
  /** P(the account is ever this far below its high water mark within the horizon). */
  drawdown20: number
  drawdown35: number
  drawdown50: number
  /** Multiplier on starting equity: 1.2 means +20%. */
  medianGrowth: number
  p05Growth: number
  p95Growth: number
}

/**
 * Monte Carlo over resampled R-multiples.
 *
 * Equity compounds — risking 1% means 1% *of the current balance*, so a
 * drawdown shrinks the next bet and the path is multiplicative, not additive.
 * Modelling it additively is the classic way to make ruin look impossible.
 */
export function simulateRisk(
  rs: number[],
  fraction: number,
  horizon: number
): RiskOutcome {
  const empty: RiskOutcome = {
    fraction, drawdown20: 0, drawdown35: 0, drawdown50: 0,
    medianGrowth: 1, p05Growth: 1, p95Growth: 1,
  }
  if (rs.length === 0 || horizon <= 0) return empty

  const rand = rng(SEED)
  const finals = new Float64Array(PATHS)
  let hit20 = 0
  let hit35 = 0
  let hit50 = 0

  for (let p = 0; p < PATHS; p++) {
    let equity = 1
    let peak = 1
    let worst = 0

    for (let i = 0; i < horizon; i++) {
      const r = rs[Math.floor(rand() * rs.length)]
      equity *= 1 + fraction * r
      // A single trade cannot take the account below zero in this model, but
      // an absurd fraction plus a large negative R can. Floor it rather than
      // letting the path go negative and produce nonsense.
      if (equity <= 0.0001) { equity = 0.0001; worst = 1; break }
      if (equity > peak) peak = equity
      const dd = 1 - equity / peak
      if (dd > worst) worst = dd
    }

    if (worst >= 0.2) hit20++
    if (worst >= 0.35) hit35++
    if (worst >= 0.5) hit50++
    finals[p] = equity
  }

  finals.sort()
  return {
    fraction,
    drawdown20: hit20 / PATHS,
    drawdown35: hit35 / PATHS,
    drawdown50: hit50 / PATHS,
    medianGrowth: finals[Math.floor(PATHS * 0.5)],
    p05Growth: finals[Math.floor(PATHS * 0.05)],
    p95Growth: finals[Math.floor(PATHS * 0.95)],
  }
}

// ─── Growth-optimal fraction ───────────────────────────────────────────────────

export interface KellyEstimate {
  /** The fraction that maximises expected log growth on this sample. */
  full: number
  /** False when the sample has no positive expectancy to size against. */
  meaningful: boolean
}

// Deliberately no "suggested" or "safe" fraction here. An earlier version
// exported quarter-Kelly, the UI printed it as "the usual practical ceiling",
// and a reader correctly concluded the app was inviting him to size up ten-fold.
// There is no derived number that is safe to publish next to an edge estimated
// from a few dozen trades, so the library does not offer one.

/**
 * Kelly for a set of R-multiples: the f maximising E[log(1 + f·r)].
 *
 * Scanned rather than solved, because the closed form only exists for the
 * two-outcome case and an R distribution has as many outcomes as trades.
 *
 * The number this returns is almost always far too large to trade. Kelly
 * assumes the distribution is known; on 30 trades it is estimated, and an
 * over-estimated edge produces an over-sized bet whose downside is compounding
 * and permanent. Pair it with kellyRange() wherever it is shown — on a few
 * dozen trades the spread usually covers most of the answers it could give.
 */
export function kelly(rs: number[]): KellyEstimate {
  if (rs.length < 10) return { full: 0, meaningful: false }
  const mean = rs.reduce((s, r) => s + r, 0) / rs.length
  if (mean <= 0) return { full: 0, meaningful: false }

  const worst = Math.min(...rs)
  // Beyond this the log is undefined — a bet that can lose more than the account.
  const cap = worst < 0 ? Math.min(1, -1 / worst - 1e-6) : 1

  let best = 0
  let bestGrowth = 0
  for (let f = 0.001; f <= cap; f += 0.001) {
    let g = 0
    for (const r of rs) {
      const x = 1 + f * r
      if (x <= 0) { g = -Infinity; break }
      g += Math.log(x)
    }
    g /= rs.length
    if (g > bestGrowth) { bestGrowth = g; best = f }
  }

  return { full: round(best, 4), meaningful: best > 0 }
}

/**
 * How much the Kelly figure can be trusted, by re-estimating it from resamples
 * of the same size.
 *
 * This exists because the point estimate is the single most dangerous number
 * the app produces. On a few dozen trades it is not a measurement, it is a
 * draw: a distribution whose true optimum is 20% will hand back anything from
 * 0% to 40% depending which trades happened to land in the sample. Printing
 * "23.4%" without that spread invites a reader to treat one decimal place as
 * precision, and the downside of acting on it compounds and does not come back.
 */
export function kellyRange(rs: number[]): { lower: number; upper: number; wide: boolean } {
  if (rs.length < 10) return { lower: 0, upper: 0, wide: true }

  const rand = rng(SEED)
  const ests: number[] = []
  // Fewer resamples than the drawdown sim: each one runs a full Kelly scan,
  // and 200 is plenty to show a range that spans most of the possible answers.
  for (let b = 0; b < 200; b++) {
    const samp = Array.from({ length: rs.length }, () => rs[Math.floor(rand() * rs.length)])
    ests.push(kelly(samp).full)
  }
  ests.sort((a, b) => a - b)

  const lower = ests[Math.floor(ests.length * 0.05)]
  const upper = ests[Math.floor(ests.length * 0.95)]
  return {
    lower: round(lower, 4),
    upper: round(upper, 4),
    // A spread wider than 10 points of account risk means the sample cannot
    // locate the optimum at all, which is the honest headline.
    wide: upper - lower > 0.1,
  }
}

// ─── Losing runs ───────────────────────────────────────────────────────────────────

export interface StreakExpectation {
  /** Trades the expectation is computed over. */
  n: number
  lossProb: number
  /** The longest losing run you should expect to see across n trades. */
  expectedLongest: number
  /** P(at least one run of `k` or more losses somewhere in n trades). */
  probabilityOf: (k: number) => number
  meaningful: boolean
}

/**
 * Exact, by dynamic programming over the run length, rather than the usual
 * log approximation — n is small enough that there is no reason to approximate,
 * and the approximation is worst exactly where it gets read (short samples).
 *
 * `state[j]` is the probability of having survived i trades with a current
 * unbroken losing run of length j. Mass that reaches j = k has hit the run and
 * is absorbed, so what remains sums to P(no run of k yet).
 */
function noRunProbability(lossProb: number, k: number, n: number): number {
  if (k <= 0) return 0
  if (k > n) return 1
  const win = 1 - lossProb
  let state = new Float64Array(k)
  state[0] = 1

  for (let i = 0; i < n; i++) {
    const next = new Float64Array(k)
    for (let j = 0; j < k; j++) {
      const mass = state[j]
      if (mass === 0) continue
      next[0] += mass * win           // a win resets the run
      if (j + 1 < k) next[j + 1] += mass * lossProb // a loss extends it
      // j + 1 === k is absorbed: the run happened, that mass leaves the system
    }
    state = next
  }

  let total = 0
  for (let j = 0; j < k; j++) total += state[j]
  return total
}

export function streakExpectation(
  wins: number,
  losses: number,
  n: number
): StreakExpectation {
  const decided = wins + losses
  const lossProb = decided > 0 ? losses / decided : 0

  const base: StreakExpectation = {
    n, lossProb, expectedLongest: 0,
    probabilityOf: () => 0,
    // Under ten decided trades the win rate itself is a guess, and a
    // probability built on a guessed probability is theatre.
    meaningful: decided >= 10 && lossProb > 0 && lossProb < 1 && n > 0,
  }
  if (!base.meaningful) return base

  const probabilityOf = (k: number) => 1 - noRunProbability(lossProb, k, n)

  // E[longest] = Σ P(longest ≥ k) over k ≥ 1.
  let expected = 0
  for (let k = 1; k <= n; k++) {
    const p = probabilityOf(k)
    if (p < 1e-6) break
    expected += p
  }

  return { ...base, expectedLongest: round(expected, 1), probabilityOf }
}

// ─── Rolling expectancy ────────────────────────────────────────────────────────

export interface RollingPoint {
  i: number
  /** Mean R over the trailing window ending at this trade. */
  window: number
  /** Mean R over every trade up to and including this one. */
  cumulative: number
  date: string
}

/**
 * Trailing-window mean R, alongside the all-time mean.
 *
 * Both lines matter and neither alone is honest. The window answers "is it
 * getting better or worse lately", which is the question actually being asked;
 * the cumulative line is the anchor that shows how little the recent wobble
 * has moved the real number. A window on its own invites reading noise as a
 * trend — over ten trades a single +3R winner moves the line by 0.3R.
 */
export function rollingExpectancy(trades: Trade[], window = 10): RollingPoint[] {
  const closed = trades
    .filter((t) => t.status === 'closed' && t.rMultiple !== null)
    .sort((a, b) => {
      const da = new Date(a.exitDate ?? a.tradeDate).getTime()
      const db = new Date(b.exitDate ?? b.tradeDate).getTime()
      return da - db
    })

  if (closed.length < window) return []

  const out: RollingPoint[] = []
  let runningTotal = 0

  for (let i = 0; i < closed.length; i++) {
    runningTotal += closed[i].rMultiple as number
    if (i + 1 < window) continue

    let sum = 0
    for (let j = i - window + 1; j <= i; j++) sum += closed[j].rMultiple as number

    out.push({
      i: i + 1,
      window: round(sum / window, 3),
      cumulative: round(runningTotal / (i + 1), 3),
      date: closed[i].exitDate ?? closed[i].tradeDate,
    })
  }

  return out
}

// ─── Typical risk actually taken ───────────────────────────────────────────────

/**
 * The median risk % across trades that recorded one — what he *actually* sizes
 * at, rather than what the strategy says. Median, not mean: one mis-keyed 12%
 * would drag a mean somewhere he has never traded.
 */
export function typicalRiskPercent(trades: Trade[], fallback = 1): number {
  const ps = trades
    .map((t) => t.riskPercent)
    .filter((p): p is number => p !== null && Number.isFinite(p) && p > 0 && p < 25)
    .sort((a, b) => a - b)

  if (!ps.length) return fallback
  const mid = Math.floor(ps.length / 2)
  const median = ps.length % 2 ? ps[mid] : (ps[mid - 1] + ps[mid]) / 2
  return round(median, 2)
}
