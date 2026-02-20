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

// GET /api/contacts/[id]/notes
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: contactId } = await params

    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Get notes with the author's name
    const { data: notes, error } = await supabaseAdmin
      .from('contact_notes')
      .select('*, user_profiles!contact_notes_user_id_fkey(display_name)')
      .eq('contact_id', contactId)
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false })

    if (error) {
      // If the join fails, try without the join
      const { data: notesSimple, error: simpleError } = await supabaseAdmin
        .from('contact_notes')
        .select('*')
        .eq('contact_id', contactId)
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false })

      if (simpleError) {
        console.error('[Notes GET] Error:', simpleError.message)
        return NextResponse.json({ error: simpleError.message }, { status: 500 })
      }

      return NextResponse.json({ notes: notesSimple || [] })
    }

    return NextResponse.json({ notes: notes || [] })
  } catch (error) {
    console.error('[Notes GET] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/contacts/[id]/notes
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: contactId } = await params

    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    const body = await request.json()
    const { text } = body

    if (!text || !text.trim()) {
      return NextResponse.json({ error: 'Note text is required' }, { status: 400 })
    }

    const { data: note, error } = await supabaseAdmin
      .from('contact_notes')
      .insert({
        tenant_id: profile.tenant_id,
        contact_id: contactId,
        user_id: user.id,
        body: text.trim(),
      })
      .select()
      .single()

    if (error) {
      console.error('[Notes POST] Error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ note }, { status: 201 })
  } catch (error) {
    console.error('[Notes POST] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
