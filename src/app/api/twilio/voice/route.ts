import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'

const VoiceResponse = twilio.twiml.VoiceResponse

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const to = formData.get('To') as string
  const from = formData.get('From') as string
  const callerId = process.env.TWILIO_PHONE_NUMBER!

  const twiml = new VoiceResponse()

  if (to) {
    // Outgoing call from browser
    if (to.startsWith('+') || to.match(/^\d+$/)) {
      // Calling a phone number
      const dial = twiml.dial({ callerId })
      dial.number({
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/status`,
        statusCallbackMethod: 'POST',
      }, to.startsWith('+') ? to : `+1${to}`)
    } else {
      // Calling another browser client (agent-to-agent)
      const dial = twiml.dial({ callerId })
      dial.client(to)
    }
  } else {
    // Incoming call - ring the browser client
    // For now, ring all connected clients. Later we'll add smart routing.
    const dial = twiml.dial({
      timeout: 30,
      action: `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/call-complete`,
      method: 'POST',
    })

    // Ring the first available agent
    // TODO: Implement smart routing based on call_routing_rules
    dial.client('agent')
    
    // If no one answers after timeout, go to voicemail
    // The action URL above handles this
  }

  return new NextResponse(twiml.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  })
}
