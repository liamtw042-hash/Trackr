import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import toast from 'react-hot-toast'

const MARKETS = [
  { id: 'forex', label: 'Forex', icon: '💱', desc: 'Currency pairs' },
  { id: 'stocks', label: 'Stocks', icon: '📈', desc: 'Equities & shares' },
  { id: 'crypto', label: 'Crypto', icon: '₿', desc: 'Digital assets' },
  { id: 'commodities', label: 'Commodities', icon: '🥇', desc: 'Gold, oil & more' },
  { id: 'options', label: 'Options', icon: '📋', desc: 'Derivatives' },
  { id: 'futures', label: 'Futures', icon: '⏳', desc: 'Futures contracts' },
  { id: 'indices', label: 'Indices', icon: '🌐', desc: 'Market indices' },
  { id: 'other', label: 'Other', icon: '✨', desc: 'Other markets' },
]

const STEPS = [
  { id: 'welcome', title: 'Welcome to Trackr', subtitle: 'Let\'s set up your trading journal in 3 quick steps' },
  { id: 'account', title: 'Your account', subtitle: 'Tell us about your trading account' },
  { id: 'markets', title: 'Markets you trade', subtitle: 'Select all markets you actively trade' },
  { id: 'strategy', title: 'Your trading strategy', subtitle: 'Describe your edge — AI will use this for every analysis' },
]

export default function Onboarding() {
  const { user, completeOnboarding } = useAuth()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)

  const [data, setData] = useState({
    accountBalance: '',
    defaultRisk: '1',
    markets: [],
    strategy: '',
    displayName: user?.displayName ?? '',
  })

  const updateData = (key, value) => setData((d) => ({ ...d, [key]: value }))

  const toggleMarket = (id) => {
    setData((d) => ({
      ...d,
      markets: d.markets.includes(id)
        ? d.markets.filter((m) => m !== id)
        : [...d.markets, id],
    }))
  }

  const canAdvance = () => {
    if (step === 1) return data.accountBalance && Number(data.accountBalance) > 0
    if (step === 2) return data.markets.length > 0
    if (step === 3) return data.strategy.trim().length >= 20
    return true
  }

  const handleNext = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1)
  }

  const handleBack = () => {
    if (step > 0) setStep((s) => s - 1)
  }

  const handleSubmit = async () => {
    if (!canAdvance()) return
    setLoading(true)
    try {
      await completeOnboarding(user.uid, {
        displayName: data.displayName || user?.displayName || 'Trader',
        accountBalance: Number(data.accountBalance),
        startingBalance: Number(data.accountBalance),
        defaultRisk: Number(data.defaultRisk),
        markets: data.markets,
        strategy: data.strategy.trim(),
      })
      toast.success('You\'re all set! Welcome to Trackr 🎉')
    } catch (err) {
      console.error(err)
      toast.error('Setup failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const progress = (step / (STEPS.length - 1)) * 100

  return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center p-6">
      {/* Background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,rgba(59,130,246,0.06),transparent_70%)]" />

      <div className="relative w-full max-w-2xl animate-slide-up">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-accent" viewBox="0 0 20 20" fill="none">
              <polyline points="2,15 6,9 10,12 14,5 18,8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-white font-bold text-xl">Trackr</span>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-white/40 font-medium">
              Step {step + 1} of {STEPS.length}
            </span>
            <span className="text-xs text-white/40 font-medium">{Math.round(progress)}%</span>
          </div>
          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent to-win rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Card */}
        <div className="card p-8">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">{STEPS[step].title}</h2>
            <p className="text-white/40">{STEPS[step].subtitle}</p>
          </div>

          {/* Step 0 — Welcome */}
          {step === 0 && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { icon: '🤖', title: 'AI Analysis', desc: 'Every trade analysed by Claude AI against your personal strategy' },
                  { icon: '📊', title: 'Live Analytics', desc: 'Real-time P&L, win rates, and pattern detection' },
                  { icon: '🛡️', title: 'Streak Protection', desc: 'AI warnings when you\'re on a losing streak' },
                  { icon: '📅', title: 'Trade Replay', desc: 'Compare entry vs exit with AI feedback' },
                ].map((f) => (
                  <div key={f.title} className="bg-white/3 border border-white/5 rounded-xl p-4">
                    <div className="text-2xl mb-2">{f.icon}</div>
                    <div className="text-sm font-semibold text-white mb-1">{f.title}</div>
                    <div className="text-xs text-white/40 leading-relaxed">{f.desc}</div>
                  </div>
                ))}
              </div>
              <div>
                <label className="label">What should we call you?</label>
                <input
                  type="text"
                  value={data.displayName}
                  onChange={(e) => updateData('displayName', e.target.value)}
                  placeholder="Your name or trading alias"
                  className="input-field"
                />
              </div>
            </div>
          )}

          {/* Step 1 — Account */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <label className="label">Starting account balance ($)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 font-medium">$</span>
                  <input
                    type="number"
                    value={data.accountBalance}
                    onChange={(e) => updateData('accountBalance', e.target.value)}
                    placeholder="10000"
                    className="input-field pl-8"
                    min="1"
                    step="100"
                  />
                </div>
                <p className="text-xs text-white/30 mt-1.5">
                  This is your current account balance — used to calculate risk and P&L percentages
                </p>
              </div>

              <div>
                <label className="label">Default risk per trade (%)</label>
                <div className="relative">
                  <input
                    type="number"
                    value={data.defaultRisk}
                    onChange={(e) => updateData('defaultRisk', e.target.value)}
                    placeholder="1"
                    className="input-field pr-8"
                    min="0.1"
                    max="100"
                    step="0.1"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 font-medium">%</span>
                </div>
                <p className="text-xs text-white/30 mt-1.5">
                  Industry standard is 1–2% per trade. This will be pre-filled when adding trades.
                </p>
              </div>

              {data.accountBalance && Number(data.accountBalance) > 0 && data.defaultRisk && (
                <div className="bg-accent/5 border border-accent/20 rounded-xl p-4">
                  <div className="text-xs text-white/40 font-medium mb-1">Risk per trade at default settings</div>
                  <div className="text-2xl font-bold text-accent">
                    ${(Number(data.accountBalance) * Number(data.defaultRisk) / 100).toFixed(2)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2 — Markets */}
          {step === 2 && (
            <div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {MARKETS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMarket(m.id)}
                    className={`
                      p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer
                      ${data.markets.includes(m.id)
                        ? 'bg-accent/10 border-accent/40 text-white'
                        : 'bg-white/3 border-white/5 text-white/60 hover:border-white/15 hover:text-white/80'
                      }
                    `}
                  >
                    <div className="text-2xl mb-2">{m.icon}</div>
                    <div className="text-sm font-semibold mb-0.5">{m.label}</div>
                    <div className="text-xs opacity-60">{m.desc}</div>
                    {data.markets.includes(m.id) && (
                      <div className="mt-2 flex items-center gap-1">
                        <div className="w-4 h-4 rounded-full bg-accent flex items-center justify-center">
                          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                            <polyline points="2,5 4,7 8,3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                        <span className="text-xs text-accent font-medium">Selected</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
              {data.markets.length > 0 && (
                <p className="text-xs text-white/40 mt-4">
                  {data.markets.length} market{data.markets.length !== 1 ? 's' : ''} selected
                </p>
              )}
            </div>
          )}

          {/* Step 3 — Strategy */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-gold/5 border border-gold/20 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <span className="text-xl">💡</span>
                  <div>
                    <div className="text-sm font-semibold text-gold mb-1">This is your AI's memory</div>
                    <div className="text-xs text-white/50 leading-relaxed">
                      Write your strategy in plain English. Claude AI will reference this for every trade analysis,
                      rating how well each trade matches your rules. Be specific about your entry criteria,
                      risk rules, and what setups you take.
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="label">Your trading strategy</label>
                <textarea
                  value={data.strategy}
                  onChange={(e) => updateData('strategy', e.target.value)}
                  placeholder={`Example: I trade price action on the 1H and 4H timeframes. My entries require:
1. Price must be above/below the 200 EMA for long/short
2. I wait for a pullback into a Fair Value Gap (FVG) or Order Block
3. Confirmation: 15min engulfing candle in trade direction
4. Stop loss below/above the structure low/high
5. Minimum 1:2 RR — I never take less
6. I only trade Monday–Thursday, 8am–12pm NY session
7. I avoid trading before major news events`}
                  className="input-field min-h-[200px] resize-none leading-relaxed"
                  rows={8}
                />
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-xs text-white/30">
                    {data.strategy.length < 20
                      ? `${20 - data.strategy.length} more characters required`
                      : `${data.strategy.length} characters — good detail`
                    }
                  </p>
                  <div className={`w-2 h-2 rounded-full ${data.strategy.length >= 20 ? 'bg-win' : 'bg-white/10'}`} />
                </div>
              </div>

              <div className="bg-white/3 border border-white/5 rounded-xl p-4">
                <div className="text-xs text-white/40 font-medium mb-2">Strategy prompts to include:</div>
                <div className="grid grid-cols-2 gap-1">
                  {[
                    'Entry criteria',
                    'Timeframes used',
                    'Risk rules',
                    'Trading hours',
                    'Setup types',
                    'What you avoid',
                  ].map((p) => (
                    <div key={p} className="flex items-center gap-1.5 text-xs text-white/30">
                      <div className="w-1 h-1 rounded-full bg-accent/40" />
                      {p}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <button
            type="button"
            onClick={handleBack}
            disabled={step === 0}
            className="btn-secondary disabled:opacity-0"
          >
            ← Back
          </button>

          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={!canAdvance()}
              className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              Continue →
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !canAdvance()}
              className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 bg-win hover:bg-emerald-500"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Setting up...
                </>
              ) : (
                '🚀 Launch Trackr'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
