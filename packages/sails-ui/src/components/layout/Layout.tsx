import { Outlet } from 'react-router-dom'
import { TopNav } from './TopNav'
import { BottomNav } from './BottomNav'

export function Layout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />
      <main className="max-w-6xl mx-auto px-4 py-6 pb-20 md:pb-6">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
