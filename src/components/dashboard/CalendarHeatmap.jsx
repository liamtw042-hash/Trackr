import { useMemo } from 'react'
import { startOfWeek, addDays, subWeeks, format, isSameMonth } from 'date-fns'

const WEEKS = 15
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function cellColor(pnl) {
  if (pnl == null) return 'bg-white/3'
  if (pnl === 0) return 'bg-white/10'
  if (pnl > 0) {
    if (pnl > 500) return 'bg-win opacity-100'
    if (pnl > 200) return 'bg-win opacity-80'
    if (pnl > 50)  return 'bg-win opacity-50'
    return 'bg-win opacity-30'
  }
  if (pnl < -500) return 'bg-loss opacity-100'
  if (pnl < -200) return 'bg-loss opacity-80'
  if (pnl < -50)  return 'bg-loss opacity-50'
  return 'bg-loss opacity-30'
}

export default function CalendarHeatmap({ trades }) {
  const pnlByDay = useMemo(() => {
    const map = {}
    trades.forEach((t) => {
      if (!t.tradeDate || t.pnl == null) return
      const key = new Date(t.tradeDate).toISOString().slice(0, 10)
      map[key] = (map[key] ?? 0) + t.pnl
    })
    return map
  }, [trades])

  const grid = useMemo(() => {
    const today = new Date()
    const start = startOfWeek(subWeeks(today, WEEKS - 1))
    const weeks = []
    for (let w = 0; w < WEEKS; w++) {
      const weekStart = addDays(start, w * 7)
      const days = []
      for (let d = 0; d < 7; d++) {
        const date = addDays(weekStart, d)
        const key = format(date, 'yyyy-MM-dd')
        const isFuture = date > today
        days.push({ date, key, pnl: isFuture ? undefined : (pnlByDay[key] ?? null), isFuture })
      }
      weeks.push(days)
    }
    return weeks
  }, [pnlByDay])

  // Month labels: find first week each month appears
  const monthLabels = useMemo(() => {
    const labels = []
    let lastMonth = null
    grid.forEach((week, wi) => {
      const month = format(week[0].date, 'MMM')
      if (month !== lastMonth) { labels.push({ wi, month }); lastMonth = month }
    })
    return labels
  }, [grid])

  return (
    <div className="w-full overflow-x-auto no-scrollbar">
      {/* Month labels */}
      <div className="flex mb-1 ml-7">
        {grid.map((_, wi) => {
          const label = monthLabels.find((m) => m.wi === wi)
          return (
            <div key={wi} className="flex-1 text-center">
              {label && <span className="text-[10px] text-white/25">{label.month}</span>}
            </div>
          )
        })}
      </div>

      <div className="flex gap-0.5">
        {/* Day labels */}
        <div className="flex flex-col gap-0.5 mr-1 justify-around">
          {DAYS.map((d, i) => (
            <div key={d} className={`text-[9px] text-white/20 w-6 text-right leading-none ${i % 2 === 0 ? 'opacity-0' : ''}`}>
              {d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        {grid.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-0.5 flex-1">
            {week.map((day) => (
              <div
                key={day.key}
                title={
                  day.isFuture ? ''
                    : day.pnl != null
                    ? `${format(day.date, 'MMM d')}: ${day.pnl >= 0 ? '+' : ''}$${day.pnl.toFixed(2)}`
                    : format(day.date, 'MMM d')
                }
                className={`
                  aspect-square rounded-sm cursor-default transition-opacity duration-150
                  hover:opacity-100 ${day.isFuture ? 'opacity-0' : ''}
                  ${cellColor(day.pnl)}
                `}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-3 justify-end">
        <span className="text-[10px] text-white/20">Less</span>
        {['bg-loss opacity-30', 'bg-loss opacity-70', 'bg-white/10', 'bg-win opacity-30', 'bg-win opacity-70'].map((cls) => (
          <div key={cls} className={`w-3 h-3 rounded-sm ${cls}`} />
        ))}
        <span className="text-[10px] text-white/20">More</span>
      </div>
    </div>
  )
}
