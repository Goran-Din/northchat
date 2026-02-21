import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { supabaseAdmin } from '@/lib/supabase/admin'

const VoiceResponse = twilio.twiml.VoiceResponse

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const dialCallStatus = formData.get('DialCallStatus') as string
  const callerId = process.env.TWILIO_PHONE_NUMBER!

  const twiml = new VoiceResponse()

  console.log('Call fallback triggered, agent dial status:', dialCallStatus)

  if (dialCallStatus === 'completed') {
    // Agent answered and call completed normally — do nothing
    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  // Look up tenant settings for call forwarding configuration
  const { data: tenants } = await supabaseAdmin
    .from('tenants')
    .select('id, settings')
    .eq('status', 'active')
    .limit(1)

  const tenant = tenants?.[0] || null
  const settings = (tenant?.settings as Record<string, unknown>) || {}
  const callForwarding = settings.call_forwarding as {
    enabled?: boolean
    fallback_number?: string
    fallback_timeout?: number
  } | undefined

  // If call forwarding is enabled and has a fallback number, forward the call
  if (callForwarding?.enabled && callForwarding.fallback_number) {
    let fallbackNumber = callForwarding.fallback_number.replace(/\D/g, '')
    if (fallbackNumber.length === 10) {
      fallbackNumber = `+1${fallbackNumber}`
    } else if (!fallbackNumber.startsWith('+')) {
      fallbackNumber = `+${fallbackNumber}`
    }

    const fallbackTimeout = callForwarding.fallback_timeout || 25

    console.log(`Forwarding to fallback number: ${fallbackNumber} (timeout: ${fallbackTimeout}s)`)

    const dial = twiml.dial({
      callerId,
      timeout: fallbackTimeout,
      action: `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/call-complete`,
      method: 'POST',
    })
    dial.number(fallbackNumber)
  } else {
    // Call forwarding disabled or no fallback number — go straight to voicemail
    console.log('Call forwarding disabled — sending to voicemail')

    const voicemailSettings = settings.voicemail as Record<string, unknown> | undefined
    const greeting = voicemailSettings?.greeting as string | undefined

    twiml.say({ voice: 'Polly.Amy' },
      greeting || 'Thank you for calling. No one is available to take your call right now. Please leave a message after the beep.'
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

  return new NextResponse(twiml.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  })
}
