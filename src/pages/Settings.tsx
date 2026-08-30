import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '@/store/AuthContext'
import { useTrades } from '@/store/TradeContext'
import { recomputeBalance } from '@/lib/repair'
import { migrateTrades, needsMigration, type MigrationResult } from '@/lib/migration'
import { aiConfigured } from '@/lib/ai'
import { cloudinaryConfigured } from '@/lib/images'
import { fmtMoney, num } from '@/lib/calc'
import { SCHEMA_VERSION } from '@/types'
import { PageHeader, Input, Textarea, Spinner, Tag } from '@/components/ui/Primitives'

// ────────────────────────────────────────────────────────────────────────
// Settings.
//
// The previous version was six identically-bordered blocks stacked in one
// column — the exact "everything is a box" problem the rest of the app had
// already been redesigned out of, and the reason the reset panel at the bottom
// of it was invisible.
//
// It is now a two-pane page: a rail that names the groups, and a content pane
// built from labelled rows — description on the left, control on the right —
// separated by hairlines rather than wrapped in rectangles. That is the shape
// a settings page actually wants: it makes each row scannable, keeps every
// control on one vertical axis, and leaves no panel competing with another for
// attention.
//
// Data (export, import, restore, reset) is no longer here at all. It has its
// own top-level page.
// ────────────────────────────────────────────────────────────────────────

type PaneId = 'account' | 'strategy' | 'connections' | 'maintenance'

const PANES: { id: PaneId; label: string; blurb: string }[] = [
  { id: 'account', label: 'Account', blurb: 'Name, balances, default risk' },
  { id: 'strategy', label: 'Strategy', blurb: 'Extra context for the AI' },
  { id: 'connections', label: 'Connections', blurb: 'Firebase, Anthropic, Cloudinary' },
  { id: 'maintenance', label: 'Maintenance', blurb: 'Repair and migration' },
]

/**
 * One settings row: what it is on the left, the control on the right, a
 * hairline underneath. No box.
 */
function Row({
  title, detail, children, control = 'w-full',
}: {
  title: string
  detail?: ReactNode
  children?: ReactNode
  control?: string
}) {
  return (
    <div
      className="grid sm:grid-cols-[minmax(0,1fr)_240px] gap-x-10 gap-y-3 py-5 items-start"
      style={{ boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.045)' }}
    >
      <div className="min-w-0">
        <h3 className="text-xs font-semibold text-ink-50 tracking-tight">{title}</h3>
        {detail && <p className="text-2xs text-ink-400 mt-1.5 leading-relaxed max-w-lg">{detail}</p>}
      </div>
      {children && <div className={`${control} sm:justify-self-end`}>{children}</div>}
    </div>
  )
}

export function Settings() {
  const { user, profile, saveProfile } = useAuth()
  const { trades } = useTrades()

  const [pane, setPane] = useState<PaneId>('account')

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
  const [baseline, setBaseline] = useState({ displayName: '', balance: '', startBalance: '', risk: '', strategy: '' })

  useEffect(() => {
    if (!profile || seeded.current) return
    seeded.current = true
    const seed = {
      displayName: profile.displayName ?? '',
      balance: String(profile.accountBalance ?? ''),
      startBalance: String(profile.startingBalance ?? ''),
      risk: String(profile.defaultRisk ?? 1),
      strategy: profile.strategy ?? '',
    }
    setDisplayName(seed.displayName)
    setBalance(seed.balance)
    setStartBalance(seed.startBalance)
    setRisk(seed.risk)
    setStrategy(seed.strategy)
    setBaseline(seed)
  }, [profile])

  useEffect(() => {
    if (!user) return
    void needsMigration(user.uid).then(setMigrationNeeded).catch(() => setMigrationNeeded(false))
  }, [user, trades.length])

  // Dirty is measured against the snapshot taken when the form was seeded, not
  // against the live profile — the live balance moves on its own as trades
  // close, and that must not read as an unsaved edit.
  const dirty = useMemo(
    () =>
      displayName !== baseline.displayName ||
      balance !== baseline.balance ||
      startBalance !== baseline.startBalance ||
      risk !== baseline.risk ||
      strategy !== baseline.strategy,
    [displayName, balance, startBalance, risk, strategy, baseline]
  )

  const save = async () => {
    setSaving(true)
    try {
      // Send only what actually changed.
      //
      // `accountBalance` is a derived field: TradeContext moves it with an
      // atomic increment every time a trade closes, while this form holds a
      // value seeded once at mount. Writing it unconditionally means opening
      // Settings, logging a closed trade with `N`, editing the strategy note
      // and pressing Save silently rolls the balance back to what it was when
      // the page loaded. Omitting an unchanged field leaves the live value
      // alone — saveProfile merges — while an edit the user actually made in
      // the Account pane still goes through.
      const patch: Parameters<typeof saveProfile>[0] = {
        displayName: displayName.trim() || 'Trader',
        defaultRisk: num(risk) ?? 1,
        strategy: strategy.trim(),
        schemaVersion: SCHEMA_VERSION,
      }
      if (balance !== baseline.balance) patch.accountBalance = num(balance) ?? 0
      if (startBalance !== baseline.startBalance) patch.startingBalance = num(startBalance) ?? 0

      await saveProfile(patch)
      setBaseline({ displayName, balance, startBalance, risk, strategy })
      toast.success('Saved')
    } catch {
      toast.error('Could not save')
    } finally {
      setSaving(false)
    }
  }

  // Discard re-reads the LIVE profile rather than restoring the seed snapshot:
  // the balance may have moved since the form was seeded, and putting the stale
  // figure back on screen marked "clean" would be worse than not offering the
  // button at all.
  const discard = () => {
    const live = {
      displayName: profile?.displayName ?? baseline.displayName,
      balance: profile ? String(profile.accountBalance ?? '') : baseline.balance,
      startBalance: profile ? String(profile.startingBalance ?? '') : baseline.startBalance,
      risk: profile ? String(profile.defaultRisk ?? 1) : baseline.risk,
      strategy: profile?.strategy ?? baseline.strategy,
    }
    setDisplayName(live.displayName)
    setBalance(live.balance)
    setStartBalance(live.startBalance)
    setRisk(live.risk)
    setStrategy(live.strategy)
    setBaseline(live)
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
      setBaseline((b) => ({ ...b, balance: String(next) }))
      toast.success(`Balance recomputed to ${fmtMoney(next)}`)
    } catch {
      toast.error('Could not recompute')
    } finally {
      setRepairing(false)
    }
  }

  // The profile listener keeps moving accountBalance while this form holds a
  // value seeded at mount. Say so rather than silently showing a stale figure.
  const liveBalanceMoved =
    profile != null && seeded.current && String(profile.accountBalance ?? '') !== baseline.balance

  const onOldSchema = trades.filter((t) => t.schemaVersion < SCHEMA_VERSION).length
  const oneR = ((num(balance) ?? 0) * (num(risk) ?? 0)) / 100

  return (
    <div className="space-y-section pb-24 max-w-[1000px]">
      <PageHeader
        title="Settings"
        lede="How the account is configured and what the AI is told about your strategy."
      />

      <div className="grid lg:grid-cols-[190px_minmax(0,1fr)] gap-x-14 gap-y-8 max-w-[1000px]">

        {/* ── Rail ───────────────────────────────────────────────────────── */}
        <nav className="lg:sticky lg:top-[76px] lg:self-start space-y-1">
          {PANES.map((p) => {
            const active = pane === p.id
            return (
              <button
                key={p.id}
                onClick={() => setPane(p.id)}
                className={`w-full text-left px-3 py-2.5 rounded-md
                            transition-[background-color,box-shadow,color] duration-130 ease-snap
                            ${active ? 'bg-ink-850' : 'hover:bg-ink-900'}`}
                style={
                  active
                    ? { boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 0 0 1px rgba(255,255,255,0.06)' }
                    : undefined
                }
              >
                <span className={`block text-xs font-medium ${active ? 'text-ink-50' : 'text-ink-300'}`}>
                  {p.label}
                </span>
                <span className="block text-3xs text-ink-500 mt-0.5 leading-snug">{p.blurb}</span>
              </button>
            )
          })}

          {/* Data is a page, not a settings pane — but this is where people
              come looking for it, so it is signposted from here. */}
          <Link
            to="/data"
            className="block px-3 py-2.5 rounded-md mt-3 transition-[background-color,box-shadow] duration-130 ease-snap
                       bg-azure-wash hover:bg-azure/15"
            style={{ boxShadow: 'inset 0 1px 0 rgba(166,205,242,0.14), inset 0 0 0 1px rgba(127,180,232,0.28)' }}
          >
            <span className="flex items-center gap-1.5 text-xs font-medium text-azure-bright">
              Data &amp; reset
              <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.5 2.5L8 6l-3.5 3.5" />
              </svg>
            </span>
            <span className="block text-3xs text-azure-dim mt-0.5 leading-snug">
              Export, import, restore, wipe
            </span>
          </Link>

          <div className="px-3 pt-5 space-y-1">
            <p className="text-3xs text-ink-500 font-mono truncate" title={user?.email ?? ''}>
              {user?.email}
            </p>
            <p className="text-3xs text-ink-600 font-mono">
              {trades.length} trades · schema v{SCHEMA_VERSION}
            </p>
          </div>
        </nav>

        {/* ── Pane ───────────────────────────────────────────────────────── */}
        <div key={pane} className="animate-rise-sm min-w-0">

          {pane === 'account' && (
            <div>
              <Row title="Display name" detail="Used in AI prompts so the coaching reads as though it is addressed to you.">
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </Row>

              <Row
                title="Current balance"
                detail={
                  <>
                    Adjusts itself as trades close. Edit it only if it has drifted out of step —
                    Maintenance can recompute it from the trade history instead.
                    {liveBalanceMoved && (
                      <span className="block mt-2 text-azure-bright">
                        A trade closed since this page loaded — the live balance is now{' '}
                        <span className="font-mono">{fmtMoney(profile?.accountBalance ?? 0)}</span>.
                        Saving will not overwrite it unless you edit this field.
                      </span>
                    )}
                  </>
                }
              >
                <Input mono type="number" step="any" value={balance} onChange={(e) => setBalance(e.target.value)} />
              </Row>

              <Row
                title="Starting balance"
                detail="The baseline the equity curve is drawn from, and the figure every cumulative return is measured against."
              >
                <Input mono type="number" step="any" value={startBalance} onChange={(e) => setStartBalance(e.target.value)} />
              </Row>

              <Row
                title="Default risk"
                detail={
                  num(risk) !== null && num(balance) !== null ? (
                    <>
                      Pre-filled on every new trade. At {risk}% of {fmtMoney(num(balance))}, one R is{' '}
                      <span className="text-azure-bright font-mono">{fmtMoney(oneR)}</span>.
                    </>
                  ) : (
                    'Pre-filled on every new trade.'
                  )
                }
              >
                <div className="relative">
                  <Input mono type="number" step="0.1" value={risk} onChange={(e) => setRisk(e.target.value)} className="pr-7" />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-500 pointer-events-none font-mono">
                    %
                  </span>
                </div>
              </Row>
            </div>
          )}

          {pane === 'strategy' && (
            <div>
              <div className="py-5" style={{ boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.045)' }}>
                <h3 className="text-xs font-semibold text-ink-50 tracking-tight">Extra context for the AI</h3>
                <p className="text-2xs text-ink-400 mt-1.5 leading-relaxed max-w-lg">
                  Your five core rules are already built in and do not need repeating here. Add
                  anything specific — pairs you avoid, sessions you trade, patterns you are
                  working on — and it is sent with every review, chat and pattern analysis.
                </p>
                <div className="mt-4 max-w-2xl">
                  <Textarea
                    rows={9}
                    value={strategy}
                    onChange={(e) => setStrategy(e.target.value)}
                    placeholder="I avoid trading GBP pairs around UK data releases…"
                  />
                  <p className="hint mt-2">{strategy.trim().length} characters</p>
                </div>
              </div>
            </div>
          )}

          {pane === 'connections' && (
            <div>
              {([
                ['Firebase', Boolean(import.meta.env.VITE_FIREBASE_PROJECT_ID),
                  'VITE_FIREBASE_*', 'Auth and the database. Without it there is no app.'],
                ['Anthropic', aiConfigured(),
                  'VITE_ANTHROPIC_API_KEY', 'Screenshot reading, trade review, pattern analysis and Ask. Everything else works without it.'],
                ['Cloudinary', cloudinaryConfigured(),
                  'VITE_CLOUDINARY_CLOUD_NAME + _UPLOAD_PRESET', 'Screenshot storage. Trades still save without it — the images just are not kept.'],
              ] as const).map(([label, ok, envVar, detail]) => (
                <Row
                  key={label}
                  title={label}
                  detail={
                    <>
                      {detail}
                      <span className="block font-mono text-3xs text-ink-600 mt-1.5">{envVar}</span>
                    </>
                  }
                  control="w-auto"
                >
                  <Tag tone={ok ? 'up' : 'down'}>{ok ? 'connected' : 'missing'}</Tag>
                </Row>
              ))}
              <p className="hint pt-5 max-w-lg">
                Set on Vercel under Project → Settings → Environment Variables, or in a local{' '}
                <span className="font-mono text-ink-400">.env</span>. A change needs a redeploy
                to reach the browser.
              </p>
            </div>
          )}

          {pane === 'maintenance' && (
            <div>
              <Row
                title="Recompute balance"
                detail="The balance updates automatically as trades close. If it has drifted — after editing trades directly in Firestore, say — this recalculates it as the starting balance plus every realised P&L."
                control="w-auto"
              >
                <button onClick={() => void repairBalance()} disabled={repairing} className="btn-ghost">
                  {repairing ? <><Spinner /> Recomputing…</> : 'Recompute'}
                </button>
              </Row>

              <Row
                title="Schema migration"
                detail={
                  onOldSchema > 0 || migrationNeeded ? (
                    <>
                      {onOldSchema || 'Some'} trade{onOldSchema === 1 ? '' : 's'} are still on the
                      previous schema. Migrating maps every old field to its new home — nothing is
                      deleted, old checklist entries are matched to the five fixed rules by keyword,
                      anything unmatchable is left unanswered rather than guessed, and running it
                      twice is safe.
                    </>
                  ) : (
                    <>All {trades.length} trades are on schema v{SCHEMA_VERSION}. Nothing to do.</>
                  )
                }
                control="w-auto"
              >
                {migrationNeeded ? (
                  <button onClick={() => void runMigration()} disabled={migrating} className="btn-primary">
                    {migrating ? <><Spinner /> Migrating…</> : 'Migrate now'}
                  </button>
                ) : (
                  <Tag tone="up">current</Tag>
                )}
              </Row>

              {migrationResult && (
                <div className="surface-raised p-4 mt-5 animate-rise-sm max-w-sm">
                  <div className="sub-label mb-3">Migration report</div>
                  {([
                    ['Scanned', migrationResult.scanned],
                    ['Migrated', migrationResult.migrated],
                    ['Already current', migrationResult.skipped],
                  ] as const).map(([label, v]) => (
                    <div key={label} className="kv">
                      <span className="text-2xs text-ink-300">{label}</span>
                      <span className="font-mono text-xs text-ink-50 tabular">{v}</span>
                    </div>
                  ))}
                  {migrationResult.errors.length > 0 && (
                    <div className="pt-3 space-y-1">
                      {migrationResult.errors.slice(0, 5).map((e, i) => (
                        <p key={i} className="text-2xs text-down leading-relaxed">{e}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Unsaved-changes bar ───────────────────────────────────────────────────
          A save button sitting inside each panel means the state of the form is
          only knowable by scrolling to it. This states it once, from wherever
          you are, and disappears the moment there is nothing to save. */}
      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-5 pb-5 pointer-events-none">
          <div
            className="max-w-[1560px] mx-auto flex items-center gap-4 px-4 py-3 rounded-lg
                       bg-ink-850/95 backdrop-blur-xl pointer-events-auto animate-slide-up"
            style={{
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 0 0 1px rgba(255,255,255,0.07), ' +
                '0 2px 6px rgba(0,0,0,0.45), 0 20px 50px -12px rgba(0,0,0,0.7)',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-azure shrink-0" />
            <span className="text-xs text-ink-100">Unsaved changes</span>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={discard} disabled={saving} className="btn-quiet">Discard</button>
              <button onClick={() => void save()} disabled={saving} className="btn-solid">
                {saving ? <><Spinner /> Saving…</> : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
