// ─────────────────────────────────────────────────────────────────────────────
// ASX quote proxy (Vercel serverless function).
//
// Why a proxy at all: no free ASX price API is usable directly from a browser.
// Yahoo Finance has the data but sends no CORS headers, so a fetch from the
// page is blocked. This function calls Yahoo server-side and returns JSON the
// app can read.
//
// Honest limits, repeated in the UI so they can't be missed:
//   • This is Yahoo's undocumented chart endpoint. It has no SLA and no
//     support, and it can change or start rate-limiting without notice.
//     If quotes stop working, this is the first place to look.
//   • ASX prices on Yahoo are delayed roughly 20 minutes. Fine for tracking a
//     long-term holding; useless for anything time-sensitive.
//   • Some ASX codes — LICs, ETFs, recently renamed tickers — resolve poorly
//     or not at all. Those come back with an error and the app falls back to
//     cost basis rather than showing a wrong number.
//
// Swapping providers means changing only this file: keep the response shape.
// ─────────────────────────────────────────────────────────────────────────────

interface VercelRequest {
  query: Record<string, string | string[] | undefined>
}

interface VercelResponse {
  status: (code: number) => VercelResponse
  json: (body: unknown) => void
  setHeader: (name: string, value: string) => void
}

interface QuoteResult {
  code: string
  price: number | null
  change: number | null
  changePercent: number | null
  currency: string
  asOf: string | null
  stale: boolean
  error?: string
}

const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart'

async function fetchOne(code: string): Promise<QuoteResult> {
  const base: QuoteResult = {
    code, price: null, change: null, changePercent: null,
    currency: 'AUD', asOf: null, stale: true,
  }

  try {
    const res = await fetch(`${YAHOO}/${encodeURIComponent(code)}.AX?interval=1d&range=5d`, {
      headers: {
        // Yahoo returns 429 to requests without a browser-shaped User-Agent.
        'User-Agent': 'Mozilla/5.0 (compatible; Trackr/2.0)',
        Accept: 'application/json',
      },
    })

    if (!res.ok) {
      return { ...base, error: res.status === 404 ? 'Unknown ASX code' : `Yahoo returned ${res.status}` }
    }

    const data = await res.json()
    const result = data?.chart?.result?.[0]
    if (!result) return { ...base, error: 'No data for this code' }

    const meta = result.meta ?? {}
    const price: number | null =
      typeof meta.regularMarketPrice === 'number' ? meta.regularMarketPrice : null
    const previous: number | null =
      typeof meta.chartPreviousClose === 'number' ? meta.chartPreviousClose
      : typeof meta.previousClose === 'number' ? meta.previousClose
      : null

    if (price === null) return { ...base, error: 'No price in response' }

    const change = previous !== null ? price - previous : null
    const asOf = typeof meta.regularMarketTime === 'number'
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : null

    return {
      code,
      price,
      change,
      changePercent: change !== null && previous ? (change / previous) * 100 : null,
      currency: typeof meta.currency === 'string' ? meta.currency : 'AUD',
      asOf,
      // Anything older than 30 minutes is flagged in the UI rather than
      // presented as current.
      stale: asOf === null || Date.now() - new Date(asOf).getTime() > 30 * 60 * 1000,
    }
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : 'Request failed' }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.codes
  const codes = (Array.isArray(raw) ? raw.join(',') : raw ?? '')
    .split(',')
    .map((c) => c.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .filter(Boolean)
    .slice(0, 30)

  if (!codes.length) {
    res.status(400).json({ error: 'Pass ?codes=CBA,BHP' })
    return
  }

  const quotes = await Promise.all(codes.map(fetchOne))

  // Cache at the edge for five minutes. The data is ~20 minutes delayed
  // anyway, so refetching faster only burns Yahoo's rate limit.
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
  res.status(200).json({
    quotes,
    source: 'Yahoo Finance (unofficial), ~20 min delayed',
    fetchedAt: new Date().toISOString(),
  })
}
