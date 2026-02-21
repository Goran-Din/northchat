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

// POST /api/contacts/lookup — look up a contact by phone number
export async function POST(request: NextRequest) {
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

    const body = await request.json()
    const { phone } = body

    if (!phone) {
      return NextResponse.json({ error: 'Missing required field: phone' }, { status: 400 })
    }

    // Normalize the phone number for lookup
    let normalizedPhone = phone.replace(/\D/g, '')
    if (normalizedPhone.length === 10) {
      normalizedPhone = `+1${normalizedPhone}`
    } else if (normalizedPhone.length === 11 && normalizedPhone.startsWith('1')) {
      normalizedPhone = `+${normalizedPhone}`
    } else if (!normalizedPhone.startsWith('+')) {
      normalizedPhone = `+${normalizedPhone}`
    }

    // Also try with just the raw digits for flexible matching
    const phoneLast10 = normalizedPhone.replace(/\D/g, '').slice(-10)

    // Look up contact by phone identifier within the tenant
    const { data: identifiers, error } = await supabaseAdmin
      .from('contact_identifiers')
      .select('contact_id, identifier_value, contacts(id, display_name, company_name, contact_type_id, contact_types(id, name))')
      .eq('tenant_id', profile.tenant_id)
      .eq('identifier_type', 'phone')

    if (error) {
      console.error('[Contact Lookup] Error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Find a match by comparing normalized phone numbers
    const match = identifiers?.find(id => {
      const storedDigits = id.identifier_value.replace(/\D/g, '').slice(-10)
      return storedDigits === phoneLast10
    })

    if (!match || !match.contacts) {
      return NextResponse.json({ contact: null })
    }

    const contact = match.contacts as Record<string, unknown>
    const contactType = contact.contact_types as Record<string, unknown> | null

    return NextResponse.json({
      contact: {
        id: contact.id,
        display_name: contact.display_name,
        company_name: contact.company_name,
        contact_type: contactType?.name || null,
      },
    })
  } catch (error) {
    console.error('[Contact Lookup] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
