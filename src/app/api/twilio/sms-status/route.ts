import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const messageSid = formData.get('MessageSid') as string
    const messageStatus = formData.get('MessageStatus') as string

    console.log(`[SMS Status] SID: ${messageSid}, Status: ${messageStatus}`)

    // Update the status in our database
    if (messageSid && messageStatus) {
      const { error } = await supabaseAdmin
        .from('sms_log')
        .update({ status: messageStatus })
        .eq('twilio_sid', messageSid)

      if (error) {
        console.error('[SMS Status] Failed to update:', error.message)
      }
    }

    return new NextResponse('OK', { status: 200 })
  } catch (error) {
    console.error('[SMS Status] Error:', error)
    return new NextResponse('OK', { status: 200 })
  }
}
