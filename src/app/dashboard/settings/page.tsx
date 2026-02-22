'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ── Constants ──────────────────────────────────────────────

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

const RING_TIMEOUT_OPTIONS = [10, 15, 20, 25, 30]
const FALLBACK_TIMEOUT_OPTIONS = [15, 20, 25, 30, 35, 40]

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

// ── Types ──────────────────────────────────────────────────

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

interface CallForwarding {
  enabled: boolean
  fallback_number: string
  ring_timeout: number
  fallback_timeout: number
}

interface VoicemailMessages {
  after_hours: string
  no_answer: string
  voicemail_prompt: string
}

interface VoicemailSettings {
  enabled: boolean
  voice: string
  messages: VoicemailMessages
}

// ── Defaults ───────────────────────────────────────────────

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

function getDefaultCallForwarding(): CallForwarding {
  return {
    enabled: false,
    fallback_number: '',
    ring_timeout: 20,
    fallback_timeout: 25,
  }
}

function getDefaultVoicemail(): VoicemailSettings {
  return {
    enabled: true,
    voice: 'Polly.Joanna',
    messages: {
      after_hours: 'Thank you for calling Sunset Services. We are currently closed. Our business hours are Monday through Friday, 8 AM to 5 PM Central Time.',
      no_answer: 'All of our team members are currently busy. Please leave a message and we will return your call as soon as possible.',
      voicemail_prompt: 'Please leave your name, number, and a brief message after the tone.',
    },
  }
}

const VOICE_OPTIONS = [
  { group: 'Female', voices: [
    { value: 'Polly.Joanna', label: 'Joanna', desc: 'US English (most popular)' },
    { value: 'Polly.Kendra', label: 'Kendra', desc: 'US English' },
    { value: 'Polly.Ruth', label: 'Ruth', desc: 'US English (neural)' },
    { value: 'Polly.Amy', label: 'Amy', desc: 'British English' },
    { value: 'Polly.Salli', label: 'Salli', desc: 'US English' },
  ]},
  { group: 'Male', voices: [
    { value: 'Polly.Matthew', label: 'Matthew', desc: 'US English' },
    { value: 'Polly.Joey', label: 'Joey', desc: 'US English' },
    { value: 'Polly.Stephen', label: 'Stephen', desc: 'US English (neural)' },
  ]},
]

const VM_MESSAGE_FIELDS: { key: keyof VoicemailMessages; title: string; description: string }[] = [
  {
    key: 'after_hours',
    title: 'After Hours Greeting',
    description: 'Played when someone calls outside your business hours',
  },
  {
    key: 'no_answer',
    title: 'No Answer Message',
    description: 'Played during business hours when no agent picks up',
  },
  {
    key: 'voicemail_prompt',
    title: 'Voicemail Prompt',
    description: 'Played right before the recording tone in all scenarios',
  },
]

const TABS = [
  { key: 'business-hours', label: 'Business Hours' },
  { key: 'call-forwarding', label: 'Call Forwarding' },
  { key: 'voicemail', label: 'Voicemail' },
]

// ── Helper: format phone for display ───────────────────────

function formatPhoneDisplay(value: string): string {
  let digits = value.replace(/\D/g, '')
  // Strip leading country code 1 if present (e.g. +16309469321 → 6309469321)
  if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.slice(1)
  }
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`
}

// ── Component ──────────────────────────────────────────────

export default function SettingsPage() {
  // Business Hours state
  const [businessHours, setBusinessHours] = useState<BusinessHours>(getDefaultBusinessHours())
  const [bhLoading, setBhLoading] = useState(true)
  const [bhSaving, setBhSaving] = useState(false)
  const [bhSaveStatus, setBhSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [bhErrorMessage, setBhErrorMessage] = useState('')

  // Call Forwarding state
  const [callForwarding, setCallForwarding] = useState<CallForwarding>(getDefaultCallForwarding())
  const [cfLoading, setCfLoading] = useState(false)
  const [cfLoaded, setCfLoaded] = useState(false)
  const [cfSaving, setCfSaving] = useState(false)
  const [cfSaveStatus, setCfSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [cfErrorMessage, setCfErrorMessage] = useState('')

  // Voicemail state
  const [voicemail, setVoicemail] = useState<VoicemailSettings>(getDefaultVoicemail())
  const [vmLoading, setVmLoading] = useState(false)
  const [vmLoaded, setVmLoaded] = useState(false)
  const [vmSaving, setVmSaving] = useState(false)
  const [vmSaveStatus, setVmSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [vmErrorMessage, setVmErrorMessage] = useState('')
  const [previewingKey, setPreviewingKey] = useState<string | null>(null)
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null)

  const [activeTab, setActiveTab] = useState('business-hours')

  // ── Fetch business hours ──

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
      setBhLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBusinessHours()
  }, [fetchBusinessHours])

  // ── Fetch call forwarding (on tab switch) ──

  const fetchCallForwarding = useCallback(async () => {
    if (cfLoaded) return
    setCfLoading(true)
    try {
      const res = await fetch('/api/settings/call-forwarding')
      if (res.ok) {
        const data = await res.json()
        if (data.call_forwarding) {
          setCallForwarding(data.call_forwarding)
        }
      }
    } catch (err) {
      console.error('Failed to fetch call forwarding:', err)
    } finally {
      setCfLoading(false)
      setCfLoaded(true)
    }
  }, [cfLoaded])

  useEffect(() => {
    if (activeTab === 'call-forwarding') {
      fetchCallForwarding()
    }
  }, [activeTab, fetchCallForwarding])

  // ── Save business hours ──

  const handleSaveBh = async () => {
    setBhSaving(true)
    setBhSaveStatus('idle')
    setBhErrorMessage('')

    try {
      const res = await fetch('/api/settings/business-hours', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_hours: businessHours }),
      })

      if (res.ok) {
        setBhSaveStatus('success')
        setTimeout(() => setBhSaveStatus('idle'), 3000)
      } else {
        const data = await res.json()
        setBhErrorMessage(data.error || 'Failed to save')
        setBhSaveStatus('error')
      }
    } catch (err) {
      console.error('Failed to save business hours:', err)
      setBhErrorMessage('Network error')
      setBhSaveStatus('error')
    } finally {
      setBhSaving(false)
    }
  }

  // ── Fetch voicemail (on tab switch) ──

  const fetchVoicemail = useCallback(async () => {
    if (vmLoaded) return
    setVmLoading(true)
    try {
      const res = await fetch('/api/settings/voicemail')
      if (res.ok) {
        const data = await res.json()
        if (data.voicemail) {
          // Handle old format from API (already mapped server-side, but be safe)
          const vm = data.voicemail
          if (vm.messages) {
            setVoicemail(vm)
          } else if (vm.greeting_message) {
            setVoicemail({
              enabled: vm.enabled ?? true,
              voice: vm.voice || 'Polly.Joanna',
              messages: {
                after_hours: vm.greeting_message,
                no_answer: getDefaultVoicemail().messages.no_answer,
                voicemail_prompt: getDefaultVoicemail().messages.voicemail_prompt,
              },
            })
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch voicemail settings:', err)
    } finally {
      setVmLoading(false)
      setVmLoaded(true)
    }
  }, [vmLoaded])

  useEffect(() => {
    if (activeTab === 'voicemail') {
      fetchVoicemail()
    }
  }, [activeTab, fetchVoicemail])

  // ── Save call forwarding ──

  const handleSaveCf = async () => {
    setCfSaving(true)
    setCfSaveStatus('idle')
    setCfErrorMessage('')

    try {
      const res = await fetch('/api/settings/call-forwarding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ call_forwarding: callForwarding }),
      })

      if (res.ok) {
        setCfSaveStatus('success')
        setTimeout(() => setCfSaveStatus('idle'), 3000)
      } else {
        const data = await res.json()
        setCfErrorMessage(data.error || 'Failed to save')
        setCfSaveStatus('error')
      }
    } catch (err) {
      console.error('Failed to save call forwarding:', err)
      setCfErrorMessage('Network error')
      setCfSaveStatus('error')
    } finally {
      setCfSaving(false)
    }
  }

  // ── Save voicemail ──

  const handleSaveVm = async () => {
    setVmSaving(true)
    setVmSaveStatus('idle')
    setVmErrorMessage('')

    try {
      const res = await fetch('/api/settings/voicemail', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voicemail }),
      })

      if (res.ok) {
        setVmSaveStatus('success')
        setTimeout(() => setVmSaveStatus('idle'), 3000)
      } else {
        const data = await res.json()
        setVmErrorMessage(data.error || 'Failed to save')
        setVmSaveStatus('error')
      }
    } catch (err) {
      console.error('Failed to save voicemail settings:', err)
      setVmErrorMessage('Network error')
      setVmSaveStatus('error')
    } finally {
      setVmSaving(false)
    }
  }

  // ── Business hours helpers ──

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

  // ── Call forwarding helpers ──

  const handlePhoneChange = (value: string) => {
    // Strip to digits only, max 10
    const digits = value.replace(/\D/g, '').slice(0, 10)
    setCallForwarding(prev => ({ ...prev, fallback_number: digits }))
  }

  // ── Voicemail preview helpers ──

  const stopPreview = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    speechRef.current = null
    setPreviewingKey(null)
  }, [])

  const togglePreview = useCallback((key: string, text: string) => {
    if (previewingKey === key) {
      stopPreview()
      return
    }
    stopPreview()
    if (typeof window === 'undefined' || !window.speechSynthesis || !text.trim()) return

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.95
    utterance.onend = () => {
      speechRef.current = null
      setPreviewingKey(null)
    }
    utterance.onerror = () => {
      speechRef.current = null
      setPreviewingKey(null)
    }
    speechRef.current = utterance
    setPreviewingKey(key)
    window.speechSynthesis.speak(utterance)
  }, [previewingKey, stopPreview])

  // Stop preview on tab switch or unmount
  useEffect(() => {
    return () => stopPreview()
  }, [activeTab, stopPreview])

  // ── Loading state ──

  if (bhLoading) {
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
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ═══════════════════════════════════════════════════════
          BUSINESS HOURS TAB
          ═══════════════════════════════════════════════════════ */}
      {activeTab === 'business-hours' && (
        <>
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
                        <span className={`text-sm font-medium w-24 flex-shrink-0 ${
                          schedule.open ? 'text-gray-900' : 'text-gray-400'
                        }`}>
                          {day.label}
                        </span>

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
              onClick={handleSaveBh}
              disabled={bhSaving}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {bhSaving ? 'Saving...' : 'Save Changes'}
            </button>
            {bhSaveStatus === 'success' && (
              <span className="text-sm text-green-600 font-medium">Settings saved successfully</span>
            )}
            {bhSaveStatus === 'error' && (
              <span className="text-sm text-red-600 font-medium">{bhErrorMessage || 'Failed to save'}</span>
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

      {/* ═══════════════════════════════════════════════════════
          CALL FORWARDING TAB
          ═══════════════════════════════════════════════════════ */}
      {activeTab === 'call-forwarding' && (
        <>
          {cfLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-gray-500 text-sm">Loading call forwarding settings...</div>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                {/* Enable toggle */}
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Call Forwarding</h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Forward unanswered calls to a backup phone number
                    </p>
                  </div>
                  <button
                    onClick={() => setCallForwarding(prev => ({ ...prev, enabled: !prev.enabled }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      callForwarding.enabled ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        callForwarding.enabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {callForwarding.enabled && (
                  <div className="space-y-5">
                    {/* Fallback phone number */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Fallback Phone Number
                      </label>
                      <p className="text-xs text-gray-400 mb-2">
                        The number calls will forward to when no agent answers
                      </p>
                      <input
                        type="tel"
                        value={formatPhoneDisplay(callForwarding.fallback_number)}
                        onChange={(e) => handlePhoneChange(e.target.value)}
                        placeholder="(555) 123-4567"
                        className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    {/* Ring timeout */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Ring Timeout
                      </label>
                      <p className="text-xs text-gray-400 mb-2">
                        How long to ring browser agents before forwarding
                      </p>
                      <select
                        value={callForwarding.ring_timeout}
                        onChange={(e) => setCallForwarding(prev => ({ ...prev, ring_timeout: Number(e.target.value) }))}
                        className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        {RING_TIMEOUT_OPTIONS.map(sec => (
                          <option key={sec} value={sec}>{sec} seconds{sec === 20 ? ' (default)' : ''}</option>
                        ))}
                      </select>
                    </div>

                    {/* Fallback timeout */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Fallback Timeout
                      </label>
                      <p className="text-xs text-gray-400 mb-2">
                        How long to ring the fallback number before going to voicemail
                      </p>
                      <select
                        value={callForwarding.fallback_timeout}
                        onChange={(e) => setCallForwarding(prev => ({ ...prev, fallback_timeout: Number(e.target.value) }))}
                        className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        {FALLBACK_TIMEOUT_OPTIONS.map(sec => (
                          <option key={sec} value={sec}>{sec} seconds{sec === 25 ? ' (default)' : ''}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Save button */}
              <div className="mt-6 flex items-center gap-3">
                <button
                  onClick={handleSaveCf}
                  disabled={cfSaving}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {cfSaving ? 'Saving...' : 'Save Changes'}
                </button>
                {cfSaveStatus === 'success' && (
                  <span className="text-sm text-green-600 font-medium">Settings saved successfully</span>
                )}
                {cfSaveStatus === 'error' && (
                  <span className="text-sm text-red-600 font-medium">{cfErrorMessage || 'Failed to save'}</span>
                )}
              </div>

              {/* Help section */}
              <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-blue-900 mb-2">How call forwarding works</h3>
                <ul className="text-sm text-blue-800 space-y-1.5">
                  <li>
                    <strong>Step 1</strong> — When an incoming call arrives, it rings all available browser
                    agents for the duration of the <strong>ring timeout</strong>.
                  </li>
                  <li>
                    <strong>Step 2</strong> — If no agent answers, the call forwards to the
                    <strong> fallback phone number</strong> and rings for the <strong>fallback timeout</strong>.
                  </li>
                  <li>
                    <strong>Step 3</strong> — If the fallback number doesn&apos;t answer either, the caller is
                    sent to voicemail.
                  </li>
                  <li>
                    <strong>When disabled</strong> — unanswered calls skip the forwarding step and go directly
                    to voicemail.
                  </li>
                </ul>
              </div>
            </>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════
          VOICEMAIL TAB
          ═══════════════════════════════════════════════════════ */}
      {activeTab === 'voicemail' && (
        <>
          {vmLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-gray-500 text-sm">Loading voicemail settings...</div>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                {/* Enable toggle */}
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Voicemail</h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Record voicemail when calls go unanswered
                    </p>
                  </div>
                  <button
                    onClick={() => setVoicemail(prev => ({ ...prev, enabled: !prev.enabled }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      voicemail.enabled ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        voicemail.enabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {voicemail.enabled && (
                  <div className="space-y-6">
                    {/* Voice selection */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Voice
                      </label>
                      <p className="text-xs text-gray-400 mb-2">
                        Choose the voice that reads your messages to callers
                      </p>
                      <select
                        value={voicemail.voice}
                        onChange={(e) => setVoicemail(prev => ({ ...prev, voice: e.target.value }))}
                        className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        {VOICE_OPTIONS.map(group => (
                          <optgroup key={group.group} label={group.group}>
                            {group.voices.map(v => (
                              <option key={v.value} value={v.value}>
                                {v.label} — {v.desc}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    {/* Message textareas */}
                    {VM_MESSAGE_FIELDS.map(field => (
                      <div key={field.key}>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-sm font-medium text-gray-700">
                            {field.title}
                          </label>
                          <button
                            onClick={() => togglePreview(field.key, voicemail.messages[field.key])}
                            className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition-colors ${
                              previewingKey === field.key
                                ? 'bg-blue-100 text-blue-700'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              {previewingKey === field.key ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10h6v4H9z" />
                              ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 6v12m0-12l-4 4m4-4l4 4" />
                              )}
                            </svg>
                            {previewingKey === field.key ? 'Stop' : 'Preview'}
                          </button>
                        </div>
                        <p className="text-xs text-gray-400 mb-2">
                          {field.description}
                        </p>
                        <textarea
                          value={voicemail.messages[field.key]}
                          onChange={(e) => {
                            if (e.target.value.length <= 500) {
                              setVoicemail(prev => ({
                                ...prev,
                                messages: { ...prev.messages, [field.key]: e.target.value },
                              }))
                            }
                          }}
                          rows={4}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                          placeholder={`Enter ${field.title.toLowerCase()}...`}
                        />
                        <p className="mt-1.5 text-xs text-gray-400">
                          {voicemail.messages[field.key].length}/500 characters
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Save button */}
              <div className="mt-6 flex items-center gap-3">
                <button
                  onClick={handleSaveVm}
                  disabled={vmSaving}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {vmSaving ? 'Saving...' : 'Save Changes'}
                </button>
                {vmSaveStatus === 'success' && (
                  <span className="text-sm text-green-600 font-medium">Settings saved successfully</span>
                )}
                {vmSaveStatus === 'error' && (
                  <span className="text-sm text-red-600 font-medium">{vmErrorMessage || 'Failed to save'}</span>
                )}
              </div>

              {/* Help section */}
              <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-blue-900 mb-2">How voicemail messages work</h3>
                <p className="text-sm text-blue-800 mb-2">
                  When a caller reaches voicemail, they hear messages in this order:
                </p>
                <ol className="text-sm text-blue-800 space-y-1.5 list-decimal list-inside">
                  <li>
                    <strong>After Hours Greeting</strong> OR <strong>No Answer Message</strong> — depending
                    on whether the call arrived outside business hours or during hours when no one picked up.
                  </li>
                  <li>
                    <strong>Voicemail Prompt</strong> — always played before the recording tone.
                  </li>
                  <li>
                    Recording starts automatically after the tone.
                  </li>
                </ol>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
