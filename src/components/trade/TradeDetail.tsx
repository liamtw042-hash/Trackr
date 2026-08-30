import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '@/store/AuthContext'
import { useTrades } from '@/store/TradeContext'
import { readChart, reviewTrade, aiConfigured } from '@/lib/ai'
import { uploadImage } from '@/lib/images'
import {
  estimatePnl, outcomeFromPnl, rMultiple, num, fmtMoney, fmtR, fmtDateTime,
  fmtPrice, valueClass, stopDistance, riskPercentFor, round,
} from '@/lib/calc'
import { RULES, MISTAKE_LABELS, EMOTIONS, type ChartRead, type RuleState, type Trade } from '@/types'
import {
  Modal, Field, Input, Select, Textarea, Segmented, Spinner, Tag,
} from '@/components/ui/Primitives'
import { ImageDrop } from '@/components/ui/ImageDrop'
import { RulesChecklist } from './RulesChecklist'
import { MISTAKES } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Trade detail: the place a trade gets its context added after the fact.
//
// Logging captures the numbers in seconds; this is where the reasoning, the
// charts, and the rules get filled in later — and where a still-open position
// gets closed out.
// ─────────────────────────────────────────────────────────────────────────────

function localFromIso(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

/**
 * Risk in dollars, editable.
 *
 * It used to be derived and fixed: stop distance x position size. That is only
 * the AUD risk when the pair is quoted in AUD (EUR/AUD, GBP/AUD). On any other
 * cross the product is in the quote currency, so a JPY pair comes out about
 * 112x too big and its R-multiple lands near zero. R is the primary metric in
 * this app, so a wrong risk quietly corrupts expectancy, the rule comparisons
 * and the R distribution all at once.
 *
 * Rather than guess an FX rate the app does not have, the figure is editable
 * and the derived one is offered as a starting point.
 */
function RiskField({
  value, onChange, quoteRisk, suspect, ticker, balance,
}: {
  value: string
  onChange: (v: string) => void
  quoteRisk: number | null
  suspect: boolean
  ticker: string
  balance: number | null
}) {
  const v = num(value)
  const pct = balance ? riskPercentFor(balance, v) : null
  const quote = ticker.includes('/') ? ticker.split('/')[1] : null

  return (
    <div>
      <Field
        label="Risk $"
        hint={
          <>
            What one R is worth. Everything R-based is measured against it.
            {pct !== null && (
              <> Currently <span className="font-mono text-azure-bright">{pct}%</span> of balance.</>
            )}
          </>
        }
      >
        <Input
          mono type="number" step="any"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0.00"
          className={suspect ? '!border-down' : ''}
        />
      </Field>

      {suspect && (
        <div className="edge-note-warn text-2xs text-ink-200 leading-relaxed mt-2 py-0.5 animate-rise-sm">
          This looks like the raw stop distance times units, which for{' '}
          <span className="font-mono">{ticker}</span> is in{' '}
          <span className="font-mono">{quote ?? 'the quote currency'}</span>, not AUD. Convert it
          before trusting the R.
        </div>
      )}

      {quoteRisk !== null && v !== null && Math.abs(v - quoteRisk) > 0.01 && (
        <button
          type="button"
          onClick={() => onChange(String(quoteRisk))}
          className="btn-quiet btn-sm mt-1.5"
        >
          Reset to stop x units ({quoteRisk.toLocaleString()})
        </button>
      )}
    </div>
  )
}

function ChartReadPanel({ read, phase }: { read: ChartRead; phase: string }) {
  return (
    <div className="surface divide-y divide-ink-800">
      <div className="px-2.5 py-1.5 bg-ink-850/60 flex items-center justify-between">
        <span className="text-2xs uppercase tracking-label text-ink-400">{phase} chart — AI read</span>
        <span className="text-2xs text-ink-500 font-mono">{fmtDateTime(read.readAt)}</span>
      </div>

      {([
        ['Trend', read.trend],
        ['Price context', read.priceContext],
        ['Entry candle', read.entryCandle],
        ['Notable', read.notable],
      ] as const)
        .filter(([, v]) => v)
        .map(([label, v]) => (
          <div key={label} className="px-2.5 py-2">
            <div className="text-2xs uppercase tracking-label text-ink-500 mb-0.5">{label}</div>
            <p className="text-xs text-ink-100 leading-relaxed">{v}</p>
          </div>
        ))}

      {read.disagreements.length > 0 && (
        <div className="px-2.5 py-2 bg-azure-wash">
          <div className="text-2xs uppercase tracking-label text-azure-bright mb-1">
            Disagrees with your rules
          </div>
          {read.disagreements.map((d, i) => (
            <p key={i} className="text-xs text-ink-100 leading-relaxed">
              <span className="text-azure-bright">
                {RULES.find((r) => r.key === d.rule)?.label ?? d.rule}:
              </span>{' '}
              {d.note}
            </p>
          ))}
        </div>
      )}

      <p className="px-2.5 py-2 text-2xs text-ink-500 leading-relaxed">
        A second opinion from an image, not a verdict. It can't count zone touches
        from a windowed chart or read EMAs that aren't plotted — where it says it
        can't tell, it genuinely can't.
      </p>
    </div>
  )
}

export function TradeDetail({ trade, onClose }: { trade: Trade | null; onClose: () => void }) {
  const { user, profile } = useAuth()
  const { updateTrade, deleteTrade } = useTrades()

  const [rules, setRules] = useState<RuleState>(() => trade?.rules ?? ({} as RuleState))
  const [notes, setNotes] = useState('')
  const [setupType, setSetupType] = useState('')
  const [mistake, setMistake] = useState('')
  const [emotion, setEmotion] = useState('3')
  const [status, setStatus] = useState<'open' | 'closed'>('open')
  const [exitPrice, setExitPrice] = useState('')
  const [exitDate, setExitDate] = useState('')
  const [pnl, setPnl] = useState('')
  const [finalStop, setFinalStop] = useState('')
  const [risk, setRisk] = useState('')
  const [entryImage, setEntryImage] = useState<string | null>(null)
  const [exitImage, setExitImage] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [reading, setReading] = useState<'entry' | 'exit' | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Surface the price-derived estimate in the P&L field itself rather than
  // leaving it as a placeholder. Whatever ends up here is what moves the
  // account balance, and for a cross pair the estimate can be materially off
  // (it can't know the AUD conversion at close) — so it has to be a number the
  // trader has actually seen and can overwrite with the broker's figure, never
  // one that gets banked silently because the field looked empty.
  const pnlTouched = useRef(false)

  // Reload local state whenever a different trade is opened.
  useEffect(() => {
    if (!trade) return
    setRules(trade.rules)
    setNotes(trade.notes)
    setSetupType(trade.setupType)
    setMistake(trade.mistake)
    setEmotion(trade.emotion !== null ? String(trade.emotion) : '3')
    setStatus(trade.status)
    setExitPrice(trade.exitPrice !== null ? String(trade.exitPrice) : '')
    setExitDate(localFromIso(trade.exitDate))
    setPnl(trade.pnl !== null ? String(trade.pnl) : '')
    setFinalStop(trade.finalStopLoss !== null ? String(trade.finalStopLoss) : '')
    setRisk(trade.riskAmount !== null ? String(trade.riskAmount) : '')
    setEntryImage(null)
    setExitImage(null)
    setConfirmDelete(false)
    // A stored P&L is the trader's own figure — don't let the estimator
    // overwrite it when the trade is reopened.
    pnlTouched.current = trade.pnl !== null
  }, [trade?.id])

  useEffect(() => {
    if (!trade || status !== 'closed' || pnlTouched.current) return
    const est = estimatePnl({
      direction: trade.direction,
      entryPrice: trade.entryPrice,
      exitPrice: num(exitPrice),
      positionSize: trade.positionSize,
    })
    if (est !== null) setPnl(String(est))
  }, [trade, status, exitPrice])

  const derived = useMemo(() => {
    if (!trade) return null
    const typed = num(pnl)
    const estimated = estimatePnl({
      direction: trade.direction,
      entryPrice: trade.entryPrice,
      exitPrice: num(exitPrice),
      positionSize: trade.positionSize,
    })
    const finalPnl = typed ?? estimated
    const editedRisk = num(risk)

    // What the app would derive from the stop, for comparison. This is stop
    // distance x units in the QUOTE currency, which is only the AUD risk when
    // the pair is quoted in AUD. On a JPY cross it is out by the JPY/AUD rate,
    // roughly 112x, which is why the figure has to be editable at all.
    const quoteRisk =
      trade.stopLoss !== null && trade.entryPrice !== null && trade.positionSize !== null
        ? round(Math.abs(trade.entryPrice - trade.stopLoss) * Math.abs(trade.positionSize), 2)
        : null

    return {
      estimated,
      pnl: finalPnl,
      risk: editedRisk,
      quoteRisk,
      // A cross pair gives itself away: the derived figure is a different order
      // of magnitude from the money that actually moved.
      suspect:
        quoteRisk !== null && editedRisk !== null &&
        Math.abs(editedRisk - quoteRisk) < 0.01 &&
        finalPnl !== null && Math.abs(finalPnl) > 0 &&
        (quoteRisk / Math.abs(finalPnl) > 5 || Math.abs(finalPnl) / quoteRisk > 5),
      r: rMultiple(finalPnl, editedRisk),
      outcome: outcomeFromPnl(finalPnl),
      oneR: stopDistance({
        direction: trade.direction,
        entryPrice: trade.entryPrice,
        stopLoss: trade.stopLoss,
      }),
    }
  }, [trade, pnl, exitPrice, risk])

  const save = useCallback(async () => {
    if (!trade || !user) return
    setSaving(true)
    try {
      const [entryUrl, exitUrl] = await Promise.all([
        entryImage ? uploadImage(user.uid, 'entry', entryImage) : Promise.resolve(null),
        exitImage ? uploadImage(user.uid, 'exit', exitImage) : Promise.resolve(null),
      ])
      const uploadFailed = (entryImage && !entryUrl) || (exitImage && !exitUrl)

      const isClosed = status === 'closed'
      const finalPnl = isClosed ? (derived?.pnl ?? null) : null

      await updateTrade(trade.id, {
        rules,
        notes: notes.trim(),
        setupType: setupType.trim(),
        mistake,
        emotion: num(emotion),
        status,
        outcome: isClosed ? outcomeFromPnl(finalPnl) : null,
        exitPrice: isClosed ? num(exitPrice) : null,
        exitDate: isClosed ? (exitDate || new Date().toISOString()) : null,
        pnl: finalPnl,
        riskAmount: num(risk),
        // Keep the percentage in step with an edited dollar risk, otherwise the
        // AI context and the backup export keep quoting the old one.
        ...(num(risk) !== null && profile?.accountBalance
          ? { riskPercent: riskPercentFor(profile.accountBalance, num(risk)) }
          : {}),
        rMultiple: isClosed ? rMultiple(finalPnl, num(risk)) : null,
        finalStopLoss: num(finalStop),
        ...(entryUrl ? { entryScreenshotUrl: entryUrl } : {}),
        ...(exitUrl ? { exitScreenshotUrl: exitUrl } : {}),
      })

      // A dropped screenshot must be reported — silently saying "Saved" while
      // discarding the image is how a chart goes missing without anyone noticing.
      toast.success(uploadFailed ? 'Saved — a screenshot failed to upload' : 'Saved')
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('Could not save')
    } finally {
      setSaving(false)
    }
  }, [
    trade, user, profile, rules, notes, setupType, mistake, emotion, status, exitPrice,
    exitDate, finalStop, risk, derived, entryImage, exitImage, updateTrade, onClose,
  ])

  const runChartRead = async (phase: 'entry' | 'exit') => {
    if (!trade) return
    const url = phase === 'entry'
      ? (entryImage ?? trade.entryScreenshotUrl)
      : (exitImage ?? trade.exitScreenshotUrl)
    if (!url) {
      toast.error(`Add an ${phase} chart first`)
      return
    }

    setReading(phase)
    try {
      const read = await readChart(url, {
        rules, direction: trade.direction, ticker: trade.ticker, phase, profile,
      })
      await updateTrade(trade.id, phase === 'entry' ? { entryChartRead: read } : { exitChartRead: read })
      toast.success(
        read.disagreements.length
          ? `Read complete — ${read.disagreements.length} disagreement${read.disagreements.length === 1 ? '' : 's'}`
          : 'Read complete — nothing contradicts your rules'
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Chart read failed')
    } finally {
      setReading(null)
    }
  }

  const runReview = async () => {
    if (!trade) return
    if (trade.status !== 'closed') {
      toast.error('Close the trade first')
      return
    }
    setReviewing(true)
    try {
      const review = await reviewTrade(trade, profile)
      await updateTrade(trade.id, { review })
      toast.success('Review complete')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Review failed')
    } finally {
      setReviewing(false)
    }
  }

  const remove = async () => {
    if (!trade) return
    try {
      await deleteTrade(trade.id)
      toast.success('Trade deleted')
      onClose()
    } catch {
      toast.error('Could not delete')
    }
  }

  if (!trade) return null

  return (
    <Modal
      open={!!trade}
      onClose={onClose}
      width="max-w-5xl"
      title={`${trade.ticker} ${trade.direction === 'long' ? 'LONG' : 'SHORT'}`}
      subtitle={`${fmtDateTime(trade.tradeDate)}${trade.exitDate ? ` → ${fmtDateTime(trade.exitDate)}` : ' · still open'} · logged from ${trade.source}`}
      footer={
        <>
          {confirmDelete ? (
            <div className="mr-auto flex items-center gap-2">
              <span className="text-2xs text-down">Delete permanently?</span>
              <button onClick={() => void remove()} className="btn-danger btn-sm">Delete</button>
              <button onClick={() => setConfirmDelete(false)} className="btn-ghost btn-sm">Keep</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="btn-ghost btn-sm mr-auto text-ink-500">
              Delete
            </button>
          )}
          <button onClick={onClose} className="btn-ghost">Close</button>
          <button onClick={() => void save()} disabled={saving} className="btn-primary">
            {saving ? <><Spinner /> Saving…</> : 'Save'}
          </button>
        </>
      }
    >
      {/* ── Numbers strip ── */}
      <div className="grid grid-cols-3 sm:grid-cols-6 divide-x divide-ink-800 border-b border-ink-800 bg-ink-850">
        {([
          ['Entry', fmtPrice(trade.entryPrice, trade.ticker), 'neutral'],
          ['Stop', fmtPrice(trade.stopLoss, trade.ticker), 'neutral'],
          ['Exit', trade.exitPrice !== null ? fmtPrice(trade.exitPrice, trade.ticker) : '—', 'neutral'],
          ['Units', trade.positionSize?.toLocaleString() ?? '—', 'neutral'],
          ['P&L', fmtMoney(trade.pnl), trade.pnl === null ? 'neutral' : trade.pnl >= 0 ? 'up' : 'down'],
          ['R', fmtR(trade.rMultiple), trade.rMultiple === null ? 'neutral' : trade.rMultiple >= 0 ? 'up' : 'down'],
        ] as const).map(([label, value, tone]) => (
          <div key={label} className="px-2.5 py-2">
            <div className="text-2xs uppercase tracking-label text-ink-500">{label}</div>
            <div
              className={`font-mono text-xs mt-0.5 ${
                tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-ink-50'
              }`}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-ink-800">

        {/* ── Left: outcome + rules + notes ── */}
        <div className="p-3 space-y-3">
          <div>
            <div className="label">Status</div>
            <Segmented
              value={status}
              onChange={(v) => {
                setStatus(v)
                if (v === 'closed' && !exitDate) setExitDate(localFromIso(new Date().toISOString()))
              }}
              options={[
                { value: 'open', label: 'Open' },
                { value: 'closed', label: 'Closed' },
              ]}
            />
          </div>

          <RiskField
            value={risk}
            onChange={setRisk}
            quoteRisk={derived?.quoteRisk ?? null}
            suspect={derived?.suspect ?? false}
            ticker={trade.ticker}
            balance={profile?.accountBalance ?? null}
          />

          {status === 'closed' && (
            <div className="space-y-2 animate-rise">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Exit price">
                  <Input
                    mono type="number" step="any"
                    value={exitPrice}
                    onChange={(e) => setExitPrice(e.target.value)}
                  />
                </Field>
                <Field label="Closed at">
                  <Input
                    type="datetime-local"
                    value={exitDate}
                    onChange={(e) => setExitDate(e.target.value)}
                  />
                </Field>
                <Field
                  label="P&L $"
                  hint={
                    !pnlTouched.current && derived?.estimated != null
                      ? 'Estimated from price — replace with CMC’s figure'
                      : 'From CMC'
                  }
                >
                  <Input
                    mono type="number" step="any"
                    value={pnl}
                    onChange={(e) => { pnlTouched.current = true; setPnl(e.target.value) }}
                    placeholder="0.00"
                  />
                </Field>
                <Field label="Stop ended at" hint={derived?.oneR ? `1R = ${derived.oneR.toPrecision(3)}` : 'If trailed'}>
                  <Input
                    mono type="number" step="any"
                    value={finalStop}
                    onChange={(e) => setFinalStop(e.target.value)}
                  />
                </Field>
              </div>

              {derived?.pnl != null && (
                <div className={`flex items-center justify-between px-3 py-2 rounded-md ${
                  derived.pnl >= 0 ? 'bg-up-wash' : 'bg-down-wash'
                }`}>
                  <span className="text-2xs uppercase tracking-label text-ink-300">Result</span>
                  <div className="flex items-center gap-4 font-mono">
                    <span className={valueClass(derived.pnl)}>{fmtMoney(derived.pnl)}</span>
                    <span className={`text-sm ${valueClass(derived.r)}`}>{fmtR(derived.r)}</span>
                    <Tag tone={derived.outcome === 'win' ? 'up' : derived.outcome === 'loss' ? 'down' : 'neutral'}>
                      {derived.outcome ?? '—'}
                    </Tag>
                  </div>
                </div>
              )}
            </div>
          )}

          <RulesChecklist value={rules} onChange={setRules} />

          <div className="grid grid-cols-2 gap-2">
            <Field label="Setup">
              <Input value={setupType} onChange={(e) => setSetupType(e.target.value)} placeholder="Daily zone retest" />
            </Field>
            <Field label="Mistake">
              <Select value={mistake} onChange={(e) => setMistake(e.target.value)}>
                <option value="">None</option>
                {MISTAKES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </Select>
            </Field>
          </div>

          <Field label="State at entry" hint={EMOTIONS.find((e) => String(e.value) === emotion)?.detail}>
            <Segmented
              value={emotion}
              onChange={setEmotion}
              options={EMOTIONS.map((e) => ({ value: String(e.value), label: e.label }))}
            />
          </Field>

          <Field label="Notes">
            <Textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What made this zone valid? What did you get right or wrong?"
            />
          </Field>
        </div>

        {/* ── Right: charts + AI ── */}
        <div className="p-3 space-y-3 bg-ink-950/40">
          {(['entry', 'exit'] as const).map((phase) => {
            const stored = phase === 'entry' ? trade.entryScreenshotUrl : trade.exitScreenshotUrl
            const pending = phase === 'entry' ? entryImage : exitImage
            const setPending = phase === 'entry' ? setEntryImage : setExitImage
            const read = phase === 'entry' ? trade.entryChartRead : trade.exitChartRead

            return (
              <div key={phase} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="label mb-0 capitalize">{phase} chart</span>
                  {(stored || pending) && aiConfigured() && (
                    <button
                      onClick={() => void runChartRead(phase)}
                      disabled={reading !== null}
                      className="btn-ghost btn-sm"
                    >
                      {reading === phase ? <><Spinner /> Reading…</> : read ? 'Re-read' : 'Read chart'}
                    </button>
                  )}
                </div>

                {pending ? (
                  <ImageDrop value={pending} onChange={setPending} label={`${phase} chart`} compact />
                ) : stored ? (
                  <a href={stored} target="_blank" rel="noreferrer" className="block surface">
                    <img src={stored} alt={`${phase} chart`} className="w-full h-32 object-contain bg-ink-950" />
                  </a>
                ) : (
                  <ImageDrop value={null} onChange={setPending} label={`Add ${phase} chart`} compact />
                )}

                {read && <ChartReadPanel read={read} phase={phase} />}
              </div>
            )
          })}

          {/* Post-trade review */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="label mb-0">Post-trade review</span>
              {aiConfigured() && trade.status === 'closed' && (
                <button onClick={() => void runReview()} disabled={reviewing} className="btn-ghost btn-sm">
                  {reviewing ? <><Spinner /> Reviewing…</> : trade.review ? 'Re-review' : 'Review'}
                </button>
              )}
            </div>

            {trade.status !== 'closed' ? (
              <p className="hint">Available once the trade is closed.</p>
            ) : trade.review ? (
              <div className="surface divide-y divide-ink-800">
                {trade.review.didWell.length > 0 && (
                  <div className="px-2.5 py-2">
                    <div className="text-2xs uppercase tracking-label text-up mb-1">Did well</div>
                    <ul className="space-y-1">
                      {trade.review.didWell.map((s, i) => (
                        <li key={i} className="text-xs text-ink-100 leading-relaxed flex gap-1.5">
                          <span className="text-up shrink-0">+</span>{s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {trade.review.didBadly.length > 0 && (
                  <div className="px-2.5 py-2">
                    <div className="text-2xs uppercase tracking-label text-down mb-1">Did badly</div>
                    <ul className="space-y-1">
                      {trade.review.didBadly.map((s, i) => (
                        <li key={i} className="text-xs text-ink-100 leading-relaxed flex gap-1.5">
                          <span className="text-down shrink-0">−</span>{s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {trade.review.verdict && (
                  <div className="px-2.5 py-2 bg-ink-850">
                    <p className="text-xs text-ink-100 leading-relaxed">{trade.review.verdict}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="hint">
                Judges process against your rules, not whether it made money.
                A rule-following loss is a good trade.
              </p>
            )}
          </div>

          {trade.ticketScreenshotUrl && (
            <div>
              <div className="label">Original ticket</div>
              <a href={trade.ticketScreenshotUrl} target="_blank" rel="noreferrer" className="block surface">
                <img src={trade.ticketScreenshotUrl} alt="Trade ticket" className="w-full h-24 object-contain bg-ink-950" />
              </a>
            </div>
          )}

          {trade.mistake && (
            <div className="bg-down-wash rounded-md px-2.5 py-2">
              <span className="text-2xs uppercase tracking-label text-down">Flagged mistake</span>
              <p className="text-xs text-ink-100 mt-0.5">{MISTAKE_LABELS[trade.mistake] ?? trade.mistake}</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
