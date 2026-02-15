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

  // Agents didn't answer — try forwarding to Manager
  // Find a manager or admin with a phone number set
  const { data: manager } = await supabaseAdmin
    .from('user_profiles')
    .select('phone, display_name')
    .not('phone', 'is', null)
    .in('platform_role', ['super_admin', 'admin', 'manager'])
    .limit(1)
    .single()

  if (manager?.phone) {
    console.log(`Forwarding to manager: ${manager.display_name} at ${manager.phone}`)

    twiml.say({ voice: 'Polly.Amy' }, 'Please hold while we connect you.')

    const dial = twiml.dial({
      callerId,
      timeout: 30,
      action: `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/call-complete`,
      method: 'POST',
    })
    dial.number(manager.phone)
  } else {
    // No manager phone configured — go straight to voicemail
    console.log('No manager phone configured, going to voicemail')

    twiml.say(
      { voice: 'Polly.Amy' },
      'Sorry, no one is available to take your call. Please leave a message after the beep.'
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
