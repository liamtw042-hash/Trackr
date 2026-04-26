import { useState, useEffect } from 'react'
import { generateWeeklySummary } from '../../services/aiService'
import { format, startOfWeek } from 'date-fns'

function weekKey(uid) {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }) // Monday
  return `trackr_weekly_${uid}_${format(weekStart, 'yyyy-MM-dd')}`
}

export default function WeeklySummary({ trades, userProfile, user }) {
  const [text, setText] = useState(null)
  const [loading, setLoading] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const weekLabel = format(weekStart, 'MMM d')

  useEffect(() => {
    if (!user || !trades.length || dismissed) return

    const key = weekKey(user.uid)
    const cached = localStorage.getItem(key)
    if (cached) { setText(cached); return }

    // Need at least 3 closed trades to generate summary
    const closedThisWeek = trades.filter((t) => {
      if (!t.outcome) return false
      return new Date(t.tradeDate) >= weekStart
    })
    if (closedThisWeek.length < 1 && trades.filter((t) => t.outcome).length < 3) return

    setLoading(true)
    generateWeeklySummary(trades, userProfile?.strategy)
      .then((msg) => {
        setText(msg)
        localStorage.setItem(key, msg)
      })
      .catch(() => {}) // Silent fail — not critical
      .finally(() => setLoading(false))
  }, [user?.uid, trades.length]) // eslint-disable-line react-hooks/exhaustive-deps

  if (dismissed || (!text && !loading)) return null

  return (
    <div className="card p-5 border-gold/20 bg-gradient-to-r from-gold/5 to-transparent">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-lg">📋</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">Weekly Summary</span>
              <span className="text-xs text-white/25 font-medium">w/c {weekLabel}</span>
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="text-white/20 hover:text-white/50 transition-colors flex-shrink-0"
              title="Dismiss"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {loading && (
            <div className="space-y-2">
              {[100, 85, 70].map((w) => (
                <div key={w} className="h-3 bg-white/5 rounded animate-pulse" style={{ width: `${w}%` }} />
              ))}
            </div>
          )}

          {text && !loading && (
            <p className="text-sm text-white/70 leading-relaxed">{text}</p>
          )}
        </div>
      </div>
    </div>
  )
}
