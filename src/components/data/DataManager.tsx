import { useCallback, useRef, useState } from 'react'
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
import { Section, Field, Input, Spinner, Tag } from '@/components/ui/Primitives'

// ─────────────────────────────────────────────────────────────────────────────
// Export, reset and restore.
//
// The governing rule: you cannot reach a delete without having been offered the
// download first, and the destructive path needs the count of what it will
// remove typed back before it will run. Firestore has no undo and this is the
// only copy of the journal.
// ─────────────────────────────────────────────────────────────────────────────

type ResetMode = 'balance' | 'everything'

export function DataManager() {
  const { user, profile } = useAuth()
  const { trades } = useTrades()
  const { holdings } = useHoldings()

  const [exporting, setExporting] = useState(false)
  const [exportedAt, setExportedAt] = useState<Date | null>(null)

  const [mode, setMode] = useState<ResetMode>('balance')
  const [newBalance, setNewBalance] = useState(String(profile?.startingBalance ?? 10000))
  const [alsoHoldings, setAlsoHoldings] = useState(false)
  const [typed, setTyped] = useState('')
  const [resetting, setResetting] = useState(false)
  const [result, setResult] = useState<ResetResult | null>(null)

  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null)
  const [pendingBackup, setPendingBackup] = useState<BackupFile | null>(null)
  const [restoring, setRestoring] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const closedCount = trades.filter((t) => t.status === 'closed').length
  const openCount = trades.length - closedCount

  // The word that has to be typed: the trade count, so it can't be muscle
  // memory. If the number on screen isn't the number you expected, that's the
  // point at which you stop.
  const confirmWord = String(trades.length)
  const confirmed = typed.trim() === confirmWord

  // ── Export ────────────────────────────────────────────────────────────────
  const doExport = useCallback(
    async (format: 'json' | 'csv') => {
      if (!user) return
      setExporting(true)
      try {
        const backup = await collectBackup(user.uid, profile)
        if (format === 'json') {
          download(backupFilename('json'), backupToJson(backup), 'application/json')
        } else {
          download(backupFilename('csv'), tradesToCsv(backup.trades), 'text/csv')
        }
        setExportedAt(new Date())
        toast.success(
          format === 'json'
            ? `Exported ${backup.counts.trades} trades and ${backup.counts.holdings} holdings`
            : `Exported ${backup.counts.trades} trades`
        )
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Export failed')
      } finally {
        setExporting(false)
      }
    },
    [user, profile]
  )

  // ── Reset ─────────────────────────────────────────────────────────────────
  const doReset = async () => {
    if (!user) return
    const balance = num(newBalance)
    if (balance === null || balance < 0) {
      toast.error('Enter a valid starting balance')
      return
    }
    if (mode === 'everything' && !confirmed) return

    setResetting(true)
    try {
      const r = await applyReset(user.uid, {
        deleteTrades: mode === 'everything',
        deleteHoldings: mode === 'everything' && alsoHoldings,
        startingBalance: balance,
      })
      setResult(r)
      setTyped('')
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

  // ── Restore ───────────────────────────────────────────────────────────────
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
    <div className="space-y-section">

      {/* ── Export ── */}
      <Section title="Export" meta={`${trades.length} trades · ${holdings.length} holdings`}>
        <div className="space-y-3">
          <p className="text-xs text-ink-300 leading-relaxed max-w-xl">
            JSON is a complete backup — every field, plus holdings and your profile — and
            is what the restore below reads. CSV is the trades only, flattened for a
            spreadsheet, and can't be restored from.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => void doExport('json')} disabled={exporting} className="btn-primary">
              {exporting ? <><Spinner /> Exporting…</> : 'Download JSON backup'}
            </button>
            <button onClick={() => void doExport('csv')} disabled={exporting} className="btn-ghost">
              Download CSV
            </button>
            {exportedAt && (
              <span className="text-2xs text-up font-mono">
                Exported {exportedAt.toLocaleTimeString('en-AU')}
              </span>
            )}
          </div>
        </div>
      </Section>

      {/* ── Reset ── */}
      <Section title="Reset">
        <div className="space-y-4 max-w-2xl">

          {/* Export gate — stated before the options, not after */}
          {!exportedAt && (
            <div className="edge-note text-xs text-ink-200 leading-relaxed">
              Nothing here can be undone. Download a backup first — it takes a second
              and it's the only way back.
            </div>
          )}

          {/* Mode choice, as two described options rather than a bare toggle */}
          <div className="space-y-2">
            {([
              {
                id: 'balance' as const,
                title: 'Balance only',
                detail: `Set the starting and current balance to a new figure. All ${trades.length} trades are kept, and the equity curve redraws from the new baseline.`,
              },
              {
                id: 'everything' as const,
                title: 'Everything',
                detail: `Permanently delete all ${trades.length} trades${
                  alsoHoldings ? ` and ${holdings.length} ASX holdings` : ''
                }, then set the balance. This cannot be undone.`,
              },
            ]).map((opt) => {
              const active = mode === opt.id
              const danger = opt.id === 'everything'
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => { setMode(opt.id); setTyped('') }}
                  className={`w-full text-left px-3.5 py-3 rounded-md transition-colors
                    ${active
                      ? danger ? 'bg-down-wash ring-1 ring-inset ring-down/40'
                               : 'bg-azure-wash ring-1 ring-inset ring-azure/40'
                      : 'bg-ink-900 hover:bg-ink-850'}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        active ? (danger ? 'bg-down' : 'bg-azure') : 'bg-ink-700'
                      }`}
                    />
                    <span className={`text-xs font-medium ${danger && active ? 'text-down' : 'text-ink-50'}`}>
                      {opt.title}
                    </span>
                  </div>
                  <p className="text-2xs text-ink-300 leading-relaxed mt-1.5 ml-4.5 pl-0.5">
                    {opt.detail}
                  </p>
                </button>
              )
            })}
          </div>

          <div className="grid grid-cols-2 gap-4 items-start">
            <Field label="New starting balance" hint="Both starting and current balance are set to this">
              <Input
                mono type="number" step="any"
                value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)}
              />
            </Field>

            {mode === 'everything' && (
              <label className="flex items-start gap-2 text-2xs text-ink-200 cursor-pointer pt-6">
                <input
                  type="checkbox"
                  checked={alsoHoldings}
                  onChange={(e) => setAlsoHoldings(e.target.checked)}
                  className="accent-down mt-0.5"
                />
                <span>
                  Also delete {holdings.length} ASX holding{holdings.length === 1 ? '' : 's'}
                  <span className="block text-ink-500 mt-0.5">
                    Off by default — holdings are unrelated to trading performance.
                  </span>
                </span>
              </label>
            )}
          </div>

          {mode === 'everything' && (
            <div className="space-y-3 pt-1">
              {/* What is actually about to go */}
              <div className="surface rounded-md p-3.5 space-y-1.5">
                <div className="sub-label mb-2">About to be deleted</div>
                {([
                  ['Closed trades', closedCount],
                  ['Open positions', openCount],
                  ...(alsoHoldings ? ([['ASX holdings', holdings.length]] as [string, number][]) : []),
                ] as [string, number][]).map(([label, n]) => (
                  <div key={label} className="flex justify-between text-2xs">
                    <span className="text-ink-300">{label}</span>
                    <span className={`font-mono ${n > 0 ? 'text-down' : 'text-ink-500'}`}>{n}</span>
                  </div>
                ))}
                <div className="flex justify-between text-2xs pt-1.5 border-t border-ink-800">
                  <span className="text-ink-200">Balance set to</span>
                  <span className="font-mono text-ink-50">{fmtMoney(num(newBalance) ?? 0, 0)}</span>
                </div>
                <p className="hint pt-1">
                  Screenshots already uploaded to Cloudinary are not removed — this
                  deletes the journal, not the image host.
                </p>
              </div>

              <Field
                label={`Type ${confirmWord} to confirm`}
                hint="The number of trades about to be deleted. If it isn't the number you expected, stop."
              >
                <Input
                  mono
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={confirmWord}
                  className={confirmed ? '!border-down' : ''}
                />
              </Field>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => void doReset()}
              disabled={resetting || (mode === 'everything' && !confirmed)}
              className={mode === 'everything' ? 'btn-danger' : 'btn-primary'}
            >
              {resetting ? (
                <><Spinner /> Working…</>
              ) : mode === 'everything' ? (
                `Delete ${trades.length} trades and reset`
              ) : (
                'Reset balance'
              )}
            </button>
            {mode === 'everything' && !confirmed && (
              <span className="text-2xs text-ink-500">Type the number above to enable</span>
            )}
          </div>

          {result && (
            <div className="surface rounded-md p-3.5 text-2xs font-mono space-y-1.5">
              <div className="flex justify-between">
                <span className="text-ink-300">Trades deleted</span>
                <span className="text-ink-50">{result.tradesDeleted}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-300">Holdings deleted</span>
                <span className="text-ink-50">{result.holdingsDeleted}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-300">Balance</span>
                <span className="text-ink-50">{fmtMoney(result.balanceSetTo, 0)}</span>
              </div>
              {result.errors.map((e, i) => (
                <p key={i} className="text-down pt-1">{e}</p>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* ── Restore ── */}
      <Section title="Restore from backup">
        <div className="space-y-3 max-w-2xl">
          <p className="text-xs text-ink-300 leading-relaxed">
            Reads a JSON backup produced by the export above. Always additive — it never
            deletes anything already in the journal. Trades keep their original ids, so
            restoring the same file twice overwrites rather than duplicating.
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
            <div className="surface rounded-md p-3.5 space-y-2">
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
                  <div className="text-2xs text-ink-200 font-mono">
                    {restorePreview.tradeCount} trades · {restorePreview.holdingCount} holdings
                    {restorePreview.hasProfile && ' · includes profile'}
                  </div>
                  <p className="hint">
                    Your profile and balance are left alone — only trades and holdings
                    are written back.
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
  )
}
