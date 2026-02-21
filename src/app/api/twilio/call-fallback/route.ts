import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'

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

  // Agents didn't answer — forward to Erick's cell as backup
  const BACKUP_PHONE = '+16309469321'
  console.log(`Forwarding to backup: Erick at ${BACKUP_PHONE}`)

  const dial = twiml.dial({
    callerId,
    timeout: 25,
    action: `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/call-complete`,
    method: 'POST',
  })
  dial.number(BACKUP_PHONE)

  return new NextResponse(twiml.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  })
}
