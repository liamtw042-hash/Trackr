import { useCallback, useEffect, useRef, useState } from 'react'
import type { Quote } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// ASX quotes, via the /api/quotes serverless function.
//
// In `vite dev` there is no serverless runtime, so the fetch 404s and every
// holding falls back to its cost basis — visibly flagged, never silently shown
// as a live price. Run `vercel dev` to exercise the real path locally.
// ─────────────────────────────────────────────────────────────────────────────

const REFRESH_MS = 5 * 60 * 1000

export interface QuotesState {
  quotes: Record<string, Quote>
  loading: boolean
  error: string | null
  source: string | null
  fetchedAt: string | null
  refresh: () => void
}

export function useQuotes(codes: string[]): QuotesState {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)

  // Join into a primitive so the effect doesn't re-run on every array identity
  // change from the parent's render.
  const key = [...codes].sort().join(',')
  const keyRef = useRef(key)
  keyRef.current = key

  const load = useCallback(async () => {
    const current = keyRef.current
    if (!current) {
      setQuotes({})
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/quotes?codes=${encodeURIComponent(current)}`)
      if (!res.ok) throw new Error(`Quote service returned ${res.status}`)

      const data = await res.json()
      const next: Record<string, Quote> = {}
      for (const q of data.quotes ?? []) next[q.code] = q as Quote

      setQuotes(next)
      setSource(data.source ?? null)
      setFetchedAt(data.fetchedAt ?? null)
    } catch (err) {
      setError(
        err instanceof Error && err.message.includes('404')
          ? 'Quote endpoint not running — deploy to Vercel or use `vercel dev`'
          : err instanceof Error ? err.message : 'Could not load quotes'
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!key) {
      setQuotes({})
      return
    }
    void load()
    const id = setInterval(() => void load(), REFRESH_MS)
    return () => clearInterval(id)
  }, [key, load])

  return { quotes, loading, error, source, fetchedAt, refresh: load }
}
