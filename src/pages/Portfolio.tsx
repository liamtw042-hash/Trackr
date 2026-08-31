import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useHoldings } from '@/store/HoldingsContext'
import { useQuotes } from '@/hooks/useQuotes'
import { useTableSort } from '@/hooks/useTableSort'
import { fmtMoney, fmtSigned, fmtSignedPct, valueClass, num, round } from '@/lib/calc'
import { asxSession, moveLabel, freshestAsOf } from '@/lib/market'
import type { Holding } from '@/types'
import {
  Section, Stat, StatRow, Empty, Modal, Field, Input, Textarea, Spinner, SortTh,
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

type Col =
  | 'code' | 'name' | 'units' | 'avgCost' | 'price'
  | 'day' | 'value' | 'gain' | 'gainPct'

export function Portfolio() {
  const { holdings, loading } = useHoldings()
  const codes = useMemo(() => holdings.map((h) => h.code), [holdings])
  const { quotes, loading: quotesLoading, error, source, fetchedAt, refresh } = useQuotes(codes)

  const [editing, setEditing] = useState<Holding | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const sort = useTableSort<Col>('value')

  const rows = useMemo(
    () =>
      holdings.map((h) => {
        const q = quotes[h.code]
        const live = q?.price ?? null
        const price = live ?? h.avgCost
        const cost = h.avgCost * h.units
        const value = price * h.units
        const gain = value - cost

        // The day move is only meaningful against a real previous close. A
        // holding priced at cost basis has no move — it has no price.
        const dayPct = live !== null ? q?.changePercent ?? null : null
        const day = live !== null && q?.change != null ? round(q.change * h.units, 2) : null

        return {
          h, q, live, day, dayPct,
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

    // Only holdings that actually reported a move contribute. Treating a
    // missing change as zero would quietly dilute the portfolio's day figure
    // toward nothing every time Yahoo failed to resolve a code.
    const moved = rows.filter((r) => r.day !== null)
    const day = moved.reduce((s, r) => s + (r.day as number), 0)
    // Yesterday's close of the same parcels — the only correct denominator.
    const dayBase = moved.reduce((s, r) => s + (r.value - (r.day as number)), 0)

    const ranked = [...moved].sort((a, b) => (b.dayPct ?? 0) - (a.dayPct ?? 0))

    return {
      cost: round(cost, 2),
      value: round(value, 2),
      gain: round(value - cost, 2),
      gainPct: cost > 0 ? round(((value - cost) / cost) * 100, 2) : 0,
      priced,
      unpriced: rows.length - priced,
      day: moved.length ? round(day, 2) : null,
      dayPct: dayBase > 0 ? round((day / dayBase) * 100, 2) : null,
      dayCovered: moved.length,
      up: moved.filter((r) => (r.dayPct ?? 0) > 0).length,
      down: moved.filter((r) => (r.dayPct ?? 0) < 0).length,
      best: ranked[0] ?? null,
      worst: ranked.length > 1 ? ranked[ranked.length - 1] : null,
    }
  }, [rows])

  // The bar is scaled to the largest holding, not to 100%. Eight holdings in a
  // $9k account all sit between 8% and 19%, so a bar against 100% draws eight
  // near-identical dots and answers nothing. Against the largest, the shape
  // carries the ranking — and the printed figure stays absolute, so the number
  // still means "share of the portfolio".
  const peakValue = useMemo(
    () => Math.max(...rows.map((r) => r.value), 0.01),
    [rows]
  )

  const freshest = useMemo(
    () => freshestAsOf(rows.map((r) => r.q?.asOf)),
    [rows]
  )
  const session = useMemo(() => asxSession(freshest), [freshest])
  const dayLabel = useMemo(() => moveLabel(freshest), [freshest])

  const sorted = useMemo(
    () =>
      sort.sortBy(rows, (r) => {
        switch (sort.key) {
          case 'code': return r.h.code
          case 'name': return r.h.name || r.h.code
          case 'units': return r.h.units
          case 'avgCost': return r.h.avgCost
          case 'price': return r.live
          case 'day': return r.dayPct
          case 'value': return r.value
          case 'gain': return r.gain
          case 'gainPct': return r.gainPct
          default: return r.value
        }
      }),
    [rows, sort]
  )

  const openForm = (h: Holding | null) => { setEditing(h); setFormOpen(true) }
  const Th = (k: Col, label: string, isNum = true) => (
    <SortTh active={sort.key === k} desc={sort.desc} onClick={() => sort.toggle(k)} num={isNum}>
      {label}
    </SortTh>
  )

  if (loading) return <div className="skel h-64" />

  return (
    <div className="space-y-3">

      <StatRow cols={5}>
        <Stat label="Market value" value={fmtMoney(totals.value, 0)} sub={`${holdings.length} holdings`} />
        <Stat label="Cost basis" value={fmtMoney(totals.cost, 0)} />
        <Stat
          label={dayLabel}
          value={totals.day === null ? '—' : fmtSigned(totals.day, 0)}
          sub={
            totals.day === null
              ? 'no live prices'
              : `${fmtSignedPct(totals.dayPct)} · ${totals.up} up, ${totals.down} down`
          }
          tone={totals.day === null ? 'neutral' : totals.day >= 0 ? 'up' : 'down'}
          title={`Movement across the ${totals.dayCovered} holding${
            totals.dayCovered === 1 ? '' : 's'
          } that reported a previous close`}
        />
        <Stat
          label="Unrealised"
          value={fmtSigned(totals.gain, 0)}
          tone={totals.gain >= 0 ? 'up' : 'down'}
        />
        <Stat
          label="Return"
          value={fmtSignedPct(totals.gainPct)}
          tone={totals.gainPct >= 0 ? 'up' : 'down'}
        />
      </StatRow>

      {/* Session strip. A day-change figure is only honest next to the day it
          belongs to — on a Sunday every one of these is Friday's move. */}
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-7 gap-y-2 text-2xs pt-0.5">
          <span className="flex items-center gap-2">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                session.state === 'open' ? 'bg-up'
                  : session.state === 'pre-open' ? 'bg-azure' : 'bg-ink-600'
              }`}
              aria-hidden="true"
            />
            <span className="text-ink-200">
              ASX {session.label.toLowerCase()}{' '}
              <span className="text-ink-500">· figures show {session.describes}</span>
            </span>
          </span>

          {totals.best && (totals.best.dayPct ?? 0) > 0 && (
            <span className="flex items-baseline gap-2">
              <span className="text-3xs uppercase tracking-label text-ink-500">Best</span>
              <span className="font-mono text-ink-100">{totals.best.h.code}</span>
              <span className="font-mono text-up">{fmtSignedPct(totals.best.dayPct)}</span>
            </span>
          )}
          {totals.worst && (totals.worst.dayPct ?? 0) < 0 && (
            <span className="flex items-baseline gap-2">
              <span className="text-3xs uppercase tracking-label text-ink-500">Worst</span>
              <span className="font-mono text-ink-100">{totals.worst.h.code}</span>
              <span className="font-mono text-down">{fmtSignedPct(totals.worst.dayPct)}</span>
            </span>
          )}
        </div>
      )}

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
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  {Th('code', 'Code', false)}
                  {Th('name', 'Name', false)}
                  {Th('units', 'Units')}
                  {Th('avgCost', 'Avg cost')}
                  {Th('price', 'Price')}
                  {Th('day', dayLabel)}
                  {Th('value', 'Value')}
                  {/* Weight is value ÷ total, so sorting by it would order the
                      rows exactly as Value already does. One control, not two
                      that quietly do the same thing. */}
                  <th className="num">Weight</th>
                  {Th('gain', 'Unrealised')}
                  {Th('gainPct', '%')}
                </tr>
              </thead>
              <tbody>
                {sorted.map(({ h, q, live, day, dayPct, value, gain, gainPct }) => {
                  const weight = totals.value > 0 ? (value / totals.value) * 100 : 0
                  return (
                    <tr key={h.id} onClick={() => openForm(h)} className="cursor-pointer">
                      <td className="font-mono text-ink-50 font-medium">{h.code}</td>
                      <td className="text-ink-400 max-w-[12rem] truncate">{h.name || '—'}</td>
                      <td className="num text-ink-200">{h.units.toLocaleString()}</td>
                      <td className="num text-ink-300">{h.avgCost.toFixed(3)}</td>
                      <td className="num">
                        {live !== null ? (
                          <span
                            className="text-ink-50"
                            title={q?.asOf ? `As at ${new Date(q.asOf).toLocaleString('en-AU')}` : undefined}
                          >
                            {live.toFixed(3)}
                            {q?.stale && <span className="text-azure ml-1" title="Delayed or stale">·</span>}
                          </span>
                        ) : (
                          <span className="text-ink-600" title={q?.error ?? 'No live price — showing cost basis'}>
                            no price
                          </span>
                        )}
                      </td>

                      {/* The percentage leads: that is the stock's move. The
                          dollar figure beside it is what the move did to this
                          parcel, which is the part that varies with size. */}
                      <td className="num">
                        {dayPct === null ? (
                          <span className="text-ink-600">—</span>
                        ) : (
                          <span className="inline-flex items-baseline gap-2">
                            <span className={valueClass(dayPct)}>{fmtSignedPct(dayPct)}</span>
                            <span className="text-ink-500">{fmtSigned(day, 0)}</span>
                          </span>
                        )}
                      </td>

                      <td className="num text-ink-100">{fmtMoney(value, 0)}</td>

                      {/* Concentration, the same question the Desk asks of open
                          trades: how much of this rides on one name. */}
                      <td className="num">
                        <span
                          className="inline-flex items-center gap-2.5 justify-end"
                          title={`${weight.toFixed(1)}% of ${fmtMoney(totals.value, 0)}`}
                        >
                          <span
                            className="w-11 h-[3px] rounded-full bg-ink-800/70 overflow-hidden inline-block"
                            aria-hidden="true"
                          >
                            <span
                              className={`block h-full rounded-full ${
                                weight >= 25 ? 'bg-azure-bright/80' : 'bg-azure/55'
                              }`}
                              style={{ width: `${(value / peakValue) * 100}%` }}
                            />
                          </span>
                          <span className={weight >= 25 ? 'text-azure-bright' : 'text-ink-400'}>
                            {weight.toFixed(1)}%
                          </span>
                        </span>
                      </td>

                      <td className={`num ${valueClass(gain)}`}>{fmtSigned(gain, 0)}</td>
                      <td className={`num ${valueClass(gainPct)}`}>{fmtSignedPct(gainPct)}</td>
                    </tr>
                  )
                })}
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
          <p>
            The {dayLabel.toLowerCase()} column is the move against each stock's previous
            close, and the total covers only the {totals.dayCovered} of {rows.length}{' '}
            holding{rows.length === 1 ? '' : 's'} that reported one. Public holidays are
            not modelled, so the open/closed marker falls back to whether any quote is
            actually dated today.
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
