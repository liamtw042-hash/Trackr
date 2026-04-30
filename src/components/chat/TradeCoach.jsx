import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useTrades } from '../../context/TradeContext'
import { generateChatResponse } from '../../services/aiService'
import toast from 'react-hot-toast'

const GREETING = 'Hi! I\'m your AI Trade Coach. I have full access to your trade data, stats, and strategy — ask me anything about your performance, patterns, or what to work on next.'

export default function TradeCoach() {
  const { userProfile } = useAuth()
  const { trades } = useTrades()
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([{ role: 'assistant', content: GREETING }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      inputRef.current?.focus()
    }
  }, [messages, isOpen])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return

    const newMessages = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      // Skip the initial greeting for the API call (it must start with a user message)
      const apiMessages = newMessages
        .filter((m, i) => !(i === 0 && m.role === 'assistant'))
        .map((m) => ({ role: m.role, content: m.content }))

      const reply = await generateChatResponse(apiMessages, trades, userProfile)
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
    } catch (err) {
      toast.error(err.message || 'Coach unavailable right now')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Chat panel */}
      {isOpen && (
        <div className="w-80 flex flex-col shadow-2xl rounded-2xl border border-white/10 bg-navy-900 overflow-hidden animate-slide-up" style={{ height: '460px' }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 flex-shrink-0 bg-white/2">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center text-xs flex-shrink-0">🤖</div>
              <div>
                <div className="text-sm font-semibold text-white leading-none">AI Trade Coach</div>
                <div className="text-xs text-win mt-0.5">● Online</div>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-white/30 hover:text-white transition-colors p-1">
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 no-scrollbar">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] text-xs leading-relaxed px-3 py-2 rounded-xl whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-accent text-white rounded-br-none'
                    : 'bg-white/8 text-white/80 rounded-bl-none'
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white/8 text-white/35 text-xs px-3 py-2 rounded-xl rounded-bl-none">
                  <span className="animate-pulse">Thinking…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Suggested prompts (only shown on first load) */}
          {messages.length === 1 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5">
              {['What should I improve?', 'Best setup this month?', 'Why am I losing?'].map((p) => (
                <button key={p} onClick={() => { setInput(p); inputRef.current?.focus() }}
                  className="text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-white/50 hover:text-white hover:border-white/20 transition-colors">
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="flex-shrink-0 px-3 pb-3 pt-1 border-t border-white/5">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask your coach…"
                rows={2}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/25 resize-none focus:outline-none focus:border-accent/40 transition-colors"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="btn-primary text-sm py-2 px-3 flex-shrink-0 disabled:opacity-40 rounded-xl"
              >
                ↑
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toggle bubble */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className={`w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-all duration-200 hover:scale-110 active:scale-95 ${
          isOpen
            ? 'bg-white/10 border border-white/20'
            : 'bg-gradient-to-br from-accent to-purple-600'
        }`}
      >
        {isOpen ? (
          <svg className="w-5 h-5 text-white" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>
    </div>
  )
}
