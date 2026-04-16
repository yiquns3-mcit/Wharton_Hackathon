// POST /api/analyze
// Scene 3 for a single review: analyse review_text → write text_analysis → update hotel_analysis
import { supabase } from '@/lib/supabase'
import { openai } from '@/lib/openai'
import { RATING_FEATURES } from '@/lib/scoring'
import { buildAnalysisPrompt, stripMarkdownFences } from '@/lib/prompts'
import { updateHotelAnalysis } from '@/lib/hotelAnalysisUpdater'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { review_id } = await req.json()

  if (!review_id) {
    return NextResponse.json({ error: 'review_id is required' }, { status: 400 })
  }

  // 1. Fetch the review
  const { data: review, error: reviewError } = await supabase
    .from('reviews_proc')
    .select('review_id, eg_property_id, review_text')
    .eq('review_id', review_id)
    .single()

  if (reviewError || !review) {
    return NextResponse.json({ error: 'Review not found' }, { status: 404 })
  }

  if (!review.review_text) {
    return NextResponse.json({ error: 'Review has no text to analyse' }, { status: 400 })
  }

  // 2. Call Scene 3
  const { system, user } = buildAnalysisPrompt(
    review.review_text,
    [...RATING_FEATURES]
  )

  let text_analysis: Record<string, number> = {}
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    })
    const raw = completion.choices[0].message.content ?? '{}'
    text_analysis = JSON.parse(stripMarkdownFences(raw))
  } catch (err) {
    console.error('[POST /api/analyze] Failed to parse OpenAI response', err)
    return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
  }

  // 4. Write text_analysis back to reviews_proc
  const { error: updateError } = await supabase
    .from('reviews_proc')
    .update({ text_analysis })
    .eq('review_id', review_id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // 5. Trigger auto-update of hotel_analysis (async — don't block response)
  updateHotelAnalysis(review.eg_property_id).catch((err) =>
    console.error('[POST /api/analyze] updateHotelAnalysis failed', err)
  )

  return NextResponse.json({ ok: true, review_id, text_analysis })
}
