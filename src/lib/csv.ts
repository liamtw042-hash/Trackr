import Papa from 'papaparse'
import type { Direction, TradeDraft } from '@/types'
import { emptyRules } from '@/types'
import { outcomeFromPnl, rMultiple, round } from './calc'

// ─────────────────────────────────────────────────────────────────────────────
// CMC Markets CSV import.
//
// CMC's export format is not stable — the column set differs between the
// "Order History" and "Transaction History" reports, and has changed between
// platform versions. So rather than hard-coding column indices, this matches
// headers by keyword and reports exactly what it found, letting you see and
// correct the mapping before anything is written.
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedRow {
  raw: Record<string, string>
  draft: TradeDraft | null
  hash: string
  errors: string[]
  duplicate: boolean
}

export interface ParseReport {
  rows: ParsedRow[]
  headers: string[]
  mapping: Partial<Record<FieldKey, string>>
  unmapped: FieldKey[]
}

type FieldKey =
  | 'ticker' | 'direction' | 'entryPrice' | 'exitPrice' | 'stopLoss'
  | 'takeProfit' | 'size' | 'pnl' | 'openedAt' | 'closedAt'

/**
 * Header keyword patterns, most specific first. CMC uses different wording
 * across reports ("Product" vs "Instrument", "P&L" vs "Profit/Loss"), and
 * generic terms like "Price" must not swallow a more specific column.
 */
const HEADER_PATTERNS: { key: FieldKey; patterns: RegExp[] }[] = [
  { key: 'ticker', patterns: [/^product$/i, /^instrument$/i, /^market$/i, /^symbol$/i, /product name/i] },
  { key: 'direction', patterns: [/^direction$/i, /^side$/i, /^b\/s$/i, /buy.?sell/i, /^type$/i] },
  { key: 'entryPrice', patterns: [/open(ing)?\s*(level|price|rate)/i, /entry\s*(level|price)/i, /^open$/i] },
  { key: 'exitPrice', patterns: [/clos(e|ing)\s*(level|price|rate)/i, /exit\s*(level|price)/i, /^close$/i] },
  { key: 'stopLoss', patterns: [/stop\s*loss/i, /^stop$/i, /\bs\/?l\b/i] },
  { key: 'takeProfit', patterns: [/take\s*profit/i, /^target$/i, /\bt\/?p\b/i] },
  { key: 'size', patterns: [/^units?$/i, /^quantity$/i, /^qty$/i, /^size$/i, /^amount$/i] },
  { key: 'pnl', patterns: [/profit.?(and|&|\/)?.?loss/i, /^p\s*&?\s*l$/i, /realised/i, /realized/i, /\bnet\b.*\bp/i] },
  { key: 'openedAt', patterns: [/open(ed)?\s*(date|time)/i, /date\s*opened/i, /^date$/i, /trade\s*date/i] },
  { key: 'closedAt', patterns: [/clos(e|ed|ing)\s*(date|time)/i, /date\s*closed/i] },
]

function buildMapping(headers: string[]): Partial<Record<FieldKey, string>> {
  const mapping: Partial<Record<FieldKey, string>> = {}
  const claimed = new Set<string>()

  // Two passes so an exact match always beats a loose one — otherwise
  // "Open Date" could be claimed by the entryPrice pattern for "open".
  for (let pass = 0; pass < 2; pass++) {
    for (const { key, patterns } of HEADER_PATTERNS) {
      if (mapping[key]) continue
      const pool = pass === 0 ? patterns.filter((p) => p.source.includes('^')) : patterns
      for (const header of headers) {
        if (claimed.has(header)) continue
        if (pool.some((p) => p.test(header.trim()))) {
          mapping[key] = header
          claimed.add(header)
          break
        }
      }
    }
  }
  return mapping
}

function parseNumber(v: string | undefined): number | null {
  if (!v) return null
  // CMC wraps losses in parentheses and pads with currency symbols/commas.
  const negative = /^\(.*\)$/.test(v.trim())
  const cleaned = v.replace(/[()$,\s]/g, '').replace(/[A-Za-z]/g, '')
  if (!cleaned || cleaned === '-') return null
  const n = parseFloat(cleaned)
  if (!Number.isFinite(n)) return null
  return negative ? -Math.abs(n) : n
}

function parseDate(v: string | undefined): string | null {
  if (!v) return null
  const s = v.trim()

  // CMC exports Australian order: DD/MM/YYYY. Parsing this with `new Date()`
  // gives the American reading and silently produces the wrong month, so the
  // day-first form is matched explicitly first.
  const dmy = s.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  )
  if (dmy) {
    const [, d, m, yRaw, hh = '0', mm = '0', ss = '0'] = dmy
    const y = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw)
    const date = new Date(y, Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss))
    if (!Number.isNaN(date.getTime())) {
      // Local time, offset-free — matches how the rest of the app stores dates.
      const pad = (n: number) => String(n).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
    }
  }

  const iso = new Date(s)
  return Number.isNaN(iso.getTime()) ? null : iso.toISOString().slice(0, 16)
}

function normaliseTicker(v: string | undefined): string {
  if (!v) return ''
  // "GBP/JPY - Cash", "Great Britain Pound vs Japanese Yen" → GBPJPY
  const direct = v.toUpperCase().match(/\b([A-Z]{3})\s*[/-]?\s*([A-Z]{3})\b/)
  if (direct) return `${direct[1]}${direct[2]}`
  return v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6)
}

function parseDirection(v: string | undefined): Direction | null {
  if (!v) return null
  const s = v.trim().toLowerCase()
  if (/^b/.test(s) || s.includes('long')) return 'long'
  if (/^s/.test(s) || s.includes('short')) return 'short'
  return null
}

/**
 * Stable identity for a broker row, so re-importing an overlapping export
 * doesn't duplicate trades. Built from the fields that uniquely pin a fill and
 * never change: pair, direction, open time, entry price, size.
 */
export function rowHash(parts: (string | number | null)[]): string {
  const s = parts.map((p) => (p === null ? '' : String(p))).join('|').toLowerCase()
  // FNV-1a — short, dependency-free, and collision-safe at this scale.
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36).padStart(7, '0')
}

export function parseCmcCsv(
  text: string,
  opts: { existingHashes: Set<string>; defaultRiskPercent: number; accountBalance: number }
): ParseReport {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  })

  const headers = result.meta.fields ?? []
  const mapping = buildMapping(headers)
  const unmapped = (['ticker', 'direction', 'entryPrice', 'openedAt'] as FieldKey[]).filter(
    (k) => !mapping[k]
  )

  const get = (row: Record<string, string>, key: FieldKey): string | undefined => {
    const header = mapping[key]
    return header ? row[header] : undefined
  }

  const seenInFile = new Set<string>()

  const rows: ParsedRow[] = result.data.map((raw) => {
    const errors: string[] = []

    const ticker = normaliseTicker(get(raw, 'ticker'))
    const direction = parseDirection(get(raw, 'direction'))
    const entryPrice = parseNumber(get(raw, 'entryPrice'))
    const exitPrice = parseNumber(get(raw, 'exitPrice'))
    const stopLoss = parseNumber(get(raw, 'stopLoss'))
    const takeProfit = parseNumber(get(raw, 'takeProfit'))
    const size = parseNumber(get(raw, 'size'))
    const pnl = parseNumber(get(raw, 'pnl'))
    const openedAt = parseDate(get(raw, 'openedAt'))
    const closedAt = parseDate(get(raw, 'closedAt'))

    if (!ticker) errors.push('No pair')
    if (!direction) errors.push('No direction')
    if (entryPrice === null) errors.push('No entry price')
    if (!openedAt) errors.push('No open date')

    const hash = rowHash([ticker, direction, openedAt, entryPrice, size])

    // A row can collide with the journal, or with an earlier row in this same
    // file if the export contains repeats.
    const duplicate = opts.existingHashes.has(hash) || seenInFile.has(hash)
    seenInFile.add(hash)

    // Each required value is re-tested by identity rather than relying on
    // `errors.length`, so the narrowing below is something the compiler can
    // actually follow — and so a future error pushed onto the array can't
    // silently start rejecting otherwise-valid rows.
    if (errors.length || !direction || !ticker || !openedAt || entryPrice === null) {
      return { raw, draft: null, hash, errors, duplicate }
    }

    const isClosed = exitPrice !== null || pnl !== null

    // What was actually at risk on THIS trade: stop distance × position size.
    // Deriving it from today's balance instead would date-stamp every
    // historical R-multiple with the current account size, which is wrong for
    // every row and worst for the oldest ones — and R is the primary metric.
    // Fall back to the default-risk estimate only when the export omitted the
    // stop, and mark it so the UI can say the R is approximate.
    const derivedRisk =
      stopLoss !== null && size !== null
        ? round(Math.abs(entryPrice - stopLoss) * Math.abs(size), 2)
        : null
    const riskAmount =
      derivedRisk ??
      (opts.accountBalance
        ? round((opts.accountBalance * opts.defaultRiskPercent) / 100, 2)
        : null)

    // With a P&L the outcome is exact. Without one, a close price still tells
    // us the direction of the result — treating a closed trade as outcome-less
    // would inflate the closed count while contributing nothing to win rate.
    const outcome = isClosed
      ? pnl !== null
        ? outcomeFromPnl(pnl)
        : outcomeFromPnl(
            exitPrice !== null
              ? (direction === 'long' ? exitPrice - entryPrice : entryPrice - exitPrice)
              : null
          )
      : null

    const draft: TradeDraft = {
      ticker,
      direction,
      entryPrice,
      stopLoss,
      finalStopLoss: null,
      takeProfit,
      positionSize: size,
      riskAmount,
      riskPercent:
        derivedRisk !== null && opts.accountBalance
          ? round((derivedRisk / opts.accountBalance) * 100, 2)
          : opts.defaultRiskPercent,

      tradeDate: openedAt,
      exitDate: closedAt,

      status: isClosed ? 'closed' : 'open',
      outcome,
      exitPrice,
      pnl,
      rMultiple: rMultiple(pnl, riskAmount),

      setupType: '',
      timeframe: '4H',
      emotion: null,
      mistake: '',
      notes: '',
      // Rules are deliberately left unanswered — the importer has no way to
      // know them, and guessing would corrupt the adherence analysis.
      rules: emptyRules(),

      entryScreenshotUrl: null,
      exitScreenshotUrl: null,
      ticketScreenshotUrl: null,
      entryChartRead: null,
      exitChartRead: null,
      review: null,

      source: 'csv',
      importHash: hash,
      schemaVersion: 2,
    }

    return { raw, draft, hash, errors, duplicate }
  })

  return { rows, headers, mapping, unmapped }
}
