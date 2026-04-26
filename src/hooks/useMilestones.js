import { useState, useEffect, useRef } from 'react'
import { doc, updateDoc, arrayUnion } from 'firebase/firestore'
import { db } from '../firebase/config'

function getStartOfWeek(date = new Date()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d
}

export function useMilestones(trades, userProfile, userId) {
  const [pendingMilestone, setPendingMilestone] = useState(null)
  const checkedRef = useRef(false)

  useEffect(() => {
    if (!userId || !userProfile || !trades.length) return
    // Only run once per session to avoid re-triggering on re-renders
    if (checkedRef.current) return

    const earned = userProfile.milestonesEarned ?? []
    const closed = trades.filter((t) => t.outcome)
    const newMilestones = []

    // First trade
    if (!earned.includes('first_trade') && trades.length >= 1) {
      newMilestones.push('first_trade')
    }
    // 10 trades
    if (!earned.includes('trades_10') && trades.length >= 10) {
      newMilestones.push('trades_10')
    }
    // 50 trades
    if (!earned.includes('trades_50') && trades.length >= 50) {
      newMilestones.push('trades_50')
    }
    // 100 trades
    if (!earned.includes('trades_100') && trades.length >= 100) {
      newMilestones.push('trades_100')
    }

    // First winning week
    if (!earned.includes('first_win_week') && closed.length >= 3) {
      const weekStart = getStartOfWeek()
      const thisWeek = closed.filter((t) => new Date(t.tradeDate) >= weekStart)
      const weekPnL = thisWeek.reduce((s, t) => s + (t.pnl ?? 0), 0)
      if (weekPnL > 0 && thisWeek.length >= 1) {
        newMilestones.push('first_win_week')
      }
    }

    // Best trade ever — re-triggers each time beaten
    if (closed.length) {
      const best = Math.max(...closed.map((t) => t.pnl ?? 0))
      const lastBest = userProfile.bestTradeEver ?? 0
      if (best > lastBest && best > 0) {
        newMilestones.push('best_trade_ever')
        // Persist new best
        updateDoc(doc(db, 'users', userId), { bestTradeEver: best }).catch(() => {})
      }
    }

    if (newMilestones.length) {
      checkedRef.current = true
      // Save all new milestones to Firestore
      const toSave = newMilestones.filter((m) => m !== 'best_trade_ever')
      if (toSave.length) {
        updateDoc(doc(db, 'users', userId), {
          milestonesEarned: arrayUnion(...toSave),
        }).catch(() => {})
      }
      // Show the most impressive one
      const priority = ['trades_100', 'trades_50', 'best_trade_ever', 'first_win_week', 'trades_10', 'first_trade']
      const toShow = priority.find((m) => newMilestones.includes(m)) ?? newMilestones[0]
      setPendingMilestone(toShow)
    }
  }, [trades.length, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  return { pendingMilestone, clearMilestone: () => setPendingMilestone(null) }
}
