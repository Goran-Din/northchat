import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { supabaseAdmin } from '@/lib/supabase/admin'

const VoiceResponse = twilio.twiml.VoiceResponse

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
    const { data: tenants, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('id')
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

    // Ring all available agents (no business hours check)
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

      twiml.say({ voice: 'Polly.Amy' },
        'Thank you for calling Sunset Services. No one is available to take your call right now. Please leave a message after the beep.'
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
  }

  return new NextResponse(twiml.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  })
}
