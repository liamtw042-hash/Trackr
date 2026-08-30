import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useTrades } from '@/store/TradeContext'
import {
  estimatePnl, outcomeFromPnl, rMultiple, num, fmtMoney, fmtR, valueClass,
} from '@/lib/calc'
import { resolveRisk, riskLooksUnconverted } from '@/lib/fx'
import { Spinner } from '@/components/ui/Primitives'
import type { Trade } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Closing a trade without leaving the table.
//
// Closing out is the single most repeated action in this app and it was costing
// a modal, a scroll and six fields to do. The full trade detail is the right
// place to add reasoning, screenshots and rule answers — it is the wrong place
// to type one number.
//
// This is the fast path: exit price in, P&L estimated, Enter. Everything the
// detail view offers is still there for when the trade deserves a write-up.
// ─────────────────────────────────────────────────────────────────────────────

export function QuickClose({
  trade, colSpan, onDone, onOpenFull,
}: {
  trade: Trade
  colSpan: number
  onDone: () => void
  onOpenFull: () => void
}) {
  const { updateTrade } = useTrades()
  const [exitPrice, setExitPrice] = useState('')
  const [pnl, setPnl] = useState('')
  const [saving, setSaving] = useState(false)
  const pnlTouched = useRef(false)
  const firstField = useRef<HTMLInputElement>(null)

  useEffect(() => {
    firstField.current?.focus()
  }, [])

  // The estimate follows the exit price until the moment the user types a P&L
  // of their own, and then never overwrites it. Whatever sits in that box is
  // what moves the account balance, so it must not change under them.
  useEffect(() => {
    if (pnlTouched.current) return
    const est = estimatePnl({
      direction: trade.direction,
      entryPrice: trade.entryPrice,
      exitPrice: num(exitPrice),
      positionSize: trade.positionSize,
    })
    setPnl(est === null ? '' : String(est))
  }, [exitPrice, trade])

  const preview = useMemo(() => {
    const p = num(pnl)
    // Risk is re-resolved against the exit being typed, so a JPY cross shows a
    // real R here rather than the near-zero one an unconverted risk would give.
    const res = resolveRisk({
      ticker: trade.ticker,
      direction: trade.direction,
      entryPrice: trade.entryPrice,
      exitPrice: num(exitPrice),
      positionSize: trade.positionSize,
      pnl: p,
      conversionRate: trade.conversionRate,
      stopLoss: trade.stopLoss,
    })
    // A stored risk is the user's figure until proven otherwise. Closing a
    // trade must not quietly replace a hand-corrected risk with a back-solved
    // one — the resolved amount is only adopted when there is nothing there, or
    // when what is there is still the raw quote-currency product.
    const stale = riskLooksUnconverted({
      storedRisk: trade.riskAmount,
      quoteRisk: res.quoteAmount,
      pnl: p,
    })
    const risk =
      trade.riskAmount === null || stale ? (res.amount ?? trade.riskAmount) : trade.riskAmount

    return { pnl: p, risk, r: rMultiple(p, risk), outcome: outcomeFromPnl(p), converted: stale }
  }, [pnl, exitPrice, trade])

  const save = async () => {
    if (preview.pnl === null) {
      toast.error('Needs an exit price or a P&L')
      return
    }
    setSaving(true)
    try {
      await updateTrade(trade.id, {
        status: 'closed',
        exitPrice: num(exitPrice),
        exitDate: new Date().toISOString(),
        pnl: preview.pnl,
        outcome: preview.outcome,
        riskAmount: preview.risk,
        rMultiple: preview.r,
      })
      toast.success(`${trade.ticker} closed · ${fmtR(preview.r)}`)
      onDone()
    } catch (err) {
      console.error(err)
      toast.error('Could not close the trade')
    } finally {
      setSaving(false)
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); void save() }
    if (e.key === 'Escape') { e.preventDefault(); onDone() }
  }

  return (
    <tr className="!bg-ink-900/60">
      <td colSpan={colSpan} className="!py-2.5">
        <div
          className="flex flex-wrap items-end gap-x-3 gap-y-2 animate-slide-down"
          onKeyDown={onKey}
        >
          <span className="text-2xs uppercase tracking-label text-ink-500 pb-1.5">
            Close {trade.ticker}
          </span>

          <label className="flex flex-col gap-1">
            <span className="text-3xs uppercase tracking-label text-ink-500">Exit</span>
            <input
              ref={firstField}
              className="field !py-1 !text-2xs font-mono w-28"
              type="number" step="any" inputMode="decimal"
              value={exitPrice}
              onChange={(e) => setExitPrice(e.target.value)}
              placeholder={trade.entryPrice?.toString() ?? '0.00'}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-3xs uppercase tracking-label text-ink-500">
              P&amp;L {!pnlTouched.current && pnl !== '' && <span className="text-ink-600">est</span>}
            </span>
            <input
              className="field !py-1 !text-2xs font-mono w-28"
              type="number" step="any" inputMode="decimal"
              value={pnl}
              onChange={(e) => { pnlTouched.current = true; setPnl(e.target.value) }}
              placeholder="0.00"
            />
          </label>

          {preview.pnl !== null && (
            <div className="flex items-baseline gap-3 font-mono text-xs pb-1.5">
              <span className={valueClass(preview.pnl)}>{fmtMoney(preview.pnl)}</span>
              <span className={valueClass(preview.r)}>{fmtR(preview.r)}</span>
              {preview.converted && preview.risk !== null && (
                <span className="text-2xs text-azure-bright" title="The stored risk was in the quote currency">
                  risk &rarr; {fmtMoney(preview.risk)}
                </span>
              )}
            </div>
          )}

          <div className="flex items-center gap-1.5 ml-auto pb-0.5">
            <button onClick={onOpenFull} className="btn-quiet btn-sm">Full detail</button>
            <button onClick={onDone} className="btn-ghost btn-sm">Cancel</button>
            <button onClick={() => void save()} disabled={saving} className="btn-primary btn-sm">
              {saving ? <><Spinner /> Closing…</> : 'Close'}
            </button>
          </div>
        </div>

        <p className="text-3xs text-ink-600 mt-1.5">
          Enter saves, Escape cancels. Rules, notes and screenshots live in the full detail.
        </p>
      </td>
    </tr>
  )
}
