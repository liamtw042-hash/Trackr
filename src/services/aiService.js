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

// ─── Image helpers ────────────────────────────────────────────────────────────

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

async function urlToBase64(url) {
  const res = await fetch(url)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result.replace(/^data:image\/\w+;base64,/, ''))
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

// ─── Static system prompts (cached) ──────────────────────────────────────────

const ANALYSIS_SYSTEM = `You are an expert trading analyst, technical chart reader, and professional trading coach with deep experience across forex, stocks, crypto, commodities, options, futures, and index markets.

Your role is to:
1. Analyse chart screenshots with precision — identifying price action patterns, market structure, key levels, setup quality, and timing
2. Rate every trade objectively against the trader's stated strategy rules
3. Provide honest, specific, data-backed feedback that helps the trader improve

When analysing charts you look for:
- Clear market structure (higher highs/lows, lower highs/lows, consolidation ranges)
- Entry precision — is the entry at a high-probability location (key level, FVG, order block, support/resistance, confluence)?
- Risk definition — is the stop loss logical (below structure, above invalidation point)?
- Reward potential — does the target make sense relative to the next level of structure?
- Setup quality indicators: trend alignment, timeframe confluence, volume confirmation where visible
- Common mistakes: chasing price, poor timing, ignoring market context, overleveraging

When rating against strategy:
- Be strict but fair — only give an A+ when the setup genuinely matches every stated rule
- Call out specific rule violations with clear explanations
- A mediocre rating is honest feedback, not a failure
- Rate 1–4 as "Don't Take", 5–6 as "Mediocre", 7–8 as "Good", 9–10 as "A+"

Always return valid JSON only. Never include markdown, explanation text, or code fences outside the JSON object.`

const BRIEFING_SYSTEM = `You are a professional trading coach delivering personalised morning briefings. You have years of experience coaching retail and professional traders across all asset classes.

Your morning briefings are:
- Specific and data-driven — you reference actual trade data, not generic advice
- Honest but encouraging — you acknowledge strengths and flag risks without being harsh
- Actionable — every briefing ends with something the trader can focus on today
- Concise — maximum 4–5 sentences, no bullet points, plain text only
- Personalised — you address the trader by name and reference their specific patterns

You understand trading psychology deeply: the impact of loss streaks, overconfidence after wins, FOMO, revenge trading, and the importance of process over outcomes. You help traders stay disciplined and objective.

When you see loss streaks, you recommend caution and strategy review.
When you see win streaks, you remind traders to stay disciplined and avoid overconfidence.
When you see inconsistent results, you look for patterns in setups, times, or emotional states.`

const WEEKLY_SYSTEM = `You are a professional trading performance analyst and coach delivering weekly reviews. You have expertise in performance analytics, trading psychology, and systematic improvement.

Your weekly reviews are:
- Comprehensive but concise (4–6 sentences, plain text only)
- Grounded in actual trade data — you reference specific tickers, setups, and outcomes
- Structured around: overall performance, what worked, what didn't, and one specific improvement action
- Forward-looking — every review ends with a concrete focus for next week
- Honest — you don't sugarcoat poor weeks, but you always find a constructive path forward

You understand that a trader's edge comes from consistency and process, not individual outcomes. Even a losing week can show good process; even a winning week can mask poor habits.

Identify the best and worst performing setups. Look for timing patterns (day of week, time of day). Flag emotional trading signals (overtrading after losses, cutting winners short). Recognise when the strategy is being followed vs abandoned.`

const PATTERNS_SYSTEM = `You are a quantitative trading analyst specialising in behavioural pattern detection. You analyse trader performance data to surface statistically meaningful patterns that the trader might not see themselves.

Your pattern analysis is:
- Data-driven — every insight must reference specific numbers from the provided data
- Actionable — each pattern comes with a concrete recommendation
- Categorised by severity: "warning" for harmful patterns, "info" for neutral observations, "positive" for strengths to exploit
- Honest — you report what the data shows, even if unflattering
- Specific — "You win 73% on Monday but only 31% on Friday (n=13/n=16)" is good; "You perform better on some days" is not

Patterns to look for:
- Day of week win rate and P&L distribution
- Time of day performance (by entry hour)
- Setup type win rate and average R comparison
- Direction bias (long vs short performance)
- Emotional state correlation with outcomes (emotion rating vs win rate)
- Behaviour after losing trades (revenge trading, loss aversion)
- Behaviour after winning trades (overconfidence, giving back gains)
- Rule adherence correlation (followedRules=true vs false win rates)
- Trade frequency patterns (too many trades, clustering)

Return ONLY a valid JSON array. No markdown, no explanation outside the array.`

const REPLAY_SYSTEM = `You are an elite trading coach specialising in trade execution analysis. You review completed trades by examining both entry and exit charts side by side, providing detailed feedback on execution quality.

Your replay analysis focuses on:
- Entry timing precision — was the entry taken at the optimal point, or too early/late?
- Exit execution — did the trader exit at the right level, or leave money on the table / cut too early?
- Trade management — did the position sizing and stop placement make sense?
- Execution discipline — did the trader follow their plan, or did they make reactive decisions?
- Key chart events — what happened between entry and exit that the trader should learn from?

You provide:
1. Entry quality assessment — specific feedback on the entry location relative to structure
2. Exit quality assessment — specific feedback on the exit relative to target and price action at close
3. Overall execution rating (1–10) reflecting how well the plan was executed
4. What went well — genuine positives to reinforce
5. What to improve — one or two specific, actionable execution improvements
6. Key lesson — the single most important takeaway from reviewing this trade

Be precise about what you see in each chart. Reference price levels, patterns, and timing where visible. Return ONLY valid JSON, no markdown or explanation outside the object.`

// ─── AI functions ─────────────────────────────────────────────────────────────

/**
 * Analyse an entry screenshot with Claude vision.
 * Returns extracted trade info + quality rating against the user's strategy.
 */
export async function analyzeTradeScreenshot(imageFile, strategy) {
  const client = getClient()
  const compressed = await compressImage(imageFile)
  const base64 = dataUrlToBase64(compressed)

  const userContent = [
    {
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
    },
    {
      type: 'text',
      text: `Trader's strategy:\n${strategy?.trim() || 'No strategy provided — rate the setup on general trading principles.'}

Analyse this chart screenshot and return a single JSON object with ALL of these fields:
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

Field rules:
- ticker: visible symbol/pair, or ""
- timeframe: one of "1m","5m","15m","30m","1H","4H","Daily","Weekly", or ""
- direction: "long" or "short" based on visible setup, or ""
- assetClass: one of "forex","stocks","crypto","commodities","options","futures","indices","other"
- setupType: brief pattern name e.g. "FVG retest", "Break of structure", "Support bounce"
- verdict: exactly one of "A+" | "Good" | "Mediocre" | "Don't Take"
- Rating 9-10 → A+, 7-8 → Good, 5-6 → Mediocre, 1-4 → Don't Take

Respond with ONLY the JSON object.`,
      cache_control: { type: 'ephemeral' },
    },
  ]

  const message = await client.beta.promptCaching.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: ANALYSIS_SYSTEM,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userContent }],
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

  const message = await client.beta.promptCaching.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    system: [
      {
        type: 'text',
        text: BRIEFING_SYSTEM,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Strategy:\n${strategy || 'Not provided'}`,
            cache_control: { type: 'ephemeral' },
          },
          {
            type: 'text',
            text: `Good morning${userName ? `, ${userName}` : ''}. Here is my recent trading data:

Recent trades (last ${recent.length}):
${tradesSummary}

Summary: ${wins} wins, ${losses} losses, total P&L: $${totalPnL.toFixed(2)}

Please give me my morning briefing — 3–5 sentences, plain text, specific to my data.`,
          },
        ],
      },
    ],
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

  const message = await client.beta.promptCaching.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    system: [
      {
        type: 'text',
        text: WEEKLY_SYSTEM,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Strategy:\n${strategy || 'Not provided'}`,
            cache_control: { type: 'ephemeral' },
          },
          {
            type: 'text',
            text: `Weekly trading data:
${wins}W / ${losses}L, P&L: $${pnl.toFixed(2)}
Trades:
${details}

Write my weekly summary covering: overall performance, best setup this week, worst pattern or mistake, and one specific improvement focus for next week. 4–6 sentences, plain text only.`,
          },
        ],
      },
    ],
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
    followedRules: t.followedRules,
  }))

  const message = await client.beta.promptCaching.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: [
      {
        type: 'text',
        text: PATTERNS_SYSTEM,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Strategy:\n${strategy || 'Not provided'}`,
            cache_control: { type: 'ephemeral' },
          },
          {
            type: 'text',
            text: `Trade history (${summary.length} closed trades):
${JSON.stringify(summary, null, 2)}

Find 3–5 specific, data-backed patterns. Return ONLY a JSON array:
[
  { "insight": "Specific finding with numbers", "severity": "warning|info|positive", "action": "What to do about it" }
]`,
          },
        ],
      },
    ],
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

  const message = await client.beta.promptCaching.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    system: [
      {
        type: 'text',
        text: REPLAY_SYSTEM,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Strategy:\n${strategy || 'Not provided'}`,
            cache_control: { type: 'ephemeral' },
          },
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: entryB64 },
          },
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: exitB64 },
          },
          {
            type: 'text',
            text: `Trade: ${tradeDesc}

The FIRST image is the ENTRY chart. The SECOND image is the EXIT chart.

Analyse the full trade execution and return JSON:
{
  "entryQuality": "string",
  "exitQuality": "string",
  "executionRating": 7,
  "whatWentWell": "string",
  "improvements": "string",
  "lessonLearned": "string"
}

Return ONLY the JSON object.`,
          },
        ],
      },
    ],
  })

  const text = message.content[0].text.trim()
  try {
    const m = text.match(/\{[\s\S]*\}/)
    return JSON.parse(m ? m[0] : text)
  } catch {
    throw new Error('AI replay returned unexpected format.')
  }
}

// ─── Setup history lookup system prompt ───────────────────────────────────────

const LOOKUP_SYSTEM = `You are a trading journal analyst specialising in pattern recognition and setup comparison. You help traders identify whether they have encountered similar market setups in the past, so they can learn from their previous experience.

When comparing setups you look for:
- Same or correlated ticker/instrument
- Same setup type or price action pattern (FVG, order block, structure break, support/resistance bounce, breakout retest, etc.)
- Similar market structure at the time of entry (trending, ranging, after a sweep, at a key level)
- Similar timeframe and market context
- Similar entry trigger or confirmation signal

Similarity levels:
- "high" — same instrument, same setup type, same structural context
- "medium" — same setup type on different instrument, or same instrument with slightly different conditions
- "low" — loosely related pattern or instrument correlation

You only flag genuine matches — not superficial ones. If the trade history has no similar trades, say so honestly.

Your key lesson should be specific and actionable, referencing actual trade outcomes from the history. For example: "You've taken FVG retests on GBPUSD 3 times — 2 wins, 1 loss. The loss occurred when you entered before the wick was fully engulfed. All your winners had clean engulfing candles at the FVG."

Return ONLY valid JSON as specified. Never include markdown or explanation outside the JSON object.`

/**
 * Search past trades for setups similar to the one the trader is about to take.
 * Accepts optional screenshot and/or text description.
 * Returns matching trades with stats and a key lesson.
 */
export async function lookupSetupHistory(closedTrades, description, imageFile, strategy) {
  const client = getClient()

  if (!closedTrades.length) return { found: false, keyLesson: 'No closed trades in your journal yet.' }

  // Build a compact, indexed summary of closed trades (max 100)
  const tradeSummary = closedTrades.slice(0, 100).map((t, i) => ({
    i: i + 1,
    date: t.tradeDate ? new Date(t.tradeDate).toISOString().slice(0, 10) : '?',
    ticker: t.ticker ?? '?',
    direction: t.direction ?? '?',
    setup: t.setupType ?? '?',
    outcome: t.outcome,
    pnl: t.pnl ?? null,
    r: t.rMultiple ?? null,
    notes: t.notes ? t.notes.slice(0, 80) : null,
  }))

  const content = []

  if (imageFile) {
    const compressed = await compressImage(imageFile)
    const base64 = dataUrlToBase64(compressed)
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } })
  }

  content.push({
    type: 'text',
    text: `Strategy:\n${strategy || 'Not provided'}`,
    cache_control: { type: 'ephemeral' },
  })

  content.push({
    type: 'text',
    text: `${description ? `Setup description: "${description}"\n\n` : ''}Closed trade history (${tradeSummary.length} trades):
${JSON.stringify(tradeSummary, null, 2)}

Find any past trades that are genuinely similar to the setup ${imageFile ? 'shown in the chart above' : ''}${description ? ` described as "${description}"` : ''}.

Return JSON:
{
  "found": true,
  "matchIndices": [1, 3, 7],
  "analysis": [
    { "i": 1, "similarity": "high|medium|low", "note": "Why this trade matches" }
  ],
  "stats": {
    "winRate": 67,
    "avgR": 1.2,
    "totalMatches": 3
  },
  "keyLesson": "Specific, actionable insight referencing actual outcomes from the matching trades"
}

If no similar trades exist, return: { "found": false, "keyLesson": "No similar setups found in your journal yet." }
Return ONLY valid JSON.`,
  })

  const message = await client.beta.promptCaching.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    system: [{ type: 'text', text: LOOKUP_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
  })

  const text = message.content[0].text.trim()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  const result = JSON.parse(jsonMatch ? jsonMatch[0] : text)

  if (!result.found) return { found: false, keyLesson: result.keyLesson }

  // Hydrate matchIndices back to full trade objects
  const matches = (result.matchIndices ?? [])
    .map((idx) => {
      const summary = tradeSummary[idx - 1]
      const original = closedTrades[idx - 1]
      if (!summary || !original) return null
      const note = result.analysis?.find((a) => a.i === idx)?.note ?? ''
      return {
        id: original.id,
        date: summary.date,
        ticker: summary.ticker,
        setup: summary.setup,
        direction: summary.direction,
        outcome: summary.outcome,
        pnl: summary.pnl,
        rMultiple: summary.r,
        note,
      }
    })
    .filter(Boolean)

  return { found: true, matches, stats: result.stats, keyLesson: result.keyLesson }
}
