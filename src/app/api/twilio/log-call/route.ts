import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { tenantId, direction, phone, callSid, disposition, duration } = body

    // Look up contact by phone number
    const { data: identifier } = await supabaseAdmin
      .from('contact_identifiers')
      .select('contact_id')
      .eq('identifier_type', 'phone')
      .eq('identifier_value', phone)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    // Insert call record using admin client (bypasses RLS)
    const { error: insertError } = await supabaseAdmin.from('call_records').insert({
      tenant_id: tenantId,
      contact_id: identifier?.contact_id || null,
      agent_user_id: user.id,
      direction,
      twilio_call_sid: callSid,
      phone_from: direction === 'outbound' ? (process.env.TWILIO_PHONE_NUMBER || '') : phone,
      phone_to: direction === 'outbound' ? phone : (process.env.TWILIO_PHONE_NUMBER || ''),
      duration_seconds: duration || 0,
      disposition,
    })

    if (insertError) {
      console.error('Failed to insert call record:', insertError)
      return NextResponse.json({ error: 'Failed to log call' }, { status: 500 })
    }

    // Log activity
    await supabaseAdmin.from('activity_log').insert({
      tenant_id: tenantId,
      user_id: user.id,
      action: direction === 'outbound' ? 'call_made' : 'call_received',
      resource_type: 'call',
      details: { phone, duration, disposition },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Log call error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
