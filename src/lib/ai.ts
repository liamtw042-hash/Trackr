import Anthropic from '@anthropic-ai/sdk'
import type {
  ChartRead, RuleKey, RuleState, TicketExtract, Trade, TradeReview, UserProfile,
} from '@/types'
import { RULES, MISTAKE_LABELS } from '@/types'
import { fmtR, fmtMoney } from './calc'

// ─────────────────────────────────────────────────────────────────────────────
// Anthropic integration.
//
// The key is read from VITE_ANTHROPIC_API_KEY and the SDK runs in the browser,
// which means the key is visible to anyone with devtools on this page. That is
// an accepted trade-off for a single-user personal tool with no backend — see
// the note in README. Do not deploy this publicly with a shared key.
// ─────────────────────────────────────────────────────────────────────────────

// Opus 5. Every call here is either a vision task on a chart the trader is
// about to act on, or an analysis they'll make decisions from — the accuracy
// is worth the rate. Swap this one constant to change models everywhere;
// current pricing is at anthropic.com/pricing.
const MODEL = 'claude-opus-5'

let client: Anthropic | null = null

function getClient(): Anthropic {
  if (client) return client
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error(
      'No Anthropic API key. Add VITE_ANTHROPIC_API_KEY to your .env file — get one at console.anthropic.com.'
    )
  }
  client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  return client
}

export function aiConfigured(): boolean {
  return Boolean(import.meta.env.VITE_ANTHROPIC_API_KEY)
}

// ─── Image handling ──────────────────────────────────────────────────────────

type ImageSource =
  | { type: 'base64'; media_type: 'image/jpeg'; data: string }
  | { type: 'url'; url: string }

/**
 * Data URLs are sent inline; https URLs are handed to the API by reference so
 * we never have to fetch a Cloudinary asset from the browser (which CORS blocks).
 */
function imageSource(input: string): ImageSource {
  if (input.startsWith('data:')) {
    return {
      type: 'base64',
      media_type: 'image/jpeg',
      data: input.replace(/^data:image\/\w+;base64,/, ''),
    }
  }
  if (/^https?:\/\//.test(input)) return { type: 'url', url: input }
  throw new Error('Image must be a data URL or an https URL')
}

/** Pull the first JSON object out of a response, tolerating markdown fences. */
function parseJson<T>(text: string, context: string): T {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) {
    throw new Error(`${context}: model did not return JSON`)
  }
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T
  } catch {
    throw new Error(`${context}: could not parse the model's JSON`)
  }
}

async function textFrom(promise: Promise<Anthropic.Message>): Promise<string> {
  const res = await promise
  const block = res.content.find((b) => b.type === 'text')
  if (!block || block.type !== 'text') throw new Error('Empty response from model')
  return block.text
}

// ─── Shared strategy context ─────────────────────────────────────────────────

const STRATEGY_BRIEF = `The trader runs a discretionary support/resistance strategy on forex CFDs:
- Key S/R zones are marked on the DAILY chart. A valid zone has been touched and rejected from roughly 3+ times.
- Entries are taken on the 4H chart when price retests a zone, or breaks it and retests from the other side.
- The trigger is a rejection candle confirming the zone held.
- Stop loss goes just beyond the wick of the candle before the rejection (below for longs, above for shorts).
- There is NO fixed take profit. The stop is trailed instead. Do not treat a missing TP as a mistake.
- Risk is 1% per trade, minimum 2:1 reward-to-risk to justify entry.
- Trades are only taken WITH the daily trend as defined by the 50/200 EMA. Counter-trend trades have historically been the biggest losers.`

function ruleList(): string {
  return RULES.map((r) => `- ${r.key}: "${r.label}" — ${r.detail}`).join('\n')
}

function strategyNote(profile: UserProfile | null): string {
  const extra = profile?.strategy?.trim()
  return extra ? `\n\nThe trader's own notes on their strategy:\n${extra}` : ''
}

// ─── 1. Ticket extraction ────────────────────────────────────────────────────

const TICKET_SYSTEM = `You read screenshots of forex broker trade tickets and position panels — usually CMC Markets — and extract the trade's mechanical details as JSON.

Return ONLY a JSON object:
{
  "ticker": "GBPJPY" | null,
  "direction": "long" | "short" | null,
  "entryPrice": number | null,
  "stopLoss": number | null,
  "takeProfit": number | null,
  "positionSize": number | null,
  "openedAt": "YYYY-MM-DDTHH:mm" | null,
  "confidence": { "ticker": 0-1, "direction": 0-1, "entryPrice": 0-1, "stopLoss": 0-1, "takeProfit": 0-1, "positionSize": 0-1 },
  "warnings": ["..."]
}

Rules:
- Normalise the ticker to six uppercase letters with no separator: "GBP/JPY" and "GBPJPY" both become "GBPJPY".
- CMC labels direction as Buy/Sell. Buy is "long", Sell is "short".
- "Units" or "Quantity" is the position size. Keep it as the broker states it — do not convert to lots.
- If a value is not legible in the image, use null. NEVER guess a price. A null is far more useful than a plausible wrong number, because the trader will confirm each field and a wrong number that looks right will be accepted by mistake.
- Set confidence per field: 1.0 when the number is crisp and unambiguous, 0.5 when you can read it but the label is ambiguous, below 0.3 when you are largely inferring.
- Use warnings for anything the trader should check: cropped values, ambiguous columns, several positions visible in one screenshot, a currency you cannot identify.
- If the screenshot shows MULTIPLE positions, extract the FIRST/topmost one and add a warning saying so.`

export async function extractTicket(imageDataUrl: string): Promise<TicketExtract> {
  const text = await textFrom(
    getClient().messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: TICKET_SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: imageSource(imageDataUrl) },
            { type: 'text', text: 'Extract this trade ticket.' },
          ],
        },
      ],
    })
  )

  const raw = parseJson<Partial<TicketExtract>>(text, 'Ticket extraction')

  const num = (v: unknown): number | null => {
    if (v === null || v === undefined) return null
    const n = typeof v === 'number' ? v : parseFloat(String(v))
    return Number.isFinite(n) ? n : null
  }

  const ticker = typeof raw.ticker === 'string'
    ? raw.ticker.toUpperCase().replace(/[^A-Z]/g, '')
    : null

  return {
    ticker: ticker || null,
    direction: raw.direction === 'long' || raw.direction === 'short' ? raw.direction : null,
    entryPrice: num(raw.entryPrice),
    stopLoss: num(raw.stopLoss),
    takeProfit: num(raw.takeProfit),
    positionSize: num(raw.positionSize),
    openedAt: typeof raw.openedAt === 'string' ? raw.openedAt : null,
    confidence: (raw.confidence ?? {}) as TicketExtract['confidence'],
    warnings: Array.isArray(raw.warnings) ? raw.warnings.filter((w) => typeof w === 'string') : [],
  }
}

// ─── 2. Chart reading ────────────────────────────────────────────────────────

const CHART_SYSTEM = `You read forex chart screenshots and describe what is actually visible. You are giving a SECOND OPINION to an experienced discretionary trader, not a verdict.

${STRATEGY_BRIEF}

The trader ticks these rules for each trade:
${ruleList()}

Return ONLY JSON:
{
  "trend": "one or two sentences on the visible trend direction and structure",
  "priceContext": "where price sits relative to the obvious levels on this chart",
  "entryCandle": "the candle at or near the marked entry — what it looks like",
  "notable": "anything else worth flagging, or empty string",
  "disagreements": [ { "rule": "<one of the rule keys above>", "note": "why the image seems to disagree with what was ticked" } ]
}

Honesty requirements — these matter more than being useful:
- You CANNOT reliably count how many times a zone has been touched from a single screenshot. The chart is windowed; earlier touches are usually off-screen. Never claim a zone has or lacks 3 touches. If asked to judge zoneTouches, say the image does not show enough history.
- You CANNOT verify EMA values unless the EMAs are actually plotted and labelled on the chart. If they are not visible, do not infer trend alignment from price shape alone — say the EMAs are not visible.
- You CANNOT determine exact risk percentage from a chart.
- Only raise a disagreement when the image shows something that CLEARLY contradicts the ticked rule. An absence of evidence is not a disagreement. Return an empty array when nothing clearly conflicts — that is the expected result most of the time.
- Describe what you see. Do not offer trade advice or predictions.`

export async function readChart(
  imageUrl: string,
  opts: { rules: RuleState; direction: string; ticker: string; phase: 'entry' | 'exit'; profile: UserProfile | null }
): Promise<ChartRead> {
  const ticked = RULES.filter((r) => opts.rules[r.key] === true).map((r) => r.key)
  const notTicked = RULES.filter((r) => opts.rules[r.key] === false).map((r) => r.key)

  const context = [
    `Pair: ${opts.ticker || 'unknown'}`,
    `Direction: ${opts.direction}`,
    `This is the ${opts.phase.toUpperCase()} chart.`,
    ticked.length ? `Trader ticked as followed: ${ticked.join(', ')}` : 'Trader ticked no rules as followed.',
    notTicked.length ? `Trader marked as broken: ${notTicked.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const text = await textFrom(
    getClient().messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: CHART_SYSTEM + strategyNote(opts.profile),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: imageSource(imageUrl) },
            { type: 'text', text: `${context}\n\nDescribe what you see on this chart.` },
          ],
        },
      ],
    })
  )

  const raw = parseJson<Partial<ChartRead>>(text, 'Chart read')
  const validKeys = new Set(RULES.map((r) => r.key as string))

  return {
    trend: String(raw.trend ?? ''),
    priceContext: String(raw.priceContext ?? ''),
    entryCandle: String(raw.entryCandle ?? ''),
    notable: String(raw.notable ?? ''),
    disagreements: Array.isArray(raw.disagreements)
      ? raw.disagreements
          .filter((d) => d && validKeys.has(String(d.rule)))
          .map((d) => ({ rule: String(d.rule) as RuleKey, note: String(d.note ?? '') }))
      : [],
    readAt: new Date().toISOString(),
  }
}

// ─── 3. Post-trade review ────────────────────────────────────────────────────

const REVIEW_SYSTEM = `You review a closed forex trade against the trader's own rules. You are direct and specific. You are not encouraging, and you do not soften findings.

${STRATEGY_BRIEF}

The five rules:
${ruleList()}

Return ONLY JSON:
{
  "didWell": ["specific things done correctly, each tied to evidence from the trade"],
  "didBadly": ["specific errors, each tied to evidence"],
  "verdict": "two or three sentences: was this a good trade by process, regardless of whether it made money?"
}

Requirements:
- Judge PROCESS, not outcome. A trade that followed every rule and lost is a good trade. A trade that broke rules and won is a bad trade that got lucky — say so plainly.
- Reference the actual numbers. "Risked 2.4% against a 1% rule" beats "position was too large".
- Do not invent detail you were not given. If the notes are empty, do not speculate about what the trader was thinking.
- If nothing went wrong, didBadly may be empty. If nothing went right, didWell may be empty. Do not pad either list to look balanced.
- No preamble, no encouragement, no "keep it up". Two to four items per list is the useful range.`

export async function reviewTrade(
  trade: Trade,
  profile: UserProfile | null
): Promise<TradeReview> {
  const ruleLines = RULES.map((r) => {
    const v = trade.rules[r.key]
    return `  ${r.label}: ${v === true ? 'followed' : v === false ? 'BROKEN' : 'not answered'}`
  }).join('\n')

  const facts = [
    `Pair: ${trade.ticker}`,
    `Direction: ${trade.direction}`,
    `Entry: ${trade.entryPrice ?? '?'}  Stop: ${trade.stopLoss ?? '?'}  Exit: ${trade.exitPrice ?? '?'}`,
    trade.finalStopLoss !== null ? `Stop was trailed to: ${trade.finalStopLoss}` : '',
    `Outcome: ${trade.outcome ?? '?'}`,
    `P&L: ${fmtMoney(trade.pnl)}   R-multiple: ${fmtR(trade.rMultiple)}`,
    trade.riskPercent !== null ? `Risked: ${trade.riskPercent}% of account` : '',
    `Opened: ${trade.tradeDate}${trade.exitDate ? `   Closed: ${trade.exitDate}` : ''}`,
    trade.setupType ? `Setup: ${trade.setupType}` : '',
    trade.emotion !== null ? `Pre-trade state (1 flat – 5 charged): ${trade.emotion}` : '',
    trade.mistake ? `Self-flagged mistake: ${MISTAKE_LABELS[trade.mistake] ?? trade.mistake}` : '',
    '',
    'Rules as answered by the trader:',
    ruleLines,
    '',
    trade.notes ? `Trader's notes:\n${trade.notes}` : 'No notes were written.',
  ]
    .filter(Boolean)
    .join('\n')

  const content: Anthropic.MessageParam['content'] = []
  if (trade.entryScreenshotUrl) {
    content.push({ type: 'text', text: 'Entry chart:' })
    content.push({ type: 'image', source: imageSource(trade.entryScreenshotUrl) })
  }
  if (trade.exitScreenshotUrl) {
    content.push({ type: 'text', text: 'Exit chart:' })
    content.push({ type: 'image', source: imageSource(trade.exitScreenshotUrl) })
  }
  content.push({ type: 'text', text: `${facts}\n\nReview this trade.` })

  const text = await textFrom(
    getClient().messages.create({
      model: MODEL,
      max_tokens: 1400,
      system: REVIEW_SYSTEM + strategyNote(profile),
      messages: [{ role: 'user', content }],
    })
  )

  const raw = parseJson<Partial<TradeReview>>(text, 'Trade review')
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : []

  return {
    didWell: strings(raw.didWell),
    didBadly: strings(raw.didBadly),
    verdict: String(raw.verdict ?? ''),
    reviewedAt: new Date().toISOString(),
  }
}

// ─── 4. Pattern finding ──────────────────────────────────────────────────────

/** Below this, differences between groups are noise. Enforced in the UI too. */
export const MIN_TRADES_FOR_PATTERNS = 20

export interface PatternReport {
  headline: string
  findings: { title: string; detail: string; confidence: 'strong' | 'tentative' }[]
  notEnoughData: string[]
}

const PATTERN_SYSTEM = `You analyse a trader's closed-trade history and report what genuinely separates their winners from their losers.

${STRATEGY_BRIEF}

Return ONLY JSON:
{
  "headline": "the single most important finding, one sentence",
  "findings": [ { "title": "short label", "detail": "2-3 sentences with the actual numbers", "confidence": "strong" | "tentative" } ],
  "notEnoughData": ["questions the data cannot yet answer, and roughly how many more trades would be needed"]
}

Statistical honesty is the entire job here:
- Mark a finding "strong" only when the split rests on at least 10 trades per side and the gap is large. Everything else is "tentative".
- A pair with 3 trades is not a pattern. Put it in notEnoughData instead of dressing it up as a finding.
- Compare like with like. A higher win rate on a subgroup that is also 4 trades deep is noise.
- Prefer R-multiple over dollar P&L when comparing groups, because position sizes vary.
- Say plainly when rule adherence does NOT correlate with outcome. That is a real and useful finding.
- Never manufacture a finding to fill the list. Three real findings beat eight padded ones. An empty findings array is acceptable if the data genuinely says nothing.`

export async function findPatterns(
  trades: Trade[],
  profile: UserProfile | null
): Promise<PatternReport> {
  const closed = trades.filter((t) => t.status === 'closed')

  const rows = closed.map((t) => {
    const brokenRules = RULES.filter((r) => t.rules[r.key] === false).map((r) => r.key)
    const d = new Date(t.tradeDate)
    return {
      pair: t.ticker,
      dir: t.direction,
      outcome: t.outcome,
      r: t.rMultiple,
      pnl: t.pnl,
      riskPct: t.riskPercent,
      setup: t.setupType || null,
      dow: Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-AU', { weekday: 'short' }),
      hour: Number.isNaN(d.getTime()) ? null : d.getHours(),
      emotion: t.emotion,
      mistake: t.mistake || null,
      rulesBroken: brokenRules,
      rulesAnswered: RULES.filter((r) => t.rules[r.key] !== null).length,
    }
  })

  const text = await textFrom(
    getClient().messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: PATTERN_SYSTEM + strategyNote(profile),
      messages: [
        {
          role: 'user',
          content: `${closed.length} closed trades. Times are Australian local. Analyse.\n\n${JSON.stringify(rows)}`,
        },
      ],
    })
  )

  const raw = parseJson<Partial<PatternReport>>(text, 'Pattern analysis')
  return {
    headline: String(raw.headline ?? ''),
    findings: Array.isArray(raw.findings)
      ? raw.findings.map((f) => ({
          title: String(f.title ?? ''),
          detail: String(f.detail ?? ''),
          confidence: f.confidence === 'strong' ? 'strong' : 'tentative',
        }))
      : [],
    notEnoughData: Array.isArray(raw.notEnoughData)
      ? raw.notEnoughData.filter((x) => typeof x === 'string')
      : [],
  }
}

// ─── 5. Ask the journal ──────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const ASK_SYSTEM = `You answer questions about a trader's own journal, using only the trade data provided.

${STRATEGY_BRIEF}

How to answer:
- Lead with the number, then the caveat. "You're 4-2 on AUD pairs — but six trades is too few to read anything into."
- Always state the sample size behind any statistic you quote.
- When the data cannot answer the question, say so directly and say what would be needed. Do not approximate an answer from too little data.
- Use R-multiples when comparing across trades of different sizes.
- Be concise. Two or three short paragraphs at most. No bullet lists unless comparing three or more items.
- No encouragement, no hedging padding, no restating the question back.`

export async function askJournal(
  messages: ChatMessage[],
  trades: Trade[],
  profile: UserProfile | null
): Promise<string> {
  const closed = trades.filter((t) => t.status === 'closed')

  const rows = closed.map((t) => ({
    date: t.tradeDate.slice(0, 16),
    pair: t.ticker,
    dir: t.direction,
    outcome: t.outcome,
    r: t.rMultiple,
    pnl: t.pnl,
    setup: t.setupType || null,
    emotion: t.emotion,
    mistake: t.mistake || null,
    rulesBroken: RULES.filter((r) => t.rules[r.key] === false).map((r) => r.key),
    notes: t.notes ? t.notes.slice(0, 220) : null,
  }))

  const openCount = trades.length - closed.length

  return textFrom(
    getClient().messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: [
        { type: 'text', text: ASK_SYSTEM + strategyNote(profile) },
        {
          // The journal is stable across a conversation, so cache it rather
          // than re-sending it at full cost on every follow-up question.
          type: 'text',
          text: `Closed trades (${closed.length}), plus ${openCount} still open:\n${JSON.stringify(rows)}`,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    })
  )
}
