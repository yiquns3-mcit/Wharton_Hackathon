// POST /api/ai/questions
// Scene 2: generate guided questions for a hotel's top features.
// Called only when top_features order changes (enforced in hotelAnalysisUpdater).
import { openai } from '@/lib/openai'
import { buildQuestionsPrompt, stripMarkdownFences } from '@/lib/prompts'
import { fetchHotelDescription } from '@/lib/hotelAnalysisUpdater'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { eg_property_id, top_features } = await req.json()

  if (!eg_property_id || !Array.isArray(top_features) || top_features.length === 0) {
    return NextResponse.json(
      { error: 'eg_property_id and top_features[] are required' },
      { status: 400 }
    )
  }

  const hotelDesc = await fetchHotelDescription(eg_property_id)
  const { system, user } = buildQuestionsPrompt(top_features, hotelDesc)

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  })

  const raw = completion.choices[0].message.content ?? '[]'
  let ai_questions: unknown[] = []
  try {
    ai_questions = JSON.parse(stripMarkdownFences(raw))
  } catch {
    console.error('[POST /api/ai/questions] JSON parse failed', raw)
    return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
  }

  return NextResponse.json({ ai_questions })
}
