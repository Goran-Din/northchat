import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { supabaseAdmin } from '@/lib/supabase/admin'

const VoiceResponse = twilio.twiml.VoiceResponse

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const dialCallStatus = formData.get('DialCallStatus') as string

  const twiml = new VoiceResponse()

  // If the call wasn't answered, send to voicemail
  if (dialCallStatus !== 'completed') {
    // Look up tenant settings for voicemail configuration
    const { data: tenants } = await supabaseAdmin
      .from('tenants')
      .select('id, settings')
      .eq('status', 'active')
      .limit(1)

    const tenant = tenants?.[0] || null
    const settings = (tenant?.settings as Record<string, unknown>) || {}
    const vmSettings = settings.voicemail as {
      voice?: string
      messages?: { no_answer?: string; voicemail_prompt?: string }
      greeting?: string
    } | undefined

    const voice = (vmSettings?.voice as 'Polly.Joanna' | undefined) || 'Polly.Joanna'
    const noAnswer = vmSettings?.messages?.no_answer
      || vmSettings?.greeting
      || 'Sorry, no one is available to take your call.'
    const prompt = vmSettings?.messages?.voicemail_prompt
      || 'Please leave your name, number, and a brief message after the tone.'

    twiml.say({ voice }, noAnswer)
    twiml.say({ voice }, prompt)
    twiml.record({
      maxLength: 120,
      transcribe: false,
      recordingStatusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/recording`,
      recordingStatusCallbackMethod: 'POST',
      playBeep: true,
    })
    twiml.say({ voice }, 'Thank you. Goodbye.')
  }

  return new NextResponse(twiml.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  })
}
