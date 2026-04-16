// POST /api/analyze
// Scene 3 for a single review: analyse review_text → write text_analysis + fact_analysis → update hotel_analysis
import { supabase } from '@/lib/supabase'
import { openai } from '@/lib/openai'
import { RATING_FEATURES, type FactTag } from '@/lib/scoring'
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

  // 2. Fetch hotel's fact_inventory to include in Scene 3 prompt
  const { data: ha } = await supabase
    .from('hotel_analysis')
    .select('fact_inventory')
    .eq('eg_property_id', review.eg_property_id)
    .single()

  const factTags: Array<{ tag_id: string; fact_claim: string }> =
    ((ha?.fact_inventory as FactTag[]) ?? []).map((f) => ({
      tag_id: f.tag_id,
      fact_claim: f.fact_claim,
    }))

  // 3. Call Scene 3
  const { system, user } = buildAnalysisPrompt(
    review.review_text,
    [...RATING_FEATURES],
    factTags.length > 0 ? factTags : undefined
  )

  let text_analysis: Record<string, number> = {}
  let fact_analysis: Record<string, number> = {}

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    })
    const raw = completion.choices[0].message.content ?? '{}'
    const parsed = JSON.parse(stripMarkdownFences(raw))

    // New format: { text_analysis: {...}, fact_analysis: {...} }
    if (parsed.text_analysis) {
      text_analysis = parsed.text_analysis
      fact_analysis = parsed.fact_analysis ?? {}
    } else {
      // Fallback: old flat format (no fact tags were passed)
      text_analysis = parsed
    }
  } catch (err) {
    console.error('[POST /api/analyze] Failed to parse OpenAI response', err)
    return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
  }

  // 4. Write text_analysis + fact_analysis back to reviews_proc
  const updatePayload: Record<string, unknown> = { text_analysis }
  if (factTags.length > 0) {
    updatePayload.fact_analysis = fact_analysis
  }

  const { error: updateError } = await supabase
    .from('reviews_proc')
    .update(updatePayload)
    .eq('review_id', review_id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // 5. Trigger auto-update of hotel_analysis (async — don't block response)
  updateHotelAnalysis(review.eg_property_id).catch((err) =>
    console.error('[POST /api/analyze] updateHotelAnalysis failed', err)
  )

  return NextResponse.json({ ok: true, review_id, text_analysis, fact_analysis })
}
