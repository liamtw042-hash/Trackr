import { useCallback, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '@/store/AuthContext'
import { useTrades } from '@/store/TradeContext'
import { parseCmcCsv, type ParseReport } from '@/lib/csv'
import { fmtMoney, fmtDateTime } from '@/lib/calc'
import { Modal, Spinner, Tag, Empty } from '@/components/ui/Primitives'

// ─────────────────────────────────────────────────────────────────────────────
// Bulk import from a CMC Markets CSV export.
//
// CMC's column names differ between reports and platform versions, so the
// parser matches headers by keyword and this screen shows exactly what it
// mapped. Nothing is written until the mapping has been seen and confirmed.
// ─────────────────────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  ticker: 'Pair', direction: 'Direction', entryPrice: 'Entry price',
  exitPrice: 'Exit price', stopLoss: 'Stop loss', takeProfit: 'Take profit',
  size: 'Units', pnl: 'P&L', openedAt: 'Opened', closedAt: 'Closed',
}

export function CsvImport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth()
  const { addTrades, importHashes } = useTrades()

  const [report, setReport] = useState<ParseReport | null>(null)
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setReport(null)
    setFileName('')
  }

  const handleFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return
      setFileName(file.name)
      try {
        const text = await file.text()
        setReport(
          parseCmcCsv(text, {
            existingHashes: importHashes,
            defaultRiskPercent: profile?.defaultRisk ?? 1,
            accountBalance: profile?.accountBalance ?? 0,
          })
        )
      } catch {
        toast.error('Could not read that file')
      }
    },
    [importHashes, profile]
  )

  const summary = useMemo(() => {
    if (!report) return null
    const valid = report.rows.filter((r) => r.draft !== null)
    const dupes = valid.filter((r) => r.duplicate)
    const failed = report.rows.filter((r) => r.draft === null)
    const willImport = skipDuplicates ? valid.filter((r) => !r.duplicate) : valid
    return { valid, dupes, failed, willImport }
  }, [report, skipDuplicates])

  const doImport = async () => {
    if (!summary?.willImport.length) return
    setImporting(true)
    try {
      const drafts = summary.willImport.map((r) => r.draft!).filter(Boolean)
      const count = await addTrades(drafts)
      toast.success(`Imported ${count} trade${count === 1 ? '' : 's'}`)
      reset()
      onClose()
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
      onClose={() => { reset(); onClose() }}
      title="Import from CMC"
      subtitle={fileName || 'CSV export of your trade history'}
      width="max-w-5xl"
      footer={
        <>
          {summary && (
            <span className="text-2xs text-ink-400 mr-auto font-mono">
              {summary.willImport.length} to import
              {summary.dupes.length > 0 && ` · ${summary.dupes.length} already in journal`}
              {summary.failed.length > 0 && ` · ${summary.failed.length} unreadable`}
            </span>
          )}
          <button onClick={() => { reset(); onClose() }} className="btn-ghost">Cancel</button>
          <button
            onClick={() => void doImport()}
            disabled={importing || !summary?.willImport.length}
            className="btn-primary"
          >
            {importing ? <><Spinner /> Importing…</> : `Import ${summary?.willImport.length ?? 0}`}
          </button>
        </>
      }
    >
      {!report ? (
        <div className="p-3">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); void handleFile(e.dataTransfer.files?.[0]) }}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter') inputRef.current?.click() }}
            role="button"
            tabIndex={0}
            className="border border-dashed border-ink-600 hover:border-ink-500 bg-ink-950
                       hover:bg-ink-900 transition-colors cursor-pointer
                       flex flex-col items-center justify-center py-14 px-4 text-center"
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
            <svg className="w-6 h-6 text-ink-500 mb-3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.25">
              <path d="M4 2.5h8l4 4v11H4z" />
              <path d="M12 2.5v4h4" />
              <path d="M6.5 11h7M6.5 14h4" />
            </svg>
            <div className="text-xs text-ink-100 font-medium">Drop your CMC CSV export</div>
            <div className="text-2xs text-ink-400 mt-1.5 max-w-sm leading-relaxed">
              In CMC: History → Order History → export as CSV. Re-importing an overlapping
              date range is safe — trades already in your journal are detected and skipped.
            </div>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-ink-700">

          {/* Column mapping */}
          <div className="p-3">
            <div className="label">Column mapping</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(FIELD_LABELS).map(([key, label]) => {
                const col = report.mapping[key as keyof typeof report.mapping]
                return (
                  <span
                    key={key}
                    className={`inline-flex items-center gap-1.5 border px-2 py-1 text-2xs
                      ${col ? 'border-ink-600 bg-ink-850' : 'border-ink-700 bg-transparent'}`}
                  >
                    <span className="text-ink-400">{label}</span>
                    <span className={col ? 'font-mono text-ink-100' : 'text-ink-600'}>
                      {col ?? 'not found'}
                    </span>
                  </span>
                )
              })}
            </div>

            {report.unmapped.length > 0 && (
              <p className="text-2xs text-down mt-2 leading-relaxed">
                Missing required columns: {report.unmapped.map((k) => FIELD_LABELS[k]).join(', ')}.
                Rows without these can't be imported — check you exported the full report.
              </p>
            )}

            <details className="mt-2">
              <summary className="text-2xs text-ink-400 hover:text-ink-100 cursor-pointer">
                All {report.headers.length} columns in this file
              </summary>
              <p className="text-2xs text-ink-500 font-mono mt-1.5 leading-relaxed break-words">
                {report.headers.join(' · ')}
              </p>
            </details>
          </div>

          {/* Options */}
          <div className="px-3 py-2 flex items-center gap-4 bg-ink-950/50">
            <label className="flex items-center gap-2 text-2xs text-ink-200 cursor-pointer">
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
                className="accent-brass"
              />
              Skip {summary?.dupes.length ?? 0} already in journal
            </label>
            <span className="text-2xs text-ink-500">
              Matched on pair, direction, open time, entry price and size.
            </span>
          </div>

          {/* Preview */}
          <div className="max-h-[45vh] overflow-auto">
            {report.rows.length === 0 ? (
              <Empty title="No rows found" detail="The file parsed but contained no data rows." />
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
                    <th className="num">P&L</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.slice(0, 300).map((row, i) => {
                    const d = row.draft
                    const excluded = !d || (skipDuplicates && row.duplicate)
                    return (
                      <tr key={i} className={excluded ? 'opacity-40' : ''}>
                        <td className="text-center">
                          {!d ? (
                            <span className="text-down" title={row.errors.join(', ')}>✕</span>
                          ) : row.duplicate ? (
                            <span className="text-brass" title="Already in your journal">≡</span>
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
                        <td className="font-mono text-ink-300">{fmtDateTime(d?.tradeDate)}</td>
                        <td className="num text-ink-200">{d?.entryPrice ?? '—'}</td>
                        <td className="num text-ink-200">{d?.exitPrice ?? '—'}</td>
                        <td className="num text-ink-300">{d?.positionSize?.toLocaleString() ?? '—'}</td>
                        <td className={`num ${(d?.pnl ?? 0) > 0 ? 'text-up' : (d?.pnl ?? 0) < 0 ? 'text-down' : 'text-ink-400'}`}>
                          {d?.pnl !== null && d?.pnl !== undefined ? fmtMoney(d.pnl) : '—'}
                        </td>
                        <td>
                          {!d ? (
                            <span className="text-2xs text-down">{row.errors[0]}</span>
                          ) : row.duplicate ? (
                            <Tag tone="brass">Duplicate</Tag>
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
            {report.rows.length > 300 && (
              <p className="text-2xs text-ink-500 px-2 py-2">
                Showing the first 300 of {report.rows.length} rows. All of them will be imported.
              </p>
            )}
          </div>

          <div className="px-3 py-2">
            <p className="hint">
              Imported trades have no rules recorded — the export doesn't contain them, and
              guessing would distort your rule-adherence numbers. Fill them in per trade when
              you review.
            </p>
          </div>
        </div>
      )}
    </Modal>
  )
}
