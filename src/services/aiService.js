import Anthropic from '@anthropic-ai/sdk'

let _client = null

function getClient() {
  if (!_client) {
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('VITE_ANTHROPIC_API_KEY is not set')
    _client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  }
  return _client
}

/**
 * Compress an image File to a JPEG data URL, max 1024px wide.
 */
async function compressImage(file, maxWidth = 1024) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const ratio = Math.min(1, maxWidth / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * ratio)
      canvas.height = Math.round(img.height * ratio)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = reject
    img.src = url
  })
}

function dataUrlToBase64(dataUrl) {
  return dataUrl.replace(/^data:image\/\w+;base64,/, '')
}

/**
 * Analyse an entry screenshot with Claude vision.
 * Returns extracted trade info + quality rating against the user's strategy.
 */
export async function analyzeTradeScreenshot(imageFile, strategy) {
  const client = getClient()
  const compressed = await compressImage(imageFile)
  const base64 = dataUrlToBase64(compressed)

  const strategySection = strategy?.trim()
    ? `\n\nTrader's strategy:\n${strategy}`
    : '\n\nNo strategy provided — do your best.'

  const prompt = `You are an expert trading analyst and coach. Analyse this chart screenshot.

TASK 1 — Extract visible information (answer only from what you can see):
Return JSON with these fields:
- ticker: string (symbol/pair, or "" if not visible)
- timeframe: string (one of: "1m","5m","15m","1H","4H","Daily","Weekly", or "" if unclear)
- direction: string ("long" or "short" based on the setup you see, or "")
- assetClass: string (one of: "forex","stocks","crypto","commodities","options","other")
- setupType: string (brief name of the pattern/setup visible, e.g. "FVG retest", "Break of structure", "Support bounce")

TASK 2 — Rate this trade against the strategy (1–10):${strategySection}

Return a single JSON object with ALL of these fields:
{
  "ticker": "",
  "timeframe": "",
  "direction": "",
  "assetClass": "",
  "setupType": "",
  "rating": 7,
  "verdict": "Good",
  "verdictDetail": "Good Setup",
  "rulesFeedback": [
    { "rule": "Rule description", "passed": true, "note": "Why passed or failed" }
  ],
  "summary": "2-3 sentence overall assessment"
}

Verdict must be one of: "A+" | "Good" | "Mediocre" | "Don't Take"
Rating 9-10 → A+, 7-8 → Good, 5-6 → Mediocre, 1-4 → Don't Take

Respond with ONLY the JSON object, no markdown, no explanation.`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  })

  const text = message.content[0].text.trim()
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    return JSON.parse(jsonMatch ? jsonMatch[0] : text)
  } catch {
    throw new Error('AI returned unexpected format. Please try again.')
  }
}

/**
 * Generate a morning briefing based on recent trades and patterns.
 */
export async function generateMorningBriefing(trades, strategy, userName) {
  const client = getClient()

  const recent = trades.slice(0, 20)
  const wins = recent.filter((t) => t.outcome === 'win').length
  const losses = recent.filter((t) => t.outcome === 'loss').length
  const totalPnL = recent.reduce((s, t) => s + (t.pnl ?? 0), 0)

  const tradesSummary = recent.slice(0, 10).map((t) =>
    `${t.ticker ?? '?'} ${t.direction ?? ''} ${t.outcome ?? 'open'} $${t.pnl?.toFixed(2) ?? '0'} (${t.setupType ?? 'unknown setup'}, ${new Date(t.tradeDate).toLocaleDateString('en-US', { weekday: 'short' })})`
  ).join('\n')

  const prompt = `You are a professional trading coach giving a morning briefing to ${userName || 'a trader'}.

Recent trades (last ${recent.length}):
${tradesSummary}

Summary: ${wins} wins, ${losses} losses, total P&L: $${totalPnL.toFixed(2)}

Strategy: ${strategy || 'Not provided'}

Write a brief, specific, actionable morning briefing (3-5 sentences max). Be direct and honest. Reference specific patterns you see in their data. Use a coaching tone — encouraging but frank. Do not use generic advice.

Respond with plain text only, no markdown, no bullet points.`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  })

  return message.content[0].text.trim()
}

/**
 * Generate weekly performance summary.
 */
export async function generateWeeklySummary(trades, strategy) {
  const client = getClient()

  const weekTrades = trades.filter((t) => {
    const d = new Date(t.tradeDate)
    const now = new Date()
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)
    return d >= weekAgo
  })

  if (!weekTrades.length) return 'No trades this week to summarise.'

  const wins = weekTrades.filter((t) => t.outcome === 'win').length
  const losses = weekTrades.filter((t) => t.outcome === 'loss').length
  const pnl = weekTrades.reduce((s, t) => s + (t.pnl ?? 0), 0)
  const details = weekTrades.map((t) =>
    `${t.ticker} ${t.direction} ${t.outcome} $${t.pnl?.toFixed(2)} (${t.setupType})`
  ).join('\n')

  const prompt = `Weekly trading summary for a trader:

This week: ${wins}W / ${losses}L, P&L: $${pnl.toFixed(2)}
Trades:
${details}

Strategy: ${strategy || 'Not provided'}

Write a weekly summary with:
1. Overall performance assessment
2. Best performing setup this week
3. Worst pattern or mistake to fix
4. One specific thing to improve next week

Be specific, reference actual trades from the data. 4-6 sentences. Plain text only.`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  })

  return message.content[0].text.trim()
}

/**
 * Detect behavioural patterns in trade history.
 */
export async function detectPatterns(trades, strategy) {
  const client = getClient()

  if (trades.length < 5) return []

  const closed = trades.filter((t) => t.outcome)
  const summary = closed.map((t) => ({
    day: new Date(t.tradeDate).toLocaleDateString('en-US', { weekday: 'short' }),
    hour: new Date(t.tradeDate).getHours(),
    outcome: t.outcome,
    pnl: t.pnl,
    setup: t.setupType,
    emotion: t.emotion,
    direction: t.direction,
  }))

  const prompt = `Analyse this trader's trade history for behavioural patterns:

${JSON.stringify(summary, null, 2)}

Strategy: ${strategy || 'Not provided'}

Find 3-5 specific, data-backed patterns. Each pattern must reference actual numbers from the data.
Examples: "You win 80% on Tuesdays but only 30% on Fridays", "After 2 consecutive losses your next trade has a 25% win rate", "Your FVG setups have a 70% win rate vs 40% for breakouts".

Return JSON array:
[
  { "insight": "Specific finding with numbers", "severity": "warning|info|positive", "action": "What to do about it" }
]

Return ONLY the JSON array.`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  })

  try {
    const text = message.content[0].text.trim()
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    return JSON.parse(jsonMatch ? jsonMatch[0] : text)
  } catch {
    return []
  }
}

/**
 * Fetch a URL and return it as a base64 JPEG string (for Firebase Storage URLs).
 */
async function urlToBase64(url) {
  const res = await fetch(url)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const b64 = reader.result.replace(/^data:image\/\w+;base64,/, '')
      resolve(b64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function isDataUrl(s) { return typeof s === 'string' && s.startsWith('data:') }
function isHttpUrl(s) { return typeof s === 'string' && (s.startsWith('http://') || s.startsWith('https://')) }

async function toBase64(input) {
  if (isDataUrl(input)) return input.replace(/^data:image\/\w+;base64,/, '')
  if (isHttpUrl(input)) return urlToBase64(input)
  throw new Error('Unsupported image input')
}

/**
 * AI Trade Replay: compare entry vs exit screenshot and give execution feedback.
 */
export async function analyzeTradeReplay(entryInput, exitInput, tradeInfo, strategy) {
  const client = getClient()
  const [entryB64, exitB64] = await Promise.all([toBase64(entryInput), toBase64(exitInput)])

  const tradeDesc = [
    tradeInfo.ticker && `Ticker: ${tradeInfo.ticker}`,
    tradeInfo.direction && `Direction: ${tradeInfo.direction}`,
    tradeInfo.outcome && `Outcome: ${tradeInfo.outcome}`,
    tradeInfo.entryPrice && `Entry: ${tradeInfo.entryPrice}`,
    tradeInfo.exitPrice && `Exit: ${tradeInfo.exitPrice}`,
    tradeInfo.pnl != null && `P&L: $${tradeInfo.pnl}`,
    tradeInfo.rMultiple != null && `R: ${tradeInfo.rMultiple}`,
    tradeInfo.setupType && `Setup: ${tradeInfo.setupType}`,
  ].filter(Boolean).join(' | ')

  const prompt = `You are an elite trading coach reviewing a completed trade.

Trade: ${tradeDesc}
Strategy: ${strategy || 'Not provided'}

The FIRST image is the ENTRY chart. The SECOND image is the EXIT chart.

Analyse the full trade execution and return JSON:
{
  "entryQuality": "string — was the entry well-timed? What was good/bad?",
  "exitQuality": "string — did they exit at the right time? Too early/late/perfect?",
  "executionRating": 7,
  "whatWentWell": "string — specific positives",
  "improvements": "string — one or two specific things to do better next time",
  "lessonLearned": "string — the key takeaway from this trade"
}

executionRating is 1–10. Be specific and reference what you see in the charts. Return ONLY the JSON.`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: entryB64 } },
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: exitB64 } },
        { type: 'text', text: prompt },
      ],
    }],
  })

  const text = message.content[0].text.trim()
  try {
    const m = text.match(/\{[\s\S]*\}/)
    return JSON.parse(m ? m[0] : text)
  } catch {
    throw new Error('AI replay returned unexpected format.')
  }
}
