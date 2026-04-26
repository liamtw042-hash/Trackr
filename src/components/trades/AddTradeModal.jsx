import { useState, useEffect, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'
import { useAuth } from '../../context/AuthContext'
import { useTrades } from '../../context/TradeContext'
import { analyzeTradeScreenshot } from '../../services/aiService'
import { compressImageFile, uploadScreenshot } from '../../services/storageService'
import { parseStrategyRules } from '../../utils/strategyParser'
import {
  calcPnL,
  calcRMultiple,
  calcRiskAmount,
  calcRiskPercent,
  calcPositionSize,
} from '../../utils/tradeCalculations'
import { v4 as uuidv4 } from 'uuid'

// ─── Constants ────────────────────────────────────────────────────────────────

const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1H', '4H', 'Daily', 'Weekly']
const ASSET_CLASSES = ['forex', 'stocks', 'crypto', 'commodities', 'options', 'futures', 'indices', 'other']
const EMOTIONS = [
  { value: 1, emoji: '😴', label: 'Tired / Bored' },
  { value: 2, emoji: '😐', label: 'Neutral' },
  { value: 3, emoji: '🙂', label: 'Focused' },
  { value: 4, emoji: '😤', label: 'Eager / Excited' },
  { value: 5, emoji: '🤯', label: 'Overconfident / FOMO' },
]
const VERDICT_CONFIG = {
  'A+':        { color: 'text-win',    bg: 'bg-win/10 border-win/30',    label: 'A+ Setup' },
  'Good':      { color: 'text-accent', bg: 'bg-accent/10 border-accent/30', label: 'Good Setup' },
  'Mediocre':  { color: 'text-gold',   bg: 'bg-gold/10 border-gold/30',  label: 'Mediocre' },
  "Don't Take":{ color: 'text-loss',   bg: 'bg-loss/10 border-loss/30',  label: "Don't Take This" },
}

const EMPTY_FORM = {
  ticker: '',
  assetClass: '',
  direction: 'long',
  entryPrice: '',
  stopLoss: '',
  takeProfit: '',
  positionSize: '',
  riskAmount: '',
  riskPercent: '',
  tradeDate: new Date().toISOString().slice(0, 16),
  setupType: '',
  timeframe: '1H',
  emotion: 3,
  notes: '',
  outcome: '',
  exitPrice: '',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return <p className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-3">{children}</p>
}

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="text-xs text-white/25 mt-1">{hint}</p>}
    </div>
  )
}

function DirectionToggle({ value, onChange }) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-white/10">
      {['long', 'short'].map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onChange(d)}
          className={`flex-1 py-2.5 text-sm font-semibold transition-all duration-200 capitalize
            ${value === d
              ? d === 'long'
                ? 'bg-win text-white'
                : 'bg-loss text-white'
              : 'bg-white/5 text-white/40 hover:text-white/70'
            }`}
        >
          {d === 'long' ? '▲ Long' : '▼ Short'}
        </button>
      ))}
    </div>
  )
}

function EmotionPicker({ value, onChange }) {
  return (
    <div className="flex gap-2">
      {EMOTIONS.map((e) => (
        <button
          key={e.value}
          type="button"
          onClick={() => onChange(e.value)}
          title={e.label}
          className={`flex-1 py-2 rounded-lg text-xl transition-all duration-200 border
            ${value === e.value
              ? 'bg-accent/10 border-accent/40 scale-110'
              : 'bg-white/3 border-white/5 hover:border-white/20 opacity-50 hover:opacity-80'
            }`}
        >
          {e.emoji}
        </button>
      ))}
    </div>
  )
}

function OutcomeToggle({ value, onChange }) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-white/10">
      {[
        { key: 'win', label: '✓ Win', active: 'bg-win text-white', inactive: 'text-white/40' },
        { key: 'loss', label: '✗ Loss', active: 'bg-loss text-white', inactive: 'text-white/40' },
        { key: 'breakeven', label: '≈ B/E', active: 'bg-white/20 text-white', inactive: 'text-white/40' },
      ].map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(value === o.key ? '' : o.key)}
          className={`flex-1 py-2.5 text-sm font-semibold transition-all duration-200
            ${value === o.key ? o.active : `bg-white/5 ${o.inactive} hover:text-white/70`}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function ScreenshotZone({ preview, onDrop, onClear, label }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => files[0] && onDrop(files[0]),
    accept: { 'image/*': [] },
    maxFiles: 1,
    multiple: false,
  })

  if (preview) {
    return (
      <div className="relative rounded-xl overflow-hidden border border-white/10 group">
        <img src={preview} alt={label} className="w-full h-40 object-cover" />
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={onClear}
            className="bg-loss/80 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
          >
            Remove
          </button>
        </div>
        <div className="absolute bottom-2 left-2 bg-black/70 text-white/70 text-xs px-2 py-0.5 rounded">
          {label}
        </div>
      </div>
    )
  }

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all duration-200
        ${isDragActive ? 'border-accent bg-accent/5' : 'border-white/10 hover:border-white/25 hover:bg-white/2'}`}
    >
      <input {...getInputProps()} />
      <div className="text-2xl mb-2">📸</div>
      <p className="text-sm text-white/40">{label}</p>
      <p className="text-xs text-white/20 mt-1">Drop image or click to browse</p>
    </div>
  )
}

function AIVerdictCard({ analysis, loading }) {
  if (loading) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/3 p-4 space-y-3 animate-pulse">
        <div className="h-4 bg-white/10 rounded w-1/2" />
        <div className="h-3 bg-white/5 rounded w-full" />
        <div className="h-3 bg-white/5 rounded w-3/4" />
      </div>
    )
  }
  if (!analysis) return null

  const cfg = VERDICT_CONFIG[analysis.verdict] ?? VERDICT_CONFIG['Good']

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${cfg.bg}`}>
      <div className="flex items-center justify-between">
        <span className={`text-lg font-bold ${cfg.color}`}>{cfg.label}</span>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <span className={`text-2xl font-bold ${cfg.color}`}>{analysis.rating}</span>
            <span className="text-white/30 text-sm">/10</span>
          </div>
        </div>
      </div>

      {analysis.summary && (
        <p className="text-sm text-white/60 leading-relaxed">{analysis.summary}</p>
      )}

      {analysis.rulesFeedback?.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-white/10">
          {analysis.rulesFeedback.map((r, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className={r.passed ? 'text-win mt-0.5' : 'text-loss mt-0.5'}>
                {r.passed ? '✓' : '✗'}
              </span>
              <div>
                <span className="text-white/70 font-medium">{r.rule}</span>
                {r.note && <span className="text-white/35"> — {r.note}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StrategyChecklist({ rules, checked, onChange }) {
  if (!rules.length) return null
  const allChecked = rules.every((_, i) => checked[i])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <SectionLabel>Strategy Checklist</SectionLabel>
        <button
          type="button"
          onClick={() => {
            const all = rules.every((_, i) => checked[i])
            onChange(rules.map(() => !all))
          }}
          className="text-xs text-accent hover:text-blue-400 transition-colors"
        >
          {allChecked ? 'Uncheck all' : 'Check all'}
        </button>
      </div>
      {rules.map((rule, i) => (
        <label
          key={i}
          className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all duration-150
            ${checked[i]
              ? 'bg-win/5 border-win/20'
              : 'bg-white/3 border-white/5 hover:border-white/15'
            }`}
        >
          <input
            type="checkbox"
            checked={!!checked[i]}
            onChange={(e) => {
              const next = [...checked]
              next[i] = e.target.checked
              onChange(next)
            }}
            className="mt-0.5 accent-win flex-shrink-0"
          />
          <span className={`text-sm leading-snug ${checked[i] ? 'text-white/80' : 'text-white/45'}`}>
            {rule}
          </span>
        </label>
      ))}
      <div className="text-xs text-white/30 pt-1">
        {checked.filter(Boolean).length}/{rules.length} rules confirmed
      </div>
    </div>
  )
}

function StreakWarning({ streak, onCancel, onContinue }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="card p-6 max-w-sm w-full border-loss/30 animate-slide-up">
        <div className="text-4xl mb-4 text-center">⚠️</div>
        <h3 className="text-lg font-bold text-loss text-center mb-2">Streak Protection</h3>
        <p className="text-white/60 text-sm text-center leading-relaxed mb-5">
          You've had <strong className="text-loss">{Math.abs(streak)} consecutive losses</strong>.
          Before entering, take a breath. Is this truly an A+ setup that matches every rule of your strategy?
        </p>
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="btn-secondary flex-1 text-sm">
            Take a break
          </button>
          <button type="button" onClick={onContinue} className="btn-danger flex-1 text-sm">
            Submit anyway
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AddTradeModal({ isOpen, onClose }) {
  const { user, userProfile } = useAuth()
  const { addTrade, stats } = useTrades()

  const [form, setForm] = useState(EMPTY_FORM)
  const [entryScreenshotFile, setEntryScreenshotFile] = useState(null)
  const [entryScreenshotPreview, setEntryScreenshotPreview] = useState(null)
  const [exitScreenshotFile, setExitScreenshotFile] = useState(null)
  const [exitScreenshotPreview, setExitScreenshotPreview] = useState(null)
  const [aiAnalysis, setAiAnalysis] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [strategyRules, setStrategyRules] = useState([])
  const [checklist, setChecklist] = useState([])
  const [showStreakWarning, setShowStreakWarning] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const tradeIdRef = useRef(uuidv4())
  const s = stats()

  // Parse strategy rules when modal opens
  useEffect(() => {
    if (isOpen && userProfile?.strategy) {
      const rules = parseStrategyRules(userProfile.strategy)
      setStrategyRules(rules)
      setChecklist(new Array(rules.length).fill(false))
    }
  }, [isOpen, userProfile?.strategy])

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setForm({
        ...EMPTY_FORM,
        riskPercent: userProfile?.defaultRisk ?? 1,
        tradeDate: new Date().toISOString().slice(0, 16),
      })
      setEntryScreenshotFile(null)
      setEntryScreenshotPreview(null)
      setExitScreenshotFile(null)
      setExitScreenshotPreview(null)
      setAiAnalysis(null)
      tradeIdRef.current = uuidv4()
    }
  }, [isOpen, userProfile?.defaultRisk])

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  // Auto-calculate risk amount when % changes
  const handleRiskPercentChange = (val) => {
    set('riskPercent', val)
    const amt = calcRiskAmount(userProfile?.accountBalance, val)
    if (amt !== '') set('riskAmount', amt)
  }

  // Auto-calculate risk % when amount changes
  const handleRiskAmountChange = (val) => {
    set('riskAmount', val)
    const pct = calcRiskPercent(userProfile?.accountBalance, val)
    if (pct !== '') set('riskPercent', pct)
  }

  // Auto-calculate position size from risk + stop distance
  const handleAutoSize = () => {
    const size = calcPositionSize({
      riskAmount: form.riskAmount,
      entryPrice: form.entryPrice,
      stopLoss: form.stopLoss,
      direction: form.direction,
    })
    if (size !== '') {
      set('positionSize', size)
      toast.success(`Position size: ${size}`)
    } else {
      toast.error('Fill entry price, stop loss and risk amount first')
    }
  }

  // Derived live calculations
  const livePnL = (() => {
    if (!form.exitPrice) return null
    return calcPnL({
      direction: form.direction,
      entryPrice: form.entryPrice,
      exitPrice: form.exitPrice,
      positionSize: form.positionSize,
    })
  })()

  const liveR = (() => {
    if (livePnL == null) return null
    return calcRMultiple({ pnl: livePnL, riskAmount: form.riskAmount })
  })()

  const followedRules = checklist.length > 0 && checklist.every(Boolean)

  // Screenshot handlers
  const handleEntryScreenshot = useCallback(async (file) => {
    setEntryScreenshotFile(file)
    const compressed = await compressImageFile(file)
    setEntryScreenshotPreview(compressed)
  }, [])

  const handleExitScreenshot = useCallback(async (file) => {
    setExitScreenshotFile(file)
    const compressed = await compressImageFile(file)
    setExitScreenshotPreview(compressed)
  }, [])

  // AI analysis
  const handleAIAnalyse = async () => {
    if (!entryScreenshotFile) { toast.error('Upload an entry screenshot first'); return }
    setAiLoading(true)
    setAiAnalysis(null)
    try {
      const result = await analyzeTradeScreenshot(entryScreenshotFile, userProfile?.strategy)
      setAiAnalysis(result)
      // Auto-fill form fields
      if (result.ticker) set('ticker', result.ticker)
      if (result.timeframe) set('timeframe', result.timeframe)
      if (result.direction) set('direction', result.direction)
      if (result.assetClass) set('assetClass', result.assetClass)
      if (result.setupType) set('setupType', result.setupType)
      toast.success('AI analysis complete')
    } catch (err) {
      toast.error(err.message ?? 'AI analysis failed')
    } finally {
      setAiLoading(false)
    }
  }

  // Submit
  const doSubmit = async () => {
    setSubmitting(true)
    try {
      const tradeId = tradeIdRef.current

      // Upload screenshots
      let entryScreenshotUrl = null
      let exitScreenshotUrl = null
      if (entryScreenshotPreview && user) {
        entryScreenshotUrl = await uploadScreenshot(user.uid, tradeId, entryScreenshotPreview, 'entry')
      }
      if (exitScreenshotPreview && user) {
        exitScreenshotUrl = await uploadScreenshot(user.uid, tradeId, exitScreenshotPreview, 'exit')
      }

      const pnl = livePnL
      const rMultiple = liveR

      const tradeData = {
        ...form,
        entryPrice: parseFloat(form.entryPrice) || null,
        stopLoss: parseFloat(form.stopLoss) || null,
        takeProfit: parseFloat(form.takeProfit) || null,
        positionSize: parseFloat(form.positionSize) || null,
        riskAmount: parseFloat(form.riskAmount) || null,
        riskPercent: parseFloat(form.riskPercent) || null,
        exitPrice: form.exitPrice ? parseFloat(form.exitPrice) : null,
        pnl,
        rMultiple,
        followedRules,
        checklist: strategyRules.map((rule, i) => ({ rule, checked: !!checklist[i] })),
        entryScreenshotUrl,
        exitScreenshotUrl,
        aiAnalysis: aiAnalysis ?? null,
        tradeDate: form.tradeDate || new Date().toISOString(),
      }

      await addTrade(tradeData)
      toast.success('Trade logged! 📊')
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('Failed to save trade. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.ticker.trim()) { toast.error('Enter a ticker'); return }
    if (!form.entryPrice) { toast.error('Enter an entry price'); return }
    // Streak protection
    if (s.currentStreak <= -3 && !showStreakWarning) {
      setShowStreakWarning(true)
      return
    }
    doSubmit()
  }

  if (!isOpen) return null

  return (
    <>
      {/* Streak warning overlay */}
      {showStreakWarning && (
        <StreakWarning
          streak={s.currentStreak}
          onCancel={() => { setShowStreakWarning(false); onClose() }}
          onContinue={() => { setShowStreakWarning(false); doSubmit() }}
        />
      )}

      {/* Modal overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-end"
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        {/* Drawer panel */}
        <div className="h-full w-full max-w-3xl bg-navy-900 border-l border-white/5 flex flex-col shadow-2xl animate-slide-in overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 flex-shrink-0">
            <div>
              <h2 className="text-lg font-bold text-white">Log Trade</h2>
              <p className="text-xs text-white/30 mt-0.5">Fill in the details below</p>
            </div>
            <button onClick={onClose} className="text-white/30 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/5">
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {/* Scrollable body */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-white/5">

              {/* ── LEFT COLUMN ── */}
              <div className="p-6 space-y-6">

                {/* Trade info */}
                <div>
                  <SectionLabel>Trade Info</SectionLabel>
                  <div className="space-y-4">
                    <Field label="Ticker / Symbol">
                      <input
                        type="text"
                        value={form.ticker}
                        onChange={(e) => set('ticker', e.target.value.toUpperCase())}
                        placeholder="e.g. EURUSD, AAPL, BTC"
                        className="input-field"
                        autoFocus
                      />
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Asset Class">
                        <select
                          value={form.assetClass}
                          onChange={(e) => set('assetClass', e.target.value)}
                          className="input-field cursor-pointer capitalize"
                        >
                          <option value="">Select…</option>
                          {ASSET_CLASSES.map((a) => (
                            <option key={a} value={a} className="capitalize">{a}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Timeframe">
                        <select
                          value={form.timeframe}
                          onChange={(e) => set('timeframe', e.target.value)}
                          className="input-field cursor-pointer"
                        >
                          {TIMEFRAMES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </Field>
                    </div>

                    <Field label="Direction">
                      <DirectionToggle value={form.direction} onChange={(v) => set('direction', v)} />
                    </Field>
                  </div>
                </div>

                {/* Pricing */}
                <div>
                  <SectionLabel>Pricing</SectionLabel>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Entry Price">
                      <input type="number" step="any" value={form.entryPrice} onChange={(e) => set('entryPrice', e.target.value)} placeholder="0.00" className="input-field" />
                    </Field>
                    <Field label="Stop Loss">
                      <input type="number" step="any" value={form.stopLoss} onChange={(e) => set('stopLoss', e.target.value)} placeholder="0.00" className="input-field" />
                    </Field>
                    <Field label="Take Profit">
                      <input type="number" step="any" value={form.takeProfit} onChange={(e) => set('takeProfit', e.target.value)} placeholder="0.00" className="input-field" />
                    </Field>
                  </div>
                </div>

                {/* Risk */}
                <div>
                  <SectionLabel>Risk & Size</SectionLabel>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Risk Amount ($)">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
                          <input type="number" step="any" value={form.riskAmount} onChange={(e) => handleRiskAmountChange(e.target.value)} placeholder="100" className="input-field pl-7" />
                        </div>
                      </Field>
                      <Field label="Risk (%)">
                        <div className="relative">
                          <input type="number" step="0.1" value={form.riskPercent} onChange={(e) => handleRiskPercentChange(e.target.value)} placeholder="1" className="input-field pr-7" />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">%</span>
                        </div>
                      </Field>
                    </div>
                    <div className="flex items-end gap-2">
                      <Field label="Position Size">
                        <input type="number" step="any" value={form.positionSize} onChange={(e) => set('positionSize', e.target.value)} placeholder="0.0" className="input-field" />
                      </Field>
                      <button
                        type="button"
                        onClick={handleAutoSize}
                        className="btn-secondary text-xs py-2.5 px-3 flex-shrink-0 mb-0.5"
                        title="Auto-calculate from risk ÷ SL distance"
                      >
                        Auto
                      </button>
                    </div>
                  </div>
                </div>

                {/* Trade details */}
                <div>
                  <SectionLabel>Details</SectionLabel>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Date & Time">
                        <input type="datetime-local" value={form.tradeDate} onChange={(e) => set('tradeDate', e.target.value)} className="input-field" />
                      </Field>
                      <Field label="Setup Type">
                        <input type="text" value={form.setupType} onChange={(e) => set('setupType', e.target.value)} placeholder="e.g. FVG retest" className="input-field" />
                      </Field>
                    </div>
                    <Field label={`Pre-Trade Emotion — ${EMOTIONS.find((e) => e.value === form.emotion)?.label ?? ''}`}>
                      <EmotionPicker value={form.emotion} onChange={(v) => set('emotion', v)} />
                    </Field>
                  </div>
                </div>

                {/* Outcome */}
                <div>
                  <SectionLabel>Outcome (optional — add later)</SectionLabel>
                  <div className="space-y-3">
                    <OutcomeToggle value={form.outcome} onChange={(v) => set('outcome', v)} />
                    {form.outcome && (
                      <Field label="Exit Price">
                        <input type="number" step="any" value={form.exitPrice} onChange={(e) => set('exitPrice', e.target.value)} placeholder="0.00" className="input-field" />
                      </Field>
                    )}
                    {livePnL != null && (
                      <div className={`flex items-center justify-between p-3 rounded-lg border ${livePnL >= 0 ? 'bg-win/5 border-win/20' : 'bg-loss/5 border-loss/20'}`}>
                        <div>
                          <div className="text-xs text-white/40">Calculated P&L</div>
                          <div className={`text-xl font-bold ${livePnL >= 0 ? 'text-win' : 'text-loss'}`}>
                            {livePnL >= 0 ? '+' : ''}${livePnL.toFixed(2)}
                          </div>
                        </div>
                        {liveR != null && (
                          <div className="text-right">
                            <div className="text-xs text-white/40">R Multiple</div>
                            <div className={`text-xl font-bold ${liveR >= 0 ? 'text-win' : 'text-loss'}`}>
                              {liveR >= 0 ? '+' : ''}{liveR.toFixed(2)}R
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <SectionLabel>Notes</SectionLabel>
                  <textarea
                    value={form.notes}
                    onChange={(e) => set('notes', e.target.value)}
                    placeholder="What did you see? What was your reasoning? Any hesitation?"
                    className="input-field resize-none"
                    rows={4}
                  />
                </div>
              </div>

              {/* ── RIGHT COLUMN ── */}
              <div className="p-6 space-y-6">

                {/* Entry screenshot */}
                <div>
                  <SectionLabel>Entry Screenshot</SectionLabel>
                  <ScreenshotZone
                    preview={entryScreenshotPreview}
                    onDrop={handleEntryScreenshot}
                    onClear={() => { setEntryScreenshotFile(null); setEntryScreenshotPreview(null); setAiAnalysis(null) }}
                    label="Entry Chart"
                  />
                  {entryScreenshotFile && !aiAnalysis && (
                    <button
                      type="button"
                      onClick={handleAIAnalyse}
                      disabled={aiLoading}
                      className="btn-primary w-full mt-3 text-sm flex items-center justify-center gap-2 bg-gradient-to-r from-accent to-purple-600"
                    >
                      {aiLoading ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Analysing chart…
                        </>
                      ) : (
                        <>🤖 Analyse with AI</>
                      )}
                    </button>
                  )}
                </div>

                {/* AI Verdict */}
                {(aiAnalysis || aiLoading) && (
                  <div>
                    <SectionLabel>AI Analysis</SectionLabel>
                    <AIVerdictCard analysis={aiAnalysis} loading={aiLoading} />
                    {aiAnalysis && (
                      <button
                        type="button"
                        onClick={handleAIAnalyse}
                        className="text-xs text-white/30 hover:text-white/60 mt-2 transition-colors"
                      >
                        Re-analyse
                      </button>
                    )}
                  </div>
                )}

                {/* Exit screenshot */}
                <div>
                  <SectionLabel>Exit Screenshot (optional)</SectionLabel>
                  <ScreenshotZone
                    preview={exitScreenshotPreview}
                    onDrop={handleExitScreenshot}
                    onClear={() => { setExitScreenshotFile(null); setExitScreenshotPreview(null) }}
                    label="Exit Chart"
                  />
                </div>

                {/* Strategy checklist */}
                {strategyRules.length > 0 && (
                  <StrategyChecklist
                    rules={strategyRules}
                    checked={checklist}
                    onChange={setChecklist}
                  />
                )}

                {/* Followed rules indicator */}
                {strategyRules.length > 0 && (
                  <div className={`text-xs font-semibold px-3 py-2 rounded-lg border ${
                    followedRules
                      ? 'bg-win/5 border-win/20 text-win'
                      : 'bg-white/3 border-white/10 text-white/30'
                  }`}>
                    {followedRules ? '✓ All strategy rules followed' : `${checklist.filter(Boolean).length}/${strategyRules.length} rules confirmed`}
                  </div>
                )}
              </div>
            </div>
          </form>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-white/5 flex-shrink-0 bg-navy-900">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="btn-primary flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving…
                </>
              ) : (
                'Save Trade'
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
