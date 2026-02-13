import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const callSid = formData.get('CallSid') as string
    const callStatus = formData.get('CallStatus') as string
    const duration = formData.get('CallDuration') as string
    const from = formData.get('From') as string
    const to = formData.get('To') as string

    console.log(`Call ${callSid}: ${callStatus} (duration: ${duration || 'n/a'})`)

    // Map Twilio status to our disposition
    const dispositionMap: Record<string, string> = {
      'initiated': 'in_progress',
      'ringing': 'in_progress',
      'in-progress': 'in_progress',
      'completed': 'completed',
      'busy': 'busy',
      'no-answer': 'no_answer',
      'failed': 'failed',
      'canceled': 'failed',
    }

    const disposition = dispositionMap[callStatus] || 'failed'

    // Update existing call record if it exists, or we'll create one on completion
    if (callStatus === 'completed' || callStatus === 'busy' || 
        callStatus === 'no-answer' || callStatus === 'failed' || callStatus === 'canceled') {
      
      // Try to update existing record
      const { data: existing } = await supabaseAdmin
        .from('call_records')
        .select('id')
        .eq('twilio_call_sid', callSid)
        .single()

      if (existing) {
        await supabaseAdmin
          .from('call_records')
          .update({
            disposition,
            duration_seconds: duration ? parseInt(duration) : 0,
          })
          .eq('id', existing.id)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Status callback error:', error)
    return NextResponse.json({ success: true }) // Always return 200 to Twilio
  }
}
