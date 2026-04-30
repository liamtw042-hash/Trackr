import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTrades } from '../context/TradeContext'
import { db } from '../firebase/config'
import { doc, getDoc, setDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore'
import { generateWeeklyReviewSuggestions } from '../services/aiService'
import toast from 'react-hot-toast'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekStart(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatWeekRange(isoDate) {
  const start = new Date(isoDate + 'T00:00:00')
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const opts = { month: 'short', day: 'numeric' }
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`
}

// ─── Section card ─────────────────────────────────────────────────────────────

function Section({ label, icon, value, onChange, placeholder }) {
  return (
    <div className="card p-5">
      <label className="flex items-center gap-2 text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">
        <span>{icon}</span>{label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        className="input-field resize-none w-full leading-relaxed text-sm"
      />
    </div>
  )
}

// ─── Past reviews list ────────────────────────────────────────────────────────

function PastReviews({ reviews, currentWeek, onSelect }) {
  if (!reviews.length) return null
  return (
    <div className="card p-5">
      <h3 className="section-title mb-4">Past Reviews</h3>
      <div className="space-y-2">
        {reviews.map((r) => {
          const isActive = r.weekStart === currentWeek
          return (
            <button
              key={r.weekStart}
              onClick={() => onSelect(r.weekStart)}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-all duration-150
                ${isActive
                  ? 'bg-accent/10 border-accent/30 text-white'
                  : 'bg-white/3 border-white/5 text-white/60 hover:border-white/15 hover:text-white'
                }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{formatWeekRange(r.weekStart)}</span>
                <div className="flex items-center gap-3 text-xs">
                  {r.tradeCount != null && (
                    <span className="text-white/30">{r.tradeCount} trade{r.tradeCount !== 1 ? 's' : ''}</span>
                  )}
                  {r.pnl != null && (
                    <span className={r.pnl >= 0 ? 'text-win font-semibold' : 'text-loss font-semibold'}>
                      {r.pnl >= 0 ? '+' : ''}${r.pnl.toFixed(0)}
                    </span>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WeeklyReview() {
  const { user, userProfile } = useAuth()
  const { trades } = useTrades()

  const [weekStart, setWeekStart] = useState(getWeekStart())
  const [form, setForm] = useState({ wellWent: '', wentWrong: '', lessons: '', goals: '' })
  const [pastReviews, setPastReviews] = useState([])
  const [aiLoading, setAiLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  const weekKey = weekStart.toISOString().slice(0, 10)
  const docId = `${user?.uid}_${weekKey}`
  const isCurrentWeek = getWeekStart().toISOString().slice(0, 10) === weekKey

  const weekTrades = trades.filter((t) => {
    const d = new Date(t.tradeDate)
    const end = new Date(weekStart)
    end.setDate(end.getDate() + 7)
    return d >= weekStart && d < end
  })

  const wins = weekTrades.filter((t) => t.outcome === 'win').length
  const losses = weekTrades.filter((t) => t.outcome === 'loss').length
  const pnl = weekTrades.reduce((s, t) => s + (t.pnl ?? 0), 0)

  // Load review for selected week
  useEffect(() => {
    if (!user) return
    setLoading(true)
    setSaved(false)
    getDoc(doc(db, 'weeklyReviews', docId)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data()
        setForm({ wellWent: data.wellWent ?? '', wentWrong: data.wentWrong ?? '', lessons: data.lessons ?? '', goals: data.goals ?? '' })
      } else {
        setForm({ wellWent: '', wentWrong: '', lessons: '', goals: '' })
      }
      setLoading(false)
    })
  }, [docId, user])

  // Load past reviews list
  useEffect(() => {
    if (!user) return
    getDocs(query(collection(db, 'weeklyReviews'), where('userId', '==', user.uid))).then((snap) => {
      const list = snap.docs
        .map((d) => ({ weekStart: d.data().weekStart, tradeCount: d.data().tradeCount, pnl: d.data().pnl }))
        .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
        .slice(0, 12)
      setPastReviews(list)
    })
  }, [user, saved])

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }))

  const handleAIFill = async () => {
    if (!weekTrades.length) { toast.error('No trades this week to analyse'); return }
    setAiLoading(true)
    try {
      const suggestions = await generateWeeklyReviewSuggestions(weekTrades, userProfile?.strategy)
      setForm((f) => ({
        wellWent: f.wellWent || suggestions.wellWent,
        wentWrong: f.wentWrong || suggestions.wentWrong,
        lessons: f.lessons || suggestions.lessons,
        goals: f.goals || suggestions.goals,
      }))
      toast.success('AI suggestions filled in')
    } catch (err) {
      toast.error(err.message || 'AI fill failed')
    } finally {
      setAiLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, 'weeklyReviews', docId), {
        userId: user.uid,
        weekStart: weekKey,
        ...form,
        tradeCount: weekTrades.length,
        wins,
        losses,
        pnl,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setSaved(true)
      toast.success('Review saved')
    } catch {
      toast.error('Failed to save review')
    } finally {
      setSaving(false)
    }
  }

  const goWeek = (delta) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + delta * 7)
    if (d <= new Date()) setWeekStart(d)
  }

  const selectWeek = (isoDate) => {
    setWeekStart(new Date(isoDate + 'T00:00:00'))
  }

  return (
    <div className="space-y-5 animate-fade-in max-w-4xl">

      {/* Header */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">Weekly Review</h2>
            <p className="text-xs text-white/30 mt-0.5">{formatWeekRange(weekKey)}</p>
          </div>

          {/* Week nav */}
          <div className="flex items-center gap-2">
            <button onClick={() => goWeek(-1)} className="btn-secondary text-xs py-1.5 px-3">← Prev</button>
            {!isCurrentWeek && (
              <button onClick={() => setWeekStart(getWeekStart())} className="btn-secondary text-xs py-1.5 px-3">This week</button>
            )}
            {!isCurrentWeek && (
              <button onClick={() => goWeek(1)} className="btn-secondary text-xs py-1.5 px-3">Next →</button>
            )}
          </div>
        </div>

        {/* Week stats */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          {[
            { label: 'Trades', value: weekTrades.length, color: 'text-white' },
            { label: 'Win / Loss', value: `${wins}W / ${losses}L`, color: wins >= losses ? 'text-win' : 'text-loss' },
            { label: 'P&L', value: `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`, color: pnl >= 0 ? 'text-win' : 'text-loss' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl bg-white/3 border border-white/5 p-3 text-center">
              <div className="text-xs text-white/30 mb-0.5">{label}</div>
              <div className={`text-lg font-bold ${color}`}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* AI fill button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleAIFill}
          disabled={aiLoading || !weekTrades.length}
          className="btn-primary flex items-center gap-2 text-sm bg-gradient-to-r from-accent to-purple-600 disabled:opacity-40"
        >
          {aiLoading ? (
            <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>AI is writing…</>
          ) : '🤖 AI Pre-fill Suggestions'}
        </button>
        <p className="text-xs text-white/25">Only fills blank fields — won't overwrite what you've written</p>
      </div>

      {/* Four sections */}
      {loading ? (
        <div className="space-y-4">
          {[1,2,3,4].map((i) => <div key={i} className="card p-5 h-32 animate-pulse bg-white/2" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Section label="What went well" icon="✅" value={form.wellWent} onChange={set('wellWent')}
            placeholder="Trades that executed cleanly, rules followed, good patience…" />
          <Section label="What went wrong" icon="❌" value={form.wentWrong} onChange={set('wentWrong')}
            placeholder="Mistakes made, rules broken, emotional decisions…" />
          <Section label="Key lessons" icon="💡" value={form.lessons} onChange={set('lessons')}
            placeholder="The 1-2 most important things you're taking away from this week…" />
          <Section label="Goals for next week" icon="🎯" value={form.goals} onChange={set('goals')}
            placeholder="Specific, measurable targets for the week ahead…" />
        </div>
      )}

      {/* Save */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="btn-primary flex items-center gap-2">
          {saving ? <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Saving…</> : 'Save Review'}
        </button>
      </div>

      {/* Past reviews */}
      <PastReviews reviews={pastReviews} currentWeek={weekKey} onSelect={selectWeek} />
    </div>
  )
}
