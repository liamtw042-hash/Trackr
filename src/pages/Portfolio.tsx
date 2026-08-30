import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useHoldings } from '@/store/HoldingsContext'
import { useQuotes } from '@/hooks/useQuotes'
import { fmtMoney, fmtSigned, fmtPct, valueClass, num, round } from '@/lib/calc'
import type { Holding } from '@/types'
import {
  Section, Stat, StatRow, Empty, Modal, Field, Input, Textarea, Spinner,
} from '@/components/ui/Primitives'

// ─────────────────────────────────────────────────────────────────────────────
// ASX holdings. Deliberately secondary to trading — long-term positions held
// through NAB Trade, which has no API, so they're entered by hand.
// ─────────────────────────────────────────────────────────────────────────────

function HoldingForm({
  holding, open, onClose,
}: {
  holding: Holding | null
  open: boolean
  onClose: () => void
}) {
  const { addHolding, updateHolding, deleteHolding } = useHoldings()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [units, setUnits] = useState('')
  const [avgCost, setAvgCost] = useState('')
  const [openedAt, setOpenedAt] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Reset when the target changes — `key` on the caller forces a remount.
  useState(() => {
    setCode(holding?.code ?? '')
    setName(holding?.name ?? '')
    setUnits(holding ? String(holding.units) : '')
    setAvgCost(holding ? String(holding.avgCost) : '')
    setOpenedAt(holding?.openedAt ?? new Date().toISOString().slice(0, 10))
    setNotes(holding?.notes ?? '')
  })

  const save = async () => {
    const u = num(units)
    const c = num(avgCost)
    if (!code.trim()) { toast.error('ASX code required'); return }
    if (u === null || u <= 0) { toast.error('Units must be a positive number'); return }
    if (c === null || c < 0) { toast.error('Average cost required'); return }

    setBusy(true)
    try {
      const payload = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        units: u,
        avgCost: c,
        openedAt: openedAt || new Date().toISOString().slice(0, 10),
        notes: notes.trim(),
      }
      if (holding) await updateHolding(holding.id, payload)
      else await addHolding(payload)
      toast.success(holding ? 'Holding updated' : 'Holding added')
      onClose()
    } catch {
      toast.error('Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={holding ? `Edit ${holding.code}` : 'Add holding'}
      width="max-w-md"
      footer={
        <>
          {holding && (
            confirmDelete ? (
              <div className="mr-auto flex items-center gap-2">
                <span className="text-2xs text-down">Remove?</span>
                <button
                  onClick={async () => { await deleteHolding(holding.id); toast.success('Removed'); onClose() }}
                  className="btn-danger btn-sm"
                >
                  Remove
                </button>
                <button onClick={() => setConfirmDelete(false)} className="btn-ghost btn-sm">Keep</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="btn-ghost btn-sm mr-auto text-ink-500">
                Remove
              </button>
            )
          )}
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={() => void save()} disabled={busy} className="btn-primary">
            {busy ? <><Spinner /> Saving…</> : 'Save'}
          </button>
        </>
      }
    >
      <div className="p-3 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <Field label="ASX code">
            <Input mono value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CBA" />
          </Field>
          <Field label="Name" className="col-span-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Commonwealth Bank" />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Units">
            <Input mono type="number" step="any" value={units} onChange={(e) => setUnits(e.target.value)} />
          </Field>
          <Field label="Avg cost" hint="Per unit, incl. brokerage">
            <Input mono type="number" step="any" value={avgCost} onChange={(e) => setAvgCost(e.target.value)} />
          </Field>
          <Field label="First bought">
            <Input type="date" value={openedAt} onChange={(e) => setOpenedAt(e.target.value)} />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why you hold this" />
        </Field>
      </div>
    </Modal>
  )
}

export function Portfolio() {
  const { holdings, loading } = useHoldings()
  const codes = useMemo(() => holdings.map((h) => h.code), [holdings])
  const { quotes, loading: quotesLoading, error, source, fetchedAt, refresh } = useQuotes(codes)

  const [editing, setEditing] = useState<Holding | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const rows = useMemo(
    () =>
      holdings.map((h) => {
        const q = quotes[h.code]
        const live = q?.price ?? null
        const price = live ?? h.avgCost
        const cost = h.avgCost * h.units
        const value = price * h.units
        const gain = value - cost
        return {
          h, q, live,
          cost: round(cost, 2),
          value: round(value, 2),
          gain: round(gain, 2),
          gainPct: cost > 0 ? round((gain / cost) * 100, 2) : 0,
        }
      }),
    [holdings, quotes]
  )

  const totals = useMemo(() => {
    const cost = rows.reduce((s, r) => s + r.cost, 0)
    const value = rows.reduce((s, r) => s + r.value, 0)
    const priced = rows.filter((r) => r.live !== null).length
    return {
      cost: round(cost, 2),
      value: round(value, 2),
      gain: round(value - cost, 2),
      gainPct: cost > 0 ? round(((value - cost) / cost) * 100, 2) : 0,
      priced,
      unpriced: rows.length - priced,
    }
  }, [rows])

  const openForm = (h: Holding | null) => { setEditing(h); setFormOpen(true) }

  if (loading) return <div className="skel h-64" />

  return (
    <div className="space-y-3">

      <StatRow cols={4}>
        <Stat label="Market value" value={fmtMoney(totals.value, 0)} sub={`${holdings.length} holdings`} />
        <Stat label="Cost basis" value={fmtMoney(totals.cost, 0)} />
        <Stat
          label="Unrealised"
          value={fmtSigned(totals.gain, 0)}
          tone={totals.gain >= 0 ? 'up' : 'down'}
        />
        <Stat
          label="Return"
          value={`${totals.gainPct >= 0 ? '+' : ''}${totals.gainPct.toFixed(1)}%`}
          tone={totals.gainPct >= 0 ? 'up' : 'down'}
        />
      </StatRow>

      <Section
        title="ASX holdings"
        bodyClass=""
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              disabled={quotesLoading || !codes.length}
              className="btn-ghost btn-sm"
            >
              {quotesLoading ? <><Spinner /> …</> : 'Refresh'}
            </button>
            <button onClick={() => openForm(null)} className="btn-primary btn-sm">Add</button>
          </div>
        }
      >
        {holdings.length === 0 ? (
          <Empty
            title="No holdings"
            detail="NAB Trade has no API, so ASX positions are entered by hand. Prices are then pulled automatically."
            action={<button onClick={() => openForm(null)} className="btn-primary">Add a holding</button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th className="num">Units</th>
                  <th className="num">Avg cost</th>
                  <th className="num">Price</th>
                  <th className="num">Value</th>
                  <th className="num">Unrealised</th>
                  <th className="num">%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ h, q, live, value, gain, gainPct }) => (
                  <tr key={h.id} onClick={() => openForm(h)} className="cursor-pointer">
                    <td className="font-mono text-ink-50 font-medium">{h.code}</td>
                    <td className="text-ink-400 max-w-[12rem] truncate">{h.name || '—'}</td>
                    <td className="num text-ink-200">{h.units.toLocaleString()}</td>
                    <td className="num text-ink-300">{h.avgCost.toFixed(3)}</td>
                    <td className="num">
                      {live !== null ? (
                        <span className="text-ink-50" title={q?.asOf ? `As at ${new Date(q.asOf).toLocaleString('en-AU')}` : undefined}>
                          {live.toFixed(3)}
                          {q?.stale && <span className="text-azure ml-1" title="Delayed or stale">·</span>}
                        </span>
                      ) : (
                        <span className="text-ink-600" title={q?.error ?? 'No live price — showing cost basis'}>
                          no price
                        </span>
                      )}
                    </td>
                    <td className="num text-ink-100">{fmtMoney(value, 0)}</td>
                    <td className={`num ${valueClass(gain)}`}>{fmtSigned(gain, 0)}</td>
                    <td className={`num ${valueClass(gainPct)}`}>{fmtPct(gainPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Price source disclosure — the limits belong on the page, not buried in a README */}
      <Section title="Price data">
        <div className="space-y-1.5 text-2xs text-ink-400 leading-relaxed">
          {error ? (
            <p className="text-down">{error}</p>
          ) : (
            <p>
              <span className="text-ink-200">{source ?? 'Yahoo Finance (unofficial)'}</span>
              {fetchedAt && ` · fetched ${new Date(fetchedAt).toLocaleTimeString('en-AU')}`}
              {totals.unpriced > 0 && ` · ${totals.unpriced} holding${totals.unpriced === 1 ? '' : 's'} without a live price`}
            </p>
          )}
          <p>
            Prices come from Yahoo Finance's undocumented chart endpoint via a serverless
            proxy, because no free ASX API is callable directly from a browser. Roughly
            20 minutes delayed. There is no SLA — it can break or start rate-limiting
            without notice, and some codes (LICs, ETFs, recently renamed tickers) don't
            resolve at all.
          </p>
          <p>
            Where a price is missing the row falls back to cost basis and says
            <span className="text-ink-200"> no price</span> rather than showing a stale
            number as though it were current. Good enough for tracking a long-term
            holding; don't trade off it.
          </p>
        </div>
      </Section>

      {formOpen && (
        <HoldingForm
          key={editing?.id ?? 'new'}
          holding={editing}
          open={formOpen}
          onClose={() => { setFormOpen(false); setEditing(null) }}
        />
      )}
    </div>
  )
}
