import type { DocumentData, QueryDocumentSnapshot, Timestamp } from 'firebase/firestore'
import type { Holding, Trade, TradeSource, Direction, Outcome, RuleState } from '@/types'
import { SCHEMA_VERSION, emptyRules, RULE_KEYS } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Firestore ⇄ app-model conversion.
//
// Reads are defensive: a document written by the previous build, or one that
// has been hand-edited in the Firestore console, still has to produce a valid
// Trade rather than crash a render. Every field falls back to a safe default.
// ─────────────────────────────────────────────────────────────────────────────

function ts(v: unknown): Date {
  if (v && typeof v === 'object' && 'toDate' in v) {
    try {
      return (v as Timestamp).toDate()
    } catch {
      return new Date(0)
    }
  }
  if (typeof v === 'string') {
    const d = new Date(v)
    if (!Number.isNaN(d.getTime())) return d
  }
  return new Date(0)
}

function n(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const x = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(x) ? x : null
}

function s(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function readRules(v: unknown): RuleState {
  const out = emptyRules()
  if (!v || typeof v !== 'object') return out
  const rec = v as Record<string, unknown>
  for (const k of RULE_KEYS) {
    const val = rec[k]
    if (val === true || val === false) out[k] = val
  }
  return out
}

export function tradeFromDoc(snap: QueryDocumentSnapshot<DocumentData>): Trade {
  const d = snap.data()

  const rawOutcome = s(d.outcome).toLowerCase()
  const outcome: Outcome | null =
    rawOutcome === 'win' || rawOutcome === 'loss' || rawOutcome === 'breakeven'
      ? (rawOutcome as Outcome)
      : null

  const rawStatus = s(d.status)
  const status = rawStatus === 'open' || rawStatus === 'closed'
    ? rawStatus
    : outcome !== null
      ? 'closed'
      : 'open'

  return {
    id: snap.id,
    userId: s(d.userId),

    ticker: s(d.ticker).toUpperCase(),
    direction: (s(d.direction) === 'short' ? 'short' : 'long') as Direction,
    entryPrice: n(d.entryPrice),
    stopLoss: n(d.stopLoss),
    finalStopLoss: n(d.finalStopLoss),
    takeProfit: n(d.takeProfit),
    positionSize: n(d.positionSize),
    riskAmount: n(d.riskAmount),
    riskPercent: n(d.riskPercent),
    conversionRate: n(d.conversionRate),

    tradeDate: s(d.tradeDate, new Date().toISOString()),
    exitDate: s(d.exitDate) || null,

    status,
    outcome,
    exitPrice: n(d.exitPrice),
    pnl: n(d.pnl),
    rMultiple: n(d.rMultiple),

    setupType: s(d.setupType),
    timeframe: s(d.timeframe, '4H'),
    emotion: n(d.emotion),
    mistake: s(d.mistake),
    notes: s(d.notes),
    rules: readRules(d.rules),

    entryScreenshotUrl: s(d.entryScreenshotUrl) || null,
    exitScreenshotUrl: s(d.exitScreenshotUrl) || null,
    ticketScreenshotUrl: s(d.ticketScreenshotUrl) || null,

    entryChartRead: (d.entryChartRead ?? null) as Trade['entryChartRead'],
    exitChartRead: (d.exitChartRead ?? null) as Trade['exitChartRead'],
    review: (d.review ?? null) as Trade['review'],

    source: (s(d.source, 'manual') as TradeSource),
    importHash: s(d.importHash) || null,
    schemaVersion: n(d.schemaVersion) ?? 1,

    createdAt: ts(d.createdAt),
    updatedAt: ts(d.updatedAt),
  }
}

export function holdingFromDoc(snap: QueryDocumentSnapshot<DocumentData>): Holding {
  const d = snap.data()
  return {
    id: snap.id,
    userId: s(d.userId),
    code: s(d.code).toUpperCase(),
    name: s(d.name),
    units: n(d.units) ?? 0,
    avgCost: n(d.avgCost) ?? 0,
    openedAt: s(d.openedAt, new Date().toISOString().slice(0, 10)),
    notes: s(d.notes),
    createdAt: ts(d.createdAt),
    updatedAt: ts(d.updatedAt),
  }
}

/**
 * Strip `undefined` before writing — Firestore rejects undefined values, and
 * partial form state produces them constantly.
 */
export function clean<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v
  }
  return out
}

export { SCHEMA_VERSION }
