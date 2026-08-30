import {
  createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode,
} from 'react'
import {
  collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
  setDoc, serverTimestamp, increment, writeBatch,
} from 'firebase/firestore'
import { db, COL } from '@/lib/firebase'
import { tradeFromDoc, clean } from '@/lib/serialize'
import { computeStats, dateOf } from '@/lib/calc'
import { SCHEMA_VERSION } from '@/types'
import type { Stats, Trade, TradeDraft } from '@/types'
import { useAuth } from './AuthContext'

interface TradeValue {
  trades: Trade[]
  loading: boolean
  stats: Stats
  addTrade: (draft: TradeDraft) => Promise<string>
  addTrades: (drafts: TradeDraft[]) => Promise<number>
  updateTrade: (id: string, patch: Partial<Trade>) => Promise<void>
  deleteTrade: (id: string) => Promise<void>
  /** Hashes of every imported trade, for CSV dedupe. */
  importHashes: Set<string>
}

const Ctx = createContext<TradeValue | null>(null)

export function TradeProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth()
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setTrades([])
      setLoading(false)
      return
    }

    setLoading(true)
    // No orderBy — that would need a composite index on (userId, tradeDate).
    // The set is small enough that sorting client-side is free.
    const q = query(collection(db, COL.trades), where('userId', '==', user.uid))

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map(tradeFromDoc)
          .sort((a, b) => dateOf(b).getTime() - dateOf(a).getTime())
        setTrades(list)
        setLoading(false)
      },
      (err) => {
        console.error('[trades] listener:', err.code, err.message)
        setLoading(false)
      }
    )

    return unsub
  }, [user?.uid])

  /**
   * Keep the account balance in step with realised P&L.
   *
   * `setDoc(..., { merge: true })` rather than `updateDoc`: there is no
   * registration flow, so the user document doesn't exist until Settings is
   * saved for the first time. `updateDoc` fails outright on a missing document,
   * which meant every balance adjustment on a fresh account was swallowed by
   * the catch below. Merge creates it if absent and leaves other fields alone.
   *
   * `increment` is atomic, so concurrent writes can't clobber each other.
   */
  const adjustBalance = useCallback(
    async (delta: number) => {
      if (!user || !delta || !Number.isFinite(delta)) return
      try {
        await setDoc(
          doc(db, COL.users, user.uid),
          { accountBalance: increment(delta) },
          { merge: true }
        )
      } catch (err) {
        console.error('[trades] balance adjust failed:', err)
      }
    },
    [user]
  )

  const addTrade = useCallback(
    async (draft: TradeDraft): Promise<string> => {
      if (!user) throw new Error('Not signed in')
      const ref = await addDoc(collection(db, COL.trades), {
        ...clean(draft as unknown as Record<string, unknown>),
        userId: user.uid,
        schemaVersion: SCHEMA_VERSION,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      if (draft.status === 'closed' && draft.pnl !== null) {
        await adjustBalance(draft.pnl)
      }
      return ref.id
    },
    [user, adjustBalance]
  )

  /** Bulk insert for CSV import. One batch, one balance adjustment. */
  const addTrades = useCallback(
    async (drafts: TradeDraft[]): Promise<number> => {
      if (!user) throw new Error('Not signed in')
      if (!drafts.length) return 0

      let written = 0
      let pnlDelta = 0

      for (let i = 0; i < drafts.length; i += 400) {
        const chunk = drafts.slice(i, i + 400)
        const batch = writeBatch(db)
        for (const draft of chunk) {
          const ref = doc(collection(db, COL.trades))
          batch.set(ref, {
            ...clean(draft as unknown as Record<string, unknown>),
            userId: user.uid,
            schemaVersion: SCHEMA_VERSION,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
          if (draft.status === 'closed' && draft.pnl !== null) pnlDelta += draft.pnl
          written++
        }
        await batch.commit()
      }

      if (pnlDelta) await adjustBalance(pnlDelta)
      return written
    },
    [user, adjustBalance]
  )

  const updateTrade = useCallback(
    async (id: string, patch: Partial<Trade>) => {
      const before = trades.find((t) => t.id === id)
      await updateDoc(doc(db, COL.trades, id), {
        ...clean(patch as Record<string, unknown>),
        updatedAt: serverTimestamp(),
      })

      // Only move the balance by the difference, and only when P&L was part of
      // this edit — otherwise editing a note would double-count the trade.
      if ('pnl' in patch) {
        const delta = (patch.pnl ?? 0) - (before?.pnl ?? 0)
        if (delta) await adjustBalance(delta)
      }
    },
    [trades, adjustBalance]
  )

  const deleteTrade = useCallback(
    async (id: string) => {
      const before = trades.find((t) => t.id === id)
      await deleteDoc(doc(db, COL.trades, id))
      if (before?.status === 'closed' && before.pnl !== null) {
        await adjustBalance(-before.pnl)
      }
    },
    [trades, adjustBalance]
  )

  const stats = useMemo(
    () => computeStats(trades, profile?.startingBalance ?? 0),
    [trades, profile?.startingBalance]
  )

  const importHashes = useMemo(
    () => new Set(trades.map((t) => t.importHash).filter((h): h is string => !!h)),
    [trades]
  )

  return (
    <Ctx.Provider
      value={{ trades, loading, stats, addTrade, addTrades, updateTrade, deleteTrade, importHashes }}
    >
      {children}
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTrades(): TradeValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTrades must be used inside TradeProvider')
  return ctx
}
