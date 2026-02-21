import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// GET /api/settings/voicemail — return tenant's voicemail settings
export async function GET() {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    const { data: tenant, error } = await supabaseAdmin
      .from('tenants')
      .select('settings')
      .eq('id', profile.tenant_id)
      .single()

    if (error) {
      console.error('[Voicemail GET] Error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const settings = (tenant?.settings as Record<string, unknown>) || {}
    return NextResponse.json({
      voicemail: settings.voicemail || null,
    })
  } catch (error) {
    console.error('[Voicemail GET] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/settings/voicemail — update tenant's voicemail settings (admin only)
export async function PUT(request: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('tenant_id, roles(name)')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Admin-only check
    const roles = profile.roles as unknown
    const roleName = Array.isArray(roles)
      ? (roles[0] as Record<string, unknown>)?.name
      : (roles as Record<string, unknown>)?.name
    if (roleName !== 'Admin' && roleName !== 'admin' && roleName !== 'Owner' && roleName !== 'owner') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { voicemail } = body

    if (!voicemail) {
      return NextResponse.json({ error: 'Missing required field: voicemail' }, { status: 400 })
    }

    // Validate greeting_message
    if (voicemail.greeting_message !== undefined) {
      if (typeof voicemail.greeting_message !== 'string') {
        return NextResponse.json({ error: 'Greeting message must be a string' }, { status: 400 })
      }
      if (voicemail.greeting_message.length > 500) {
        return NextResponse.json({ error: 'Greeting message must be under 500 characters' }, { status: 400 })
      }
    }

    // Get existing settings to merge (don't overwrite business_hours, call_forwarding, etc.)
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('settings')
      .eq('id', profile.tenant_id)
      .single()

    const existingSettings = (tenant?.settings as Record<string, unknown>) || {}
    const mergedSettings = {
      ...existingSettings,
      voicemail,
    }

    const { error } = await supabaseAdmin
      .from('tenants')
      .update({ settings: mergedSettings })
      .eq('id', profile.tenant_id)

    if (error) {
      console.error('[Voicemail PUT] Error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, voicemail })
  } catch (error) {
    console.error('[Voicemail PUT] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
