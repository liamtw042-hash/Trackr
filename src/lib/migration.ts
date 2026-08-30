import type { DocumentData } from 'firebase/firestore'
import {
  collection, getDocs, query, where, writeBatch, doc,
} from 'firebase/firestore'
import { db, COL } from './firebase'
import {
  SCHEMA_VERSION, emptyRules, outcomeFromPnlSafe,
} from './migrationHelpers'
import type { RuleKey, RuleState, Trade, TradeSource, Direction, Outcome } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// v1 → v2 migration
//
// The previous build stored the rules checklist as an array of
// `{ rule: string, checked: boolean }`, where `rule` came from splitting the
// user's free-text strategy into lines. v2 uses five fixed keys instead, so
// adherence can actually be correlated against outcome.
//
// Old rule text is matched to new keys by keyword. Anything that doesn't match
// is left as null ("not answered") rather than guessed at — a wrong `false`
// would poison the rule-adherence analysis, which is the whole point of it.
//
// The migration is idempotent: docs already at schemaVersion 2 are skipped, so
// it is safe to run repeatedly.
// ─────────────────────────────────────────────────────────────────────────────

const RULE_MATCHERS: { key: RuleKey; patterns: RegExp[] }[] = [
  { key: 'zoneTouches', patterns: [/\b3\+?\s*touch/i, /three\s*touch/i, /\btouches\b/i, /\bzone\b.*\bvalid/i] },
  { key: 'rejectionCandle', patterns: [/rejection/i, /\bwick\b/i, /\bpin\s*bar/i, /confirm.*candle/i, /candle.*confirm/i] },
  { key: 'trendAligned', patterns: [/\btrend\b/i, /\bema\b/i, /\b50\/200\b/i, /counter[- ]?trend/i, /with the trend/i] },
  { key: 'rrMinimum', patterns: [/\br\s*[:/]\s*r\b/i, /\b2\s*[:]\s*1\b/i, /risk[- ]?reward/i, /reward.*risk/i] },
  { key: 'riskCorrect', patterns: [/\b1\s*%/i, /risk.*\b1\b/i, /position siz/i, /\brisked?\b/i] },
]

function matchRuleKey(text: string): RuleKey | null {
  for (const { key, patterns } of RULE_MATCHERS) {
    if (patterns.some((p) => p.test(text))) return key
  }
  return null
}

/** Best-effort map of a v1 checklist array onto the v2 fixed rule keys. */
export function migrateChecklist(
  checklist: unknown,
  followedRules: unknown
): RuleState {
  const rules = emptyRules()

  if (Array.isArray(checklist)) {
    for (const item of checklist) {
      if (!item || typeof item !== 'object') continue
      const rec = item as { rule?: unknown; checked?: unknown }
      const text = typeof rec.rule === 'string' ? rec.rule : ''
      if (!text) continue
      const key = matchRuleKey(text)
      // Only set a key we haven't already resolved — first match wins, so a
      // strategy line mentioning two concepts doesn't overwrite a cleaner hit.
      if (key && rules[key] === null) rules[key] = rec.checked === true
    }
  }

  // If v1 recorded "followed every rule" and we matched nothing, that's still
  // a real signal — mark all five followed.
  const noneMatched = Object.values(rules).every((v) => v === null)
  if (noneMatched && followedRules === true) {
    for (const k of Object.keys(rules) as RuleKey[]) rules[k] = true
  }

  return rules
}

function asNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

/** Map one v1 Firestore document onto the v2 shape. */
export function migrateTradeDoc(id: string, d: DocumentData): Partial<Trade> & { id: string } {
  const pnl = asNumber(d.pnl)
  const rawOutcome = asString(d.outcome).toLowerCase()

  // v1 used '' to mean "still open"; v2 has an explicit status field.
  const isClosed = rawOutcome === 'win' || rawOutcome === 'loss' || rawOutcome === 'breakeven'
  const outcome: Outcome | null = isClosed
    ? (rawOutcome as Outcome)
    : outcomeFromPnlSafe(pnl)

  const direction: Direction = asString(d.direction) === 'short' ? 'short' : 'long'

  // v1 sometimes left `mistake` as a legacy snake_case value; the v2 vocabulary
  // renamed several. Map the ones that changed, keep the rest.
  const legacyMistakeMap: Record<string, string> = {
    revenge_trade: 'revenge',
    moved_stop_loss: 'moved_stop',
    entered_too_early: 'early_entry',
    entered_too_late: 'late_entry',
    no_clear_setup: 'no_setup',
    ignored_rules: 'other',
    chased_price: 'chased',
  }
  const rawMistake = asString(d.mistake)
  const mistake = legacyMistakeMap[rawMistake] ?? rawMistake

  return {
    id,
    ticker: asString(d.ticker).toUpperCase(),
    direction,
    entryPrice: asNumber(d.entryPrice),
    stopLoss: asNumber(d.stopLoss),
    finalStopLoss: asNumber(d.finalStopLoss),
    takeProfit: asNumber(d.takeProfit),
    positionSize: asNumber(d.positionSize),
    riskAmount: asNumber(d.riskAmount),
    riskPercent: asNumber(d.riskPercent),

    tradeDate: asString(d.tradeDate, new Date().toISOString()),
    exitDate: asString(d.exitDate) || null,

    status: outcome !== null ? 'closed' : 'open',
    outcome,
    exitPrice: asNumber(d.exitPrice),
    pnl,
    rMultiple: asNumber(d.rMultiple),

    setupType: asString(d.setupType),
    timeframe: asString(d.timeframe, '4H'),
    emotion: asNumber(d.emotion),
    mistake,
    notes: asString(d.notes),
    rules: migrateChecklist(d.checklist, d.followedRules),

    entryScreenshotUrl: asString(d.entryScreenshotUrl) || null,
    exitScreenshotUrl: asString(d.exitScreenshotUrl) || null,
    ticketScreenshotUrl: null,

    // v1's `aiAnalysis` was a setup rating, a concept v2 drops entirely —
    // an unverifiable 1-10 score on a chart image isn't information. Any
    // written summary it held is preserved by appending it to notes below.
    entryChartRead: null,
    exitChartRead: null,
    review: null,

    source: (asString(d.source) || 'manual') as TradeSource,
    importHash: asString(d.importHash) || null,
    schemaVersion: SCHEMA_VERSION,
  }
}

export interface MigrationResult {
  scanned: number
  migrated: number
  skipped: number
  errors: string[]
}

/**
 * Migrate every trade belonging to `userId` from v1 to v2.
 * Safe to re-run — documents already at the current schema version are skipped.
 */
export async function migrateTrades(userId: string): Promise<MigrationResult> {
  const result: MigrationResult = { scanned: 0, migrated: 0, skipped: 0, errors: [] }

  const snap = await getDocs(
    query(collection(db, COL.trades), where('userId', '==', userId))
  )
  result.scanned = snap.size

  // Firestore caps a batch at 500 writes.
  const pending = snap.docs.filter((s) => (s.data().schemaVersion ?? 1) < SCHEMA_VERSION)
  result.skipped = snap.size - pending.length

  for (let i = 0; i < pending.length; i += 400) {
    const chunk = pending.slice(i, i + 400)
    const batch = writeBatch(db)
    let staged = 0

    for (const s of chunk) {
      try {
        const data = s.data()
        const next = migrateTradeDoc(s.id, data)

        // Preserve any v1 AI summary text rather than dropping it on the floor.
        let notes = next.notes ?? ''
        const legacySummary = data.aiAnalysis?.summary
        if (typeof legacySummary === 'string' && legacySummary.trim()) {
          const tag = '[v1 AI note]'
          if (!notes.includes(tag)) {
            notes = `${notes}${notes ? '\n\n' : ''}${tag} ${legacySummary.trim()}`
          }
        }

        const { id: _id, ...fields } = next
        batch.update(doc(db, COL.trades, s.id), {
          ...fields,
          notes,
          // Drop the v1-only fields so they stop shadowing the new ones.
          checklist: null,
          followedRules: null,
          aiAnalysis: null,
          assetClass: null,
        })
        staged++
      } catch (err) {
        result.errors.push(`${s.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // Count only after the write lands. Incrementing while staging would report
    // rows as migrated that a failed commit never wrote — and a throw here
    // would discard the tally for the chunks that DID commit, so the caller
    // gets a partial result plus the error rather than an exception.
    try {
      await batch.commit()
      result.migrated += staged
    } catch (err) {
      result.errors.push(
        `Batch at row ${i}: ${err instanceof Error ? err.message : String(err)} — ` +
        `${staged} trade(s) in this batch were not migrated. Re-running is safe.`
      )
    }
  }

  return result
}

/** True when the user has any trade still on the old schema. */
export async function needsMigration(userId: string): Promise<boolean> {
  const snap = await getDocs(
    query(collection(db, COL.trades), where('userId', '==', userId))
  )
  return snap.docs.some((s) => (s.data().schemaVersion ?? 1) < SCHEMA_VERSION)
}
