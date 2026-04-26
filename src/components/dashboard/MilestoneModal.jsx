import { useEffect } from 'react'

const MILESTONE_META = {
  first_trade:     { icon: '🎯', title: 'First Trade Logged!',      desc: 'Every expert was once a beginner. Your journey starts now.' },
  trades_10:       { icon: '🔥', title: '10 Trades!',               desc: 'You\'re building the habit. Keep logging and keep improving.' },
  trades_50:       { icon: '⚡', title: '50 Trades!',               desc: 'Real data, real patterns. Your edge is becoming visible.' },
  trades_100:      { icon: '💎', title: '100 Trades!',              desc: 'Elite consistency. Very few traders ever reach this point.' },
  first_win_week:  { icon: '🏆', title: 'First Winning Week!',      desc: 'Positive week on the board. This is what discipline looks like.' },
  best_trade_ever: { icon: '⭐', title: 'New Best Trade!',          desc: 'A new personal record. Screenshot this and remember the setup.' },
}

function Confetti() {
  const pieces = Array.from({ length: 24 }, (_, i) => i)
  const colors = ['bg-win', 'bg-accent', 'bg-gold', 'bg-loss', 'bg-purple-400', 'bg-pink-400']
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-2xl">
      {pieces.map((i) => (
        <div
          key={i}
          className={`absolute w-2 h-2 rounded-sm ${colors[i % colors.length]} animate-bounce`}
          style={{
            left: `${(i / pieces.length) * 100}%`,
            top: `${Math.random() * 40}%`,
            animationDelay: `${(i * 80) % 600}ms`,
            animationDuration: `${600 + (i * 120) % 400}ms`,
            transform: `rotate(${i * 30}deg)`,
            opacity: 0.7,
          }}
        />
      ))}
    </div>
  )
}

export default function MilestoneModal({ milestone, onClose }) {
  const meta = MILESTONE_META[milestone]

  useEffect(() => {
    if (!milestone) return
    const t = setTimeout(onClose, 6000)
    return () => clearTimeout(t)
  }, [milestone, onClose])

  if (!milestone || !meta) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        className="relative card max-w-sm w-full p-8 text-center border-gold/30 bg-gradient-to-b from-gold/5 to-transparent animate-slide-up overflow-hidden"
        onClick={onClose}
      >
        <Confetti />

        <div className="relative z-10">
          <div className="text-6xl mb-4 animate-bounce">{meta.icon}</div>
          <h2 className="text-2xl font-bold text-white mb-2">{meta.title}</h2>
          <p className="text-white/50 text-sm leading-relaxed mb-6">{meta.desc}</p>

          <div className="flex items-center justify-center gap-2 text-xs text-white/25">
            <div className="w-1 h-1 rounded-full bg-win animate-pulse" />
            Tap anywhere to dismiss
          </div>
        </div>
      </div>
    </div>
  )
}
