import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'

const VoiceResponse = twilio.twiml.VoiceResponse

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const dialCallStatus = formData.get('DialCallStatus') as string

  const twiml = new VoiceResponse()

  // If the call wasn't answered, send to voicemail
  if (dialCallStatus !== 'completed') {
    twiml.say(
      { voice: 'alice' },
      'Sorry, no one is available to take your call. Please leave a message after the beep.'
    )
    twiml.record({
      maxLength: 120, // 2 minutes max
      transcribe: false, // We'll use AI transcription instead
      recordingStatusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/recording`,
      recordingStatusCallbackMethod: 'POST',
    })
    twiml.say({ voice: 'alice' }, 'Thank you. Goodbye.')
  }

  return new NextResponse(twiml.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  })
}
