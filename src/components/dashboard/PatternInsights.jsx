import { useState, useEffect } from 'react'
import { detectPatterns } from '../../services/aiService'

const SEVERITY_STYLES = {
  warning:  { bg: 'bg-gold/5 border-gold/20',    dot: 'bg-gold',    text: 'text-gold' },
  positive: { bg: 'bg-win/5 border-win/20',      dot: 'bg-win',     text: 'text-win' },
  info:     { bg: 'bg-accent/5 border-accent/20', dot: 'bg-accent', text: 'text-accent' },
}

function weekKey(uid) {
  const d = new Date()
  const week = Math.floor(d.getTime() / (7 * 24 * 60 * 60 * 1000))
  return `trackr_patterns_${uid}_${week}`
}

export default function PatternInsights({ trades, userProfile, user }) {
  const [patterns, setPatterns] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const closed = trades.filter((t) => t.outcome)

  useEffect(() => {
    if (!user || closed.length < 5) return
    const key = weekKey(user.uid)
    try {
      const cached = localStorage.getItem(key)
      if (cached) { setPatterns(JSON.parse(cached)); return }
    } catch { /* ignore */ }

    setLoading(true)
    detectPatterns(closed, userProfile?.strategy)
      .then((data) => {
        if (Array.isArray(data) && data.length) {
          setPatterns(data)
          localStorage.setItem(key, JSON.stringify(data))
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [user?.uid, closed.length >= 5]) // eslint-disable-line react-hooks/exhaustive-deps

  if (closed.length < 5) return null
  if (error) return null

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gold/10 border border-gold/20 flex items-center justify-center">
            <span className="text-sm">🔍</span>
          </div>
          <span className="section-title">Pattern Detection</span>
        </div>
        <span className="text-xs text-white/25">Updated weekly</span>
      </div>

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-white/3 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {!loading && patterns && (
        <div className="space-y-2">
          {(expanded ? patterns : patterns.slice(0, 3)).map((p, i) => {
            const s = SEVERITY_STYLES[p.severity] ?? SEVERITY_STYLES.info
            return (
              <div key={i} className={`rounded-xl border p-3.5 ${s.bg}`}>
                <div className="flex items-start gap-2.5">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${s.dot}`} />
                  <div>
                    <p className={`text-sm font-medium leading-snug ${s.text}`}>{p.insight}</p>
                    {p.action && (
                      <p className="text-xs text-white/40 mt-1 leading-relaxed">{p.action}</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          {patterns.length > 3 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-accent hover:text-blue-400 transition-colors mt-1"
            >
              {expanded ? 'Show less' : `+${patterns.length - 3} more patterns`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
