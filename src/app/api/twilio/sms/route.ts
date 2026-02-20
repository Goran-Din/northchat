import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Use service role client - Twilio webhooks can't authenticate as a user
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const messageSid = formData.get('MessageSid') as string
    const from = formData.get('From') as string
    const to = formData.get('To') as string
    const body = formData.get('Body') as string
    const status = (formData.get('SmsStatus') as string) || 'received'

    console.log(`[SMS Inbound] From: ${from}, To: ${to}, Body: ${body?.substring(0, 50)}...`)

    // Find the tenant that owns this Twilio phone number
    const twilioNumber = process.env.TWILIO_PHONE_NUMBER || ''

    // Look up tenant - for now we use the first active tenant
    // In multi-tenant production, you'd match the "to" number against tenant phone numbers
    const { data: tenants } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('status', 'active')
      .limit(1)

    const tenant = tenants?.[0] || null

    if (!tenant) {
      console.error('[SMS Inbound] No active tenant found')
      return new NextResponse('<Response></Response>', {
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    // Try to match the sender's phone number to an existing contact
    let contactId: string | null = null
    const { data: contactMatch } = await supabaseAdmin
      .from('contact_identifiers')
      .select('contact_id')
      .eq('identifier_type', 'phone')
      .eq('identifier_value', from)
      .limit(1)

    if (contactMatch && contactMatch.length > 0) {
      contactId = contactMatch[0].contact_id
    }

    // Save the inbound SMS to the database
    const { error: insertError } = await supabaseAdmin
      .from('sms_log')
      .insert({
        tenant_id: tenant.id,
        twilio_sid: messageSid,
        direction: 'inbound',
        from_number: from,
        to_number: to,
        body: body,
        status: status,
        contact_id: contactId,
      })

    if (insertError) {
      console.error('[SMS Inbound] Failed to save:', insertError.message)
    } else {
      console.log('[SMS Inbound] Saved to database successfully')
    }

    // Return empty TwiML response (no auto-reply for now)
    return new NextResponse('<Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    })
  } catch (error) {
    console.error('[SMS Inbound] Error:', error)
    return new NextResponse('<Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    })
  }
}
