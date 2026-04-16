// GET  /api/bi/[id] — full BI metrics for a hotel
// POST /api/bi/[id] — recalculate with new weights

import { supabase } from '@/lib/supabase'
import { calculatePriorityScores, DEFAULT_WEIGHTS, type WeightConfig } from '@/lib/scoring'
import { updateHotelAnalysis, fetchHotelReviews } from '@/lib/hotelAnalysisUpdater'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET ───────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const eg_property_id = id

  // Fetch all reviews for the hotel
  const reviews = await fetchHotelReviews(eg_property_id)
  const total = reviews.length

  // Read current weight_config from hotel_analysis
  const { data: ha } = await supabase
    .from('hotel_analysis')
    .select('priority_scores, top_features, weight_config, last_updated, fact_inventory, gap_questions')
    .eq('eg_property_id', eg_property_id)
    .single()

  const weights: WeightConfig = (ha?.weight_config as WeightConfig) ?? DEFAULT_WEIGHTS

  // Calculate all three dimensions + priority scores
  const { priority_scores, top_features, dimensions } = calculatePriorityScores(reviews, weights)

  // Count reviews with text_analysis populated (non-empty).
  // Exclude reviews with no review_text — they can never be analyzed.
  const analyzable = reviews.filter((r) => r.review_text && r.review_text.trim().length > 0)
  const withTextAnalysis = analyzable.filter(
    (r) => r.text_analysis && Object.keys(r.text_analysis).length > 0
  ).length

  return NextResponse.json({
    eg_property_id,
    total_reviews: total,
    text_analysis_coverage: analyzable.length > 0 ? withTextAnalysis / analyzable.length : 0,
    last_updated: ha?.last_updated ?? null,
    weights,
    priority_scores,
    top_features,
    dimensions,
    fact_inventory: ha?.fact_inventory ?? [],
    gap_questions: ha?.gap_questions ?? [],
  })
}

// ─── POST ──────────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const eg_property_id = id

  const body = await req.json()
  const { w1, w2, w3, force_questions = false } = body as { w1: number; w2: number; w3: number; force_questions?: boolean }

  // Validate weights sum to 1 (allow small float error)
  if (
    typeof w1 !== 'number' ||
    typeof w2 !== 'number' ||
    typeof w3 !== 'number' ||
    Math.abs(w1 + w2 + w3 - 1) > 0.01
  ) {
    return NextResponse.json(
      { error: 'w1 + w2 + w3 must equal 1' },
      { status: 400 }
    )
  }

  const newWeights: WeightConfig = { w1, w2, w3 }

  try {
    const result = await updateHotelAnalysis(eg_property_id, newWeights, force_questions)

    // Return refreshed full metrics
    const reviews = await fetchHotelReviews(eg_property_id)
    const { dimensions } = calculatePriorityScores(reviews, newWeights)

    const analyzable = reviews.filter((r) => r.review_text && r.review_text.trim().length > 0)
    const withTextAnalysis = analyzable.filter(
      (r) => r.text_analysis && Object.keys(r.text_analysis).length > 0
    ).length

    return NextResponse.json({
      ok: true,
      orderChanged: result.legacyOrderChanged,
      priority_scores: result.priority_scores,
      top_features: result.top_features,
      dimensions,
      total_reviews: reviews.length,
      text_analysis_coverage: analyzable.length > 0 ? withTextAnalysis / analyzable.length : 0,
      weights: newWeights,
    })
  } catch (err) {
    console.error('[POST /api/bi/[id]]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
