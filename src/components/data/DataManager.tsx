import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '@/store/AuthContext'
import { useTrades } from '@/store/TradeContext'
import { useHoldings } from '@/store/HoldingsContext'
import {
  collectBackup, backupToJson, tradesToCsv, download, backupFilename,
  applyReset, inspectBackup, restoreBackup,
  type BackupFile, type ResetResult, type RestorePreview,
} from '@/lib/dataOps'
import { fmtMoney, num } from '@/lib/calc'
import { Section, Field, Input, Spinner, Tag, OptionCard } from '@/components/ui/Primitives'

// ────────────────────────────────────────────────────────────────────────
// Export, import, restore and reset.
//
// The governing rule: you cannot reach a delete without having been offered
// the download first, and the destructive path needs the count of what it will
// remove typed back before it will run. Firestore has no undo and this is the
// only copy of the journal.
//
// Structurally this is four bands of decreasing safety — read, add, replace,
// destroy — separated by real space and a change of treatment rather than by
// six identical bordered boxes in a column. The destructive band is the only
// place red appears.
// ────────────────────────────────────────────────────────────────────────

type ResetMode = 'balance' | 'everything'

function Money({ children }: { children: string }) {
  return <span className="font-mono text-ink-50 tabular">{children}</span>
}

export function DataManager({ onImportCsv }: { onImportCsv?: () => void }) {
  const { user, profile } = useAuth()
  const { trades, loading: tradesLoading } = useTrades()
  const { holdings } = useHoldings()

  const [exporting, setExporting] = useState<'json' | 'csv' | null>(null)
  const [exportedAt, setExportedAt] = useState<Date | null>(null)

  const [mode, setMode] = useState<ResetMode>('balance')
  const [newBalance, setNewBalance] = useState('')
  const [alsoHoldings, setAlsoHoldings] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [typed, setTyped] = useState('')
  const [resetting, setResetting] = useState(false)
  const [result, setResult] = useState<ResetResult | null>(null)

  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null)
  const [pendingBackup, setPendingBackup] = useState<BackupFile | null>(null)
  const [restoring, setRestoring] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Seed the new-balance field from the profile once it arrives. Reading it in
  // useState's initialiser ran before the Firestore listener had resolved, so
  // the field was stuck on a hardcoded default; re-seeding on every snapshot
  // would instead wipe what is being typed.
  const seeded = useRef(false)
  useEffect(() => {
    // `??` is wrong here: AuthContext's DEFAULT_PROFILE supplies
    // startingBalance: 0, and 0 ?? x is 0 — so a user doc missing the field,
    // or a profile-listener error, seeded this box with "0". The balance-only
    // reset needs no confirmation, so one click then wrote 0 to both balances,
    // and Recompute cannot undo that because it derives from startingBalance.
    // `||` falls through the zero to something meaningful.
    if (!profile || seeded.current) return
    seeded.current = true
    // Never overwrite a figure already being typed: the seed fires on the
    // profile's null → object transition, and the field is interactive before
    // that lands.
    setNewBalance((cur) =>
      cur !== ''
        ? cur
        : String(profile.startingBalance || profile.accountBalance || 10000)
    )
  }, [profile])

  const closedCount = trades.filter((t) => t.status === 'closed').length
  const openCount = trades.length - closedCount

  // The word that has to be typed: the trade count, so it can't be muscle
  // memory. If the number on screen isn't the number you expected, that is the
  // point at which you stop.
  const confirmWord = String(trades.length)
  const confirmed = typed.trim() === confirmWord
  // A delete is only reachable once a backup exists — either taken here in this
  // session, or explicitly claimed.
  const backedUp = exportedAt !== null || acknowledged
  // The confirmation word is the count from the local listener, but the delete
  // runs its own server-side query. While the first snapshot is still in flight
  // the page would read "0 trades" and "0" would satisfy the confirmation — so
  // nothing on this band is reachable until the listener has actually
  // delivered, and there has to be something to delete.
  const hasSomethingToDelete = trades.length > 0 || (alsoHoldings && holdings.length > 0)
  const canDestroy =
    mode === 'everything' && confirmed && backedUp && !tradesLoading && hasSomethingToDelete

  // ── Export ────────────────────────────────────────────────────────────────
  const doExport = useCallback(
    async (format: 'json' | 'csv') => {
      if (!user) return
      setExporting(format)
      try {
        const backup = await collectBackup(user.uid, profile)
        if (format === 'json') {
          download(backupFilename('json'), backupToJson(backup), 'application/json')
        } else {
          download(backupFilename('csv'), tradesToCsv(backup.trades), 'text/csv')
        }
        // Only JSON gates the reset below. CSV cannot be restored from, so
        // treating it as a backup would unlock a delete against a file that
        // brings nothing back.
        if (format === 'json') setExportedAt(new Date())
        toast.success(
          format === 'json'
            ? `Exported ${backup.counts.trades} trades and ${backup.counts.holdings} holdings`
            : `Exported ${backup.counts.trades} trades`
        )
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Export failed')
      } finally {
        setExporting(null)
      }
    },
    [user, profile]
  )

  // ── Reset ─────────────────────────────────────────────────────────────────
  const doReset = async () => {
    if (!user || tradesLoading) return
    const balance = num(newBalance)
    if (balance === null || balance < 0) {
      toast.error('Enter a valid starting balance')
      return
    }
    if (mode === 'everything' && !canDestroy) return

    setResetting(true)
    try {
      const r = await applyReset(user.uid, {
        deleteTrades: mode === 'everything',
        deleteHoldings: mode === 'everything' && alsoHoldings,
        startingBalance: balance,
      })
      setResult(r)
      setTyped('')
      setAcknowledged(false)
      toast.success(
        mode === 'everything'
          ? `Deleted ${r.tradesDeleted} trades · balance set to ${fmtMoney(balance, 0)}`
          : `Balance reset to ${fmtMoney(balance, 0)}`
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reset failed')
    } finally {
      setResetting(false)
    }
  }

  // ── Restore ──────────────────────────────────────────────────────────────
  const onBackupFile = async (file: File | null | undefined) => {
    if (!file) return
    const { preview, backup } = inspectBackup(await file.text())
    setRestorePreview(preview)
    setPendingBackup(backup)
    if (!preview.valid) toast.error(preview.error ?? 'Not a valid backup')
  }

  const doRestore = async () => {
    if (!user || !pendingBackup) return
    setRestoring(true)
    try {
      const r = await restoreBackup(user.uid, pendingBackup)
      toast.success(`Restored ${r.trades} trades and ${r.holdings} holdings`)
      setRestorePreview(null)
      setPendingBackup(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Restore failed')
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="space-y-band">

      {/* ══ 1. EXPORT ══════════════════════════════════════════════════════════
          The hero of this page, and deliberately the first thing on it. Every
          other band on the page is safer to reach having been here. */}
      <Section title="Export" meta={`${trades.length} trades · ${holdings.length} holdings`} tier="hero" bodyClass="p-5">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="space-y-3 max-w-xl">
            <p className="text-xs text-ink-200 leading-relaxed">
              <span className="text-ink-50 font-medium">JSON is the complete backup</span> — every
              field on every trade, plus your holdings and profile — and it is what the restore
              below reads. CSV is the trades only, flattened one row per trade for a spreadsheet,
              and cannot be restored from.
            </p>
            <p className="hint">
              Both download straight to your machine. Nothing is uploaded anywhere.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 lg:justify-end">
            <button
              onClick={() => void doExport('json')}
              disabled={exporting !== null}
              className="btn-solid btn-lg"
            >
              {exporting === 'json' ? <><Spinner /> Exporting…</> : 'Download JSON backup'}
            </button>
            <button
              onClick={() => void doExport('csv')}
              disabled={exporting !== null}
              className="btn-ghost btn-lg"
            >
              {exporting === 'csv' ? <><Spinner /> Exporting…</> : 'Download CSV'}
            </button>
          </div>
        </div>

        {exportedAt && (
          <div className="mt-5 pt-4 flex items-center gap-2 animate-rise-sm"
               style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}>
            <Tag tone="up">JSON backup taken</Tag>
            <span className="text-2xs text-ink-300 font-mono">
              {exportedAt.toLocaleTimeString('en-AU')} — the reset below is now unlocked
            </span>
          </div>
        )}
      </Section>

      {/* ══ 2. BRING DATA IN ═════════════════════════════════════════════════════
          Both additive. Neither can lose anything, so they sit together on
          quiet planes with no warning treatment at all. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Import CSV" tier="surface" bodyClass="p-4">
          <div className="space-y-3.5 h-full flex flex-col">
            <p className="text-xs text-ink-300 leading-relaxed flex-1">
              A CMC (or any broker) trade history export. Columns are mapped by hand before
              anything is written, and the report groups failures by reason so a repeated
              reason points straight at the column.
            </p>
            <div>
              <button onClick={onImportCsv} disabled={!onImportCsv} className="btn-ghost">
                Choose CSV file
              </button>
            </div>
          </div>
        </Section>

        <Section title="Restore from backup" tier="surface" bodyClass="p-4">
          <div className="space-y-3.5">
            <p className="text-xs text-ink-300 leading-relaxed">
              Reads a JSON backup from the export above. Always additive — it never deletes
              anything already in the journal. Trades keep their original ids, so restoring
              the same file twice overwrites rather than duplicating.
            </p>

            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              onChange={(e) => void onBackupFile(e.target.files?.[0])}
              className="hidden"
            />
            <button onClick={() => fileRef.current?.click()} className="btn-ghost">
              Choose backup file
            </button>

            {restorePreview && (
              <div className="surface-raised p-3.5 space-y-2.5 animate-rise-sm">
                {!restorePreview.valid ? (
                  <p className="text-xs text-down">{restorePreview.error}</p>
                ) : (
                  <>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Tag tone="up">Valid backup</Tag>
                      {restorePreview.exportedAt && (
                        <span className="text-2xs text-ink-400 font-mono">
                          from {new Date(restorePreview.exportedAt).toLocaleString('en-AU')}
                        </span>
                      )}
                    </div>
                    <div className="text-2xs text-ink-200 font-mono tabular">
                      {restorePreview.tradeCount} trades · {restorePreview.holdingCount} holdings
                      {restorePreview.hasProfile && ' · includes profile'}
                    </div>
                    <p className="hint">
                      Your profile and balance are left alone — only trades and holdings are
                      written back.
                    </p>
                    <button
                      onClick={() => void doRestore()}
                      disabled={restoring}
                      className="btn-primary mt-1"
                    >
                      {restoring ? <><Spinner /> Restoring…</> : `Restore ${restorePreview.tradeCount} trades`}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </Section>
      </div>

      {/* ══ 3. RESET ═══════════════════════════════════════════════════════════
          Separated from everything above by a full band of space and a rule.
          The red is confined to this region and, within it, to the option that
          actually deletes — the balance-only path is not dangerous and is not
          dressed as though it were. */}
      <div>
        <hr className="hairline mb-7" />

        <div className="section-label">
          <h2 className="!text-down/85">Reset</h2>
          <span className="meta">cannot be undone</span>
        </div>

        <div className="max-w-3xl space-y-5">
          {!backedUp && (
            <div className="edge-note-warn text-xs text-ink-200 leading-relaxed py-0.5">
              Nothing here can be undone and there is no second copy. Take the JSON backup
              above first — it takes a second, and it is the only way back. A CSV does not
              count: it cannot be restored from.
            </div>
          )}

          <div className="space-y-2.5">
            <OptionCard
              active={mode === 'balance'}
              title="Reset the balance, keep the trades"
              detail={
                <>
                  Sets the starting and current balance to a new figure. All {trades.length}{' '}
                  trades stay exactly as they are and the equity curve redraws from the new
                  baseline. Nothing is deleted.
                </>
              }
              onSelect={() => { setMode('balance'); setTyped('') }}
            />

            <OptionCard
              active={mode === 'everything'}
              danger
              title="Wipe everything and start again"
              detail={
                <>
                  Permanently deletes all {trades.length} trades
                  {alsoHoldings ? ` and ${holdings.length} ASX holdings` : ''}, then sets the
                  balance to your new starting figure. There is no undo and no recycle bin.
                </>
              }
              onSelect={() => { setMode('everything'); setTyped('') }}
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-5 items-start">
            <Field
              label="New starting balance"
              hint="Both the starting and the current balance are set to this"
            >
              <Input
                mono type="number" step="any"
                value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)}
              />
            </Field>

            {mode === 'everything' && (
              <label className="flex items-start gap-2.5 text-2xs text-ink-200 cursor-pointer sm:pt-[26px] animate-rise-sm">
                <input
                  type="checkbox"
                  checked={alsoHoldings}
                  onChange={(e) => setAlsoHoldings(e.target.checked)}
                  className="accent-down mt-0.5 w-3.5 h-3.5"
                />
                <span className="leading-relaxed">
                  Also delete {holdings.length} ASX holding{holdings.length === 1 ? '' : 's'}
                  <span className="block text-ink-500 mt-1">
                    Off by default — holdings are unrelated to trading performance.
                  </span>
                </span>
              </label>
            )}
          </div>

          {mode === 'everything' && (
            <div className="space-y-4 animate-rise-sm">
              {/* What is actually about to go, counted rather than described. */}
              <div className="surface-raised p-4">
                <div className="sub-label mb-3">About to be deleted</div>
                <div className="space-y-0">
                  {([
                    ['Closed trades', closedCount],
                    ['Open positions', openCount],
                    ...(alsoHoldings ? ([['ASX holdings', holdings.length]] as [string, number][]) : []),
                  ] as [string, number][]).map(([label, n]) => (
                    <div key={label} className="kv">
                      <span className="text-2xs text-ink-300">{label}</span>
                      <span className={`font-mono text-xs tabular ${n > 0 ? 'text-down' : 'text-ink-500'}`}>
                        {n}
                      </span>
                    </div>
                  ))}
                  <div className="kv">
                    <span className="text-2xs text-ink-200">Balance set to</span>
                    <Money>{fmtMoney(num(newBalance) ?? 0, 0)}</Money>
                  </div>
                </div>
                <p className="hint pt-3">
                  Screenshots already uploaded to Cloudinary are not removed — this deletes
                  the journal, not the image host.
                </p>
              </div>

              {!exportedAt && (
                <label className="flex items-start gap-2.5 text-2xs text-ink-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                    className="accent-down mt-0.5 w-3.5 h-3.5"
                  />
                  <span className="leading-relaxed">
                    I already have a backup of these {trades.length} trades somewhere else.
                    <span className="block text-ink-500 mt-1">
                      Tick this only if that is true. Otherwise take the JSON export above.
                    </span>
                  </span>
                </label>
              )}

              <Field
                label={`Type ${confirmWord} to confirm`}
                hint="The number of trades about to be deleted. If it isn't the number you expected, stop."
                className="max-w-[220px]"
              >
                <Input
                  mono
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={confirmWord}
                  className={`text-center tracking-widest ${confirmed ? '!border-down !bg-down-wash' : ''}`}
                />
              </Field>
            </div>
          )}

          {mode === 'balance' && (
            <div className="surface-raised p-4 max-w-md animate-rise-sm">
              <div className="sub-label mb-3">What changes</div>
              <div className="kv">
                <span className="text-2xs text-ink-300">Current balance</span>
                <span className="font-mono text-xs tabular text-ink-400">
                  {fmtMoney(profile?.accountBalance ?? 0, 0)}
                  <span className="text-ink-600 px-1.5">→</span>
                  <span className="text-ink-50">{fmtMoney(num(newBalance) ?? 0, 0)}</span>
                </span>
              </div>
              <div className="kv">
                <span className="text-2xs text-ink-300">Starting balance</span>
                <span className="font-mono text-xs tabular text-ink-400">
                  {fmtMoney(profile?.startingBalance ?? 0, 0)}
                  <span className="text-ink-600 px-1.5">→</span>
                  <span className="text-ink-50">{fmtMoney(num(newBalance) ?? 0, 0)}</span>
                </span>
              </div>
              <div className="kv">
                <span className="text-2xs text-ink-300">Trades kept</span>
                <span className="font-mono text-xs tabular text-up">{trades.length}</span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              onClick={() => void doReset()}
              disabled={resetting || tradesLoading || (mode === 'everything' && !canDestroy)}
              className={mode === 'everything' ? 'btn-danger btn-lg' : 'btn-primary btn-lg'}
            >
              {resetting ? (
                <><Spinner /> Working…</>
              ) : mode === 'everything' ? (
                `Delete ${trades.length} trades and reset`
              ) : (
                'Reset balance'
              )}
            </button>
            {mode === 'everything' && !canDestroy && (
              <span className="text-2xs text-ink-500">
                {tradesLoading
                  ? 'Waiting for the journal to load'
                  : !hasSomethingToDelete
                    ? 'Nothing to delete — use the balance-only option'
                    : !backedUp
                      ? 'Take a JSON backup, or confirm you have one, to enable'
                      : `Type ${confirmWord} above to enable`}
              </span>
            )}
          </div>

          {result && (
            <div className="surface-raised p-4 animate-rise-sm">
              <div className="sub-label mb-3">Done</div>
              <div className="kv">
                <span className="text-2xs text-ink-300">Trades deleted</span>
                <span className="font-mono text-xs text-ink-50 tabular">{result.tradesDeleted}</span>
              </div>
              <div className="kv">
                <span className="text-2xs text-ink-300">Holdings deleted</span>
                <span className="font-mono text-xs text-ink-50 tabular">{result.holdingsDeleted}</span>
              </div>
              <div className="kv">
                <span className="text-2xs text-ink-300">Balance</span>
                <Money>{fmtMoney(result.balanceSetTo, 0)}</Money>
              </div>
              {result.errors.map((e, i) => (
                <p key={i} className="text-2xs text-down pt-2 leading-relaxed">{e}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
