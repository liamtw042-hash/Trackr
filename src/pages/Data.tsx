import { useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from '@/store/AuthContext'
import { useTrades } from '@/store/TradeContext'
import { useHoldings } from '@/store/HoldingsContext'
import { fmtMoney, fmtDate } from '@/lib/calc'
import { SCHEMA_VERSION } from '@/types'
import { PageHeader, Stat, StatRow } from '@/components/ui/Primitives'
import { DataManager } from '@/components/data/DataManager'
import type { ShellContext } from '@/components/layout/Shell'

/**
 * Data lives at the top level rather than buried inside Settings.
 *
 * The previous build put export and reset at the bottom of a six-panel
 * settings page, below migration and maintenance, in a block styled
 * identically to everything above it. That is indistinguishable from not
 * shipping it. Backing up a journal is a routine act, not a preference, so it
 * gets a nav item of its own.
 */
export function Data() {
  const { profile } = useAuth()
  const { trades } = useTrades()
  const { holdings } = useHoldings()
  const { openCsvImport } = useOutletContext<ShellContext>()

  const oldest = useMemo(() => {
    if (!trades.length) return null
    return trades.reduce((min, t) => (t.tradeDate < min ? t.tradeDate : min), trades[0].tradeDate)
  }, [trades])

  const openCount = trades.filter((t) => t.status === 'open').length

  return (
    <div className="space-y-section max-w-[1080px]">
      <PageHeader
        title="Data"
        meta={`schema v${SCHEMA_VERSION}`}
        lede="Everything that reads or rewrites the journal in bulk. Take a backup before anything on this page that deletes — Firestore has no undo and this is the only copy."
      />

      <StatRow cols={4}>
        <Stat
          label="Trades"
          value={trades.length}
          sub={`${trades.length - openCount} closed · ${openCount} open`}
        />
        <Stat label="ASX holdings" value={holdings.length} />
        <Stat
          label="Balance"
          value={fmtMoney(profile?.accountBalance ?? 0, 0)}
          sub={profile?.startingBalance ? `from ${fmtMoney(profile.startingBalance, 0)}` : undefined}
        />
        <Stat
          label="Journal starts"
          value={oldest ? fmtDate(oldest) : '—'}
          sub={oldest ? undefined : 'nothing logged'}
        />
      </StatRow>

      <DataManager onImportCsv={openCsvImport} />
    </div>
  )
}
