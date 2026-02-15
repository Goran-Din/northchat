import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { supabaseAdmin } from '@/lib/supabase/admin'

const VoiceResponse = twilio.twiml.VoiceResponse

// Check if current time is within business hours for a tenant
function isWithinBusinessHours(businessHours: Record<string, any>, timezone: string): boolean {
  try {
    // Get current time in tenant's timezone
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    const parts = formatter.formatToParts(now)
    const weekday = parts.find(p => p.type === 'weekday')?.value?.toLowerCase() || ''
    const hour = parts.find(p => p.type === 'hour')?.value || '00'
    const minute = parts.find(p => p.type === 'minute')?.value || '00'
    const currentTime = `${hour}:${minute}`

    const todaySchedule = businessHours[weekday]
    if (!todaySchedule || !todaySchedule.is_open) {
      return false
    }

    console.log('BH Check:', { weekday, currentTime, todaySchedule })
    return currentTime >= todaySchedule.open && currentTime < todaySchedule.close
  } catch (error) {
    console.error('Error checking business hours:', error)
    return true // Default to business hours if check fails
  }
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

    // Look up which tenant owns this phone number
    // For now, use the first active tenant (we'll add multi-tenant phone routing later)
    const { data: tenants, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('id, business_hours, after_hours_message, after_hours_action, timezone')
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

    const duringBusinessHours = isWithinBusinessHours(
      tenant.business_hours || {},
      tenant.timezone || 'America/Chicago'
    )

    if (duringBusinessHours) {
      // === BUSINESS HOURS FLOW ===
      // Step 1: Ring all available agents for 15 seconds
      console.log('Business hours - ringing available agents')

      const { data: agents } = await supabaseAdmin
        .from('agent_status')
        .select('user_id')
        .eq('status', 'available')

      const dial = twiml.dial({
        timeout: 15,
        action: `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/call-fallback`,
        method: 'POST',
      })

      if (agents && agents.length > 0) {
        console.log(`Ringing ${agents.length} available agents`)
        agents.forEach(agent => {
          dial.client(agent.user_id)
        })
      } else {
        console.log('No available agents, will fall through to manager')
        dial.client('no-agents-online')
      }
    } else {
      // === AFTER HOURS FLOW ===
      console.log('After hours - sending to voicemail')

      const afterHoursMsg = tenant.after_hours_message ||
        'Thank you for calling. Our office is currently closed. Please leave a message and we will return your call during business hours.'

      twiml.say({ voice: 'Polly.Amy' }, afterHoursMsg)
      twiml.record({
        maxLength: 120,
        transcribe: false,
        recordingStatusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/recording`,
        recordingStatusCallbackMethod: 'POST',
        playBeep: true,
      })
      twiml.say({ voice: 'Polly.Amy' }, 'Thank you. Goodbye.')
    }
  }

  return new NextResponse(twiml.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  })
}
