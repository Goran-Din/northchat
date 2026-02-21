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

// GET /api/settings/call-forwarding — return tenant's call forwarding settings
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
      console.error('[Call Forwarding GET] Error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const settings = (tenant?.settings as Record<string, unknown>) || {}
    return NextResponse.json({
      call_forwarding: settings.call_forwarding || null,
    })
  } catch (error) {
    console.error('[Call Forwarding GET] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/settings/call-forwarding — update tenant's call forwarding (admin only)
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
    const { call_forwarding } = body

    if (!call_forwarding) {
      return NextResponse.json({ error: 'Missing required field: call_forwarding' }, { status: 400 })
    }

    // Validate fallback_number — must contain at least 10 digits
    if (call_forwarding.fallback_number) {
      const digits = call_forwarding.fallback_number.replace(/\D/g, '')
      if (digits.length < 10) {
        return NextResponse.json({ error: 'Fallback number must be a valid phone number (at least 10 digits)' }, { status: 400 })
      }
    }

    // Validate ring_timeout — 10 to 60 seconds
    if (call_forwarding.ring_timeout !== undefined) {
      const rt = Number(call_forwarding.ring_timeout)
      if (isNaN(rt) || rt < 10 || rt > 60) {
        return NextResponse.json({ error: 'Ring timeout must be between 10 and 60 seconds' }, { status: 400 })
      }
    }

    // Validate fallback_timeout — 10 to 60 seconds
    if (call_forwarding.fallback_timeout !== undefined) {
      const ft = Number(call_forwarding.fallback_timeout)
      if (isNaN(ft) || ft < 10 || ft > 60) {
        return NextResponse.json({ error: 'Fallback timeout must be between 10 and 60 seconds' }, { status: 400 })
      }
    }

    // Get existing settings to merge (don't overwrite business_hours, voicemail, etc.)
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('settings')
      .eq('id', profile.tenant_id)
      .single()

    const existingSettings = (tenant?.settings as Record<string, unknown>) || {}
    const mergedSettings = {
      ...existingSettings,
      call_forwarding,
    }

    const { error } = await supabaseAdmin
      .from('tenants')
      .update({ settings: mergedSettings })
      .eq('id', profile.tenant_id)

    if (error) {
      console.error('[Call Forwarding PUT] Error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, call_forwarding })
  } catch (error) {
    console.error('[Call Forwarding PUT] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
