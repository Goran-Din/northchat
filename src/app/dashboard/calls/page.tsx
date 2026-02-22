'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Phone, ArrowDownLeft, ArrowUpRight, Search, RefreshCw, MessageSquare, Clock, Voicemail } from 'lucide-react'
import { useSoftphone } from '@/contexts/SoftphoneContext'
import { ClickablePhone } from '@/components/ui/clickable-phone'

interface CallRecord {
  id: string
  direction: string
  from_number: string
  to_number: string
  status: string
  duration_seconds: number | null
  started_at: string
  created_at: string
  contact_name: string | null
}

const LIMIT = 50

export default function CallsPage() {
  const router = useRouter()
  const { triggerCall } = useSoftphone()

  const [calls, setCalls] = useState<CallRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [offset, setOffset] = useState(0)

  // Filters
  const [direction, setDirection] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const refreshTimer = useRef<NodeJS.Timeout | null>(null)

  const fetchCalls = useCallback(async (newOffset: number, append: boolean) => {
    if (append) setLoadingMore(true)
    else setLoading(true)

    try {
      const params = new URLSearchParams()
      if (direction) params.set('direction', direction)
      if (status) params.set('status', status)
      if (search) params.set('search', search)
      if (fromDate) params.set('from', fromDate)
      if (toDate) params.set('to', toDate)
      params.set('limit', String(LIMIT))
      params.set('offset', String(newOffset))

      const res = await fetch(`/api/calls?${params.toString()}`)
      const data = await res.json()

      if (data.calls) {
        setCalls(prev => append ? [...prev, ...data.calls] : data.calls)
        setTotal(data.total ?? 0)
        setOffset(newOffset)
      }
    } catch (err) {
      console.error('Failed to fetch calls:', err)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [direction, status, search, fromDate, toDate])

  // Fetch on filter change
  useEffect(() => {
    fetchCalls(0, false)
  }, [fetchCalls])

  // Auto-refresh every 30s
  useEffect(() => {
    refreshTimer.current = setInterval(() => {
      fetchCalls(0, false)
    }, 30000)
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current)
    }
  }, [fetchCalls])

  function handleLoadMore() {
    fetchCalls(offset + LIMIT, true)
  }

  function handleCallBack(phoneNumber: string) {
    triggerCall(phoneNumber)
  }

  function handleSms(phoneNumber: string) {
    router.push(`/dashboard/messages?phone=${encodeURIComponent(phoneNumber)}`)
  }

  function formatPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '')
    if (digits.length === 11 && digits.startsWith('1')) {
      return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
    }
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    }
    return phone
  }

  function formatDuration(seconds: number | null): string {
    if (!seconds || seconds <= 0) return '0:00'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  function formatDateTime(dateStr: string): string {
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffH = diffMs / (1000 * 60 * 60)

    if (diffH < 1) return `${Math.max(1, Math.round(diffH * 60))}m ago`
    if (diffH < 24) return `${Math.round(diffH)}h ago`
    if (diffH < 48) return 'Yesterday'
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  function getStatusBadge(s: string) {
    switch (s) {
      case 'completed':
        return { bg: 'bg-green-50 text-green-700 border-green-200', label: 'Completed' }
      case 'missed':
        return { bg: 'bg-red-50 text-red-700 border-red-200', label: 'Missed' }
      case 'voicemail':
        return { bg: 'bg-orange-50 text-orange-700 border-orange-200', label: 'Voicemail' }
      default:
        return { bg: 'bg-gray-50 text-gray-600 border-gray-200', label: s || 'Unknown' }
    }
  }

  function getCallPhone(call: CallRecord): string {
    return call.direction === 'inbound' ? call.from_number : call.to_number
  }

  const directionFilters = [
    { value: '', label: 'All' },
    { value: 'inbound', label: 'Inbound' },
    { value: 'outbound', label: 'Outbound' },
  ]

  const statusFilters = [
    { value: '', label: 'All' },
    { value: 'completed', label: 'Completed' },
    { value: 'missed', label: 'Missed' },
    { value: 'voicemail', label: 'Voicemail' },
  ]

  const hasMore = calls.length < total

  return (
    <div className="h-[calc(100vh-64px)] bg-white flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-900">Calls</h2>
          <span className="text-sm text-gray-400">({total})</span>
        </div>
        <button
          onClick={() => fetchCalls(0, false)}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="p-4 border-b border-gray-200 space-y-3">
        {/* Direction filter pills */}
        <div className="flex items-center gap-4">
          <span className="text-xs font-semibold uppercase text-gray-400 w-16 shrink-0">Direction</span>
          <div className="flex gap-1.5">
            {directionFilters.map((f) => (
              <button
                key={f.value}
                onClick={() => setDirection(f.value)}
                className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                  direction === f.value
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Status filter pills */}
        <div className="flex items-center gap-4">
          <span className="text-xs font-semibold uppercase text-gray-400 w-16 shrink-0">Status</span>
          <div className="flex gap-1.5">
            {statusFilters.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatus(f.value)}
                className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                  status === f.value
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search and date range */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search phone number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent border-none outline-none text-sm text-gray-900 placeholder-gray-400"
            />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-xs text-gray-400">From</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-400">To</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Call list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading...</div>
        ) : calls.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 px-4 text-center">
            <Phone className="w-10 h-10 mb-2" />
            <p className="text-sm">No calls found</p>
            <p className="text-xs mt-1">Call records will appear here once calls are made or received.</p>
          </div>
        ) : (
          <>
            {calls.map((call) => {
              const phone = getCallPhone(call)
              const badge = getStatusBadge(call.status)
              const isInbound = call.direction === 'inbound'

              return (
                <div
                  key={call.id}
                  className="flex items-center gap-4 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  {/* Direction icon */}
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      isInbound ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'
                    }`}
                  >
                    {isInbound ? (
                      <ArrowDownLeft className="w-4 h-4" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4" />
                    )}
                  </div>

                  {/* Contact / phone info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 truncate">
                        {call.contact_name || <ClickablePhone phoneNumber={phone} />}
                      </span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${badge.bg}`}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                      {call.contact_name && (
                        <ClickablePhone phoneNumber={phone} />
                      )}
                      <span>{isInbound ? 'Inbound' : 'Outbound'}</span>
                      {call.duration_seconds != null && call.duration_seconds > 0 && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-0.5">
                            <Clock className="w-3 h-3" />
                            {formatDuration(call.duration_seconds)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Time */}
                  <div className="text-right shrink-0">
                    <div className="text-xs text-gray-500">{formatDateTime(call.started_at || call.created_at)}</div>
                    <div className="text-[11px] text-gray-400">{formatTime(call.started_at || call.created_at)}</div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleCallBack(phone)}
                      className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      title="Call back"
                    >
                      <Phone className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleSms(phone)}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Send SMS"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            })}

            {/* Load more */}
            {hasMore && (
              <div className="p-4 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors"
                >
                  {loadingMore ? 'Loading...' : `Load more (${calls.length} of ${total})`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
