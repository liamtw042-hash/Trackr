import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const MARKETS_LIST = [
  { id: 'forex', label: 'Forex', icon: '💱' },
  { id: 'stocks', label: 'Stocks', icon: '📈' },
  { id: 'crypto', label: 'Crypto', icon: '₿' },
  { id: 'commodities', label: 'Commodities', icon: '🥇' },
  { id: 'options', label: 'Options', icon: '📋' },
  { id: 'futures', label: 'Futures', icon: '⏳' },
  { id: 'indices', label: 'Indices', icon: '🌐' },
  { id: 'other', label: 'Other', icon: '✨' },
]

export default function Settings() {
  const { user, userProfile, saveUserProfile } = useAuth()
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    displayName: userProfile?.displayName ?? user?.displayName ?? '',
    accountBalance: userProfile?.accountBalance ?? '',
    defaultRisk: userProfile?.defaultRisk ?? 1,
    markets: userProfile?.markets ?? [],
    strategy: userProfile?.strategy ?? '',
  })

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const toggleMarket = (id) => {
    setForm((f) => ({
      ...f,
      markets: f.markets.includes(id)
        ? f.markets.filter((m) => m !== id)
        : [...f.markets, id],
    }))
  }

  const handleSave = async () => {
    if (!form.accountBalance || Number(form.accountBalance) <= 0) {
      toast.error('Please enter a valid account balance')
      return
    }
    setSaving(true)
    try {
      await saveUserProfile(user.uid, {
        displayName: form.displayName,
        accountBalance: Number(form.accountBalance),
        defaultRisk: Number(form.defaultRisk),
        markets: form.markets,
        strategy: form.strategy,
      })
      toast.success('Settings saved')
    } catch {
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in max-w-3xl">

      {/* Profile */}
      <div className="card p-6">
        <h2 className="section-title mb-5">Profile</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Display name</label>
            <input
              type="text"
              value={form.displayName}
              onChange={(e) => update('displayName', e.target.value)}
              className="input-field"
              placeholder="Your name"
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              value={user?.email ?? ''}
              disabled
              className="input-field opacity-40 cursor-not-allowed"
            />
          </div>
        </div>
      </div>

      {/* Account */}
      <div className="card p-6">
        <h2 className="section-title mb-5">Account & Risk</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Account balance ($)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40">$</span>
              <input
                type="number"
                value={form.accountBalance}
                onChange={(e) => update('accountBalance', e.target.value)}
                className="input-field pl-8"
                placeholder="10000"
                min="1"
              />
            </div>
          </div>
          <div>
            <label className="label">Default risk per trade (%)</label>
            <div className="relative">
              <input
                type="number"
                value={form.defaultRisk}
                onChange={(e) => update('defaultRisk', e.target.value)}
                className="input-field pr-8"
                placeholder="1"
                min="0.1"
                max="100"
                step="0.1"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40">%</span>
            </div>
          </div>
        </div>
        {form.accountBalance && form.defaultRisk && (
          <div className="mt-4 p-3 rounded-lg bg-accent/5 border border-accent/20 inline-flex items-center gap-3">
            <span className="text-xs text-white/40">Risk per trade at default:</span>
            <span className="text-accent font-bold">
              ${(Number(form.accountBalance) * Number(form.defaultRisk) / 100).toFixed(2)}
            </span>
          </div>
        )}
      </div>

      {/* Markets */}
      <div className="card p-6">
        <h2 className="section-title mb-5">Markets Traded</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {MARKETS_LIST.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => toggleMarket(m.id)}
              className={`
                p-3 rounded-xl border text-left transition-all duration-200
                ${form.markets.includes(m.id)
                  ? 'bg-accent/10 border-accent/40 text-white'
                  : 'bg-white/3 border-white/5 text-white/60 hover:border-white/15'
                }
              `}
            >
              <span className="text-xl">{m.icon}</span>
              <div className="text-sm font-semibold mt-1">{m.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Strategy */}
      <div className="card p-6">
        <h2 className="section-title mb-2">Trading Strategy</h2>
        <p className="text-white/40 text-sm mb-5">
          Your AI strategy memory. Claude uses this to analyse every trade.
        </p>
        <div className="bg-gold/5 border border-gold/20 rounded-xl p-3 mb-4 flex items-start gap-2.5">
          <span className="text-lg">🧠</span>
          <span className="text-xs text-white/50 leading-relaxed">
            Be specific about entry criteria, timeframes, risk rules, and setups you look for.
            The more detail you provide, the better Claude's trade analysis will be.
          </span>
        </div>
        <textarea
          value={form.strategy}
          onChange={(e) => update('strategy', e.target.value)}
          placeholder="Describe your trading strategy in plain English..."
          className="input-field min-h-[220px] resize-none leading-relaxed"
          rows={9}
        />
        <div className="text-xs text-white/20 mt-1.5">{form.strategy.length} characters</div>
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2"
        >
          {saving ? (
            <>
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Saving...
            </>
          ) : (
            'Save settings'
          )}
        </button>
      </div>
    </div>
  )
}
