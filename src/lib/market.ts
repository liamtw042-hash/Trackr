// ─────────────────────────────────────────────────────────────────────────────
// The ASX trading session.
//
// A "today's move" column is only honest if the page also says which day it is
// talking about. On a Sunday evening the change on every holding is Friday's
// change, and labelling that "Today" is a small lie that compounds — you glance
// at a green portfolio on Sunday and carry a belief into Monday that the data
// never supported.
//
// Two sources are combined deliberately. The clock says whether the exchange
// *should* be trading; the freshest quote timestamp says whether it actually
// is. Public holidays are not modelled — there is no free ASX holiday feed and
// hardcoding a calendar rots — so the clock alone would call Good Friday an
// open market. The quote timestamp catches exactly that case: no trade today
// means no quote dated today, so the session degrades to closed on its own.
// ─────────────────────────────────────────────────────────────────────────────

export type SessionState = 'open' | 'pre-open' | 'closed'

export interface Session {
  state: SessionState
  /** Short label for a status dot: "Open", "Pre-open", "Closed". */
  label: string
  /** What the current day-change figures actually describe. */
  describes: string
}

const TZ = 'Australia/Sydney'

// Continuous trading. The opening auction runs from 07:00 and the closing
// auction to about 16:12, but between 10:00 and 16:00 is when a price is a
// price rather than an indicative match.
const OPEN = 10 * 60
const CLOSE = 16 * 60
const PRE = 7 * 60

interface Parts {
  weekday: string
  minutes: number
  day: string
}

function sydney(d: Date): Parts {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-AU', {
      timeZone: TZ,
      weekday: 'short',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  ) as Record<string, string>

  return {
    weekday: parts.weekday ?? '',
    // hour12:false yields "24" for midnight in some engines, so normalise.
    minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute),
    day: `${parts.year}-${parts.month}-${parts.day}`,
  }
}

const WEEKEND = new Set(['Sat', 'Sun'])

/** Long weekday name for a date, in the exchange's timezone. */
export function sydneyWeekday(d: Date): string {
  return new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'long' }).format(d)
}

/**
 * @param freshest The newest `asOf` across the loaded quotes, if any. Used only
 * to demote a clock-open session that has no trades behind it.
 */
export function asxSession(freshest?: string | null, now = new Date()): Session {
  const here = sydney(now)
  const quoteDay = freshest ? sydney(new Date(freshest)) : null
  const quoteIsToday = quoteDay !== null && quoteDay.day === here.day

  // What the clock alone would say.
  const trading =
    !WEEKEND.has(here.weekday) && here.minutes >= OPEN && here.minutes < CLOSE
  const preOpen =
    !WEEKEND.has(here.weekday) && here.minutes >= PRE && here.minutes < OPEN

  // The clock can only be optimistic — it does not know about holidays. A
  // quote dated today is the evidence that trading actually happened.
  const state: SessionState =
    trading && quoteIsToday ? 'open' : preOpen ? 'pre-open' : 'closed'

  // "Today's session" is only true while one is running. Once it has ended,
  // the same figures describe today's *close*, and a Sunday quote timestamped
  // this morning describes Friday's — which is why the day name comes from
  // the quote rather than from the calendar.
  const describes =
    quoteDay === null
      ? 'the last session'
      : quoteIsToday
        ? state === 'open' ? "today's session" : "today's close"
        : `${sydneyWeekday(new Date(freshest as string))}'s close`

  return {
    state,
    label: state === 'open' ? 'Open' : state === 'pre-open' ? 'Pre-open' : 'Closed',
    describes,
  }
}

/**
 * How to name a day-change figure: "Today" only when the quote is from the
 * current Sydney trading day, otherwise the day it actually belongs to.
 */
export function moveLabel(freshest: string | null | undefined, now = new Date()): string {
  if (!freshest) return 'Day'
  const d = new Date(freshest)
  if (Number.isNaN(d.getTime())) return 'Day'
  return sydney(d).day === sydney(now).day ? 'Today' : sydneyWeekday(d)
}

/** The newest non-null `asOf` in a set of quotes. */
export function freshestAsOf(asOfs: (string | null | undefined)[]): string | null {
  let best: string | null = null
  let bestMs = -Infinity
  for (const iso of asOfs) {
    if (!iso) continue
    const ms = new Date(iso).getTime()
    if (Number.isNaN(ms) || ms <= bestMs) continue
    bestMs = ms
    best = iso
  }
  return best
}

// ─── Trading sessions ────────────────────────────────────────────────────────────

export type TradingSession = 'Asia' | 'London' | 'New York'

/**
 * Which session a trade was opened in, bucketed by Sydney wall-clock time
 * because that is where the trading happens.
 *
 * Deliberately three coarse buckets a trader recognises rather than 24 hourly
 * ones that never accumulate enough trades to compare. And deliberately not
 * `new Date().getHours()`, which is the *browser's* timezone — the same trade
 * would fall in a different session depending on where the laptop is, which is
 * the kind of bug that silently rewrites an analysis on holiday.
 */
export function sessionOf(iso: string | null | undefined): TradingSession | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null

  const h = Math.floor(sydney(d).minutes / 60)
  if (h >= 8 && h < 16) return 'Asia'
  if (h >= 16) return 'London'
  return 'New York'
}
