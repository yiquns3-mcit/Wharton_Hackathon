// lib/hotelAnalysisUpdater.ts
// Shared logic: after Scene 3 completes for a review, recalculate hotel_analysis
// including both the legacy priority scores and the new Fact Gap system.

import { supabase } from './supabase'
import { openai } from './openai'
import {
  calculatePriorityScores,
  calculateGapScores,
  DEFAULT_WEIGHTS,
  type WeightConfig,
  type FactTag,
  type ReviewRow,
} from './scoring'
import { buildGapQuestionsPrompt, stripMarkdownFences } from './prompts'
import { extractAndStoreFacts } from './factExtractor'

// Fetch all description_proc fields for a hotel (used in Scene 2 & 3)
export async function fetchHotelDescription(propertyId: string) {
  const { data, error } = await supabase
    .from('description_proc')
    .select('*')
    .eq('eg_property_id', propertyId)
    .single()
  if (error) throw new Error(`fetchHotelDescription: ${error.message}`)
  return data
}

// Fetch all reviews for a hotel (rating + text_analysis + fact_analysis + acquisition_date)
export async function fetchHotelReviews(propertyId: string): Promise<ReviewRow[]> {
  const { data, error } = await supabase
    .from('reviews_proc')
    .select('acquisition_date, rating, review_text, text_analysis, fact_analysis')
    .eq('eg_property_id', propertyId)
  if (error) throw new Error(`fetchHotelReviews: ${error.message}`)
  return (data ?? []) as ReviewRow[]
}

// Core auto-update logic
export async function updateHotelAnalysis(propertyId: string, overrideWeights?: WeightConfig) {
  // 1. Read current state from hotel_analysis
  const { data: existing } = await supabase
    .from('hotel_analysis')
    .select('top_features, weight_config, fact_inventory, gap_questions')
    .eq('eg_property_id', propertyId)
    .single()

  const weights: WeightConfig =
    overrideWeights ??
    (existing?.weight_config as WeightConfig) ??
    DEFAULT_WEIGHTS

  const oldTopFeatures: string[] = existing?.top_features ?? []
  const oldGapQuestions: Array<{ tag_id: string }> = existing?.gap_questions ?? []

  // 2. Ensure fact_inventory is seeded (idempotent — skips if already populated)
  let factInventory: FactTag[] = (existing?.fact_inventory as FactTag[]) ?? []
  if (factInventory.length === 0) {
    factInventory = await extractAndStoreFacts(propertyId)
  }

  // 3. Fetch reviews with fact_analysis included
  const reviews = await fetchHotelReviews(propertyId)

  // 4. Recalculate legacy priority scores (for dashboard BI)
  const { priority_scores, top_features } = calculatePriorityScores(reviews, weights)

  // 5. Recalculate gap scores for fact tags
  const updatedFactInventory = calculateGapScores(factInventory, reviews)
  const topGapFacts = updatedFactInventory.slice(0, 5) // top 5 for question generation pool

  // 6. Determine if gap_questions need regeneration
  //    Regenerate if: top-2 gap tag IDs changed order
  const newTop2TagIds = topGapFacts.slice(0, 2).map((f) => f.tag_id)
  const oldTop2TagIds = oldGapQuestions.slice(0, 2).map((q) => q.tag_id)
  const gapOrderChanged =
    newTop2TagIds.length !== oldTop2TagIds.length ||
    newTop2TagIds.some((id, i) => id !== oldTop2TagIds[i])

  // 7. Also check legacy order for backward compat
  const legacyOrderChanged =
    top_features.length !== oldTopFeatures.length ||
    top_features.some((f, i) => f !== oldTopFeatures[i])

  let gap_questions: Array<{ tag_id: string; fact_claim: string; question: string; gap_score: number }> | undefined

  if (gapOrderChanged && topGapFacts.length > 0) {
    const { system, user } = buildGapQuestionsPrompt(
      topGapFacts.map((f) => ({
        tag_id: f.tag_id,
        fact_claim: f.fact_claim,
        source_field: f.source_field,
      }))
    )
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      })
      const raw = completion.choices[0].message.content ?? '[]'
      const parsed: Array<{ tag_id: string; question: string }> = JSON.parse(stripMarkdownFences(raw))
      // Merge question text with gap_score from fact inventory
      gap_questions = parsed.map((q) => {
        const fact = topGapFacts.find((f) => f.tag_id === q.tag_id)
        return {
          tag_id: q.tag_id,
          fact_claim: fact?.fact_claim ?? '',
          question: q.question,
          gap_score: fact?.gap_score ?? 0,
        }
      })
    } catch (err) {
      console.error('[updateHotelAnalysis] Failed to parse gap_questions', err)
      gap_questions = []
    }
  }

  // 8. Upsert hotel_analysis
  const upsertPayload: Record<string, unknown> = {
    eg_property_id: propertyId,
    priority_scores,
    top_features,
    weight_config: weights,
    fact_inventory: updatedFactInventory,
    last_updated: new Date().toISOString(),
  }
  if (gap_questions !== undefined) {
    upsertPayload.gap_questions = gap_questions
  }

  const { error: upsertError } = await supabase
    .from('hotel_analysis')
    .upsert(upsertPayload, { onConflict: 'eg_property_id' })

  if (upsertError) throw new Error(`upsert hotel_analysis: ${upsertError.message}`)

  return {
    priority_scores,
    top_features,
    legacyOrderChanged,
    gapOrderChanged,
    factInventory: updatedFactInventory,
  }
}
