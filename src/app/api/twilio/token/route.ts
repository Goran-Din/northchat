import { NextResponse } from 'next/server'
import twilio from 'twilio'
import { createServerSupabase } from '@/lib/supabase/server'

export async function POST() {
  try {
    // Verify user is authenticated
    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile for identity
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('display_name, tenant_id')
      .eq('id', user.id)
      .single()

    const accountSid = process.env.TWILIO_ACCOUNT_SID!
    const authToken = process.env.TWILIO_AUTH_TOKEN!
    const twimlAppSid = process.env.TWILIO_TWIML_APP_SID!

    // Create an access token
    const AccessToken = twilio.jwt.AccessToken
    const VoiceGrant = AccessToken.VoiceGrant

    const token = new AccessToken(
      accountSid,
      process.env.TWILIO_API_KEY_SID || accountSid,
      process.env.TWILIO_API_KEY_SECRET || authToken,
      { 
        identity: user.id,
        ttl: 3600 // Token valid for 1 hour
      }
    )

    // Grant voice capabilities
    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: twimlAppSid,
      incomingAllow: true,
    })

    token.addGrant(voiceGrant)

    return NextResponse.json({
      token: token.toJwt(),
      identity: user.id,
      displayName: profile?.display_name || user.email,
    })
  } catch (error) {
    console.error('Error generating Twilio token:', error)
    return NextResponse.json(
      { error: 'Failed to generate token' },
      { status: 500 }
    )
  }
}
