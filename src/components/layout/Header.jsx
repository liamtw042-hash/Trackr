import { useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { format } from 'date-fns'

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/trades': 'Trade Log',
  '/analytics': 'Analytics',
  '/settings': 'Settings',
}

export default function Header({ onAddTrade }) {
  const location = useLocation()
  const { userProfile } = useAuth()
  const title = PAGE_TITLES[location.pathname] ?? 'Trackr'
  const today = format(new Date(), 'EEEE, MMMM d')

  return (
    <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 sticky top-0 z-30 bg-navy-900/95 backdrop-blur-sm">
      <div>
        <h1 className="text-xl font-bold text-white">{title}</h1>
        <p className="text-xs text-white/30 font-medium">{today}</p>
      </div>

      <div className="flex items-center gap-3">
        {/* Markets badge */}
        {userProfile?.markets?.length > 0 && (
          <div className="hidden md:flex items-center gap-1.5">
            {userProfile.markets.slice(0, 3).map((m) => (
              <span key={m} className="badge-neutral capitalize">{m}</span>
            ))}
            {userProfile.markets.length > 3 && (
              <span className="badge-neutral">+{userProfile.markets.length - 3}</span>
            )}
          </div>
        )}

        {/* Add trade button */}
        <button
          onClick={onAddTrade}
          className="btn-primary flex items-center gap-2 text-sm py-2 px-4"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          Add Trade
        </button>
      </div>
    </header>
  )
}
