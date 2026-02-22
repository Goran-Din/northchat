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

// GET /api/contacts/[id]/timeline
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

    // Get the contact's phone numbers and emails
    const { data: identifiers } = await supabaseAdmin
      .from('contact_identifiers')
      .select('identifier_type, identifier_value')
      .eq('contact_id', contactId)
      .eq('tenant_id', profile.tenant_id)

    const phoneNumbers = (identifiers || [])
      .filter((i) => i.identifier_type === 'phone')
      .map((i) => i.identifier_value)

    const timeline: Array<{
      id: string
      type: string
      direction: string
      summary: string
      body?: string
      status?: string
      duration?: number
      author?: string
      time: string
    }> = []

    // Get SMS messages for this contact's phone numbers
    if (phoneNumbers.length > 0) {
      for (const phone of phoneNumbers) {
        const { data: smsMessages } = await supabaseAdmin
          .from('sms_log')
          .select('*')
          .eq('tenant_id', profile.tenant_id)
          .or(`from_number.eq.${phone},to_number.eq.${phone}`)
          .order('created_at', { ascending: false })
          .limit(50)

        if (smsMessages) {
          smsMessages.forEach((sms) => {
            timeline.push({
              id: sms.id,
              type: 'sms',
              direction: sms.direction,
              summary: sms.body || '(no content)',
              body: sms.body,
              status: sms.status,
              time: sms.created_at,
            })
          })
        }
      }
    }

    // Get calls for this contact's phone numbers
    if (phoneNumbers.length > 0) {
      for (const phone of phoneNumbers) {
        const { data: calls } = await supabaseAdmin
          .from('call_records')
          .select('*')
          .eq('tenant_id', profile.tenant_id)
          .or(`phone_from.eq.${phone},phone_to.eq.${phone}`)
          .order('created_at', { ascending: false })
          .limit(50)

        if (calls) {
          calls.forEach((call) => {
            timeline.push({
              id: call.id,
              type: 'call',
              direction: call.direction,
              summary: `${call.direction === 'inbound' ? 'Inbound' : 'Outbound'} call - ${call.disposition || 'completed'}`,
              status: call.disposition,
              duration: call.duration_seconds,
              time: call.created_at,
            })
          })
        }
      }
    }

    // Get notes for this contact
    const { data: notes } = await supabaseAdmin
      .from('contact_notes')
      .select('*')
      .eq('contact_id', contactId)
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (notes) {
      // Get user names for note authors
      const userIds = [...new Set(notes.map((n) => n.user_id))]
      const { data: users } = await supabaseAdmin
        .from('user_profiles')
        .select('id, display_name')
        .in('id', userIds)

      const userMap = new Map((users || []).map((u) => [u.id, u.display_name]))

      notes.forEach((note) => {
        timeline.push({
          id: note.id,
          type: 'note',
          direction: 'internal',
          summary: note.body,
          body: note.body,
          author: userMap.get(note.user_id) || 'Unknown',
          time: note.created_at,
        })
      })
    }

    // Sort everything by time, newest first
    timeline.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())

    return NextResponse.json({ timeline })
  } catch (error) {
    console.error('[Timeline GET] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
