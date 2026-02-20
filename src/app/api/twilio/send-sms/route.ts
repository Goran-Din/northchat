import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

// Service role client for database writes
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
)

export async function POST(request: NextRequest) {
  try {
    const { to, body, tenantId, userId } = await request.json()

    // Validate required fields
    if (!to || !body) {
      return NextResponse.json(
        { error: 'Missing required fields: to, body' },
        { status: 400 }
      )
    }

    // Format phone number - add +1 if not present
    let formattedTo = to.replace(/\D/g, '') // Strip non-digits
    if (formattedTo.length === 10) {
      formattedTo = `+1${formattedTo}`
    } else if (formattedTo.length === 11 && formattedTo.startsWith('1')) {
      formattedTo = `+${formattedTo}`
    } else if (!formattedTo.startsWith('+')) {
      formattedTo = `+${formattedTo}`
    }

    const fromNumber = process.env.TWILIO_PHONE_NUMBER!

    console.log(`[SMS Outbound] To: ${formattedTo}, Body: ${body.substring(0, 50)}...`)

    // Send via Twilio
    const messageOptions: any = {
      body: body,
      from: fromNumber,
      to: formattedTo,
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
    if (appUrl.startsWith('https://')) {
      messageOptions.statusCallback = `${appUrl}/api/twilio/sms-status`
    }

    const message = await twilioClient.messages.create(messageOptions)

    console.log(`[SMS Outbound] Sent successfully. SID: ${message.sid}`)

    // Get tenant ID - if not provided, look it up from the user
    let resolvedTenantId = tenantId
    if (!resolvedTenantId && userId) {
      const { data: userProfile } = await supabaseAdmin
        .from('user_profiles')
        .select('tenant_id')
        .eq('id', userId)
        .limit(1)

      resolvedTenantId = userProfile?.[0]?.tenant_id
    }

    // Fallback: get first active tenant
    if (!resolvedTenantId) {
      const { data: tenants } = await supabaseAdmin
        .from('tenants')
        .select('id')
        .eq('status', 'active')
        .limit(1)

      resolvedTenantId = tenants?.[0]?.id
    }

    // Try to match the recipient's phone number to a contact
    let contactId: string | null = null
    const { data: contactMatch } = await supabaseAdmin
      .from('contact_identifiers')
      .select('contact_id')
      .eq('identifier_type', 'phone')
      .eq('identifier_value', formattedTo)
      .limit(1)

    if (contactMatch && contactMatch.length > 0) {
      contactId = contactMatch[0].contact_id
    }

    // Save to database
    if (resolvedTenantId) {
      const { error: insertError } = await supabaseAdmin
        .from('sms_log')
        .insert({
          tenant_id: resolvedTenantId,
          twilio_sid: message.sid,
          direction: 'outbound',
          from_number: fromNumber,
          to_number: formattedTo,
          body: body,
          status: message.status,
          user_id: userId || null,
          contact_id: contactId,
        })

      if (insertError) {
        console.error('[SMS Outbound] Failed to save to DB:', insertError.message)
      }
    }

    return NextResponse.json({
      success: true,
      messageSid: message.sid,
      status: message.status,
    })
  } catch (error: unknown) {
    console.error('[SMS Outbound] Error:', error)
    const message = error instanceof Error ? error.message : 'Failed to send SMS'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
