// ─────────────────────────────────────────────────────────────────────────────
// Trackr data model
//
// Schema v2. v1 (the previous build) is migrated in place — see
// src/services/migration.ts. Every v1 field is either kept under the same
// name or explicitly mapped, so no trade data is lost.
// ─────────────────────────────────────────────────────────────────────────────

export const SCHEMA_VERSION = 2

// ─── Rules ───────────────────────────────────────────────────────────────────
// The five rules of the strategy. Fixed, not free text — the whole point is to
// correlate adherence against outcome, which needs a stable set of keys.

export const RULE_KEYS = [
  'zoneTouches',
  'rejectionCandle',
  'trendAligned',
  'rrMinimum',
  'riskCorrect',
] as const

export type RuleKey = (typeof RULE_KEYS)[number]

export interface RuleDef {
  key: RuleKey
  label: string
  detail: string
}

export const RULES: RuleDef[] = [
  {
    key: 'zoneTouches',
    label: 'Zone had 3+ touches',
    detail: 'Price has tested and rejected from this level at least three times on the daily.',
  },
  {
    key: 'rejectionCandle',
    label: 'Rejection candle at zone',
    detail: 'A clear rejection candle on the 4H confirming the zone held before entry.',
  },
  {
    key: 'trendAligned',
    label: 'With the daily trend',
    detail: 'Direction agrees with the 50/200 EMA on the daily. Counter-trend is the costliest mistake.',
  },
  {
    key: 'rrMinimum',
    label: 'At least 2:1 R:R',
    detail: 'Projected reward was a minimum of twice the risk at the point of entry.',
  },
  {
    key: 'riskCorrect',
    label: 'Risked ~1%',
    detail: 'Position sized so a stop-out costs approximately 1% of account equity.',
  },
]

/** null = not yet answered. Distinct from false, which means "broke this rule". */
export type RuleState = Record<RuleKey, boolean | null>

export function emptyRules(): RuleState {
  return {
    zoneTouches: null,
    rejectionCandle: null,
    trendAligned: null,
    rrMinimum: null,
    riskCorrect: null,
  }
}

/** How many rules were answered, and how many of those were followed. */
export function ruleScore(rules: RuleState | undefined): {
  followed: number
  answered: number
  broken: RuleKey[]
  complete: boolean
  allFollowed: boolean
} {
  const broken: RuleKey[] = []
  let followed = 0
  let answered = 0
  for (const key of RULE_KEYS) {
    const v = rules?.[key]
    if (v === null || v === undefined) continue
    answered++
    if (v) followed++
    else broken.push(key)
  }
  return {
    followed,
    answered,
    broken,
    complete: answered === RULE_KEYS.length,
    allFollowed: answered === RULE_KEYS.length && followed === RULE_KEYS.length,
  }
}

// ─── Trade ───────────────────────────────────────────────────────────────────

export type Direction = 'long' | 'short'
export type TradeStatus = 'open' | 'closed'
export type Outcome = 'win' | 'loss' | 'breakeven'
export type TradeSource = 'screenshot' | 'csv' | 'manual'

export const MISTAKES = [
  { value: 'revenge', label: 'Revenge trade' },
  { value: 'moved_stop', label: 'Moved stop against me' },
  { value: 'early_entry', label: 'Entered too early' },
  { value: 'late_entry', label: 'Entered too late' },
  { value: 'no_setup', label: 'No real setup' },
  { value: 'counter_trend', label: 'Traded counter-trend' },
  { value: 'oversized', label: 'Oversized position' },
  { value: 'overtraded', label: 'Overtraded' },
  { value: 'cut_early', label: 'Cut winner early' },
  { value: 'held_loser', label: 'Held loser too long' },
  { value: 'chased', label: 'Chased price' },
  { value: 'other', label: 'Other' },
] as const

export type MistakeValue = (typeof MISTAKES)[number]['value']

export const MISTAKE_LABELS: Record<string, string> = Object.fromEntries(
  MISTAKES.map((m) => [m.value, m.label])
)

/** 1 = flat/tired … 5 = wired/FOMO. 3 is the target state. */
export const EMOTIONS = [
  { value: 1, label: 'Flat', detail: 'Tired, bored, going through the motions' },
  { value: 2, label: 'Calm', detail: 'Relaxed but not especially sharp' },
  { value: 3, label: 'Focused', detail: 'Present, patient, following the plan' },
  { value: 4, label: 'Eager', detail: 'Keen to be in — watch for forcing it' },
  { value: 5, label: 'Charged', detail: 'FOMO, frustration, or overconfidence' },
] as const

/** AI's read of a chart screenshot. Explicitly a second opinion, not truth. */
export interface ChartRead {
  trend: string
  priceContext: string
  entryCandle: string
  notable: string
  /** Where the AI disagrees with the rules the user ticked. */
  disagreements: { rule: RuleKey; note: string }[]
  readAt: string
}

/** AI's post-trade review, generated once the trade is closed. */
export interface TradeReview {
  didWell: string[]
  didBadly: string[]
  verdict: string
  reviewedAt: string
}

/** What the vision model pulled off a broker ticket screenshot. */
export interface TicketExtract {
  ticker: string | null
  direction: Direction | null
  entryPrice: number | null
  stopLoss: number | null
  takeProfit: number | null
  positionSize: number | null
  openedAt: string | null
  /** Per-field 0–1 confidence, so the form can flag what to double-check. */
  confidence: Partial<Record<keyof Omit<TicketExtract, 'confidence' | 'warnings'>, number>>
  warnings: string[]
}

export interface Trade {
  id: string
  userId: string

  // ── Mechanical ──
  ticker: string
  direction: Direction
  entryPrice: number | null
  /** The stop as originally placed. Never overwritten when trailing. */
  stopLoss: number | null
  /** Where the stop actually sat at exit, if it was trailed. */
  finalStopLoss: number | null
  /** Usually null — the strategy trails rather than setting a fixed target. */
  takeProfit: number | null
  positionSize: number | null
  riskAmount: number | null
  riskPercent: number | null

  /** ISO datetime the position was opened. */
  tradeDate: string
  /** ISO datetime the position was closed. Null while open. */
  exitDate: string | null

  status: TradeStatus
  outcome: Outcome | null
  exitPrice: number | null
  /** Realised P&L in account currency (AUD). From the broker where possible. */
  pnl: number | null
  /** pnl ÷ riskAmount. Currency-agnostic, so it's the primary metric. */
  rMultiple: number | null

  // ── Context ──
  setupType: string
  timeframe: string
  emotion: number | null
  mistake: string
  notes: string
  rules: RuleState

  entryScreenshotUrl: string | null
  exitScreenshotUrl: string | null
  /** The broker ticket image, if the trade was logged from one. */
  ticketScreenshotUrl: string | null

  // ── AI ──
  entryChartRead: ChartRead | null
  exitChartRead: ChartRead | null
  review: TradeReview | null

  // ── Provenance ──
  source: TradeSource
  /** Stable hash of the broker row. Used to dedupe repeat CSV imports. */
  importHash: string | null
  schemaVersion: number

  createdAt: Date
  updatedAt: Date
}

/** What a form hands to `addTrade` — no server-managed fields. */
export type TradeDraft = Omit<Trade, 'id' | 'userId' | 'createdAt' | 'updatedAt'>

// ─── ASX holdings ────────────────────────────────────────────────────────────

export interface Holding {
  id: string
  userId: string
  /** ASX code without suffix, e.g. "CBA". */
  code: string
  name: string
  units: number
  /** Average cost per unit, in AUD, including brokerage. */
  avgCost: number
  /** ISO date of first purchase. */
  openedAt: string
  notes: string
  createdAt: Date
  updatedAt: Date
}

export type HoldingDraft = Omit<Holding, 'id' | 'userId' | 'createdAt' | 'updatedAt'>

export interface Quote {
  code: string
  price: number | null
  change: number | null
  changePercent: number | null
  currency: string
  /** ISO datetime of the quote as reported by the source. */
  asOf: string | null
  stale: boolean
  error?: string
}

// ─── User profile ────────────────────────────────────────────────────────────

export interface UserProfile {
  displayName: string
  /** Forex account equity, in AUD. Adjusted automatically as trades close. */
  accountBalance: number
  startingBalance: number
  /** Default risk per trade, in percent. */
  defaultRisk: number
  /** Free-text strategy description, fed to the AI as context. */
  strategy: string
  schemaVersion?: number
  onboardingComplete?: boolean
  createdAt?: unknown
  updatedAt?: unknown
}

// ─── Aggregate stats ─────────────────────────────────────────────────────────

export interface Stats {
  total: number
  open: number
  closed: number
  wins: number
  losses: number
  breakeven: number
  winRate: number
  totalPnl: number
  avgR: number
  expectancy: number
  profitFactor: number | null
  grossProfit: number
  grossLoss: number
  avgWin: number
  avgLoss: number
  bestTrade: number
  worstTrade: number
  maxDrawdown: number
  maxDrawdownPct: number
  currentStreak: number
}

/** The pairs traded on CMC. Used for the ticker picker and normalisation. */
export const FX_PAIRS = [
  'AUDNZD', 'GBPAUD', 'GBPJPY', 'NZDUSD', 'EURJPY', 'EURCAD',
  'EURUSD', 'EURAUD', 'AUDCAD', 'AUDUSD', 'USDCAD', 'USDJPY',
  'AUDJPY', 'EURGBP', 'AUDCHF', 'GBPNZD', 'CADJPY', 'USDCHF',
  'EURNZD', 'GBPUSD', 'GBPCHF', 'NZDJPY',
] as const

export const TIMEFRAMES = ['4H', 'Daily', '1H', '15m', 'Weekly'] as const
