import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const callSid = formData.get('CallSid') as string
    const recordingUrl = formData.get('RecordingUrl') as string
    const recordingDuration = formData.get('RecordingDuration') as string

    console.log(`Recording for call ${callSid}: ${recordingUrl} (${recordingDuration}s)`)

    // Update the call record with recording info
    const { data: existing } = await supabaseAdmin
      .from('call_records')
      .select('id')
      .eq('twilio_call_sid', callSid)
      .single()

    if (existing) {
      await supabaseAdmin
        .from('call_records')
        .update({
          recording_url: recordingUrl,
          voicemail: true,
          disposition: 'voicemail',
        })
        .eq('id', existing.id)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Recording callback error:', error)
    return NextResponse.json({ success: true })
  }
}
