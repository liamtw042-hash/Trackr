import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTrades } from '../context/TradeContext'
import {
  collection, query, where, getDocs, writeBatch, doc, deleteDoc,
} from 'firebase/firestore'
import { deleteUser, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth'
import { db, auth } from '../firebase/config'
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
  const { user, userProfile, saveUserProfile, logout } = useAuth()
  const { trades } = useTrades()
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

      {/* Import historical stats */}
      <ImportStats userId={user?.uid} saveUserProfile={saveUserProfile} existing={userProfile?.importedStats} />

      {/* Danger zone */}
      <DangerZone user={user} trades={trades} logout={logout} />
    </div>
  )
}

// ─── Import Stats component ───────────────────────────────────────────────────

function ImportStats({ userId, saveUserProfile, existing }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [imp, setImp] = useState({
    total: existing?.total ?? '',
    wins: existing?.wins ?? '',
    losses: existing?.losses ?? '',
    totalPnL: existing?.totalPnL ?? '',
    startingBalance: existing?.startingBalance ?? '',
    note: existing?.note ?? '',
  })

  const set = (k, v) => setImp((f) => ({ ...f, [k]: v }))

  const handleImport = async () => {
    const total = parseInt(imp.total) || 0
    const wins = parseInt(imp.wins) || 0
    const losses = parseInt(imp.losses) || 0
    const totalPnL = parseFloat(imp.totalPnL) || 0

    if (total < 1) { toast.error('Enter at least 1 total trade'); return }
    if (wins + losses > total) { toast.error('Wins + losses cannot exceed total trades'); return }

    setSaving(true)
    try {
      await saveUserProfile(userId, {
        importedStats: { total, wins, losses, totalPnL, startingBalance: parseFloat(imp.startingBalance) || 0, note: imp.note },
      })
      toast.success('Historical stats imported')
      setOpen(false)
    } catch {
      toast.error('Failed to import stats')
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    if (!window.confirm('Remove imported stats? This only removes the historical data, not your logged trades.')) return
    setSaving(true)
    try {
      await saveUserProfile(userId, { importedStats: null })
      setImp({ total: '', wins: '', losses: '', totalPnL: '', startingBalance: '', note: '' })
      toast.success('Imported stats cleared')
    } catch {
      toast.error('Failed to clear stats')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="section-title">Import Historical Stats</h2>
          <p className="text-white/40 text-sm mt-1">
            Have an existing trading history? Add a summary and it'll be included in all your stats.
          </p>
        </div>
        {existing && (
          <span className="badge-win text-xs">Active</span>
        )}
      </div>

      {existing && !open && (
        <div className="mt-4 p-3 rounded-xl bg-white/3 border border-white/5 grid grid-cols-3 gap-3 text-center mb-4">
          <div><div className="text-lg font-bold text-white">{existing.total}</div><div className="text-xs text-white/30">Trades</div></div>
          <div><div className="text-lg font-bold text-win">{existing.wins}W / <span className="text-loss">{existing.losses}L</span></div><div className="text-xs text-white/30">Record</div></div>
          <div><div className={`text-lg font-bold ${existing.totalPnL >= 0 ? 'text-win' : 'text-loss'}`}>{existing.totalPnL >= 0 ? '+' : ''}${existing.totalPnL?.toFixed(0)}</div><div className="text-xs text-white/30">P&L</div></div>
        </div>
      )}

      {!open ? (
        <div className="flex gap-3 mt-4">
          <button onClick={() => setOpen(true)} className="btn-secondary text-sm">
            {existing ? 'Edit imported stats' : '+ Import historical stats'}
          </button>
          {existing && (
            <button onClick={handleClear} disabled={saving} className="btn-danger text-sm">
              Clear
            </button>
          )}
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="bg-accent/5 border border-accent/20 rounded-xl p-3 text-xs text-white/50 leading-relaxed">
            Enter your pre-Trackr trading summary. These numbers combine with your logged trades in all charts and stats.
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Total trades</label>
              <input type="number" value={imp.total} onChange={(e) => set('total', e.target.value)} placeholder="250" className="input-field" min="1" />
            </div>
            <div>
              <label className="label">Starting balance ($)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30">$</span>
                <input type="number" value={imp.startingBalance} onChange={(e) => set('startingBalance', e.target.value)} placeholder="10000" className="input-field pl-7" />
              </div>
            </div>
            <div>
              <label className="label">Winning trades</label>
              <input type="number" value={imp.wins} onChange={(e) => set('wins', e.target.value)} placeholder="140" className="input-field" min="0" />
            </div>
            <div>
              <label className="label">Losing trades</label>
              <input type="number" value={imp.losses} onChange={(e) => set('losses', e.target.value)} placeholder="110" className="input-field" min="0" />
            </div>
            <div className="col-span-2">
              <label className="label">Total P&L ($)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30">$</span>
                <input type="number" value={imp.totalPnL} onChange={(e) => set('totalPnL', e.target.value)} placeholder="4200.00" className="input-field pl-7" step="0.01" />
              </div>
            </div>
            <div className="col-span-2">
              <label className="label">Note (optional)</label>
              <input type="text" value={imp.note} onChange={(e) => set('note', e.target.value)} placeholder="e.g. 2023 trading history from MT4" className="input-field" />
            </div>
          </div>

          {imp.total && imp.wins && (
            <div className="p-3 rounded-xl bg-white/3 border border-white/5 text-xs text-white/40">
              Win rate: <strong className="text-white">{Math.round(parseInt(imp.wins) / parseInt(imp.total) * 100)}%</strong>
              {imp.totalPnL && <> · P&L: <strong className={parseFloat(imp.totalPnL) >= 0 ? 'text-win' : 'text-loss'}>${parseFloat(imp.totalPnL).toFixed(2)}</strong></>}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setOpen(false)} className="btn-secondary flex-1 text-sm">Cancel</button>
            <button onClick={handleImport} disabled={saving} className="btn-primary flex-1 text-sm flex items-center justify-center gap-2">
              {saving ? <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg> : null}
              {saving ? 'Saving…' : 'Save historical stats'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}


// ─── Danger Zone ──────────────────────────────────────────────────────────────

function DangerZone({ user, trades, logout }) {
  const [deleting, setDeleting] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [showDeleteAccount, setShowDeleteAccount] = useState(false)
  const [password, setPassword] = useState('')
  const [accountDeleting, setAccountDeleting] = useState(false)

  const handleDeleteTrades = async () => {
    if (!window.confirm(`Delete all ${trades.length} trades? This cannot be undone.`)) return
    setDeleting(true)
    try {
      const q = query(collection(db, 'trades'), where('userId', '==', user.uid))
      const snap = await getDocs(q)
      const batch = writeBatch(db)
      snap.docs.forEach((d) => batch.delete(d.ref))
      await batch.commit()
      Object.keys(localStorage).filter((k) => k.includes(user.uid)).forEach((k) => localStorage.removeItem(k))
      toast.success('All trades deleted')
    } catch { toast.error('Failed to delete trades') }
    finally { setDeleting(false) }
  }

  const handleDeleteAccount = async () => {
    if (confirm !== 'DELETE') { toast.error('Type DELETE to confirm'); return }
    setAccountDeleting(true)
    try {
      const credential = EmailAuthProvider.credential(user.email, password)
      await reauthenticateWithCredential(auth.currentUser, credential)
      const q = query(collection(db, 'trades'), where('userId', '==', user.uid))
      const snap = await getDocs(q)
      const batch = writeBatch(db)
      snap.docs.forEach((d) => batch.delete(d.ref))

      batch.delete(doc(db, 'users', user.uid))
      await batch.commit()
      await deleteUser(auth.currentUser)
      Object.keys(localStorage).filter((k) => k.includes(user.uid)).forEach((k) => localStorage.removeItem(k))
      toast.success('Account deleted')
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') toast.error('Incorrect password')
      else if (err.code === 'auth/requires-recent-login') toast.error('Sign out and sign back in first')
      else toast.error('Failed to delete account')
    } finally { setAccountDeleting(false) }
  }

  return (
    <div className="card p-6 border-loss/20">
      <h2 className="text-loss font-bold text-lg mb-1">Danger Zone</h2>
      <p className="text-white/40 text-sm mb-5">These actions are permanent and cannot be undone.</p>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-loss/5 border border-loss/15">
          <div>
            <div className="text-sm font-semibold text-white mb-0.5">Delete all trades</div>
            <div className="text-xs text-white/40">Permanently delete all {trades.length} logged trades. Account stays.</div>
          </div>
          <button onClick={handleDeleteTrades} disabled={deleting || trades.length === 0}
            className="btn-danger text-sm flex-shrink-0 disabled:opacity-40 flex items-center gap-2">
            {deleting ? <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg> : null}
            {deleting ? 'Deleting…' : 'Delete trades'}
          </button>
        </div>
        <div className="p-4 rounded-xl bg-loss/5 border border-loss/15">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-white mb-0.5">Delete account</div>
              <div className="text-xs text-white/40">Permanently delete your account and all data.</div>
            </div>
            <button onClick={() => setShowDeleteAccount((v) => !v)} className="btn-danger text-sm flex-shrink-0">
              {showDeleteAccount ? 'Cancel' : 'Delete account'}
            </button>
          </div>
          {showDeleteAccount && (
            <div className="mt-4 space-y-3 pt-4 border-t border-loss/20">
              <p className="text-xs text-loss font-medium">Type <strong>DELETE</strong> and enter your password to confirm.</p>
              <input type="text" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                placeholder='Type "DELETE"' className="input-field border-loss/30 text-sm" />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password" className="input-field border-loss/30 text-sm" />
              <button onClick={handleDeleteAccount}
                disabled={accountDeleting || confirm !== 'DELETE' || !password}
                className="w-full bg-loss hover:bg-red-600 text-white font-semibold py-2.5 px-5 rounded-lg
                  transition-all text-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {accountDeleting ? <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg> : null}
                {accountDeleting ? 'Deleting…' : 'Permanently delete my account'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
