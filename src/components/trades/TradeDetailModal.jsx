import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'
import { useTrades } from '../../context/TradeContext'
import { useAuth } from '../../context/AuthContext'
import { analyzeTradeReplay } from '../../services/aiService'
import { compressImageFile, uploadScreenshot } from '../../services/storageService'

const EMOTIONS = ['', '😴', '😐', '🙂', '😤', '🤯']
const EMOTION_LABELS = ['', 'Tired', 'Neutral', 'Focused', 'Eager', 'Overconfident']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Badge({ children, className = '' }) {
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${className}`}>{children}</span>
}

function Row({ label, value, valueClass = 'text-white' }) {
  if (value == null || value === '') return null
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-white/5 last:border-0">
      <span className="text-sm text-white/40 flex-shrink-0 mr-4">{label}</span>
      <span className={`text-sm font-semibold text-right ${valueClass}`}>{value}</span>
    </div>
  )
}

function Screenshot({ url, label }) {
  if (!url) return (
    <div className="rounded-xl border border-white/5 bg-white/2 flex items-center justify-center h-44">
      <div className="text-center">
        <div className="text-2xl mb-1 opacity-30">📸</div>
        <div className="text-xs text-white/20">No {label}</div>
      </div>
    </div>
  )
  return (
    <div className="relative rounded-xl overflow-hidden border border-white/10 group">
      <img src={url} alt={label} className="w-full h-44 object-cover" />
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs text-white font-medium">
        View full size ↗
      </a>
      <div className="absolute bottom-2 left-2 bg-black/70 text-white/60 text-xs px-2 py-0.5 rounded">{label}</div>
    </div>
  )
}

function ScreenshotDropZone({ onFile }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => files[0] && onFile(files[0]),
    accept: { 'image/*': [] }, maxFiles: 1, multiple: false,
  })
  return (
    <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all duration-200
      ${isDragActive ? 'border-accent bg-accent/5' : 'border-white/10 hover:border-white/25'}`}>
      <input {...getInputProps()} />
      <p className="text-xs text-white/40">Drop exit screenshot here</p>
    </div>
  )
}

// ─── AI Replay card ───────────────────────────────────────────────────────────

function ReplayCard({ replay, loading }) {
  if (loading) return (
    <div className="rounded-xl border border-white/10 bg-white/3 p-4 space-y-2.5 animate-pulse">
      {[100, 80, 65, 90].map((w) => (
        <div key={w} className="h-3 bg-white/5 rounded" style={{ width: `${w}%` }} />
      ))}
    </div>
  )
  if (!replay) return null

  const ratingColor = replay.executionRating >= 8 ? 'text-win' : replay.executionRating >= 6 ? 'text-accent' : 'text-gold'

  return (
    <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-white">🤖 Trade Replay Analysis</span>
        <div className="flex items-center gap-1">
          <span className={`text-xl font-bold ${ratingColor}`}>{replay.executionRating}</span>
          <span className="text-white/25 text-sm">/10</span>
        </div>
      </div>
      {[
        { label: 'Entry', value: replay.entryQuality },
        { label: 'Exit', value: replay.exitQuality },
        { label: '✓ What went well', value: replay.whatWentWell, cls: 'text-win/80' },
        { label: '→ Improve', value: replay.improvements, cls: 'text-gold/80' },
        { label: '💡 Lesson', value: replay.lessonLearned, cls: 'text-white/60' },
      ].map(({ label, value, cls }) => value ? (
        <div key={label} className="pt-2 border-t border-white/5">
          <div className="text-xs text-white/30 font-medium mb-1">{label}</div>
          <p className={`text-xs leading-relaxed ${cls ?? 'text-white/60'}`}>{value}</p>
        </div>
      ) : null)}
    </div>
  )
}

// ─── Edit form (inline) ───────────────────────────────────────────────────────

function EditSection({ trade, onSave, onCancel }) {
  const { updateTrade } = useTrades()
  const { user } = useAuth()
  const [form, setForm] = useState({
    outcome: trade.outcome ?? '',
    exitPrice: trade.exitPrice ?? '',
    notes: trade.notes ?? '',
  })
  const [exitFile, setExitFile] = useState(null)
  const [exitPreview, setExitPreview] = useState(trade.exitScreenshotUrl ?? null)
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const handleExitDrop = useCallback(async (file) => {
    const compressed = await compressImageFile(file)
    setExitFile(file)
    setExitPreview(compressed)
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      let exitScreenshotUrl = exitPreview
      if (exitFile && user) {
        exitScreenshotUrl = await uploadScreenshot(user.uid, trade.id, exitPreview, 'exit')
      }

      const entry = parseFloat(trade.entryPrice)
      const exit = parseFloat(form.exitPrice)
      const size = parseFloat(trade.positionSize)
      const risk = parseFloat(trade.riskAmount)

      let pnl = null
      let rMultiple = null
      if (!isNaN(entry) && !isNaN(exit) && !isNaN(size)) {
        pnl = parseFloat(((trade.direction === 'long' ? exit - entry : entry - exit) * size).toFixed(2))
        if (!isNaN(risk) && risk > 0) rMultiple = parseFloat((pnl / risk).toFixed(2))
      }

      await updateTrade(trade.id, {
        outcome: form.outcome || null,
        exitPrice: exit || null,
        notes: form.notes,
        exitScreenshotUrl: exitScreenshotUrl || trade.exitScreenshotUrl,
        pnl,
        rMultiple,
      })
      toast.success('Trade updated')
      onSave()
    } catch {
      toast.error('Failed to update trade')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 pt-4 border-t border-white/5">
      <p className="text-xs font-semibold text-white/30 uppercase tracking-widest">Edit Trade</p>

      <div>
        <label className="label">Outcome</label>
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          {[{ k: 'win', l: '✓ Win' }, { k: 'loss', l: '✗ Loss' }, { k: 'breakeven', l: '≈ B/E' }].map(({ k, l }) => (
            <button key={k} type="button" onClick={() => set('outcome', form.outcome === k ? '' : k)}
              className={`flex-1 py-2 text-sm font-semibold transition-all ${
                form.outcome === k
                  ? k === 'win' ? 'bg-win text-white' : k === 'loss' ? 'bg-loss text-white' : 'bg-white/20 text-white'
                  : 'bg-white/5 text-white/40 hover:text-white/70'
              }`}>{l}</button>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Exit Price</label>
        <input type="number" step="any" value={form.exitPrice} onChange={(e) => set('exitPrice', e.target.value)}
          placeholder="0.00" className="input-field" />
      </div>

      <div>
        <label className="label">Notes</label>
        <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)}
          className="input-field resize-none" rows={3} />
      </div>

      <div>
        <label className="label">Exit Screenshot</label>
        {exitPreview
          ? <div className="relative rounded-xl overflow-hidden border border-white/10 group">
              <img src={exitPreview} alt="Exit" className="w-full h-32 object-cover" />
              <button type="button" onClick={() => { setExitFile(null); setExitPreview(null) }}
                className="absolute top-2 right-2 bg-loss/80 text-white text-xs px-2 py-1 rounded-lg">Remove</button>
            </div>
          : <ScreenshotDropZone onFile={handleExitDrop} />
        }
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1 text-sm">Cancel</button>
        <button type="button" onClick={handleSave} disabled={saving}
          className="btn-primary flex-1 text-sm flex items-center justify-center gap-2">
          {saving ? <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg> : null}
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function TradeDetailModal({ trade, onClose }) {
  const { deleteTrade } = useTrades()
  const { userProfile } = useAuth()
  const [editing, setEditing] = useState(false)
  const [replay, setReplay] = useState(null)
  const [replayLoading, setReplayLoading] = useState(false)

  if (!trade) return null

  const hasEntry = !!trade.entryScreenshotUrl
  const hasExit = !!trade.exitScreenshotUrl
  const canReplay = hasEntry && hasExit

  const handleReplay = async () => {
    setReplayLoading(true)
    setReplay(null)
    try {
      const result = await analyzeTradeReplay(
        trade.entryScreenshotUrl,
        trade.exitScreenshotUrl,
        trade,
        userProfile?.strategy
      )
      setReplay(result)
    } catch (err) {
      toast.error(err.message ?? 'Replay analysis failed')
    } finally {
      setReplayLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('Delete this trade permanently?')) return
    try {
      await deleteTrade(trade.id)
      toast.success('Trade deleted')
      onClose()
    } catch {
      toast.error('Failed to delete trade')
    }
  }

  const dirColor = trade.direction === 'long' ? 'text-win' : 'text-loss'
  const pnlColor = (trade.pnl ?? 0) >= 0 ? 'text-win' : 'text-loss'

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card w-full max-w-4xl max-h-[92vh] flex flex-col animate-slide-up overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xl font-bold text-white">{trade.ticker ?? '—'}</span>
            {trade.direction && (
              <span className={`text-sm font-semibold ${dirColor}`}>
                {trade.direction === 'long' ? '▲ Long' : '▼ Short'}
              </span>
            )}
            {trade.assetClass && <Badge className="badge-neutral capitalize">{trade.assetClass}</Badge>}
            {trade.timeframe && <Badge className="badge-neutral">{trade.timeframe}</Badge>}
            {trade.outcome && (
              <Badge className={trade.outcome === 'win' ? 'badge-win' : trade.outcome === 'loss' ? 'badge-loss' : 'badge-neutral'}>
                {trade.outcome.charAt(0).toUpperCase() + trade.outcome.slice(1)}
              </Badge>
            )}
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/5">
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-white/5">

            {/* Left — details */}
            <div className="p-6 space-y-5">
              {/* P&L hero */}
              {trade.pnl != null && (
                <div className={`p-4 rounded-xl border flex items-center justify-between ${trade.pnl >= 0 ? 'bg-win/5 border-win/20' : 'bg-loss/5 border-loss/20'}`}>
                  <div>
                    <div className="text-xs text-white/40 mb-0.5">P&L</div>
                    <div className={`text-3xl font-bold ${pnlColor}`}>
                      {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                    </div>
                  </div>
                  {trade.rMultiple != null && (
                    <div className="text-right">
                      <div className="text-xs text-white/40 mb-0.5">R:R</div>
                      <div className={`text-2xl font-bold ${trade.rMultiple >= 0 ? 'text-win' : 'text-loss'}`}>
                        {trade.rMultiple >= 0 ? `1:${trade.rMultiple.toFixed(2)}` : `${trade.rMultiple.toFixed(2)}R`}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Trade fields */}
              <div>
                <Row label="Date" value={trade.tradeDate ? new Date(trade.tradeDate).toLocaleString() : null} />
                <Row label="Setup type" value={trade.setupType} />
                <Row label="Entry price" value={trade.entryPrice != null ? `$${trade.entryPrice}` : null} />
                <Row label="Exit price" value={trade.exitPrice != null ? `$${trade.exitPrice}` : null} />
                <Row label="Stop loss" value={trade.stopLoss != null ? `$${trade.stopLoss}` : null} />
                <Row label="Take profit" value={trade.takeProfit != null ? `$${trade.takeProfit}` : null} />
                <Row label="Position size" value={trade.positionSize != null ? String(trade.positionSize) : null} />
                <Row label="Risk"
                  value={trade.riskAmount != null ? `$${trade.riskAmount} (${trade.riskPercent ?? '?'}%)` : null} />
                <Row label="Emotion"
                  value={trade.emotion ? `${EMOTIONS[trade.emotion]} ${EMOTION_LABELS[trade.emotion]}` : null} />
                <Row label="Followed rules" value={trade.followedRules != null ? (trade.followedRules ? '✓ Yes' : '✗ No') : null}
                  valueClass={trade.followedRules ? 'text-win' : 'text-loss'} />
              </div>

              {/* Checklist */}
              {trade.checklist?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-2">Strategy Checklist</p>
                  <div className="space-y-1.5">
                    {trade.checklist.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span className={item.checked ? 'text-win mt-0.5' : 'text-loss mt-0.5'}>{item.checked ? '✓' : '✗'}</span>
                        <span className={item.checked ? 'text-white/70' : 'text-white/35'}>{item.rule}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI analysis from entry */}
              {trade.aiAnalysis && (
                <div>
                  <p className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-2">Entry AI Analysis</p>
                  <div className={`rounded-xl border p-3.5 text-sm space-y-2
                    ${trade.aiAnalysis.verdict === 'A+' ? 'bg-win/5 border-win/20'
                      : trade.aiAnalysis.verdict === 'Good' ? 'bg-accent/5 border-accent/20'
                      : trade.aiAnalysis.verdict === 'Mediocre' ? 'bg-gold/5 border-gold/20'
                      : 'bg-loss/5 border-loss/20'}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">{trade.aiAnalysis.verdictDetail ?? trade.aiAnalysis.verdict}</span>
                      <span className="font-bold text-white">{trade.aiAnalysis.rating}/10</span>
                    </div>
                    {trade.aiAnalysis.summary && <p className="text-white/50 text-xs">{trade.aiAnalysis.summary}</p>}
                  </div>
                </div>
              )}

              {/* Notes */}
              {trade.notes && (
                <div>
                  <p className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-2">Notes</p>
                  <p className="text-sm text-white/60 leading-relaxed whitespace-pre-line">{trade.notes}</p>
                </div>
              )}

              {/* Edit section */}
              {editing
                ? <EditSection trade={trade} onSave={() => setEditing(false)} onCancel={() => setEditing(false)} />
                : null}
            </div>

            {/* Right — screenshots + replay */}
            <div className="p-6 space-y-5">
              <div>
                <p className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-3">Screenshots</p>
                <div className="grid grid-cols-2 gap-3">
                  <Screenshot url={trade.entryScreenshotUrl} label="Entry" />
                  <Screenshot url={trade.exitScreenshotUrl} label="Exit" />
                </div>
              </div>

              {/* AI Replay */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-white/30 uppercase tracking-widest">AI Trade Replay</p>
                  {canReplay && !replay && (
                    <button onClick={handleReplay} disabled={replayLoading}
                      className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5">
                      {replayLoading
                        ? <><svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>Analysing…</>
                        : <>🎬 Analyse Replay</>}
                    </button>
                  )}
                </div>
                {!canReplay && !replay && !replayLoading && (
                  <p className="text-xs text-white/20">
                    {!hasEntry && !hasExit ? 'Upload both entry and exit screenshots to enable replay analysis.'
                      : !hasEntry ? 'Entry screenshot required for replay.'
                      : 'Add an exit screenshot to enable replay analysis.'}
                  </p>
                )}
                <ReplayCard replay={replay} loading={replayLoading} />
                {replay && (
                  <button onClick={handleReplay} className="text-xs text-white/25 hover:text-white/50 mt-2 transition-colors">
                    Re-analyse
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/5 flex-shrink-0">
          <button onClick={handleDelete} className="btn-danger text-sm">
            Delete trade
          </button>
          <button onClick={() => setEditing((v) => !v)} className="btn-secondary text-sm">
            {editing ? 'Cancel edit' : 'Edit trade'}
          </button>
        </div>
      </div>
    </div>
  )
}
