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

interface MappedContact {
  name: string
  company?: string
  type?: string
  phone?: string
  email?: string
  notes?: string
}

function normalizePhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length < 10) return null
  return `+${digits}`
}

const CHUNK_SIZE = 50

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
    const contacts: MappedContact[] = body.contacts
    if (!contacts || !Array.isArray(contacts)) {
      return NextResponse.json({ error: 'Missing contacts array' }, { status: 400 })
    }

    // Fetch contact types for this tenant and cache by lowercase name
    const { data: contactTypes } = await supabaseAdmin
      .from('contact_types')
      .select('id, name')
      .eq('tenant_id', profile.tenant_id)

    const typeMap = new Map<string, string>()
    const fallbackTypeId = contactTypes?.[0]?.id || null
    contactTypes?.forEach((t) => {
      typeMap.set(t.name.toLowerCase(), t.id)
    })

    // Fetch existing phone identifiers for dedup
    const { data: existingPhones } = await supabaseAdmin
      .from('contact_identifiers')
      .select('identifier_value')
      .eq('tenant_id', profile.tenant_id)
      .eq('identifier_type', 'phone')

    const existingPhoneSet = new Set(
      (existingPhones || []).map((p) => p.identifier_value)
    )

    let imported = 0
    const skipped_contacts: { name: string; reason: string }[] = []

    // Process in chunks
    for (let i = 0; i < contacts.length; i += CHUNK_SIZE) {
      const chunk = contacts.slice(i, i + CHUNK_SIZE)

      for (const c of chunk) {
        const name = (c.name || '').trim()
        if (!name) {
          skipped_contacts.push({ name: name || '(empty)', reason: 'Missing name' })
          continue
        }

        // Normalize phone and check for duplicates
        let normalizedPhone: string | null = null
        if (c.phone?.trim()) {
          normalizedPhone = normalizePhone(c.phone.trim())
          if (normalizedPhone && existingPhoneSet.has(normalizedPhone)) {
            skipped_contacts.push({ name, reason: `Duplicate phone: ${c.phone}` })
            continue
          }
        }

        // Resolve contact type
        let contactTypeId = fallbackTypeId
        if (c.type?.trim()) {
          const resolved = typeMap.get(c.type.trim().toLowerCase())
          if (resolved) contactTypeId = resolved
        }

        if (!contactTypeId) {
          skipped_contacts.push({ name, reason: 'No contact type available' })
          continue
        }

        // Insert contact
        const { data: contact, error: contactError } = await supabaseAdmin
          .from('contacts')
          .insert({
            tenant_id: profile.tenant_id,
            display_name: name,
            contact_type_id: contactTypeId,
            company_name: c.company?.trim() || null,
            notes: c.notes?.trim() || null,
            created_by: user.id,
          })
          .select('id')
          .single()

        if (contactError) {
          console.error('[Contacts Import] Error inserting contact:', contactError.message)
          skipped_contacts.push({ name, reason: 'Database error' })
          continue
        }

        // Insert phone identifier
        if (normalizedPhone) {
          await supabaseAdmin.from('contact_identifiers').insert({
            tenant_id: profile.tenant_id,
            contact_id: contact.id,
            identifier_type: 'phone',
            identifier_value: normalizedPhone,
            is_primary: true,
            system: 'import',
          })
          existingPhoneSet.add(normalizedPhone)
        }

        // Insert email identifier
        if (c.email?.trim()) {
          await supabaseAdmin.from('contact_identifiers').insert({
            tenant_id: profile.tenant_id,
            contact_id: contact.id,
            identifier_type: 'email',
            identifier_value: c.email.trim().toLowerCase(),
            is_primary: !normalizedPhone,
            system: 'import',
          })
        }

        imported++
      }
    }

    return NextResponse.json({
      imported,
      skipped: skipped_contacts.length,
      skipped_contacts,
    })
  } catch (error) {
    console.error('[Contacts Import] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
