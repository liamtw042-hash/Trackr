import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTrades } from '../../context/TradeContext'

const NAV_ITEMS = [
  {
    path: '/', exact: true, label: 'Dashboard',
    icon: <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" /></svg>,
  },
  {
    path: '/trades', label: 'Trade Log',
    icon: <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm2 10a1 1 0 10-2 0v3a1 1 0 102 0v-3zm4-1a1 1 0 011 1v3a1 1 0 11-2 0v-3a1 1 0 011-1zm-2-8.586L13.414 6H10V3.414z" clipRule="evenodd" /></svg>,
  },
  {
    path: '/analytics', label: 'Analytics',
    icon: <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" /></svg>,
  },
  {
    path: '/weekly-review', label: 'Weekly Review',
    icon: <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg>,
  },
  {
    path: '/settings', label: 'Settings',
    icon: <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /></svg>,
  },
]

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }) {
  const { user, userProfile, logout } = useAuth()
  const { stats } = useTrades()
  const location = useLocation()
  const s = stats()

  const handleNavClick = () => {
    if (window.innerWidth < 1024) onMobileClose()
  }

  return (
    <aside className={`
      fixed top-0 left-0 h-screen z-40 flex flex-col
      border-r border-white/5 bg-navy-900
      transition-all duration-300 ease-in-out
      ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      ${collapsed ? 'lg:w-16' : 'lg:w-60'}
      w-64
    `}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/5">
        <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-accent" viewBox="0 0 20 20" fill="none">
            <polyline points="2,15 6,9 10,12 14,5 18,8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className={`${collapsed ? 'lg:hidden' : ''}`}>
          <span className="text-white font-bold text-lg tracking-tight">Trackr</span>
          <div className="text-xs text-white/30 font-medium -mt-0.5">Trading Journal</div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {/* Mobile close */}
          <button onClick={onMobileClose} className="lg:hidden text-white/30 hover:text-white/70 p-1">
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
          {/* Desktop collapse */}
          <button onClick={onToggle} className="hidden lg:block text-white/30 hover:text-white/70 p-1">
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              {collapsed
                ? <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                : <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
              }
            </svg>
          </button>
        </div>
      </div>

      {/* Quick stats strip */}
      <div className={`px-4 py-3 border-b border-white/5 ${collapsed ? 'lg:hidden' : ''}`}>
        <div className="flex items-center justify-between text-xs">
          <div className="text-center">
            <div className={`font-bold ${s.totalPnL >= 0 ? 'text-win' : 'text-loss'}`}>
              {s.totalPnL >= 0 ? '+' : ''}${s.totalPnL.toFixed(0)}
            </div>
            <div className="text-white/30 mt-0.5">P&L</div>
          </div>
          <div className="text-center">
            <div className="font-bold text-white">{s.winRate.toFixed(0)}%</div>
            <div className="text-white/30 mt-0.5">Win Rate</div>
          </div>
          <div className="text-center">
            <div className="font-bold text-white">{s.total}</div>
            <div className="text-white/30 mt-0.5">Trades</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto no-scrollbar">
        {NAV_ITEMS.map((item) => {
          const isActive = item.exact
            ? location.pathname === item.path
            : location.pathname.startsWith(item.path)
          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={handleNavClick}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm
                transition-all duration-200
                ${isActive
                  ? 'text-white bg-accent/10 border border-accent/20'
                  : 'text-white/50 hover:text-white hover:bg-white/5 border border-transparent'
                }
                ${collapsed ? 'lg:justify-center lg:px-2' : ''}
              `}
              title={collapsed ? item.label : undefined}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              <span className={collapsed ? 'lg:hidden' : ''}>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      {/* Balance */}
      {userProfile?.accountBalance && (
        <div className={`px-3 py-2 mx-2 mb-2 rounded-lg bg-white/3 border border-white/5 ${collapsed ? 'lg:hidden' : ''}`}>
          <div className="text-xs text-white/30 font-medium">Account Balance</div>
          <div className="text-sm font-bold text-win mt-0.5">
            ${Number(userProfile.accountBalance).toLocaleString()}
          </div>
        </div>
      )}

      {/* User */}
      <div className="border-t border-white/5 p-3">
        <div className={`flex items-center gap-3 ${collapsed ? 'lg:justify-center' : ''}`}>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-win flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {user?.displayName?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className={`flex-1 min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
            <div className="text-sm font-medium text-white truncate">
              {userProfile?.displayName ?? user?.displayName ?? 'Trader'}
            </div>
            <div className="text-xs text-white/30 truncate">{user?.email}</div>
          </div>
          <button
            onClick={logout}
            className={`text-white/30 hover:text-white/70 transition-colors p-1 rounded ${collapsed ? 'lg:hidden' : ''}`}
            title="Sign out"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  )
}
