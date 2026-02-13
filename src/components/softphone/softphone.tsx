'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Device, Call } from '@twilio/voice-sdk'

interface SoftphoneProps {
  userId: string
  tenantId: string
}

export function Softphone({ userId, tenantId }: SoftphoneProps) {
  const [device, setDevice] = useState<Device | null>(null)
  const [activeCall, setActiveCall] = useState<Call | null>(null)
  const [callState, setCallState] = useState<'idle' | 'connecting' | 'ringing' | 'connected' | 'incoming'>('idle')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [isMuted, setIsMuted] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  const [deviceReady, setDeviceReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [incomingFrom, setIncomingFrom] = useState('')
  const [showDialpad, setShowDialpad] = useState(true)

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const callStartRef = useRef<Date | null>(null)
  const supabase = createClient()

  // Initialize Twilio Device
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

        call.on('cancel', () => {
          setCallState('idle')
          setActiveCall(null)
          setIncomingFrom('')
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

  // Call timer
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

  // Format duration as mm:ss
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Log call to database
  const logCall = async (direction: string, phone: string, callSid: string, disposition: string) => {
    try {
      // Look up contact by phone number
      const { data: identifier } = await supabase
        .from('contact_identifiers')
        .select('contact_id')
        .eq('identifier_type', 'phone')
        .eq('identifier_value', phone)
        .single()

      await supabase.from('call_records').insert({
        tenant_id: tenantId,
        contact_id: identifier?.contact_id || null,
        agent_user_id: userId,
        direction,
        twilio_call_sid: callSid,
        phone_from: direction === 'outbound' ? process.env.NEXT_PUBLIC_TWILIO_PHONE || '' : phone,
        phone_to: direction === 'outbound' ? phone : '',
        duration_seconds: callDuration,
        disposition,
      })

      // Log activity
      await supabase.from('activity_log').insert({
        tenant_id: tenantId,
        user_id: userId,
        action: direction === 'outbound' ? 'call_made' : 'call_received',
        resource_type: 'call',
        details: { phone, duration: callDuration, disposition },
      })
    } catch (err) {
      console.error('Failed to log call:', err)
    }
  }

  // Make outgoing call
  const makeCall = async () => {
    if (!device || !phoneNumber.trim()) return

    try {
      setCallState('connecting')
      setError(null)

      // Format number - add +1 if not already formatted
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

  // Accept incoming call
  const acceptCall = () => {
    if (activeCall) {
      activeCall.accept()
      setCallState('connected')
    }
  }

  // Reject incoming call
  const rejectCall = () => {
    if (activeCall) {
      activeCall.reject()
      handleCallEnd()
    }
  }

  // Hang up
  const hangUp = () => {
    if (activeCall) {
      activeCall.disconnect()
    }
    handleCallEnd()
  }

  // Toggle mute
  const toggleMute = () => {
    if (activeCall) {
      const newMuted = !isMuted
      activeCall.mute(newMuted)
      setIsMuted(newMuted)
    }
  }

  // Handle call end
  const handleCallEnd = () => {
    setCallState('idle')
    setActiveCall(null)
    setIsMuted(false)
    setIncomingFrom('')
  }

  // Dial pad button press
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

  // Status color and text
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

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 w-72">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${deviceReady ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm font-medium text-gray-700">Phone</span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full text-white ${status.color}`}>
          {status.text}
        </span>
      </div>

      {/* Error display */}
      {error && (
        <div className="mx-4 mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
          {error}
          <button onClick={initDevice} className="ml-2 underline">Retry</button>
        </div>
      )}

      {/* Incoming call alert */}
      {callState === 'incoming' && (
        <div className="p-4 bg-orange-50 border-b border-orange-200">
          <p className="text-sm font-medium text-orange-800 text-center">Incoming Call</p>
          <p className="text-lg font-bold text-orange-900 text-center mt-1">{incomingFrom}</p>
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

      {/* Phone number input */}
      {callState !== 'incoming' && (
        <div className="p-4">
          <div className="relative">
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
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
        </div>
      )}

      {/* Dial pad */}
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

      {/* Toggle dialpad */}
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

      {/* Call controls */}
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
  )
}
