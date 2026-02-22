'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Device, Call } from '@twilio/voice-sdk'
import { useSoftphone } from '@/contexts/SoftphoneContext'

interface SoftphoneProps {
  userId: string
  tenantId: string
}

// Generate a WAV ringtone as a data URI (two-tone phone ring)
function generateRingtoneWav(): string {
  const sampleRate = 44100
  const ringDuration = 2.0
  const silenceDuration = 2.0
  const cycles = 3
  const totalSamples = Math.floor(sampleRate * (ringDuration + silenceDuration) * cycles)

  const buffer = new ArrayBuffer(44 + totalSamples * 2)
  const view = new DataView(buffer)

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i))
    }
  }
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + totalSamples * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, totalSamples * 2, true)

  const ringSamples = Math.floor(sampleRate * ringDuration)
  const cycleSamples = Math.floor(sampleRate * (ringDuration + silenceDuration))

  for (let i = 0; i < totalSamples; i++) {
    const posInCycle = i % cycleSamples
    let sample = 0

    if (posInCycle < ringSamples) {
      const t = posInCycle / sampleRate
      // Classic North American ring: 440 Hz + 480 Hz
      const tone1 = Math.sin(2 * Math.PI * 440 * t)
      const tone2 = Math.sin(2 * Math.PI * 480 * t)
      // Add slight tremolo for a more natural phone ring feel
      const tremolo = 0.8 + 0.2 * Math.sin(2 * Math.PI * 20 * t)
      sample = (tone1 + tone2) * 0.2 * tremolo * 32767

      // Fade in/out to avoid clicks
      const fadeLen = sampleRate * 0.03
      if (posInCycle < fadeLen) {
        sample *= posInCycle / fadeLen
      } else if (posInCycle > ringSamples - fadeLen) {
        sample *= (ringSamples - posInCycle) / fadeLen
      }
    }

    view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, sample)), true)
  }

  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return 'data:audio/wav;base64,' + btoa(binary)
}

function createRingtone() {
  let audio: HTMLAudioElement | null = null
  let isPlaying = false
  let unlocked = false

  const init = () => {
    if (audio) return
    try {
      audio = new Audio()
      audio.loop = true
      audio.volume = 0.7
      audio.src = generateRingtoneWav()
      audio.load()
    } catch (err) {
      console.error('Failed to create ringtone audio:', err)
    }
  }

  const unlock = () => {
    if (unlocked || !audio) return
    const playPromise = audio.play()
    if (playPromise) {
      playPromise.then(() => {
        audio!.pause()
        audio!.currentTime = 0
        unlocked = true
        console.log('Ringtone audio unlocked')
      }).catch(() => {})
    }
  }

  if (typeof document !== 'undefined') {
    const handleInteraction = () => {
      init()
      unlock()
      if (unlocked) {
        document.removeEventListener('click', handleInteraction)
        document.removeEventListener('keydown', handleInteraction)
        document.removeEventListener('touchstart', handleInteraction)
      }
    }
    document.addEventListener('click', handleInteraction)
    document.addEventListener('keydown', handleInteraction)
    document.addEventListener('touchstart', handleInteraction)
    init()
  }

  const start = () => {
    if (isPlaying || !audio) return
    isPlaying = true
    audio.currentTime = 0
    const playPromise = audio.play()
    if (playPromise) {
      playPromise.catch(err => {
        console.error('Ringtone play failed:', err)
      })
    }
  }

  const stop = () => {
    isPlaying = false
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
  }

  return { start, stop }
}

// Request browser notification permission on load
function requestNotificationPermission() {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        console.log('Notification permission:', permission)
      })
    }
  }
}

// Show a system-level browser notification for incoming call
function showIncomingCallNotification(from: string): Notification | null {
  if (typeof window === 'undefined' || !('Notification' in window)) return null
  if (Notification.permission !== 'granted') return null

  try {
    const notification = new Notification('Incoming Call - NorthChat', {
      body: `Call from ${from}`,
      icon: '/favicon.ico',
      tag: 'incoming-call', // Replaces previous notification with same tag
      requireInteraction: true, // Stays visible until user interacts
      silent: false,
    })

    // Click notification to focus NorthChat window
    notification.onclick = () => {
      window.focus()
      notification.close()
    }

    return notification
  } catch (err) {
    console.error('Failed to show notification:', err)
    return null
  }
}

export function Softphone({ userId, tenantId }: SoftphoneProps) {
  const {
    dialNumber,
    setDialNumber,
    isSoftphoneOpen: isExpanded,
    setIsSoftphoneOpen: setIsExpanded,
    setDeviceReady: setContextDeviceReady,
  } = useSoftphone()

  const [device, setDevice] = useState<Device | null>(null)
  const [activeCall, setActiveCall] = useState<Call | null>(null)
  const [callState, setCallState] = useState<'idle' | 'connecting' | 'ringing' | 'connected' | 'incoming'>('idle')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [isMuted, setIsMuted] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  const [deviceReady, setDeviceReadyLocal] = useState(false)
  const setDeviceReady = useCallback((ready: boolean) => {
    setDeviceReadyLocal(ready)
    setContextDeviceReady(ready)
  }, [setContextDeviceReady])
  const [error, setError] = useState<string | null>(null)
  const [incomingFrom, setIncomingFrom] = useState('')
  const [showDialpad, setShowDialpad] = useState(true)
  const [callerContact, setCallerContact] = useState<{
    id: string
    display_name: string
    company_name: string | null
    contact_type: string | null
  } | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)

  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const panelRef = useRef<HTMLDivElement>(null)
  const posInitialized = useRef(false)
  const dragStartPos = useRef({ x: 0, y: 0 })
  const wasDragged = useRef(false)
  const isExpandedRef = useRef(isExpanded)
  isExpandedRef.current = isExpanded
  const prevExpandedRef = useRef(isExpanded)

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const callStartRef = useRef<Date | null>(null)
  const pendingDialRef = useRef(false)
  const ringtoneRef = useRef<{ start: () => void; stop: () => void } | null>(null)
  const notificationRef = useRef<Notification | null>(null)

  // Request notification permission on mount
  useEffect(() => {
    requestNotificationPermission()
  }, [])

  // Initialize ringtone on mount
  useEffect(() => {
    ringtoneRef.current = createRingtone()
    return () => {
      ringtoneRef.current?.stop()
    }
  }, [])

  // Play/stop ringtone and show/hide notification based on call state
  useEffect(() => {
    if (callState === 'incoming') {
      // Start ringtone
      ringtoneRef.current?.start()

      // Show browser notification (works even when in another app)
      notificationRef.current = showIncomingCallNotification(incomingFrom)

      // Flash the browser tab title
      const originalTitle = document.title
      const flashInterval = setInterval(() => {
        document.title = document.title === '\uD83D\uDCDE Incoming Call!' ? originalTitle : '\uD83D\uDCDE Incoming Call!'
      }, 1000)

      return () => {
        clearInterval(flashInterval)
        document.title = originalTitle
        ringtoneRef.current?.stop()
        // Close notification when call state changes
        if (notificationRef.current) {
          notificationRef.current.close()
          notificationRef.current = null
        }
      }
    } else {
      ringtoneRef.current?.stop()
      if (notificationRef.current) {
        notificationRef.current.close()
        notificationRef.current = null
      }
    }
  }, [callState, incomingFrom])

  const getDefaultPosition = useCallback(() => ({
    x: 20,
    y: isExpandedRef.current
      ? Math.max(8, window.innerHeight - 140)
      : Math.max(8, window.innerHeight - 60),
  }), [])

  useEffect(() => {
    if (!posInitialized.current) {
      posInitialized.current = true
      setPosition(getDefaultPosition())
    }
  }, [getDefaultPosition])

  useEffect(() => {
    let timer: NodeJS.Timeout
    const handleResize = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        setPosition(getDefaultPosition())
      }, 200)
    }
    window.addEventListener('resize', handleResize)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', handleResize)
    }
  }, [getDefaultPosition])

  useEffect(() => {
    if (callState !== 'idle') {
      setIsExpanded(true)
    }
  }, [callState, setIsExpanded])

  useEffect(() => {
    if (!posInitialized.current) return

    const PANEL_H = 480
    const PILL_H = 44

    if (isExpanded && !prevExpandedRef.current) {
      setPosition(prev => ({
        x: prev.x,
        y: Math.max(10, prev.y - PANEL_H + PILL_H),
      }))
    } else if (!isExpanded && prevExpandedRef.current) {
      setPosition(prev => ({
        x: prev.x,
        y: Math.min(prev.y + PANEL_H - PILL_H, window.innerHeight - PILL_H),
      }))
    }

    prevExpandedRef.current = isExpanded
  }, [isExpanded])

  useEffect(() => {
    if (dialNumber) {
      setPhoneNumber(dialNumber)
      setShowDialpad(true)
      pendingDialRef.current = true
      setDialNumber('')
    }
  }, [dialNumber, setDialNumber])

  const initDevice = useCallback(async () => {
    try {
      setError(null)
      const response = await fetch('/api/twilio/token', { method: 'POST' })

      if (!response.ok) {
        throw new Error('Failed to get token')
      }

      const data = await response.json()

      const newDevice = new Device(data.token, {
        edge: 'ashburn',
        closeProtection: true,
      })

      newDevice.on('registered', () => {
        console.log('Twilio Device registered')
        setDeviceReady(true)
      })

      newDevice.on('error', (err) => {
        console.error('Twilio Device error:', err)
        setError(err.message)
      })

      newDevice.on('incoming', (call: Call) => {
        console.log('Incoming call from:', call.parameters.From)
        setActiveCall(call)
        setCallState('incoming')
        setIncomingFrom(call.parameters.From || 'Unknown')

        // Look up contact info for the incoming caller
        if (call.parameters.From) {
          lookupContact(call.parameters.From)
        }

        call.on('cancel', () => {
          setCallState('idle')
          setActiveCall(null)
          setIncomingFrom('')
          setCallerContact(null)
        })

        call.on('disconnect', () => {
          handleCallEnd()
        })
      })

      newDevice.on('tokenWillExpire', async () => {
        const res = await fetch('/api/twilio/token', { method: 'POST' })
        const data = await res.json()
        newDevice.updateToken(data.token)
      })

      await newDevice.register()
      setDevice(newDevice)
    } catch (err) {
      console.error('Failed to initialize Twilio:', err)
      setError('Failed to connect to phone system')
    }
  }, [])

  useEffect(() => {
    initDevice()
    return () => {
      device?.destroy()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (callState === 'connected') {
      callStartRef.current = new Date()
      timerRef.current = setInterval(() => {
        if (callStartRef.current) {
          const elapsed = Math.floor((Date.now() - callStartRef.current.getTime()) / 1000)
          setCallDuration(elapsed)
        }
      }, 1000)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      if (callState === 'idle') {
        setCallDuration(0)
        callStartRef.current = null
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [callState])

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const logCall = async (direction: string, phone: string, callSid: string, disposition: string) => {
    try {
      await fetch('/api/twilio/log-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          direction,
          phone,
          callSid,
          disposition,
          duration: callDuration,
        }),
      })
    } catch (err) {
      console.error('Failed to log call:', err)
    }
  }

  const makeCall = async () => {
    if (!device || !phoneNumber.trim()) return

    try {
      setCallState('connecting')
      setError(null)

      let formattedNumber = phoneNumber.replace(/\D/g, '')
      if (formattedNumber.length === 10) {
        formattedNumber = `+1${formattedNumber}`
      } else if (!formattedNumber.startsWith('+')) {
        formattedNumber = `+${formattedNumber}`
      }

      const call = await device.connect({
        params: { To: formattedNumber }
      })

      setActiveCall(call)

      // Look up contact info for the outbound number
      lookupContact(formattedNumber)

      call.on('accept', () => {
        setCallState('connected')
      })

      call.on('ringing', () => {
        setCallState('ringing')
      })

      call.on('disconnect', () => {
        logCall('outbound', formattedNumber, call.parameters.CallSid || '', 'completed')
        handleCallEnd()
      })

      call.on('cancel', () => {
        logCall('outbound', formattedNumber, call.parameters.CallSid || '', 'failed')
        handleCallEnd()
      })

      call.on('error', (err) => {
        console.error('Call error:', err)
        setError('Call failed')
        handleCallEnd()
      })
    } catch (err) {
      console.error('Failed to make call:', err)
      setError('Failed to connect call')
      setCallState('idle')
    }
  }

  useEffect(() => {
    if (pendingDialRef.current && phoneNumber && deviceReady && callState === 'idle' && device) {
      pendingDialRef.current = false
      makeCall()
    }
  }) // intentionally no deps

  const acceptCall = () => {
    if (activeCall) {
      activeCall.accept()
      setCallState('connected')
    }
  }

  const rejectCall = () => {
    if (activeCall) {
      activeCall.reject()
      handleCallEnd()
    }
  }

  const hangUp = () => {
    if (activeCall) {
      activeCall.disconnect()
    }
    handleCallEnd()
  }

  const toggleMute = () => {
    if (activeCall) {
      const newMuted = !isMuted
      activeCall.mute(newMuted)
      setIsMuted(newMuted)
    }
  }

  const handleCallEnd = () => {
    setCallState('idle')
    setActiveCall(null)
    setIsMuted(false)
    setIncomingFrom('')
    setCallerContact(null)
    setLookupLoading(false)
  }

  const lookupContact = useCallback(async (phone: string) => {
    if (!phone) return
    setLookupLoading(true)
    try {
      const res = await fetch('/api/contacts/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, tenant_id: tenantId }),
      })
      if (res.ok) {
        const data = await res.json()
        setCallerContact(data.contact || null)
      }
    } catch (err) {
      console.error('Contact lookup failed:', err)
    } finally {
      setLookupLoading(false)
    }
  }, [tenantId])

  const dialpadPress = (digit: string) => {
    if (callState === 'connected' && activeCall) {
      activeCall.sendDigits(digit)
    } else {
      setPhoneNumber(prev => prev + digit)
    }
  }

  const dialpadButtons = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['*', '0', '#'],
  ]

  const getStatusDisplay = () => {
    switch (callState) {
      case 'idle': return { color: 'bg-green-500', text: 'Ready' }
      case 'connecting': return { color: 'bg-yellow-500', text: 'Connecting...' }
      case 'ringing': return { color: 'bg-yellow-500', text: 'Ringing...' }
      case 'connected': return { color: 'bg-blue-500', text: formatDuration(callDuration) }
      case 'incoming': return { color: 'bg-orange-500', text: 'Incoming Call' }
      default: return { color: 'bg-gray-500', text: 'Offline' }
    }
  }

  const status = getStatusDisplay()
  const isInCall = callState !== 'idle'

  const handleDragStart = (e: React.MouseEvent) => {
    setIsDragging(true)
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    }
    dragStartPos.current = { x: e.clientX, y: e.clientY }
    wasDragged.current = false
    e.preventDefault()
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartPos.current.x
      const dy = e.clientY - dragStartPos.current.y
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        wasDragged.current = true
      }
      const elW = panelRef.current?.offsetWidth || 320
      const elH = panelRef.current?.offsetHeight || 48
      setPosition({
        x: Math.max(0, Math.min(e.clientX - dragOffset.current.x, window.innerWidth - elW)),
        y: Math.max(0, Math.min(e.clientY - dragOffset.current.y, window.innerHeight - elH)),
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      if (!wasDragged.current && !isExpandedRef.current) {
        setIsExpanded(true)
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, setIsExpanded])

  if (!isExpanded) {
    return (
      <div
        ref={panelRef}
        onMouseDown={handleDragStart}
        className={`fixed z-50 flex items-center gap-2.5 px-4 py-2.5 bg-white rounded-full shadow-lg border border-gray-200 hover:shadow-xl transition-shadow select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ left: position.x, top: position.y }}
      >
        <div className={`w-2.5 h-2.5 rounded-full ${deviceReady ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-sm font-medium text-gray-700">
          {deviceReady ? 'Phone Ready' : 'Connecting...'}
        </span>
      </div>
    )
  }

  return (
    <div
      ref={panelRef}
      className="fixed z-50 w-[320px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
      style={{ left: position.x, top: position.y }}
    >
      <div
        className={`px-4 py-3 border-b border-gray-100 flex items-center justify-between select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${deviceReady ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm font-medium text-gray-700">Phone</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full text-white ${status.color}`}>
            {status.text}
          </span>
          {!isInCall && (
            <button
              onClick={() => setIsExpanded(false)}
              onMouseDown={(e) => e.stopPropagation()}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
              title="Minimize"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="overflow-y-auto">
        {error && (
          <div className="mx-4 mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
            {error}
            <button onClick={initDevice} className="ml-2 underline">Retry</button>
          </div>
        )}

        {callState === 'incoming' && (
          <div className="p-4 bg-orange-50 border-b border-orange-200">
            <p className="text-sm font-medium text-orange-800 text-center">Incoming Call</p>
            <p className="text-lg font-bold text-orange-900 text-center mt-1">{incomingFrom}</p>
            {lookupLoading ? (
              <p className="text-xs text-orange-600 text-center mt-1">Looking up contact...</p>
            ) : callerContact ? (
              <div className="mt-1 text-center">
                <p className="text-sm font-semibold text-orange-900">{callerContact.display_name}</p>
                {callerContact.company_name && (
                  <p className="text-xs text-orange-700">{callerContact.company_name}</p>
                )}
                {callerContact.contact_type && (
                  <span className="inline-block mt-0.5 text-xs px-2 py-0.5 bg-orange-200 text-orange-800 rounded-full">
                    {callerContact.contact_type}
                  </span>
                )}
              </div>
            ) : (
              <p className="text-xs text-orange-600 text-center mt-1">Unknown caller</p>
            )}
            <div className="flex gap-2 mt-3">
              <button
                onClick={acceptCall}
                className="flex-1 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors"
              >
                Accept
              </button>
              <button
                onClick={rejectCall}
                className="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors"
              >
                Decline
              </button>
            </div>
          </div>
        )}

        {callState !== 'incoming' && (
          <div className="p-4">
            <div className="relative">
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && phoneNumber.trim() && deviceReady) {
                    e.preventDefault()
                    makeCall()
                  }
                }}
                placeholder="Enter phone number"
                className="w-full px-3 py-2.5 text-center text-lg font-mono border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={callState !== 'idle'}
              />
              {phoneNumber && callState === 'idle' && (
                <button
                  onClick={() => setPhoneNumber('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              )}
            </div>
            {callState !== 'idle' && (
              <div className="mt-2 text-center">
                {lookupLoading ? (
                  <p className="text-xs text-gray-500">Looking up contact...</p>
                ) : callerContact ? (
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{callerContact.display_name}</p>
                    {callerContact.company_name && (
                      <p className="text-xs text-gray-500">{callerContact.company_name}</p>
                    )}
                    {callerContact.contact_type && (
                      <span className="inline-block mt-0.5 text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                        {callerContact.contact_type}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">Unknown caller</p>
                )}
              </div>
            )}
          </div>
        )}

        {showDialpad && callState !== 'incoming' && (
          <div className="px-4 pb-2">
            <div className="grid grid-cols-3 gap-2">
              {dialpadButtons.map((row, i) =>
                row.map((digit) => (
                  <button
                    key={digit}
                    onClick={() => dialpadPress(digit)}
                    className="py-3 text-lg font-medium text-gray-700 bg-gray-50 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors"
                  >
                    {digit}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {callState !== 'incoming' && (
          <div className="px-4">
            <button
              onClick={() => setShowDialpad(!showDialpad)}
              className="w-full text-xs text-gray-400 hover:text-gray-600 py-1"
            >
              {showDialpad ? 'Hide dialpad' : 'Show dialpad'}
            </button>
          </div>
        )}

        <div className="p-4 pt-2">
          {callState === 'idle' ? (
            <button
              onClick={makeCall}
              disabled={!phoneNumber.trim() || !deviceReady}
              className="w-full py-3 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              <span>📞</span> Call
            </button>
          ) : callState !== 'incoming' ? (
            <div className="flex gap-2">
              <button
                onClick={toggleMute}
                className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                  isMuted
                    ? 'bg-yellow-100 text-yellow-700 border border-yellow-300'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {isMuted ? '🔇 Muted' : '🎤 Mute'}
              </button>
              <button
                onClick={hangUp}
                className="flex-1 py-3 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors"
              >
                ✕ Hang Up
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
