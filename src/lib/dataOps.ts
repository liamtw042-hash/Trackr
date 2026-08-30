import {
  collection, doc, getDocs, query, setDoc, where, writeBatch,
} from 'firebase/firestore'
import { db, COL } from './firebase'
import { tradeFromDoc, holdingFromDoc } from './serialize'
import { BACKUP_FORMAT } from './backupFormat'
import type { BackupFile } from './backupFormat'
import type { UserProfile } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Firestore data operations: read a full backup, reset, restore.
//
// Everything destructive here is paired with an export path, and the UI is
// built so a delete cannot be reached without the download having been offered
// first. Firestore has no undo, and this is the only copy of the journal.
//
// The pure serialisation lives in ./backupFormat and is re-exported below, so
// callers have one import for the whole surface without this module's Firestore
// dependency leaking into code that only formats a CSV.
// ─────────────────────────────────────────────────────────────────────────────

export {
  tradesToCsv, backupToJson, download, backupFilename, inspectBackup,
} from './backupFormat'
export type { BackupFile, RestorePreview } from './backupFormat'

/** Read everything belonging to the user, straight from Firestore. */
export async function collectBackup(
  userId: string,
  profile: UserProfile | null
): Promise<BackupFile> {
  const [tradeSnap, holdingSnap] = await Promise.all([
    getDocs(query(collection(db, COL.trades), where('userId', '==', userId))),
    getDocs(query(collection(db, COL.holdings), where('userId', '==', userId))),
  ])

  const trades = tradeSnap.docs.map(tradeFromDoc)
  const holdings = holdingSnap.docs.map(holdingFromDoc)

  return {
    format: BACKUP_FORMAT,
    version: 2,
    exportedAt: new Date().toISOString(),
    counts: { trades: trades.length, holdings: holdings.length },
    profile,
    trades,
    holdings,
  }
}

// ─── Reset ──────────────────────────────────────────────────────────────────────

export interface ResetPlan {
  deleteTrades: boolean
  deleteHoldings: boolean
  /** New starting balance. Current balance is set to match. */
  startingBalance: number
}

export interface ResetResult {
  tradesDeleted: number
  holdingsDeleted: number
  balanceSetTo: number
  errors: string[]
}

/**
 * Apply a reset.
 *
 * Deletes run before the balance is written, so a failure part-way leaves the
 * balance still matching the trades that survived rather than claiming a clean
 * slate over a half-emptied journal.
 */
export async function applyReset(
  userId: string,
  plan: ResetPlan
): Promise<ResetResult> {
  const result: ResetResult = {
    tradesDeleted: 0,
    holdingsDeleted: 0,
    balanceSetTo: plan.startingBalance,
    errors: [],
  }

  const deleteAll = async (col: string): Promise<number> => {
    const snap = await getDocs(query(collection(db, col), where('userId', '==', userId)))
    let n = 0
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(db)
      const chunk = snap.docs.slice(i, i + 400)
      for (const d of chunk) batch.delete(doc(db, col, d.id))
      try {
        await batch.commit()
        n += chunk.length
      } catch (err) {
        result.errors.push(
          `${col}: ${err instanceof Error ? err.message : String(err)} — ` +
          `${chunk.length} not deleted.`
        )
      }
    }
    return n
  }

  if (plan.deleteTrades) result.tradesDeleted = await deleteAll(COL.trades)
  if (plan.deleteHoldings) result.holdingsDeleted = await deleteAll(COL.holdings)

  await setDoc(
    doc(db, COL.users, userId),
    {
      accountBalance: plan.startingBalance,
      startingBalance: plan.startingBalance,
    },
    { merge: true }
  )

  return result
}

// ─── Restore ───────────────────────────────────────────────────────────────────

/**
 * Write a backup's trades back into Firestore under the current user.
 *
 * Always additive — never deletes. Restoring alongside existing trades is a
 * recoverable mistake; restoring *over* them is not, so that isn't offered.
 * Original document ids are reused, so restoring the same file twice overwrites
 * rather than duplicating.
 */
export async function restoreBackup(
  userId: string,
  backup: BackupFile
): Promise<{ trades: number; holdings: number; errors: string[] }> {
  const errors: string[] = []
  let tradeCount = 0
  let holdingCount = 0

  const writeAll = async (
    col: string,
    items: { id?: string }[],
  ): Promise<number> => {
    let n = 0
    for (let i = 0; i < items.length; i += 400) {
      const batch = writeBatch(db)
      const chunk = items.slice(i, i + 400)
      for (const item of chunk) {
        const { id, ...rest } = item as Record<string, unknown> & { id?: string }
        const ref = id ? doc(db, col, id) : doc(collection(db, col))
        batch.set(ref, { ...rest, userId, restoredAt: new Date().toISOString() }, { merge: true })
      }
      try {
        await batch.commit()
        n += chunk.length
      } catch (err) {
        errors.push(`${col}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    return n
  }

  if (backup.trades?.length) tradeCount = await writeAll(COL.trades, backup.trades)
  if (backup.holdings?.length) holdingCount = await writeAll(COL.holdings, backup.holdings)

  return { trades: tradeCount, holdings: holdingCount, errors }
}
