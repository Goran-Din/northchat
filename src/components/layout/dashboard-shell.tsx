'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Softphone } from '@/components/softphone/softphone'
import { useSoftphone } from '@/contexts/SoftphoneContext'
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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { isSoftphoneOpen: phoneOpen, setIsSoftphoneOpen: setPhoneOpen } = useSoftphone()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const tenantName = profile?.tenants?.name || 'NorthChat'
  const tenantId = profile?.tenant_id || ''
  const displayName = profile?.display_name || user.email
  const roleName = profile?.roles?.name || 'User'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Tenant Header */}
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <div>
            <h1 className="text-lg font-bold text-gray-900">NorthChat</h1>
            <p className="text-xs text-gray-500">{tenantName}</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="mt-4 px-3 space-y-1">
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
                }`}
                onClick={() => setSidebarOpen(false)}
              >
                <span className="text-lg">{item.icon}</span>
                {item.name}
              </Link>
            )
          })}
        </nav>

        {/* User Info at Bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <span className="text-blue-700 text-sm font-medium">
                {displayName?.charAt(0)?.toUpperCase() || '?'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {displayName}
              </p>
              <p className="text-xs text-gray-500">{roleName}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="mt-3 w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="md:ml-64">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          <button
            className="md:hidden text-gray-500 hover:text-gray-700"
            onClick={() => setSidebarOpen(true)}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="flex items-center gap-4">
            {/* Agent Status Indicator */}
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-green-500 rounded-full"></div>
              <span className="text-sm text-gray-600">Available</span>
            </div>

            {/* Phone toggle button */}
            <button
              onClick={() => setPhoneOpen(!phoneOpen)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                phoneOpen 
                  ? 'bg-blue-50 text-blue-700' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              📞 {phoneOpen ? 'Hide Phone' : 'Show Phone'}
            </button>
          </div>
        </header>

        {/* Content area with optional phone panel */}
        <div className="flex">
          {/* Page Content */}
          <main className="flex-1 p-6">
            {children}
          </main>

          {/* Softphone Panel (right side) */}
          {phoneOpen && tenantId && (
            <aside className="hidden lg:block p-4 border-l border-gray-200 bg-gray-50">
              <Softphone userId={user.id} tenantId={tenantId} />
            </aside>
          )}
        </div>
      </div>
    </div>
  )
}
