import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Service role client for reads
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Helper to get authenticated user
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

// GET /api/calls — list call records for the tenant
export async function GET(request: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's tenant
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const direction = searchParams.get('direction') || ''
    const status = searchParams.get('status') || ''
    const search = searchParams.get('search') || ''
    const from = searchParams.get('from') || ''
    const to = searchParams.get('to') || ''
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 100)
    const offset = parseInt(searchParams.get('offset') || '0', 10) || 0

    // Build query
    let query = supabaseAdmin
      .from('call_records')
      .select('*', { count: 'exact' })
      .eq('tenant_id', profile.tenant_id)

    if (direction === 'inbound' || direction === 'outbound') {
      query = query.eq('direction', direction)
    }

    if (status) {
      query = query.eq('disposition', status)
    }

    if (search) {
      query = query.or(`phone_from.ilike.%${search}%,phone_to.ilike.%${search}%`)
    }

    if (from) {
      query = query.gte('created_at', from)
    }

    if (to) {
      query = query.lte('created_at', to)
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data: calls, count, error } = await query

    if (error) {
      console.error('[Calls GET] Query error:', error)
      return NextResponse.json({ error: 'Failed to fetch calls' }, { status: 500 })
    }

    // Match phone numbers to contacts
    const callList = calls || []

    // Collect unique phone numbers to look up
    const phonesToLookup = new Set<string>()
    for (const call of callList) {
      if (call.direction === 'inbound' && call.phone_from) {
        phonesToLookup.add(call.phone_from)
      } else if (call.direction === 'outbound' && call.phone_to) {
        phonesToLookup.add(call.phone_to)
      }
    }

    // Batch lookup contacts by phone number
    const phoneToContact = new Map<string, string>()
    if (phonesToLookup.size > 0) {
      const { data: identifiers } = await supabaseAdmin
        .from('contact_identifiers')
        .select('identifier_value, contacts(display_name)')
        .eq('tenant_id', profile.tenant_id)
        .eq('identifier_type', 'phone')
        .in('identifier_value', Array.from(phonesToLookup))

      if (identifiers) {
        for (const id of identifiers) {
          const contact = id.contacts as any
          if (contact?.display_name) {
            phoneToContact.set(id.identifier_value, contact.display_name)
          }
        }
      }
    }

    // Enrich calls with contact names and remap column names for frontend
    const enrichedCalls = callList.map((call) => {
      const lookupNumber = call.direction === 'inbound' ? call.phone_from : call.phone_to
      return {
        id: call.id,
        direction: call.direction,
        from_number: call.phone_from,
        to_number: call.phone_to,
        status: call.disposition,
        duration_seconds: call.duration_seconds,
        started_at: call.created_at,
        created_at: call.created_at,
        contact_name: phoneToContact.get(lookupNumber) || null,
      }
    })

    return NextResponse.json({ calls: enrichedCalls, total: count || 0 })
  } catch (error) {
    console.error('[Calls GET] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
