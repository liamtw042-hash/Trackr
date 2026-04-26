import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import AddTradeModal from '../trades/AddTradeModal'

export default function Layout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showAddTrade, setShowAddTrade] = useState(false)
  const location = useLocation()

  // Close mobile sidebar on route change
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  // Close mobile sidebar on desktop resize
  useEffect(() => {
    const handler = () => { if (window.innerWidth >= 1024) setMobileOpen(false) }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const desktopMargin = sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-60'

  return (
    <div className="min-h-screen bg-navy-900 flex">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${desktopMargin}`}>
        <Header
          onAddTrade={() => setShowAddTrade(true)}
          onMenuOpen={() => setMobileOpen(true)}
        />

        <main className="flex-1 p-4 md:p-6 animate-fade-in">
          <Outlet context={{ showAddTrade, setShowAddTrade }} />
        </main>
      </div>

      <AddTradeModal
        isOpen={showAddTrade}
        onClose={() => setShowAddTrade(false)}
      />
    </div>
  )
}
