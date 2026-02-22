import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_VOICES = [
  'Polly.Joanna', 'Polly.Kendra', 'Polly.Ruth', 'Polly.Amy', 'Polly.Salli',
  'Polly.Matthew', 'Polly.Joey', 'Polly.Stephen',
]

// POST /api/settings/voicemail/preview — validate text and voice for browser TTS preview
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { text, voice } = body

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid text' }, { status: 400 })
    }

    if (text.length > 500) {
      return NextResponse.json({ error: 'Text must be under 500 characters' }, { status: 400 })
    }

    if (!voice || !ALLOWED_VOICES.includes(voice)) {
      return NextResponse.json({ error: `Invalid voice. Allowed: ${ALLOWED_VOICES.join(', ')}` }, { status: 400 })
    }

    return NextResponse.json({ valid: true, text, voice })
  } catch (error) {
    console.error('[Voicemail Preview] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
