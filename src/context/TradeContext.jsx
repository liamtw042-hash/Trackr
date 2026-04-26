import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from './AuthContext'

const TradeContext = createContext(null)

export function TradeProvider({ children }) {
  const { user } = useAuth()
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setTrades([])
      setLoading(false)
      return
    }

    const q = query(
      collection(db, 'trades'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    )

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tradeList = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
        tradeDate: d.data().tradeDate ?? new Date().toISOString(),
      }))
      setTrades(tradeList)
      setLoading(false)
    }, (err) => {
      console.error('Trade snapshot error:', err)
      setLoading(false)
    })

    return unsubscribe
  }, [user])

  const addTrade = useCallback(async (tradeData) => {
    if (!user) throw new Error('Not authenticated')
    const docRef = await addDoc(collection(db, 'trades'), {
      ...tradeData,
      userId: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return docRef.id
  }, [user])

  const updateTrade = useCallback(async (tradeId, updates) => {
    const ref = doc(db, 'trades', tradeId)
    await updateDoc(ref, { ...updates, updatedAt: serverTimestamp() })
  }, [])

  const deleteTrade = useCallback(async (tradeId) => {
    await deleteDoc(doc(db, 'trades', tradeId))
  }, [])

  const stats = useCallback(() => {
    if (!trades.length) return {
      total: 0, wins: 0, losses: 0, breakeven: 0,
      winRate: 0, totalPnL: 0, avgWin: 0, avgLoss: 0,
      avgR: 0, bestTrade: 0, worstTrade: 0, currentStreak: 0,
    }

    const closedTrades = trades.filter((t) => t.outcome)
    const wins = closedTrades.filter((t) => t.outcome === 'win')
    const losses = closedTrades.filter((t) => t.outcome === 'loss')
    const totalPnL = closedTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0)
    const avgWin = wins.length ? wins.reduce((s, t) => s + (t.pnl ?? 0), 0) / wins.length : 0
    const avgLoss = losses.length ? losses.reduce((s, t) => s + (t.pnl ?? 0), 0) / losses.length : 0
    const avgR = closedTrades.length
      ? closedTrades.reduce((s, t) => s + (t.rMultiple ?? 0), 0) / closedTrades.length
      : 0
    const pnlValues = closedTrades.map((t) => t.pnl ?? 0)

    let streak = 0
    const sorted = [...closedTrades].sort((a, b) => new Date(b.tradeDate) - new Date(a.tradeDate))
    if (sorted.length) {
      const first = sorted[0].outcome
      for (const t of sorted) {
        if (t.outcome === first) streak++
        else break
      }
      if (first === 'loss') streak = -streak
    }

    return {
      total: trades.length,
      closed: closedTrades.length,
      wins: wins.length,
      losses: losses.length,
      breakeven: closedTrades.filter((t) => t.outcome === 'breakeven').length,
      winRate: closedTrades.length ? (wins.length / closedTrades.length) * 100 : 0,
      totalPnL,
      avgWin,
      avgLoss,
      avgR,
      bestTrade: pnlValues.length ? Math.max(...pnlValues) : 0,
      worstTrade: pnlValues.length ? Math.min(...pnlValues) : 0,
      currentStreak: streak,
    }
  }, [trades])

  return (
    <TradeContext.Provider value={{ trades, loading, addTrade, updateTrade, deleteTrade, stats }}>
      {children}
    </TradeContext.Provider>
  )
}

export function useTrades() {
  const ctx = useContext(TradeContext)
  if (!ctx) throw new Error('useTrades must be used within TradeProvider')
  return ctx
}
