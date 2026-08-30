// Small re-exports kept in their own module so migration.ts has no import
// cycle back through the app's main type barrel at runtime.

import type { Outcome, RuleState } from '@/types'

export { SCHEMA_VERSION, emptyRules } from '@/types'

/** Like outcomeFromPnl, but tolerant of a null P&L on an unclosed v1 trade. */
export function outcomeFromPnlSafe(pnl: number | null): Outcome | null {
  if (pnl === null) return null
  if (pnl > 0.005) return 'win'
  if (pnl < -0.005) return 'loss'
  return 'breakeven'
}

export type { RuleState }
