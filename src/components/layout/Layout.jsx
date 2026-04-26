import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import AddTradeModal from '../trades/AddTradeModal'

export default function Layout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showAddTrade, setShowAddTrade] = useState(false)

  const sidebarWidth = sidebarCollapsed ? 'ml-16' : 'ml-60'

  return (
    <div className="min-h-screen bg-navy-900 flex">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
      />

      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${sidebarWidth}`}>
        <Header onAddTrade={() => setShowAddTrade(true)} />

        <main className="flex-1 p-6 animate-fade-in">
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
