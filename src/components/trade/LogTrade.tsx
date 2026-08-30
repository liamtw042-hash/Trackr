import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '@/store/AuthContext'
import { useTrades } from '@/store/TradeContext'
import { extractTicket, aiConfigured } from '@/lib/ai'
import { uploadImage } from '@/lib/images'
import {
  estimatePnl, outcomeFromPnl, positionSizeFor, rMultiple, riskAmountFor,
  riskPercentFor, stopDistance, plannedRR, num, fmtMoney, fmtR, round,
} from '@/lib/calc'
import { emptyRules, FX_PAIRS, TIMEFRAMES, MISTAKES, EMOTIONS } from '@/types'
import type { Direction, RuleState, TicketExtract, TradeDraft } from '@/types'
import {
  Modal, Field, Input, Select, Textarea, Segmented, Spinner, Confidence,
} from '@/components/ui/Primitives'
import { ImageDrop } from '@/components/ui/ImageDrop'
import { RulesChecklist } from './RulesChecklist'

// ─────────────────────────────────────────────────────────────────────────────
// Logging a trade.
//
// The organising principle is that the mechanical numbers and the reasoning are
// separate jobs. The top block is everything needed to save a valid trade — it
// should take about ten seconds, and Ctrl+Enter saves from anywhere in the form.
// Context (rules, notes, emotion, charts) sits below and can be filled in later
// from the trade detail view, because if logging is slow it doesn't get done.
// ─────────────────────────────────────────────────────────────────────────────

interface FormState {
  ticker: string
  direction: Direction
  entryPrice: string
  stopLoss: string
  takeProfit: string
  positionSize: string
  riskAmount: string
  riskPercent: string
  tradeDate: string
  timeframe: string
  setupType: string
  status: 'open' | 'closed'
  exitPrice: string
  exitDate: string
  pnl: string
  finalStopLoss: string
  emotion: string
  mistake: string
  notes: string
}

function localNow(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

function blankForm(defaultRisk: number): FormState {
  return {
    ticker: '', direction: 'long', entryPrice: '', stopLoss: '', takeProfit: '',
    positionSize: '', riskAmount: '', riskPercent: String(defaultRisk),
    tradeDate: localNow(), timeframe: '4H', setupType: '',
    status: 'open', exitPrice: '', exitDate: '', pnl: '', finalStopLoss: '',
    emotion: '3', mistake: '', notes: '',
  }
}

export function LogTrade({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, profile } = useAuth()
  const { addTrade } = useTrades()

  const defaultRisk = profile?.defaultRisk ?? 1
  const balance = profile?.accountBalance ?? 0

  const [form, setForm] = useState<FormState>(() => blankForm(defaultRisk))
  const [rules, setRules] = useState<RuleState>(emptyRules)
  const [ticketImage, setTicketImage] = useState<string | null>(null)
  const [entryImage, setEntryImage] = useState<string | null>(null)
  const [exitImage, setExitImage] = useState<string | null>(null)
  const [extract, setExtract] = useState<TicketExtract | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showContext, setShowContext] = useState(false)
  const tickerRef = useRef<HTMLInputElement>(null)

  // Reset whenever the modal is opened, so a cancelled entry never leaks into
  // the next one.
  useEffect(() => {
    if (!open) return
    setForm(blankForm(defaultRisk))
    setRules(emptyRules())
    setTicketImage(null)
    setEntryImage(null)
    setExitImage(null)
    setExtract(null)
    setShowContext(false)
    const t = setTimeout(() => tickerRef.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [open, defaultRisk])

  const set = useCallback(<K extends keyof FormState>(key: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: v }))
  }, [])

  // ── Derived numbers ──
  const derived = useMemo(() => {
    const direction = form.direction
    const entryPrice = num(form.entryPrice)
    const stopLoss = num(form.stopLoss)
    const takeProfit = num(form.takeProfit)
    const positionSize = num(form.positionSize)
    const riskAmount = num(form.riskAmount)
    const exitPrice = num(form.exitPrice)

    const dist = stopDistance({ direction, entryPrice, stopLoss })
    const rr = plannedRR({ direction, entryPrice, stopLoss, takeProfit })
    const suggestedSize = positionSizeFor({ direction, entryPrice, stopLoss, riskAmount })

    // A typed P&L always wins over one derived from price — the broker figure
    // accounts for the currency conversion and financing that price alone can't.
    const typedPnl = num(form.pnl)
    const estimated = estimatePnl({ direction, entryPrice, exitPrice, positionSize })
    const pnl = typedPnl ?? estimated

    return {
      dist, rr, suggestedSize, estimated, pnl,
      r: rMultiple(pnl, riskAmount),
      outcome: outcomeFromPnl(pnl),
      // Warn when the stop is on the wrong side of entry — a sign the direction
      // toggle is wrong, which silently inverts every derived number.
      stopInverted: entryPrice !== null && stopLoss !== null && dist === null,
    }
  }, [form])

  // Keep risk amount and percent in step, driven by whichever was last edited.
  const setRiskPercent = (v: string) => {
    set('riskPercent', v)
    const amt = riskAmountFor(balance, num(v))
    if (amt !== null) set('riskAmount', String(amt))
  }
  const setRiskAmount = (v: string) => {
    set('riskAmount', v)
    const pct = riskPercentFor(balance, num(v))
    if (pct !== null) set('riskPercent', String(pct))
  }

  // Seed the risk amount from the default percentage on first open.
  useEffect(() => {
    if (!open) return
    const amt = riskAmountFor(balance, defaultRisk)
    if (amt !== null) setForm((f) => (f.riskAmount ? f : { ...f, riskAmount: String(amt) }))
  }, [open, balance, defaultRisk])

  // ── Ticket extraction ──
  const runExtract = useCallback(async (dataUrl: string) => {
    if (!aiConfigured()) {
      toast.error('Add VITE_ANTHROPIC_API_KEY to .env to read tickets automatically')
      return
    }
    setExtracting(true)
    setExtract(null)
    try {
      const result = await extractTicket(dataUrl)
      setExtract(result)

      // Fill only fields the model actually read. A null stays null so the
      // trader notices and types it rather than saving a fabricated price.
      setForm((f) => ({
        ...f,
        ticker: result.ticker ?? f.ticker,
        direction: result.direction ?? f.direction,
        entryPrice: result.entryPrice !== null ? String(result.entryPrice) : f.entryPrice,
        stopLoss: result.stopLoss !== null ? String(result.stopLoss) : f.stopLoss,
        takeProfit: result.takeProfit !== null ? String(result.takeProfit) : f.takeProfit,
        positionSize: result.positionSize !== null ? String(result.positionSize) : f.positionSize,
        tradeDate: result.openedAt ?? f.tradeDate,
      }))

      const filled = [
        result.ticker, result.direction, result.entryPrice, result.stopLoss, result.positionSize,
      ].filter((v) => v !== null).length
      toast.success(`Read ${filled} of 5 fields — check them before saving`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not read that ticket')
    } finally {
      setExtracting(false)
    }
  }, [])

  const onTicketChange = (dataUrl: string | null) => {
    setTicketImage(dataUrl)
    if (dataUrl) void runExtract(dataUrl)
    else setExtract(null)
  }

  // ── Save ──
  const save = useCallback(async () => {
    if (!user) return
    if (!form.ticker.trim()) {
      toast.error('Which pair?')
      tickerRef.current?.focus()
      return
    }
    if (num(form.entryPrice) === null) {
      toast.error('Entry price is required')
      return
    }

    setSaving(true)
    try {
      // Images upload first, but a failure here must never lose the trade —
      // uploadImage resolves to null rather than throwing.
      const [ticketUrl, entryUrl, exitUrl] = await Promise.all([
        ticketImage ? uploadImage(user.uid, 'ticket', ticketImage) : Promise.resolve(null),
        entryImage ? uploadImage(user.uid, 'entry', entryImage) : Promise.resolve(null),
        exitImage ? uploadImage(user.uid, 'exit', exitImage) : Promise.resolve(null),
      ])
      const anyUploadFailed =
        (ticketImage && !ticketUrl) || (entryImage && !entryUrl) || (exitImage && !exitUrl)

      const isClosed = form.status === 'closed'
      const riskAmount = num(form.riskAmount)
      const pnl = isClosed ? derived.pnl : null

      const draft: TradeDraft = {
        ticker: form.ticker.trim().toUpperCase(),
        direction: form.direction,
        entryPrice: num(form.entryPrice),
        stopLoss: num(form.stopLoss),
        finalStopLoss: num(form.finalStopLoss),
        takeProfit: num(form.takeProfit),
        positionSize: num(form.positionSize),
        riskAmount,
        riskPercent: num(form.riskPercent),

        tradeDate: form.tradeDate || localNow(),
        exitDate: isClosed ? (form.exitDate || localNow()) : null,

        status: form.status,
        outcome: isClosed ? outcomeFromPnl(pnl) : null,
        exitPrice: isClosed ? num(form.exitPrice) : null,
        pnl,
        rMultiple: isClosed ? rMultiple(pnl, riskAmount) : null,

        setupType: form.setupType.trim(),
        timeframe: form.timeframe,
        emotion: num(form.emotion),
        mistake: form.mistake,
        notes: form.notes.trim(),
        rules,

        entryScreenshotUrl: entryUrl,
        exitScreenshotUrl: exitUrl,
        ticketScreenshotUrl: ticketUrl,
        entryChartRead: null,
        exitChartRead: null,
        review: null,

        source: ticketImage ? 'screenshot' : 'manual',
        importHash: null,
        schemaVersion: 2,
      }

      await addTrade(draft)
      toast.success(
        anyUploadFailed ? 'Trade saved — a screenshot failed to upload' : 'Trade logged'
      )
      onClose()
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Could not save the trade')
    } finally {
      setSaving(false)
    }
  }, [user, form, rules, ticketImage, entryImage, exitImage, derived.pnl, addTrade, onClose])

  // Ctrl/Cmd+Enter saves from anywhere in the form.
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        if (!saving) void save()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, saving, save])

  const conf = extract?.confidence ?? {}

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log trade"
      subtitle="Numbers now, reasoning later — ⌘↵ to save"
      width="max-w-5xl"
      footer={
        <>
          <span className="text-2xs text-ink-500 mr-auto font-mono">
            {derived.dist !== null && `1R = ${derived.dist.toPrecision(3)}`}
            {derived.rr !== null && `   ·   planned ${derived.rr.toFixed(1)}:1`}
          </span>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={() => void save()} disabled={saving} className="btn-primary">
            {saving ? <><Spinner /> Saving…</> : 'Save trade'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] divide-y lg:divide-y-0 lg:divide-x divide-ink-700">

        {/* ── Mechanical ── */}
        <div className="p-3 space-y-3">

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Field label="Pair" className="col-span-2 sm:col-span-1">
              <Input
                ref={tickerRef}
                list="fx-pairs"
                mono
                value={form.ticker}
                onChange={(e) => set('ticker', e.target.value.toUpperCase())}
                placeholder="GBPJPY"
                autoComplete="off"
              />
              <datalist id="fx-pairs">
                {FX_PAIRS.map((p) => <option key={p} value={p} />)}
              </datalist>
            </Field>

            <Field label="Direction" className="col-span-2 sm:col-span-1">
              <Segmented
                value={form.direction}
                onChange={(v) => set('direction', v)}
                options={[
                  { value: 'long', label: 'Long', tone: 'up' },
                  { value: 'short', label: 'Short', tone: 'down' },
                ]}
              />
            </Field>

            <Field label="Opened">
              <Input
                type="datetime-local"
                value={form.tradeDate}
                onChange={(e) => set('tradeDate', e.target.value)}
              />
            </Field>

            <Field label="Timeframe">
              <Select value={form.timeframe} onChange={(e) => set('timeframe', e.target.value)}>
                {TIMEFRAMES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Field
              label="Entry"
              hint={conf.entryPrice !== undefined ? <Confidence value={conf.entryPrice} /> : undefined}
            >
              <Input
                mono type="number" step="any" inputMode="decimal"
                value={form.entryPrice}
                onChange={(e) => set('entryPrice', e.target.value)}
                placeholder="0.00000"
              />
            </Field>

            <Field
              label="Stop loss"
              error={derived.stopInverted ? 'Stop is on the wrong side of entry' : null}
              hint={conf.stopLoss !== undefined ? <Confidence value={conf.stopLoss} /> : undefined}
            >
              <Input
                mono type="number" step="any" inputMode="decimal"
                value={form.stopLoss}
                onChange={(e) => set('stopLoss', e.target.value)}
                placeholder="0.00000"
              />
            </Field>

            <Field label="Take profit" hint="Optional — you trail instead">
              <Input
                mono type="number" step="any" inputMode="decimal"
                value={form.takeProfit}
                onChange={(e) => set('takeProfit', e.target.value)}
                placeholder="—"
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Field label="Risk %">
              <Input
                mono type="number" step="0.1" inputMode="decimal"
                value={form.riskPercent}
                onChange={(e) => setRiskPercent(e.target.value)}
              />
            </Field>

            <Field label="Risk $" hint={balance ? `of ${fmtMoney(balance, 0)}` : 'Set your balance in Settings'}>
              <Input
                mono type="number" step="any" inputMode="decimal"
                value={form.riskAmount}
                onChange={(e) => setRiskAmount(e.target.value)}
              />
            </Field>

            <Field
              label="Units"
              hint={
                derived.suggestedSize !== null && derived.suggestedSize !== num(form.positionSize) ? (
                  <button
                    type="button"
                    onClick={() => set('positionSize', String(derived.suggestedSize))}
                    className="text-brass-bright hover:underline font-mono"
                  >
                    use {derived.suggestedSize.toLocaleString()}
                  </button>
                ) : undefined
              }
            >
              <Input
                mono type="number" step="any" inputMode="decimal"
                value={form.positionSize}
                onChange={(e) => set('positionSize', e.target.value)}
                placeholder="0"
              />
            </Field>
          </div>

          {/* ── Status ── */}
          <div className="pt-1">
            <Segmented
              value={form.status}
              onChange={(v) => {
                set('status', v)
                if (v === 'closed' && !form.exitDate) set('exitDate', localNow())
              }}
              options={[
                { value: 'open', label: 'Still open' },
                { value: 'closed', label: 'Closed' },
              ]}
            />
          </div>

          {form.status === 'closed' && (
            <div className="space-y-2 animate-rise">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Field label="Exit price">
                  <Input
                    mono type="number" step="any" inputMode="decimal"
                    value={form.exitPrice}
                    onChange={(e) => set('exitPrice', e.target.value)}
                  />
                </Field>
                <Field label="Closed">
                  <Input
                    type="datetime-local"
                    value={form.exitDate}
                    onChange={(e) => set('exitDate', e.target.value)}
                  />
                </Field>
                <Field
                  label="P&L $"
                  hint={
                    derived.estimated !== null && num(form.pnl) === null
                      ? `est. ${fmtMoney(derived.estimated)}`
                      : 'From CMC'
                  }
                >
                  <Input
                    mono type="number" step="any" inputMode="decimal"
                    value={form.pnl}
                    onChange={(e) => set('pnl', e.target.value)}
                    placeholder={derived.estimated !== null ? String(derived.estimated) : '0.00'}
                  />
                </Field>
                <Field label="Stop ended at" hint="If trailed">
                  <Input
                    mono type="number" step="any" inputMode="decimal"
                    value={form.finalStopLoss}
                    onChange={(e) => set('finalStopLoss', e.target.value)}
                    placeholder="—"
                  />
                </Field>
              </div>

              {derived.pnl !== null && (
                <div
                  className={`flex items-center justify-between px-3 py-2 border
                    ${derived.pnl >= 0 ? 'border-up/30 bg-up-wash' : 'border-down/30 bg-down-wash'}`}
                >
                  <span className="text-2xs uppercase tracking-label text-ink-300">Result</span>
                  <div className="flex items-center gap-4 font-mono">
                    <span className={derived.pnl >= 0 ? 'text-up' : 'text-down'}>
                      {fmtMoney(derived.pnl)}
                    </span>
                    <span className={`text-sm ${(derived.r ?? 0) >= 0 ? 'text-up' : 'text-down'}`}>
                      {fmtR(derived.r)}
                    </span>
                    <span className="text-2xs uppercase text-ink-400">{derived.outcome}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Context (collapsed) ── */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowContext((v) => !v)}
              className="flex items-center gap-1.5 text-2xs uppercase tracking-label text-ink-400 hover:text-ink-100 transition-colors"
            >
              <svg
                className={`w-3 h-3 transition-transform ${showContext ? 'rotate-90' : ''}`}
                viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"
              >
                <path d="M4.5 3L7.5 6L4.5 9" />
              </svg>
              Context — rules, notes, charts
              <span className="text-ink-500 normal-case tracking-normal">
                (optional, can add later)
              </span>
            </button>

            {showContext && (
              <div className="mt-3 space-y-3 animate-rise">
                <RulesChecklist value={rules} onChange={setRules} />

                <div className="grid grid-cols-2 gap-2">
                  <Field label="Setup">
                    <Input
                      value={form.setupType}
                      onChange={(e) => set('setupType', e.target.value)}
                      placeholder="Daily zone retest"
                    />
                  </Field>
                  <Field label="Mistake">
                    <Select value={form.mistake} onChange={(e) => set('mistake', e.target.value)}>
                      <option value="">None</option>
                      {MISTAKES.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <Field
                  label="State at entry"
                  hint={EMOTIONS.find((e) => String(e.value) === form.emotion)?.detail}
                >
                  <Segmented
                    value={form.emotion}
                    onChange={(v) => set('emotion', v)}
                    options={EMOTIONS.map((e) => ({ value: String(e.value), label: e.label }))}
                  />
                </Field>

                <Field label="Notes">
                  <Textarea
                    rows={3}
                    value={form.notes}
                    onChange={(e) => set('notes', e.target.value)}
                    placeholder="What made this a valid zone? Any hesitation?"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-2">
                  <ImageDrop value={entryImage} onChange={setEntryImage} label="Entry chart" compact />
                  <ImageDrop value={exitImage} onChange={setExitImage} label="Exit chart" compact />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Ticket screenshot ── */}
        <aside className="p-3 space-y-3 bg-ink-950/40">
          <div>
            <div className="label">Trade ticket</div>
            <ImageDrop
              value={ticketImage}
              onChange={onTicketChange}
              label="Drop CMC ticket"
              hint="Paste from clipboard"
              pasteAnywhere
            />
            <p className="hint mt-1.5">
              Screenshot your position panel — the fields on the left fill in automatically.
            </p>
          </div>

          {extracting && (
            <div className="flex items-center gap-2 text-xs text-ink-300 border border-ink-700 px-2.5 py-2">
              <Spinner /> Reading ticket…
            </div>
          )}

          {extract && !extracting && (
            <div className="border border-ink-700 divide-y divide-ink-700 text-2xs">
              <div className="px-2.5 py-1.5 bg-ink-850 uppercase tracking-label text-ink-400">
                What it read
              </div>
              {([
                ['Pair', extract.ticker, conf.ticker],
                ['Direction', extract.direction, conf.direction],
                ['Entry', extract.entryPrice, conf.entryPrice],
                ['Stop', extract.stopLoss, conf.stopLoss],
                ['Target', extract.takeProfit, conf.takeProfit],
                ['Units', extract.positionSize, conf.positionSize],
              ] as const).map(([label, val, c]) => (
                <div key={label} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                  <span className="text-ink-400">{label}</span>
                  <span className="flex items-center gap-2">
                    <span className={`font-mono ${val === null ? 'text-ink-600' : 'text-ink-100'}`}>
                      {val === null ? 'not read' : String(val)}
                    </span>
                    <Confidence value={c} />
                  </span>
                </div>
              ))}

              {extract.warnings.length > 0 && (
                <div className="px-2.5 py-2 bg-brass-wash">
                  {extract.warnings.map((w, i) => (
                    <p key={i} className="text-brass-bright leading-snug">{w}</p>
                  ))}
                </div>
              )}

              <p className="px-2.5 py-2 text-ink-400 leading-snug">
                Extraction is a starting point, not a source of truth. Anything it
                couldn't read is left blank rather than guessed — check every value
                against the screenshot before saving.
              </p>
            </div>
          )}

          {!aiConfigured() && (
            <p className="hint border border-ink-700 px-2.5 py-2">
              Ticket reading needs <code className="text-brass-bright">VITE_ANTHROPIC_API_KEY</code> in
              your .env. Manual entry works without it.
            </p>
          )}
        </aside>
      </div>
    </Modal>
  )
}

export { round }
