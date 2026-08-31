import { useMemo, useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Column sorting for the dense tables.
//
// Extracted because the Trades table and the ASX table were about to grow two
// copies of the same three rules, and two copies is how a table ends up sorting
// blanks to the top on one page and the bottom on another.
//
// The rule that matters: a missing value always sinks, whichever way the column
// is pointed. Sorting by P&L descending should put the biggest winner first,
// not eleven open positions that have no P&L yet — a null is "unknown", not
// "zero", and floating it to the top buries the answer you asked for.
// ─────────────────────────────────────────────────────────────────────────────

export type Sortable = number | string | null | undefined

export interface TableSort<K extends string> {
  key: K
  desc: boolean
  /** Same column flips direction; a new column starts descending. */
  toggle: (k: K) => void
  /** Returns a new array. `pick` normally switches on `sort.key`. */
  sortBy: <T>(list: T[], pick: (row: T) => Sortable) => T[]
}

export function useTableSort<K extends string>(
  initial: K,
  initialDesc = true
): TableSort<K> {
  const [key, setKey] = useState<K>(initial)
  const [desc, setDesc] = useState(initialDesc)

  const toggle = (k: K) => {
    if (k === key) setDesc((d) => !d)
    else { setKey(k); setDesc(true) }
  }

  const sortBy = useMemo(
    () =>
      <T,>(list: T[], pick: (row: T) => Sortable): T[] =>
        [...list].sort((a, b) => {
          const av = pick(a)
          const bv = pick(b)

          const aNull = av === null || av === undefined || av === ''
          const bNull = bv === null || bv === undefined || bv === ''
          if (aNull && bNull) return 0
          if (aNull) return 1
          if (bNull) return -1

          const cmp =
            typeof av === 'string' || typeof bv === 'string'
              ? String(av).localeCompare(String(bv))
              : (av as number) - (bv as number)

          return desc ? -cmp : cmp
        }),
    [desc]
  )

  return { key, desc, toggle, sortBy }
}
