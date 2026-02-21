import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { supabaseAdmin } from '@/lib/supabase/admin'

const VoiceResponse = twilio.twiml.VoiceResponse

interface DaySchedule {
  open: boolean
  start: string // "HH:MM"
  end: string   // "HH:MM"
}

interface BusinessHoursSettings {
  enabled: boolean
  timezone: string
  schedule: Record<string, DaySchedule>
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function isWithinBusinessHours(settings: BusinessHoursSettings): boolean {
  if (!settings.enabled) return true

  // Get current time in the tenant's timezone
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: settings.timezone,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const parts = formatter.formatToParts(now)
  const weekday = parts.find(p => p.type === 'weekday')?.value?.toLowerCase() || ''
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10)
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10)

  // Map weekday name to schedule key
  const dayKey = DAY_NAMES.includes(weekday) ? weekday : DAY_NAMES[now.getDay()]
  const daySchedule = settings.schedule[dayKey]

  if (!daySchedule || !daySchedule.open) return false

  const currentMinutes = hour * 60 + minute
  const [startH, startM] = daySchedule.start.split(':').map(Number)
  const [endH, endM] = daySchedule.end.split(':').map(Number)
  const startMinutes = startH * 60 + startM
  const endMinutes = endH * 60 + endM

  return currentMinutes >= startMinutes && currentMinutes < endMinutes
}

function sendToVoicemail(twiml: InstanceType<typeof VoiceResponse>, greeting?: string) {
  twiml.say({ voice: 'Polly.Amy' },
    greeting || 'Thank you for calling. We are currently closed. Please leave a message after the beep.'
  )
  twiml.record({
    maxLength: 120,
    transcribe: false,
    recordingStatusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/recording`,
    recordingStatusCallbackMethod: 'POST',
    playBeep: true,
  })
  twiml.say({ voice: 'Polly.Amy' }, 'Thank you. Goodbye.')
}

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const to = formData.get('To') as string
  const from = formData.get('From') as string
  const callerId = process.env.TWILIO_PHONE_NUMBER!

  const twiml = new VoiceResponse()

  if (to && to !== callerId) {
    // === OUTBOUND CALL FROM BROWSER ===
    if (to.startsWith('client:')) {
      // Agent-to-agent call
      const clientName = to.replace('client:', '')
      const dial = twiml.dial({ callerId })
      dial.client(clientName)
    } else {
      // Calling a phone number
      let formattedNumber = to.replace(/\D/g, '')
      if (formattedNumber.length === 10) {
        formattedNumber = `+1${formattedNumber}`
      } else if (!formattedNumber.startsWith('+')) {
        formattedNumber = `+${formattedNumber}`
      } else {
        formattedNumber = to
      }

      const dial = twiml.dial({ callerId })
      dial.number({
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/status`,
        statusCallbackMethod: 'POST',
      }, formattedNumber)
    }
  } else {
    // === INBOUND CALL ===
    console.log('Inbound call from:', from)

    // Look up which tenant owns this phone number (include settings)
    const { data: tenants, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('id, settings')
      .eq('status', 'active')
      .limit(1)

    console.log('Tenant lookup result:', JSON.stringify(tenants), 'Error:', tenantError)

    const tenant = tenants?.[0] || null

    if (!tenant) {
      twiml.say({ voice: 'Polly.Amy' }, 'Sorry, this number is not currently in service.')
      return new NextResponse(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    const settings = (tenant.settings as Record<string, unknown>) || {}
    const businessHours = settings.business_hours as BusinessHoursSettings | undefined
    const voicemailSettings = settings.voicemail as Record<string, unknown> | undefined

    // Check business hours — if outside hours, go to voicemail
    if (businessHours && !isWithinBusinessHours(businessHours)) {
      console.log('Outside business hours — sending to voicemail')
      const greeting = voicemailSettings?.greeting as string | undefined
      sendToVoicemail(twiml, greeting)

      return new NextResponse(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    // Within business hours — ring all available agents
    console.log('Ringing available agents for tenant:', tenant.id)

    const { data: agents } = await supabaseAdmin
      .from('agent_status')
      .select('user_id')
      .eq('tenant_id', tenant.id)
      .eq('status', 'available')

    if (agents && agents.length > 0) {
      console.log(`Ringing ${agents.length} available agents`)

      const dial = twiml.dial({
        timeout: 20,
        action: `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/call-fallback`,
        method: 'POST',
      })

      agents.forEach(agent => {
        dial.client(agent.user_id)
      })
    } else {
      // No agents available — go straight to voicemail
      console.log('No available agents — sending to voicemail')

      const greeting = voicemailSettings?.greeting as string | undefined
      sendToVoicemail(
        twiml,
        greeting || 'Thank you for calling Sunset Services. No one is available to take your call right now. Please leave a message after the beep.'
      )
    }
  }

  return new NextResponse(twiml.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  })
}
