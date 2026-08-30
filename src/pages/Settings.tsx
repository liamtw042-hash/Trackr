import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '@/store/AuthContext'
import { useTrades } from '@/store/TradeContext'
import { recomputeBalance } from '@/lib/repair'
import { migrateTrades, needsMigration, type MigrationResult } from '@/lib/migration'
import { aiConfigured } from '@/lib/ai'
import { cloudinaryConfigured } from '@/lib/images'
import { fmtMoney, num } from '@/lib/calc'
import { SCHEMA_VERSION } from '@/types'
import { Panel, Field, Input, Textarea, Spinner, Tag } from '@/components/ui/Primitives'

export function Settings() {
  const { user, profile, saveProfile } = useAuth()
  const { trades } = useTrades()

  const [displayName, setDisplayName] = useState('')
  const [balance, setBalance] = useState('')
  const [startBalance, setStartBalance] = useState('')
  const [risk, setRisk] = useState('')
  const [strategy, setStrategy] = useState('')
  const [saving, setSaving] = useState(false)

  const [migrationNeeded, setMigrationNeeded] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null)
  const [repairing, setRepairing] = useState(false)

  // Seed the form from the profile ONCE. The profile is a live Firestore
  // listener and the balance moves every time a trade closes, so re-running
  // this on every snapshot would wipe whatever is being typed mid-edit —
  // including from a save triggered by this very form.
  const seeded = useRef(false)
  useEffect(() => {
    if (!profile || seeded.current) return
    seeded.current = true
    setDisplayName(profile.displayName ?? '')
    setBalance(String(profile.accountBalance ?? ''))
    setStartBalance(String(profile.startingBalance ?? ''))
    setRisk(String(profile.defaultRisk ?? 1))
    setStrategy(profile.strategy ?? '')
  }, [profile])

  useEffect(() => {
    if (!user) return
    void needsMigration(user.uid).then(setMigrationNeeded).catch(() => setMigrationNeeded(false))
  }, [user, trades.length])

  const save = async () => {
    setSaving(true)
    try {
      await saveProfile({
        displayName: displayName.trim() || 'Trader',
        accountBalance: num(balance) ?? 0,
        startingBalance: num(startBalance) ?? 0,
        defaultRisk: num(risk) ?? 1,
        strategy: strategy.trim(),
        schemaVersion: SCHEMA_VERSION,
      })
      toast.success('Saved')
    } catch {
      toast.error('Could not save')
    } finally {
      setSaving(false)
    }
  }

  const runMigration = async () => {
    if (!user) return
    setMigrating(true)
    try {
      const result = await migrateTrades(user.uid)
      setMigrationResult(result)
      setMigrationNeeded(await needsMigration(user.uid))
      toast.success(`Migrated ${result.migrated} trade${result.migrated === 1 ? '' : 's'}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Migration failed')
    } finally {
      setMigrating(false)
    }
  }

  const repairBalance = async () => {
    if (!user) return
    setRepairing(true)
    try {
      const start = num(startBalance) ?? 0
      const next = await recomputeBalance(user.uid, start)
      setBalance(String(next))
      toast.success(`Balance recomputed to ${fmtMoney(next)}`)
    } catch {
      toast.error('Could not recompute')
    } finally {
      setRepairing(false)
    }
  }

  const onOldSchema = trades.filter((t) => t.schemaVersion < SCHEMA_VERSION).length

  return (
    <div className="max-w-3xl space-y-3">

      <Panel title="Account">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Name">
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </Field>
            <Field label="Default risk %" hint="Pre-filled on every new trade">
              <Input mono type="number" step="0.1" value={risk} onChange={(e) => setRisk(e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field
              label="Current balance"
              hint="Adjusts itself as trades close"
            >
              <Input mono type="number" step="any" value={balance} onChange={(e) => setBalance(e.target.value)} />
            </Field>
            <Field label="Starting balance" hint="The baseline the equity curve is drawn from">
              <Input mono type="number" step="any" value={startBalance} onChange={(e) => setStartBalance(e.target.value)} />
            </Field>
          </div>

          {num(risk) !== null && num(balance) !== null && (
            <p className="hint">
              At {risk}% of {fmtMoney(num(balance))}, one R is{' '}
              <span className="text-brass-bright font-mono">
                {fmtMoney(((num(balance) ?? 0) * (num(risk) ?? 0)) / 100)}
              </span>
              .
            </p>
          )}

          <button onClick={() => void save()} disabled={saving} className="btn-primary">
            {saving ? <><Spinner /> Saving…</> : 'Save'}
          </button>
        </div>
      </Panel>

      <Panel title="Strategy notes">
        <Field
          label="Extra context for the AI"
          hint="Your core rules are already built in. Add anything specific — pairs you avoid, sessions you trade, patterns you're working on."
        >
          <Textarea
            rows={5}
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            placeholder="I avoid trading GBP pairs around UK data releases…"
          />
        </Field>
        <button onClick={() => void save()} disabled={saving} className="btn-primary mt-2">
          {saving ? <><Spinner /> Saving…</> : 'Save'}
        </button>
      </Panel>

      {/* ── Migration ── */}
      {(migrationNeeded || onOldSchema > 0 || migrationResult) && (
        <Panel title="Data migration">
          <div className="space-y-3">
            <p className="text-xs text-ink-200 leading-relaxed">
              {onOldSchema > 0 || migrationNeeded
                ? `${onOldSchema || 'Some'} trade${onOldSchema === 1 ? '' : 's'} are still on the previous schema. Migrating maps every old field to its new home — nothing is deleted.`
                : 'All trades are on the current schema.'}
            </p>

            <ul className="text-2xs text-ink-400 space-y-1 leading-relaxed">
              <li>· Old checklist entries are matched to the five fixed rules by keyword</li>
              <li>· Anything that can't be matched is left unanswered rather than guessed</li>
              <li>· Old AI summaries are appended to that trade's notes</li>
              <li>· Safe to run more than once — already-migrated trades are skipped</li>
            </ul>

            {migrationNeeded && (
              <button onClick={() => void runMigration()} disabled={migrating} className="btn-primary">
                {migrating ? <><Spinner /> Migrating…</> : 'Migrate now'}
              </button>
            )}

            {migrationResult && (
              <div className="border border-ink-700 divide-y divide-ink-700 text-2xs font-mono">
                {([
                  ['Scanned', migrationResult.scanned],
                  ['Migrated', migrationResult.migrated],
                  ['Already current', migrationResult.skipped],
                ] as const).map(([label, v]) => (
                  <div key={label} className="flex justify-between px-2.5 py-1.5">
                    <span className="text-ink-400">{label}</span>
                    <span className="text-ink-50">{v}</span>
                  </div>
                ))}
                {migrationResult.errors.length > 0 && (
                  <div className="px-2.5 py-2 text-down">
                    {migrationResult.errors.slice(0, 5).map((e, i) => <p key={i}>{e}</p>)}
                  </div>
                )}
              </div>
            )}
          </div>
        </Panel>
      )}

      {/* ── Maintenance ── */}
      <Panel title="Maintenance">
        <div className="space-y-2">
          <p className="text-xs text-ink-200 leading-relaxed">
            The balance updates automatically as trades close. If it has drifted out of
            step — after editing trades directly in Firestore, say — recompute it from
            the starting balance plus every realised P&L.
          </p>
          <button onClick={() => void repairBalance()} disabled={repairing} className="btn-ghost">
            {repairing ? <><Spinner /> Recomputing…</> : 'Recompute balance'}
          </button>
        </div>
      </Panel>

      {/* ── Config status ── */}
      <Panel title="Configuration">
        <div className="divide-y divide-ink-800">
          {([
            ['Firebase', Boolean(import.meta.env.VITE_FIREBASE_PROJECT_ID), 'VITE_FIREBASE_* — console.firebase.google.com'],
            ['Anthropic', aiConfigured(), 'VITE_ANTHROPIC_API_KEY — console.anthropic.com'],
            ['Cloudinary', cloudinaryConfigured(), 'VITE_CLOUDINARY_CLOUD_NAME + _UPLOAD_PRESET — cloudinary.com'],
          ] as const).map(([label, ok, detail]) => (
            <div key={label} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="text-xs text-ink-100">{label}</div>
                <div className="text-2xs text-ink-500 font-mono truncate">{detail}</div>
              </div>
              <Tag tone={ok ? 'up' : 'down'}>{ok ? 'set' : 'missing'}</Tag>
            </div>
          ))}
        </div>
        <p className="hint mt-2">
          Without Anthropic, screenshot reading and all AI features are off — everything
          else works. Without Cloudinary, trades save but screenshots aren't kept.
        </p>
      </Panel>

      <Panel title="Signed in as">
        <p className="font-mono text-2xs text-ink-300">{user?.email}</p>
        <p className="hint mt-1">
          {trades.length} trade{trades.length === 1 ? '' : 's'} · schema v{SCHEMA_VERSION}
        </p>
      </Panel>
    </div>
  )
}
