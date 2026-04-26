export default function AuthLayout({ children, title, subtitle }) {
  return (
    <div className="min-h-screen bg-navy-900 flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-navy-900 via-[#0d1530] to-navy-900" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_50%,rgba(59,130,246,0.08),transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_80%,rgba(16,185,129,0.06),transparent_60%)]" />

        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center px-16 xl:px-24">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-accent" viewBox="0 0 20 20" fill="none">
                <polyline
                  points="2,15 6,9 10,12 14,5 18,8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="text-white font-bold text-2xl tracking-tight">Trackr</span>
          </div>

          <h2 className="text-4xl xl:text-5xl font-bold text-white leading-tight mb-6">
            The professional
            <br />
            <span className="bg-gradient-to-r from-accent to-win bg-clip-text text-transparent">
              trading journal
            </span>
            <br />
            built for growth.
          </h2>

          <p className="text-white/40 text-lg font-medium mb-12 max-w-md leading-relaxed">
            Track every trade, analyse your patterns, and let AI help you trade smarter.
            Built for serious traders across all markets.
          </p>

          {/* Feature list */}
          <div className="space-y-4">
            {[
              { icon: '📊', text: 'Real-time performance analytics' },
              { icon: '🤖', text: 'AI-powered trade analysis & coaching' },
              { icon: '🎯', text: 'Strategy adherence tracking' },
              { icon: '🌍', text: 'Works for forex, stocks, crypto & more' },
            ].map((f) => (
              <div key={f.text} className="flex items-center gap-3">
                <span className="text-lg">{f.icon}</span>
                <span className="text-white/60 font-medium">{f.text}</span>
              </div>
            ))}
          </div>

          {/* Fake equity curve */}
          <div className="mt-12 p-4 rounded-xl bg-white/3 border border-white/5">
            <div className="text-xs text-white/30 font-medium mb-2">Sample Equity Curve</div>
            <svg viewBox="0 0 280 60" className="w-full">
              <defs>
                <linearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0,50 L20,45 L40,48 L60,40 L80,42 L100,32 L120,35 L140,25 L160,28 L180,18 L200,20 L220,12 L240,8 L260,5 L280,2"
                fill="none"
                stroke="#10b981"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M0,50 L20,45 L40,48 L60,40 L80,42 L100,32 L120,35 L140,25 L160,28 L180,18 L200,20 L220,12 L240,8 L260,5 L280,2 L280,60 L0,60 Z"
                fill="url(#curveGrad)"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="w-full lg:w-1/2 xl:w-2/5 flex items-center justify-center p-8">
        <div className="w-full max-w-md animate-slide-up">
          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-accent" viewBox="0 0 20 20" fill="none">
                <polyline points="2,15 6,9 10,12 14,5 18,8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-white font-bold text-xl">Trackr</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-white mb-2">{title}</h1>
            <p className="text-white/40">{subtitle}</p>
          </div>

          {children}
        </div>
      </div>
    </div>
  )
}
