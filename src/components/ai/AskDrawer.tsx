import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/store/AuthContext'
import { useTrades } from '@/store/TradeContext'
import { askJournal, aiConfigured, type ChatMessage } from '@/lib/ai'
import { Spinner } from '@/components/ui/Primitives'

const SUGGESTIONS = [
  'How do I do on AUD pairs?',
  'Does following my rules actually correlate with winning?',
  'What is my worst recurring mistake?',
  'Am I better long or short?',
]

/**
 * Natural-language questions answered from the journal.
 *
 * A side drawer rather than a floating bubble: the answers are meant to be read
 * alongside the numbers on the page behind, and a chat bubble in the corner of
 * a trading tool is exactly the ornament this UI is trying to avoid.
 */
export function AskDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth()
  const { trades } = useTrades()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80)
  }, [open])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const send = async (text: string) => {
    const question = text.trim()
    if (!question || busy) return

    const next: ChatMessage[] = [...messages, { role: 'user', content: question }]
    setMessages(next)
    setInput('')
    setBusy(true)
    setError(null)

    try {
      const answer = await askJournal(next, trades, profile)
      setMessages([...next, { role: 'assistant', content: answer }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not get an answer')
      // Drop the unanswered question so a retry doesn't stack duplicates.
      setMessages(messages)
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  const closed = trades.filter((t) => t.status === 'closed').length

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink-950/60 animate-fade-in" onClick={onClose} />

      <aside
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-ink-900 border-l border-ink-700
                   flex flex-col animate-rise"
        role="dialog"
        aria-label="Ask your journal"
      >
        <header className="panel-head shrink-0">
          <div>
            <h2 className="panel-title">Ask your journal</h2>
            <p className="text-2xs text-ink-500 normal-case tracking-normal">
              {closed} closed trade{closed === 1 ? '' : 's'} in context
            </p>
          </div>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-50 p-1 -mr-1" aria-label="Close">
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-xs text-ink-300 leading-relaxed">
                Questions are answered only from your own logged trades. Where the
                sample is too small to say anything, it will tell you that rather
                than guess.
              </p>
              <div className="space-y-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(s)}
                    disabled={!closed}
                    className="w-full text-left text-xs px-2.5 py-2 border border-ink-700
                               text-ink-200 hover:border-ink-600 hover:bg-ink-850 hover:text-ink-50
                               disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
              {!closed && (
                <p className="hint">Close a trade or two first — there's nothing to analyse yet.</p>
              )}
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i}>
              {m.role === 'user' ? (
                <div className="text-xs text-brass-bright border-l-2 border-brass pl-2.5 py-0.5">
                  {m.content}
                </div>
              ) : (
                <div className="text-xs text-ink-100 leading-relaxed whitespace-pre-wrap">
                  {m.content}
                </div>
              )}
            </div>
          ))}

          {busy && (
            <div className="flex items-center gap-2 text-xs text-ink-400">
              <Spinner /> Reading your journal…
            </div>
          )}

          {error && (
            <div className="text-xs text-down border border-down/30 bg-down-wash px-2.5 py-2">
              {error}
            </div>
          )}
        </div>

        <footer className="p-3 border-t border-ink-700 shrink-0">
          {!aiConfigured() ? (
            <p className="hint">
              Needs <code className="text-brass-bright">VITE_ANTHROPIC_API_KEY</code> in your .env.
            </p>
          ) : (
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send(input)
                  }
                }}
                placeholder="Ask anything about your trading…"
                className="field flex-1 resize-none text-xs"
              />
              <button
                onClick={() => void send(input)}
                disabled={busy || !input.trim()}
                className="btn-primary self-stretch px-3"
                aria-label="Send"
              >
                {busy ? <Spinner /> : '↵'}
              </button>
            </div>
          )}
        </footer>
      </aside>
    </>
  )
}
