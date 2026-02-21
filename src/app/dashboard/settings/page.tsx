'use client'

import { useState, useEffect, useCallback } from 'react'

const US_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
]

const DAYS_OF_WEEK = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
]

// Generate time options in 30-min increments
function generateTimeOptions() {
  const options: { value: string; label: string }[] = []
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const value = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
      const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
      const ampm = h < 12 ? 'AM' : 'PM'
      const label = `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`
      options.push({ value, label })
    }
  }
  return options
}

const TIME_OPTIONS = generateTimeOptions()

interface DaySchedule {
  open: boolean
  start: string
  end: string
}

interface BusinessHours {
  enabled: boolean
  timezone: string
  schedule: Record<string, DaySchedule>
}

const DEFAULT_DAY: DaySchedule = { open: true, start: '09:00', end: '17:00' }
const DEFAULT_CLOSED: DaySchedule = { open: false, start: '09:00', end: '17:00' }

function getDefaultBusinessHours(): BusinessHours {
  return {
    enabled: false,
    timezone: 'America/New_York',
    schedule: {
      monday: { ...DEFAULT_DAY },
      tuesday: { ...DEFAULT_DAY },
      wednesday: { ...DEFAULT_DAY },
      thursday: { ...DEFAULT_DAY },
      friday: { ...DEFAULT_DAY },
      saturday: { ...DEFAULT_CLOSED },
      sunday: { ...DEFAULT_CLOSED },
    },
  }
}

const TABS = [
  { key: 'business-hours', label: 'Business Hours', active: true },
  { key: 'call-forwarding', label: 'Call Forwarding', active: false },
  { key: 'voicemail', label: 'Voicemail', active: false },
]

export default function SettingsPage() {
  const [businessHours, setBusinessHours] = useState<BusinessHours>(getDefaultBusinessHours())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [activeTab, setActiveTab] = useState('business-hours')

  const fetchBusinessHours = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/business-hours')
      if (res.ok) {
        const data = await res.json()
        if (data.business_hours) {
          setBusinessHours(data.business_hours)
        }
      }
    } catch (err) {
      console.error('Failed to fetch business hours:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBusinessHours()
  }, [fetchBusinessHours])

  const handleSave = async () => {
    setSaving(true)
    setSaveStatus('idle')
    setErrorMessage('')

    try {
      const res = await fetch('/api/settings/business-hours', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_hours: businessHours }),
      })

      if (res.ok) {
        setSaveStatus('success')
        setTimeout(() => setSaveStatus('idle'), 3000)
      } else {
        const data = await res.json()
        setErrorMessage(data.error || 'Failed to save')
        setSaveStatus('error')
      }
    } catch (err) {
      console.error('Failed to save business hours:', err)
      setErrorMessage('Network error')
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  const updateDay = (dayKey: string, field: keyof DaySchedule, value: string | boolean) => {
    setBusinessHours(prev => ({
      ...prev,
      schedule: {
        ...prev.schedule,
        [dayKey]: {
          ...prev.schedule[dayKey],
          [field]: value,
        },
      },
    }))
  }

  const applyMondayToWeekdays = () => {
    const monday = businessHours.schedule.monday
    setBusinessHours(prev => ({
      ...prev,
      schedule: {
        ...prev.schedule,
        tuesday: { ...monday },
        wednesday: { ...monday },
        thursday: { ...monday },
        friday: { ...monday },
      },
    }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-500 text-sm">Loading settings...</div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your phone system configuration</p>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => tab.active && setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : tab.active
                    ? 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    : 'border-transparent text-gray-300 cursor-not-allowed'
              }`}
              disabled={!tab.active}
            >
              {tab.label}
              {!tab.active && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">
                  Soon
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'business-hours' && (
        <>
          {/* Business Hours card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            {/* Enable toggle */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Business Hours</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  When disabled, calls ring agents at any time
                </p>
              </div>
              <button
                onClick={() => setBusinessHours(prev => ({ ...prev, enabled: !prev.enabled }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  businessHours.enabled ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    businessHours.enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {businessHours.enabled && (
              <>
                {/* Timezone */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Timezone
                  </label>
                  <select
                    value={businessHours.timezone}
                    onChange={(e) => setBusinessHours(prev => ({ ...prev, timezone: e.target.value }))}
                    className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {US_TIMEZONES.map(tz => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                </div>

                {/* Apply Monday shortcut */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-gray-700">Weekly Schedule</h3>
                  <button
                    onClick={applyMondayToWeekdays}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Apply Monday to all weekdays
                  </button>
                </div>

                {/* Weekly schedule grid */}
                <div className="space-y-3">
                  {DAYS_OF_WEEK.map(day => {
                    const schedule = businessHours.schedule[day.key]
                    return (
                      <div
                        key={day.key}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                          schedule.open
                            ? 'border-gray-200 bg-white'
                            : 'border-gray-100 bg-gray-50'
                        }`}
                      >
                        {/* Day label */}
                        <span className={`text-sm font-medium w-24 flex-shrink-0 ${
                          schedule.open ? 'text-gray-900' : 'text-gray-400'
                        }`}>
                          {day.label}
                        </span>

                        {/* Open/Closed toggle */}
                        <button
                          onClick={() => updateDay(day.key, 'open', !schedule.open)}
                          className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${
                            schedule.open
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-200 text-gray-500'
                          }`}
                        >
                          {schedule.open ? 'Open' : 'Closed'}
                        </button>

                        {/* Time dropdowns */}
                        {schedule.open && (
                          <div className="flex items-center gap-2 ml-auto">
                            <select
                              value={schedule.start}
                              onChange={(e) => updateDay(day.key, 'start', e.target.value)}
                              className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              {TIME_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                            <span className="text-gray-400 text-xs">to</span>
                            <select
                              value={schedule.end}
                              onChange={(e) => updateDay(day.key, 'end', e.target.value)}
                              className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              {TIME_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {/* Save button */}
          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            {saveStatus === 'success' && (
              <span className="text-sm text-green-600 font-medium">Settings saved successfully</span>
            )}
            {saveStatus === 'error' && (
              <span className="text-sm text-red-600 font-medium">{errorMessage || 'Failed to save'}</span>
            )}
          </div>

          {/* Help section */}
          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">How business hours work</h3>
            <ul className="text-sm text-blue-800 space-y-1.5">
              <li>
                <strong>When enabled</strong> — inbound calls outside of your configured hours are sent
                directly to voicemail instead of ringing agents.
              </li>
              <li>
                <strong>When disabled</strong> — calls ring available agents at any time, 24/7.
              </li>
              <li>
                <strong>Timezone</strong> — all schedule times are evaluated in the timezone you select.
                Make sure it matches your primary office location.
              </li>
              <li>
                <strong>Closed days</strong> — marking a day as &quot;Closed&quot; sends all calls that day
                straight to voicemail.
              </li>
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
