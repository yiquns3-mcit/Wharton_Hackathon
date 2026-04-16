// POST /api/ai/polish
// Scene 1: polish a user's draft review text.
// Not persisted — client uses the result directly.
import { openai } from '@/lib/openai'
import { buildPolishPrompt } from '@/lib/prompts'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { draft_text } = await req.json()

  if (!draft_text) {
    return NextResponse.json({ error: 'draft_text is required' }, { status: 400 })
  }

  const { system, user } = buildPolishPrompt(draft_text)

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  })

  const polished = completion.choices[0].message.content ?? ''
  return NextResponse.json({ polished })
}
