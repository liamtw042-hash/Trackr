/**
 * Merge imported historical stats into live computed stats so that
 * Dashboard and Analytics reflect the full trading history.
 */
export function mergeImportedStats(liveStats, importedStats) {
  if (!importedStats) return liveStats

  const total = liveStats.total + (importedStats.total ?? 0)
  const wins = liveStats.wins + (importedStats.wins ?? 0)
  const losses = liveStats.losses + (importedStats.losses ?? 0)
  const closed = liveStats.closed + (importedStats.total ?? 0)
  const totalPnL = liveStats.totalPnL + (importedStats.totalPnL ?? 0)
  const winRate = closed > 0 ? (wins / closed) * 100 : 0

  return {
    ...liveStats,
    total,
    wins,
    losses,
    closed,
    totalPnL,
    winRate,
  }
}
