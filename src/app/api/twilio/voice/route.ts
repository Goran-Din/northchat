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
    if (to.startsWith('client:')) {
      // Calling another browser client (agent-to-agent)
      const clientName = to.slice('client:'.length)
      const dial = twiml.dial({ callerId })
      dial.client(clientName)
    } else {
      // Calling a phone number - strip non-digits and format
      const digits = to.replace(/\D/g, '')
      const formatted = digits.length === 10 ? `+1${digits}` : `+${digits}`
      const dial = twiml.dial({ callerId })
      dial.number({
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/status`,
        statusCallbackMethod: 'POST',
      }, formatted)
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
