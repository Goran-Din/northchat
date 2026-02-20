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
      .from('call_log')
      .select('*', { count: 'exact' })
      .eq('tenant_id', profile.tenant_id)

    if (direction === 'inbound' || direction === 'outbound') {
      query = query.eq('direction', direction)
    }

    if (status) {
      query = query.eq('status', status)
    }

    if (search) {
      query = query.or(`from_number.ilike.%${search}%,to_number.ilike.%${search}%`)
    }

    if (from) {
      query = query.gte('started_at', from)
    }

    if (to) {
      query = query.lte('started_at', to)
    }

    query = query
      .order('started_at', { ascending: false })
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
      if (call.direction === 'inbound' && call.from_number) {
        phonesToLookup.add(call.from_number)
      } else if (call.direction === 'outbound' && call.to_number) {
        phonesToLookup.add(call.to_number)
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

    // Enrich calls with contact names
    const enrichedCalls = callList.map((call) => {
      const lookupNumber = call.direction === 'inbound' ? call.from_number : call.to_number
      return {
        ...call,
        contact_name: phoneToContact.get(lookupNumber) || null,
      }
    })

    return NextResponse.json({ calls: enrichedCalls, total: count || 0 })
  } catch (error) {
    console.error('[Calls GET] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
