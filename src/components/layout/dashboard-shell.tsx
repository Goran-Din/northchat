'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Softphone } from '@/components/softphone/softphone'
import type { User } from '@supabase/supabase-js'

interface DashboardShellProps {
  user: User
  profile: any
  children: React.ReactNode
}

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: '🏠' },
  { name: 'Contacts', href: '/dashboard/contacts', icon: '👥' },
  { name: 'Calls', href: '/dashboard/calls', icon: '📞' },
  { name: 'Messages', href: '/dashboard/messages', icon: '💬' },
  { name: 'Settings', href: '/dashboard/settings', icon: '⚙️' },
]

export function DashboardShell({ user, profile, children }: DashboardShellProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const supabase = createClient()

  // Load collapsed state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('sidebar-collapsed')
    if (stored !== null) {
      setCollapsed(stored === 'true')
    }
  }, [])

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('sidebar-collapsed', String(next))
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const tenantName = profile?.tenants?.name || 'NorthChat'
  const tenantId = profile?.tenant_id || ''
  const displayName = profile?.display_name || user.email
  const roleName = profile?.roles?.name || 'User'

  const sidebarWidth = collapsed ? 'w-16' : 'w-[260px]'
  const mainMargin = collapsed ? 'md:ml-16' : 'md:ml-[260px]'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full bg-white border-r border-gray-200 transition-all duration-200 ease-in-out
          ${sidebarWidth}
          md:translate-x-0
          ${mobileOpen ? 'translate-x-0 !w-[260px]' : '-translate-x-full'}
        `}
      >
        {/* Header with collapse toggle */}
        <div className="h-16 flex items-center justify-between border-b border-gray-200 px-3">
          {(!collapsed || mobileOpen) && (
            <div className="pl-2 min-w-0">
              <h1 className="text-lg font-bold text-gray-900 truncate">NorthChat</h1>
              <p className="text-xs text-gray-500 truncate">{tenantName}</p>
            </div>
          )}
          <button
            onClick={() => {
              if (window.innerWidth < 768) {
                setMobileOpen(false)
              } else {
                toggleCollapsed()
              }
            }}
            className={`p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0 ${collapsed && !mobileOpen ? 'mx-auto' : ''}`}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed && !mobileOpen ? (
              // Chevron right (expand)
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            ) : (
              // Chevron left (collapse) / X on mobile
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="mt-4 px-2 space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-100'
                } ${collapsed && !mobileOpen ? 'justify-center px-0' : ''}`}
                onClick={() => setMobileOpen(false)}
                title={collapsed && !mobileOpen ? item.name : undefined}
              >
                <span className="text-lg flex-shrink-0">{item.icon}</span>
                {(!collapsed || mobileOpen) && <span className="truncate">{item.name}</span>}
              </Link>
            )
          })}
        </nav>

        {/* User Info at Bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-gray-200">
          <div className={`flex items-center gap-3 ${collapsed && !mobileOpen ? 'justify-center' : ''}`}>
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-blue-700 text-sm font-medium">
                {displayName?.charAt(0)?.toUpperCase() || '?'}
              </span>
            </div>
            {(!collapsed || mobileOpen) && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {displayName}
                </p>
                <p className="text-xs text-gray-500">{roleName}</p>
              </div>
            )}
          </div>
          {(!collapsed || mobileOpen) ? (
            <button
              onClick={handleSignOut}
              className="mt-3 w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              Sign out
            </button>
          ) : (
            <button
              onClick={handleSignOut}
              className="mt-3 w-full flex justify-center py-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Sign out"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h5a2 2 0 012 2v1" />
              </svg>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className={`transition-all duration-200 ease-in-out ${mainMargin}`}>
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          <button
            className="md:hidden text-gray-500 hover:text-gray-700"
            onClick={() => setMobileOpen(true)}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 bg-green-500 rounded-full"></div>
            <span className="text-sm text-gray-600">Available</span>
          </div>
        </header>

        <main className="p-6">
          {children}
        </main>
      </div>

      {/* Floating Softphone */}
      {tenantId && <Softphone userId={user.id} tenantId={tenantId} />}
    </div>
  )
}
