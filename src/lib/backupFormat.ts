import { RULES } from '@/types'
import type { Holding, Trade, UserProfile } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Backup serialisation.
//
// Deliberately free of any Firestore import: these are pure transforms between
// the app's model and the JSON/CSV on disk, so they can be tested and reasoned
// about without a database client, and no module that only needs to format a
// CSV ends up loading the Firebase SDK.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The app was called Trackr before it was called Fills. Backups written under
 * the old name are still valid and must keep restoring — a rename is not a
 * reason to strand a file the user already downloaded. New exports write
 * 'fills-backup'; both are accepted on read, forever.
 */
export type BackupFormatTag = 'fills-backup' | 'trackr-backup'

export const BACKUP_FORMAT: BackupFormatTag = 'fills-backup'
const ACCEPTED_FORMATS: readonly string[] = ['fills-backup', 'trackr-backup']

export interface BackupFile {
  format: BackupFormatTag
  version: 2
  exportedAt: string
  counts: { trades: number; holdings: number }
  profile: UserProfile | null
  trades: Trade[]
  holdings: Holding[]
}

// ─── Serialisation ────────────────────────────────────────────────────────────────

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'string' ? v : String(v)
  // Quote when the value contains a delimiter, a quote or a newline; double any
  // embedded quotes. Without this a trade note with a comma silently shifts
  // every later column in the row.
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const CSV_COLUMNS: { header: string; get: (t: Trade) => unknown }[] = [
  { header: 'id', get: (t) => t.id },
  { header: 'pair', get: (t) => t.ticker },
  { header: 'direction', get: (t) => t.direction },
  { header: 'status', get: (t) => t.status },
  { header: 'outcome', get: (t) => t.outcome },
  { header: 'opened', get: (t) => t.tradeDate },
  { header: 'closed', get: (t) => t.exitDate },
  { header: 'entry', get: (t) => t.entryPrice },
  { header: 'stop', get: (t) => t.stopLoss },
  { header: 'final_stop', get: (t) => t.finalStopLoss },
  { header: 'take_profit', get: (t) => t.takeProfit },
  { header: 'exit', get: (t) => t.exitPrice },
  { header: 'units', get: (t) => t.positionSize },
  { header: 'risk_amount', get: (t) => t.riskAmount },
  { header: 'risk_percent', get: (t) => t.riskPercent },
  { header: 'conversion_rate', get: (t) => t.conversionRate },
  { header: 'pnl', get: (t) => t.pnl },
  { header: 'r_multiple', get: (t) => t.rMultiple },
  { header: 'setup', get: (t) => t.setupType },
  { header: 'timeframe', get: (t) => t.timeframe },
  { header: 'emotion', get: (t) => t.emotion },
  { header: 'mistake', get: (t) => t.mistake },
  // Rules flatten to one column each, as followed / broken / blank — a nested
  // object in a CSV cell would be unreadable in a spreadsheet.
  ...RULES.map((r) => ({
    header: `rule_${r.key}`,
    get: (t: Trade) => (t.rules[r.key] === true ? 'followed' : t.rules[r.key] === false ? 'broken' : ''),
  })),
  { header: 'notes', get: (t) => t.notes },
  { header: 'source', get: (t) => t.source },
  { header: 'entry_chart_url', get: (t) => t.entryScreenshotUrl },
  { header: 'exit_chart_url', get: (t) => t.exitScreenshotUrl },
]

export function tradesToCsv(trades: Trade[]): string {
  const head = CSV_COLUMNS.map((c) => c.header).join(',')
  const rows = trades.map((t) => CSV_COLUMNS.map((c) => csvCell(c.get(t))).join(','))
  return [head, ...rows].join('\r\n')
}

export function backupToJson(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2)
}

/** Trigger a browser download. */
export function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export function backupFilename(ext: 'json' | 'csv'): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `fills-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.${ext}`
}


// ─── Restore validation ───────────────────────────────────────────────────────────

export interface RestorePreview {
  valid: boolean
  error?: string
  exportedAt?: string
  tradeCount: number
  holdingCount: number
  hasProfile: boolean
}

/** Validate a backup file before offering to restore from it. */
export function inspectBackup(text: string): { preview: RestorePreview; backup: BackupFile | null } {
  const invalid = (error: string) => ({
    preview: { valid: false, error, tradeCount: 0, holdingCount: 0, hasProfile: false },
    backup: null,
  })

  try {
    const parsed = JSON.parse(text) as Partial<BackupFile>
    if (!parsed.format || !ACCEPTED_FORMATS.includes(parsed.format)) {
      return invalid('Not a Fills backup file')
    }

    const trades = Array.isArray(parsed.trades) ? parsed.trades : []
    const holdings = Array.isArray(parsed.holdings) ? parsed.holdings : []

    return {
      preview: {
        valid: true,
        exportedAt: parsed.exportedAt,
        tradeCount: trades.length,
        holdingCount: holdings.length,
        hasProfile: Boolean(parsed.profile),
      },
      backup: parsed as BackupFile,
    }
  } catch {
    return invalid('File is not valid JSON')
  }
}
