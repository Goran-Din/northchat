import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Service role client for writes
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

// GET /api/contacts — list all contacts for the tenant
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

    // Get query params for filtering
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const contactType = searchParams.get('type') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit

    // Build query
    let query = supabaseAdmin
      .from('contacts')
      .select('*, contact_identifiers(*), contact_types(id, name)', { count: 'exact' })
      .eq('tenant_id', profile.tenant_id)
      .order('display_name', { ascending: true })
      .range(offset, offset + limit - 1)

    if (contactType && contactType !== 'all') {
      query = query.eq('contact_type_id', contactType)
    }

    if (search) {
      query = query.or(`display_name.ilike.%${search}%,company_name.ilike.%${search}%`)
    }

    const { data: contacts, error, count } = await query

    if (error) {
      console.error('[Contacts GET] Error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      contacts: contacts || [],
      total: count || 0,
      page,
      limit,
    })
  } catch (error) {
    console.error('[Contacts GET] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/contacts — create a new contact
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
    const {
      display_name, contact_type_id, company_name, notes, phone, email,
      address_street, address_city, address_state, address_zip,
      custom_field_label, custom_field_value,
    } = body

    if (!display_name || !contact_type_id) {
      return NextResponse.json(
        { error: 'Missing required fields: display_name, contact_type_id' },
        { status: 400 }
      )
    }

    // Create the contact
    const { data: contact, error: contactError } = await supabaseAdmin
      .from('contacts')
      .insert({
        tenant_id: profile.tenant_id,
        display_name,
        contact_type_id,
        company_name: company_name || null,
        notes: notes || null,
        address_street: address_street || null,
        address_city: address_city || null,
        address_state: address_state || null,
        address_zip: address_zip || null,
        custom_field_label: custom_field_label || null,
        custom_field_value: custom_field_value || null,
        created_by: user.id,
      })
      .select()
      .single()

    if (contactError) {
      console.error('[Contacts POST] Error creating contact:', contactError.message)
      return NextResponse.json({ error: contactError.message }, { status: 500 })
    }

    // Add phone identifier if provided
    if (phone) {
      let formattedPhone = phone.replace(/\D/g, '')
      if (formattedPhone.length === 10) formattedPhone = `+1${formattedPhone}`
      else if (formattedPhone.length === 11 && formattedPhone.startsWith('1')) formattedPhone = `+${formattedPhone}`
      else if (!formattedPhone.startsWith('+')) formattedPhone = `+${formattedPhone}`

      const { error: phoneError } = await supabaseAdmin.from('contact_identifiers').insert({
        tenant_id: profile.tenant_id,
        contact_id: contact.id,
        identifier_type: 'phone',
        identifier_value: formattedPhone,
        is_primary: true,
        system: 'manual',
      })
      if (phoneError) {
        console.error('[Contacts POST] Error adding phone identifier:', phoneError.message)
      }
    }

    // Add email identifier if provided
    if (email) {
      const { error: emailError } = await supabaseAdmin.from('contact_identifiers').insert({
        tenant_id: profile.tenant_id,
        contact_id: contact.id,
        identifier_type: 'email',
        identifier_value: email.toLowerCase(),
        is_primary: true,
        system: 'manual',
      })
      if (emailError) {
        console.error('[Contacts POST] Error adding email identifier:', emailError.message)
      }
    }

    // Re-fetch with identifiers
    const { data: fullContact } = await supabaseAdmin
      .from('contacts')
      .select('*, contact_identifiers(*), contact_types(id, name)')
      .eq('id', contact.id)
      .single()

    return NextResponse.json({ contact: fullContact }, { status: 201 })
  } catch (error) {
    console.error('[Contacts POST] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/contacts — update an existing contact
export async function PUT(request: NextRequest) {
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
    const {
      id, display_name, contact_type_id, company_name, notes, phone, email,
      address_street, address_city, address_state, address_zip,
      custom_field_label, custom_field_value,
    } = body

    if (!id) {
      return NextResponse.json({ error: 'Missing required field: id' }, { status: 400 })
    }

    // Verify the contact belongs to the user's tenant
    const { data: existing } = await supabaseAdmin
      .from('contacts')
      .select('id')
      .eq('id', id)
      .eq('tenant_id', profile.tenant_id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    // Build update object with only provided fields
    const updates: Record<string, unknown> = {}
    if (display_name !== undefined) updates.display_name = display_name
    if (contact_type_id !== undefined) updates.contact_type_id = contact_type_id
    if (company_name !== undefined) updates.company_name = company_name || null
    if (notes !== undefined) updates.notes = notes || null
    if (address_street !== undefined) updates.address_street = address_street || null
    if (address_city !== undefined) updates.address_city = address_city || null
    if (address_state !== undefined) updates.address_state = address_state || null
    if (address_zip !== undefined) updates.address_zip = address_zip || null
    if (custom_field_label !== undefined) updates.custom_field_label = custom_field_label || null
    if (custom_field_value !== undefined) updates.custom_field_value = custom_field_value || null

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('contacts')
        .update(updates)
        .eq('id', id)

      if (updateError) {
        console.error('[Contacts PUT] Error updating contact:', updateError.message)
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
    }

    // Update phone identifier if provided
    if (phone !== undefined) {
      // Delete existing phone identifiers
      const { error: deletePhoneError } = await supabaseAdmin
        .from('contact_identifiers')
        .delete()
        .eq('contact_id', id)
        .eq('identifier_type', 'phone')

      if (deletePhoneError) {
        console.error('[Contacts PUT] Error deleting phone identifiers:', deletePhoneError.message)
      }

      // Add new phone if not empty
      if (phone) {
        let formattedPhone = phone.replace(/\D/g, '')
        if (formattedPhone.length === 10) formattedPhone = `+1${formattedPhone}`
        else if (formattedPhone.length === 11 && formattedPhone.startsWith('1')) formattedPhone = `+${formattedPhone}`
        else if (!formattedPhone.startsWith('+')) formattedPhone = `+${formattedPhone}`

        const { error: phoneError } = await supabaseAdmin.from('contact_identifiers').insert({
          contact_id: id,
          identifier_type: 'phone',
          identifier_value: formattedPhone,
          is_primary: true,
          system: 'manual',
        })
        if (phoneError) {
          console.error('[Contacts PUT] Error adding phone identifier:', phoneError.message)
        }
      }
    }

    // Update email identifier if provided
    if (email !== undefined) {
      // Delete existing email identifiers
      const { error: deleteEmailError } = await supabaseAdmin
        .from('contact_identifiers')
        .delete()
        .eq('contact_id', id)
        .eq('identifier_type', 'email')

      if (deleteEmailError) {
        console.error('[Contacts PUT] Error deleting email identifiers:', deleteEmailError.message)
      }

      // Add new email if not empty
      if (email) {
        const { error: emailError } = await supabaseAdmin.from('contact_identifiers').insert({
          contact_id: id,
          identifier_type: 'email',
          identifier_value: email.toLowerCase(),
          is_primary: true,
          system: 'manual',
        })
        if (emailError) {
          console.error('[Contacts PUT] Error adding email identifier:', emailError.message)
        }
      }
    }

    // Re-fetch with identifiers and type
    const { data: fullContact } = await supabaseAdmin
      .from('contacts')
      .select('*, contact_identifiers(*), contact_types(id, name)')
      .eq('id', id)
      .single()

    return NextResponse.json({ contact: fullContact })
  } catch (error) {
    console.error('[Contacts PUT] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/contacts — delete a contact and its identifiers
export async function DELETE(request: NextRequest) {
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

    const { id } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'Missing required field: id' }, { status: 400 })
    }

    // Verify the contact belongs to the user's tenant
    const { data: existing } = await supabaseAdmin
      .from('contacts')
      .select('id')
      .eq('id', id)
      .eq('tenant_id', profile.tenant_id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    // Delete identifiers first
    const { error: idError } = await supabaseAdmin
      .from('contact_identifiers')
      .delete()
      .eq('contact_id', id)

    if (idError) {
      console.error('[Contacts DELETE] Error deleting identifiers:', idError.message)
    }

    // Delete the contact
    const { error: deleteError } = await supabaseAdmin
      .from('contacts')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('[Contacts DELETE] Error:', deleteError.message)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Contacts DELETE] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
