// POST /api/ai/followup
// Dynamic follow-up question generation.
// Called while the user is typing their review text (debounced from Page 1).
// Detects which top-gap facts the current text already covers, returns 2
// questions for the highest-gap facts that are NOT yet addressed.

import { supabase } from '@/lib/supabase'
import { openai } from '@/lib/openai'
import { type FactTag } from '@/lib/scoring'
import { buildDynamicFollowupPrompt, stripMarkdownFences } from '@/lib/prompts'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { eg_property_id, current_text } = await req.json()

  if (!eg_property_id || !current_text) {
    return NextResponse.json({ error: 'eg_property_id and current_text are required' }, { status: 400 })
  }

  // Fetch the hotel's gap_questions (pre-generated, sorted by gap_score desc)
  const { data: ha, error } = await supabase
    .from('hotel_analysis')
    .select('gap_questions, fact_inventory')
    .eq('eg_property_id', eg_property_id)
    .single()

  if (error || !ha) {
    return NextResponse.json({ questions: [] })
  }

  type GapQuestion = { tag_id: string; fact_claim: string; question: string; gap_score: number }
  const gapQuestions: GapQuestion[] = (ha.gap_questions as GapQuestion[]) ?? []

  if (gapQuestions.length === 0) {
    // Fallback: try to build from fact_inventory directly (no pre-generated questions yet)
    return NextResponse.json({ questions: [] })
  }

  // Use top 5 gap questions for the detection pool
  const topGapFacts = gapQuestions.slice(0, 5).map((q) => ({
    tag_id: q.tag_id,
    fact_claim: q.fact_claim,
    question: q.question,
  }))

  const { system, user } = buildDynamicFollowupPrompt(current_text, topGapFacts)

  let questions: Array<{ tag_id: string; question: string }> = []
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    })
    const raw = completion.choices[0].message.content ?? '[]'
    questions = JSON.parse(stripMarkdownFences(raw))
  } catch (err) {
    console.error('[POST /api/ai/followup] Failed to parse response', err)
    // Graceful degradation: return nothing rather than show already-covered questions
    questions = []
  }

  return NextResponse.json({ questions })
}
