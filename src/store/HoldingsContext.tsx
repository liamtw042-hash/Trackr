import {
  createContext, useContext, useEffect, useState, useCallback, type ReactNode,
} from 'react'
import {
  collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp,
} from 'firebase/firestore'
import { db, COL } from '@/lib/firebase'
import { holdingFromDoc, clean } from '@/lib/serialize'
import type { Holding, HoldingDraft } from '@/types'
import { useAuth } from './AuthContext'

interface HoldingsValue {
  holdings: Holding[]
  loading: boolean
  addHolding: (draft: HoldingDraft) => Promise<string>
  updateHolding: (id: string, patch: Partial<Holding>) => Promise<void>
  deleteHolding: (id: string) => Promise<void>
}

const Ctx = createContext<HoldingsValue | null>(null)

export function HoldingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setHoldings([])
      setLoading(false)
      return
    }

    setLoading(true)
    const q = query(collection(db, COL.holdings), where('userId', '==', user.uid))

    const unsub = onSnapshot(
      q,
      (snap) => {
        setHoldings(snap.docs.map(holdingFromDoc).sort((a, b) => a.code.localeCompare(b.code)))
        setLoading(false)
      },
      (err) => {
        console.error('[holdings] listener:', err.code, err.message)
        setLoading(false)
      }
    )

    return unsub
  }, [user?.uid])

  const addHolding = useCallback(
    async (draft: HoldingDraft) => {
      if (!user) throw new Error('Not signed in')
      const ref = await addDoc(collection(db, COL.holdings), {
        ...clean(draft as unknown as Record<string, unknown>),
        userId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      return ref.id
    },
    [user]
  )

  const updateHolding = useCallback(async (id: string, patch: Partial<Holding>) => {
    await updateDoc(doc(db, COL.holdings, id), {
      ...clean(patch as Record<string, unknown>),
      updatedAt: serverTimestamp(),
    })
  }, [])

  const deleteHolding = useCallback(async (id: string) => {
    await deleteDoc(doc(db, COL.holdings, id))
  }, [])

  return (
    <Ctx.Provider value={{ holdings, loading, addHolding, updateHolding, deleteHolding }}>
      {children}
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useHoldings(): HoldingsValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useHoldings must be used inside HoldingsProvider')
  return ctx
}
