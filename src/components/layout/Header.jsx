import { useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { format } from 'date-fns'

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/trades': 'Trade Log',
  '/analytics': 'Analytics',
  '/settings': 'Settings',
}

export default function Header({ onAddTrade, onMenuOpen }) {
  const location = useLocation()
  const { userProfile } = useAuth()
  const title = PAGE_TITLES[location.pathname] ?? 'Trackr'
  const today = format(new Date(), 'EEE, MMM d')

  return (
    <header className="h-14 md:h-16 border-b border-white/5 flex items-center justify-between px-4 md:px-6 sticky top-0 z-30 bg-navy-900/95 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        {/* Hamburger — mobile only */}
        <button
          onClick={onMenuOpen}
          className="lg:hidden text-white/50 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/5"
          aria-label="Open menu"
        >
          <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
        </button>

        <div>
          <h1 className="text-base md:text-xl font-bold text-white leading-none">{title}</h1>
          <p className="text-xs text-white/30 font-medium hidden sm:block">{today}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        {/* Markets — hidden on small screens */}
        {userProfile?.markets?.length > 0 && (
          <div className="hidden md:flex items-center gap-1.5">
            {userProfile.markets.slice(0, 3).map((m) => (
              <span key={m} className="badge-neutral capitalize text-xs">{m}</span>
            ))}
            {userProfile.markets.length > 3 && (
              <span className="badge-neutral text-xs">+{userProfile.markets.length - 3}</span>
            )}
          </div>
        )}

        <button
          onClick={onAddTrade}
          className="btn-primary flex items-center gap-1.5 text-sm py-2 px-3 md:px-4"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          <span className="hidden sm:inline">Add Trade</span>
          <span className="sm:hidden">Add</span>
        </button>
      </div>
    </header>
  )
}
