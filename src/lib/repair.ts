import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore'
import { db, COL } from './firebase'
import { tradeFromDoc } from './serialize'

/**
 * Recompute the account balance from scratch: starting balance plus every
 * realised P&L. Used by the Settings repair action when the running balance
 * has drifted out of step (e.g. after a manual edit in the Firestore console).
 *
 * Lives outside TradeContext so that module exports only its provider and hook,
 * which is what React Fast Refresh requires to swap a component without
 * remounting the whole tree.
 */
export async function recomputeBalance(userId: string, startingBalance: number): Promise<number> {
  const snap = await getDocs(query(collection(db, COL.trades), where('userId', '==', userId)))
  const realised = snap.docs
    .map(tradeFromDoc)
    .filter((t) => t.status === 'closed')
    .reduce((sum, t) => sum + (t.pnl ?? 0), 0)

  const balance = Math.round((startingBalance + realised) * 100) / 100
  // Merge, not update — this repair path is most likely to be run on an account
  // whose profile document was never created, which is what broke the balance.
  await setDoc(doc(db, COL.users, userId), { accountBalance: balance }, { merge: true })
  return balance
}
