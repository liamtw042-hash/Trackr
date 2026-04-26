import { useState, useEffect } from 'react'
import { generateMorningBriefing } from '../../services/aiService'

function todayKey(uid) {
  return `trackr_briefing_${uid}_${new Date().toISOString().slice(0, 10)}`
}

export default function MorningBriefing({ trades, userProfile, user }) {
  const [text, setText] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!user) return
    const key = todayKey(user.uid)
    const cached = localStorage.getItem(key)
    if (cached) { setText(cached); return }

    if (!trades.length) return

    setLoading(true)
    generateMorningBriefing(trades, userProfile?.strategy, userProfile?.displayName ?? user.displayName)
      .then((msg) => {
        setText(msg)
        localStorage.setItem(key, msg)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [user?.uid, trades.length]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!trades.length) return null

  return (
    <div className="card p-5 border-accent/20 bg-gradient-to-r from-accent/5 to-transparent">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-lg">🤖</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-semibold text-white">AI Morning Briefing</span>
            <span className="text-xs text-white/25 font-medium">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </span>
          </div>

          {loading && (
            <div className="space-y-2">
              {[100, 80, 60].map((w) => (
                <div key={w} className={`h-3 bg-white/5 rounded animate-pulse`} style={{ width: `${w}%` }} />
              ))}
            </div>
          )}

          {error && (
            <p className="text-sm text-white/40 italic">
              Briefing unavailable — check your AI API key in settings.
            </p>
          )}

          {text && !loading && (
            <p className="text-sm text-white/70 leading-relaxed">{text}</p>
          )}
        </div>
      </div>
    </div>
  )
}
