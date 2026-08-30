import { useCallback, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '@/store/AuthContext'
import { useTrades } from '@/store/TradeContext'
import { parseCmcCsv, FIELDS, type FieldKey, type ParseReport } from '@/lib/csv'
import { fmtMoney, fmtDateTime } from '@/lib/calc'
import { Modal, Spinner, Tag, Empty, Select } from '@/components/ui/Primitives'

// ─────────────────────────────────────────────────────────────────────────────
// Bulk import from a CMC Markets CSV export.
//
// Three steps: choose a file → check the mapping and preview → import, then a
// report of what actually happened. Nothing is written until the mapping has
// been seen, because CMC's column names differ between reports and platform
// versions, and a silently mis-mapped column produces plausible wrong trades
// rather than an obvious failure.
// ─────────────────────────────────────────────────────────────────────────────

type Step = 'choose' | 'review' | 'done'

interface ImportReport {
  imported: number
  skippedDuplicate: number
  skippedInvalid: { reason: string; count: number }[]
  closed: number
  open: number
}

export function CsvImport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth()
  const { addTrades, importHashes } = useTrades()

  const [step, setStep] = useState<Step>('choose')
  const [rawText, setRawText] = useState('')
  const [fileName, setFileName] = useState('')
  const [overrides, setOverrides] = useState<Partial<Record<FieldKey, string>>>({})
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [importing, setImporting] = useState(false)
  const [report, setReport] = useState<ImportReport | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const reset = useCallback(() => {
    setStep('choose')
    setRawText('')
    setFileName('')
    setOverrides({})
    setReport(null)
  }, [])

  const close = () => { reset(); onClose() }

  // Re-parsed on every mapping change, so the preview always reflects the
  // mapping actually in force rather than the one detected at load.
  const parsed: ParseReport | null = useMemo(() => {
    if (!rawText) return null
    return parseCmcCsv(rawText, {
      existingHashes: importHashes,
      defaultRiskPercent: profile?.defaultRisk ?? 1,
      accountBalance: profile?.accountBalance ?? 0,
      overrides,
    })
  }, [rawText, overrides, importHashes, profile])

  const handleFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return
    try {
      setFileName(file.name)
      setRawText(await file.text())
      setOverrides({})
      setStep('review')
    } catch {
      toast.error('Could not read that file')
    }
  }, [])

  const willImport = useMemo(
    () => parsed?.rows.filter((r) => r.draft && (!skipDuplicates || !r.duplicate)) ?? [],
    [parsed, skipDuplicates]
  )

  const blocked = (parsed?.unmapped.length ?? 0) > 0

  const doImport = async () => {
    if (!parsed || !willImport.length) return
    setImporting(true)
    try {
      const drafts = willImport.map((r) => r.draft).filter((d): d is NonNullable<typeof d> => !!d)
      const count = await addTrades(drafts)

      // Group failures by reason rather than listing rows. A reason repeated 40
      // times points straight at a mis-mapped column; 40 separate row numbers
      // do not.
      const reasons = new Map<string, number>()
      for (const r of parsed.rows) {
        if (r.draft) continue
        const key = r.errors.length ? r.errors.join(', ') : 'Unreadable row'
        reasons.set(key, (reasons.get(key) ?? 0) + 1)
      }

      setReport({
        imported: count,
        skippedDuplicate: skipDuplicates ? parsed.totals.duplicates : 0,
        skippedInvalid: [...reasons.entries()]
          .map(([reason, count]) => ({ reason, count }))
          .sort((a, b) => b.count - a.count),
        closed: drafts.filter((d) => d.status === 'closed').length,
        open: drafts.filter((d) => d.status === 'open').length,
      })
      setStep('done')
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Import from CMC"
      subtitle={fileName || 'CSV export of your trade history'}
      width="max-w-5xl"
      footer={
        step === 'done' ? (
          <button onClick={close} className="btn-primary">Done</button>
        ) : step === 'review' ? (
          <>
            <span className="text-2xs text-ink-400 mr-auto font-mono">
              {blocked
                ? 'Map the required columns to continue'
                : `${willImport.length} to import · ${parsed?.totals.duplicates ?? 0} duplicate · ${parsed?.totals.failed ?? 0} unreadable`}
            </span>
            <button onClick={reset} className="btn-ghost">Back</button>
            <button
              onClick={() => void doImport()}
              disabled={importing || blocked || !willImport.length}
              className="btn-primary"
            >
              {importing ? <><Spinner /> Importing…</> : `Import ${willImport.length}`}
            </button>
          </>
        ) : (
          <button onClick={close} className="btn-ghost">Cancel</button>
        )
      }
    >
      {/* ── Step 1: choose a file ── */}
      {step === 'choose' && (
        <div className="p-4">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); void handleFile(e.dataTransfer.files?.[0]) }}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter') inputRef.current?.click() }}
            role="button"
            tabIndex={0}
            className="border border-dashed border-ink-700 hover:border-ink-600 rounded-md
                       bg-ink-900/50 hover:bg-ink-900 transition-colors cursor-pointer
                       flex flex-col items-center justify-center py-16 px-4 text-center"
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
            <svg className="w-6 h-6 text-ink-500 mb-3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.25">
              <path d="M4 2.5h8l4 4v11H4z" strokeLinejoin="round" />
              <path d="M12 2.5v4h4" strokeLinejoin="round" />
              <path d="M6.5 11h7M6.5 14h4" strokeLinecap="round" />
            </svg>
            <div className="text-xs text-ink-100 font-medium">Drop your CMC CSV export</div>
            <div className="text-2xs text-ink-400 mt-2 max-w-md leading-relaxed">
              In CMC: History → Order History → export as CSV. Re-importing an
              overlapping date range is safe — anything already in your journal is
              detected and skipped.
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: mapping + preview ── */}
      {step === 'review' && parsed && (
        <div className="p-4 space-y-6">

          <div className="grid grid-cols-4 gap-6">
            {([
              ['Rows', parsed.totals.rows, 'neutral'],
              ['Will import', willImport.length, willImport.length ? 'up' : 'neutral'],
              ['Duplicates', parsed.totals.duplicates, parsed.totals.duplicates ? 'azure' : 'neutral'],
              ['Unreadable', parsed.totals.failed, parsed.totals.failed ? 'down' : 'neutral'],
            ] as const).map(([label, n, tone]) => (
              <div key={label}>
                <div className="text-2xs uppercase tracking-label text-azure-dim mb-1.5">{label}</div>
                <div
                  className={`font-mono text-figure ${
                    tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down'
                    : tone === 'azure' ? 'text-azure-bright' : 'text-ink-50'
                  }`}
                >
                  {n}
                </div>
              </div>
            ))}
          </div>

          {/* Column mapping — editable, because auto-detection does miss */}
          <div>
            <div className="section-label">
              <span className="lbl">Column mapping</span>
              <span className="meta">{parsed.headers.length} columns in file</span>
            </div>

            {blocked && (
              <p className="text-2xs text-down mb-3 leading-relaxed">
                Required field{parsed.unmapped.length === 1 ? '' : 's'} with no column:{' '}
                {parsed.unmapped.map((k) => FIELDS.find((f) => f.key === k)?.label).join(', ')}.
                Pick the right column below, or check you exported the full report.
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
              {FIELDS.map((field) => {
                const current = parsed.mapping[field.key] ?? ''
                const wasDetected = parsed.detected[field.key] === current && current !== ''
                const missing = field.required && !current
                return (
                  <div key={field.key} className="flex items-center gap-3">
                    <span
                      className={`w-24 shrink-0 text-2xs ${missing ? 'text-down' : 'text-ink-200'}`}
                      title={field.hint}
                    >
                      {field.label}
                      {field.required && <span className="text-ink-600 ml-0.5">*</span>}
                    </span>
                    <Select
                      value={current}
                      onChange={(e) => setOverrides((o) => ({ ...o, [field.key]: e.target.value }))}
                      className={`!py-1 !text-2xs flex-1 min-w-0 ${missing ? '!border-down' : ''}`}
                      title={field.hint}
                    >
                      <option value="">— not mapped —</option>
                      {parsed.headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </Select>
                    <span className="w-11 shrink-0 text-2xs text-ink-600">
                      {wasDetected ? 'auto' : current ? 'manual' : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3.5 py-2.5 rounded-md bg-ink-900">
            <label className="flex items-center gap-2 text-2xs text-ink-200 cursor-pointer">
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
                className="accent-azure"
              />
              Skip {parsed.totals.duplicates} already in journal
            </label>
            <span className="text-2xs text-ink-500">
              Matched on pair, direction, open time, entry price and size.
            </span>
          </div>

          <div>
            <div className="section-label">
              <span className="lbl">Preview</span>
              <span className="meta">{parsed.totals.closed} closed · {parsed.totals.open} open</span>
            </div>

            <div className="surface rounded-md overflow-hidden">
              <div className="max-h-[36vh] overflow-auto">
                {parsed.rows.length === 0 ? (
                  <Empty title="No rows" detail="The file parsed but contained no data rows." />
                ) : (
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th className="w-8" />
                        <th>Pair</th>
                        <th>Dir</th>
                        <th>Opened</th>
                        <th className="num">Entry</th>
                        <th className="num">Exit</th>
                        <th className="num">Units</th>
                        <th className="num">Risk</th>
                        <th className="num">P&L</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.rows.slice(0, 300).map((row, i) => {
                        const d = row.draft
                        const excluded = !d || (skipDuplicates && row.duplicate)
                        return (
                          <tr key={i} className={excluded ? 'opacity-40' : ''}>
                            <td className="text-center">
                              {!d ? (
                                <span className="text-down" title={row.errors.join(', ')}>✕</span>
                              ) : row.duplicate ? (
                                <span className="text-azure" title="Already in your journal">≡</span>
                              ) : (
                                <span className="text-up">✓</span>
                              )}
                            </td>
                            <td className="font-mono text-ink-50">{d?.ticker ?? '—'}</td>
                            <td>
                              {d && (
                                <span className={d.direction === 'long' ? 'text-up' : 'text-down'}>
                                  {d.direction === 'long' ? 'L' : 'S'}
                                </span>
                              )}
                            </td>
                            <td className="font-mono text-ink-400">{fmtDateTime(d?.tradeDate)}</td>
                            <td className="num text-ink-200">{d?.entryPrice ?? '—'}</td>
                            <td className="num text-ink-200">{d?.exitPrice ?? '—'}</td>
                            <td className="num text-ink-400">{d?.positionSize?.toLocaleString() ?? '—'}</td>
                            <td className="num text-ink-400">
                              {d?.riskAmount != null ? fmtMoney(d.riskAmount, 0) : '—'}
                            </td>
                            <td className={`num ${(d?.pnl ?? 0) > 0 ? 'text-up' : (d?.pnl ?? 0) < 0 ? 'text-down' : 'text-ink-400'}`}>
                              {d?.pnl != null ? fmtMoney(d.pnl) : '—'}
                            </td>
                            <td>
                              {!d ? (
                                <span className="text-2xs text-down">{row.errors[0]}</span>
                              ) : row.duplicate ? (
                                <Tag tone="azure">Duplicate</Tag>
                              ) : d.status === 'closed' ? (
                                <Tag tone={d.outcome === 'win' ? 'up' : d.outcome === 'loss' ? 'down' : 'neutral'}>
                                  {d.outcome ?? 'closed'}
                                </Tag>
                              ) : (
                                <Tag tone="neutral">Open</Tag>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {parsed.rows.length > 300 && (
              <p className="hint mt-2">
                Showing the first 300 of {parsed.rows.length} rows. All of them import.
              </p>
            )}
            <p className="hint mt-2">
              Risk per trade comes from the stop distance and size where the export has
              both — not from today's balance, which would make every historical
              R-multiple wrong. Rules are left unanswered: the export doesn't contain
              them, and guessing would distort the rule analysis.
            </p>
          </div>
        </div>
      )}

      {/* ── Step 3: report ── */}
      {step === 'done' && report && (
        <div className="p-4 space-y-6">
          <div className="grid grid-cols-3 gap-6">
            <div>
              <div className="text-2xs uppercase tracking-label text-azure-dim mb-1.5">Imported</div>
              <div className="font-mono text-hero text-up">{report.imported}</div>
              <div className="text-2xs text-ink-400 mt-2">
                {report.closed} closed · {report.open} open
              </div>
            </div>
            <div>
              <div className="text-2xs uppercase tracking-label text-azure-dim mb-1.5">Skipped</div>
              <div className="font-mono text-hero text-azure-bright">{report.skippedDuplicate}</div>
              <div className="text-2xs text-ink-400 mt-2">already in journal</div>
            </div>
            <div>
              <div className="text-2xs uppercase tracking-label text-azure-dim mb-1.5">Unreadable</div>
              <div className={`font-mono text-hero ${report.skippedInvalid.length ? 'text-down' : 'text-ink-500'}`}>
                {report.skippedInvalid.reduce((s, x) => s + x.count, 0)}
              </div>
              <div className="text-2xs text-ink-400 mt-2">
                {report.skippedInvalid.length ? 'reasons below' : 'none'}
              </div>
            </div>
          </div>

          {report.skippedInvalid.length > 0 && (
            <div>
              <div className="section-label"><span className="lbl">Why rows were skipped</span></div>
              <div className="surface rounded-md divide-y divide-ink-800">
                {report.skippedInvalid.map((x) => (
                  <div key={x.reason} className="flex justify-between gap-4 px-3.5 py-2.5">
                    <span className="text-2xs text-ink-200">{x.reason}</span>
                    <span className="text-2xs font-mono text-down shrink-0">
                      {x.count} row{x.count === 1 ? '' : 's'}
                    </span>
                  </div>
                ))}
              </div>
              <p className="hint mt-2">
                One reason repeated across many rows usually means a column mapped to the
                wrong header. Import again with the mapping corrected — anything that
                landed the first time is detected as a duplicate.
              </p>
            </div>
          )}

          <p className="text-xs text-ink-300 leading-relaxed edge-note">
            Imported trades have no rules recorded, so until they do they're invisible to
            the rule analysis. The Desk shows how many are outstanding.
          </p>
        </div>
      )}
    </Modal>
  )
}
