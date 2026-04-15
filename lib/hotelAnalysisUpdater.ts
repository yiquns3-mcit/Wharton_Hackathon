// lib/hotelAnalysisUpdater.ts
// Shared logic: after Scene 3 completes for a review, recalculate hotel_analysis
// and conditionally regenerate ai_questions (Scene 2).

import { supabase } from './supabase'
import { openai } from './openai'
import { calculatePriorityScores, DEFAULT_WEIGHTS, type WeightConfig } from './scoring'
import { buildQuestionsPrompt, stripMarkdownFences } from './prompts'

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

// Fetch all reviews for a hotel (rating + text_analysis + acquisition_date)
export async function fetchHotelReviews(propertyId: string) {
  const { data, error } = await supabase
    .from('reviews_proc')
    .select('acquisition_date, rating, text_analysis')
    .eq('eg_property_id', propertyId)
  if (error) throw new Error(`fetchHotelReviews: ${error.message}`)
  return data ?? []
}

// Core auto-update logic (Section 8 of CLAUDE.md)
export async function updateHotelAnalysis(propertyId: string, overrideWeights?: WeightConfig) {
  // 1. Read current weight_config from hotel_analysis (source of truth)
  const { data: existing } = await supabase
    .from('hotel_analysis')
    .select('top_features, weight_config')
    .eq('eg_property_id', propertyId)
    .single()

  const weights: WeightConfig =
    overrideWeights ??
    (existing?.weight_config as WeightConfig) ??
    DEFAULT_WEIGHTS

  const oldTopFeatures: string[] = existing?.top_features ?? []

  // 2. Recalculate
  const reviews = await fetchHotelReviews(propertyId)
  const { priority_scores, top_features } = calculatePriorityScores(reviews, weights)

  // 3. Compare order (order-sensitive)
  const orderChanged =
    top_features.length !== oldTopFeatures.length ||
    top_features.some((f, i) => f !== oldTopFeatures[i])

  let ai_questions = undefined

  if (orderChanged) {
    // 4. Call Scene 2 to regenerate questions
    const hotelDesc = await fetchHotelDescription(propertyId)
    const { system, user } = buildQuestionsPrompt(top_features, hotelDesc)
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    })
    const raw = completion.choices[0].message.content ?? '[]'
    try {
      ai_questions = JSON.parse(stripMarkdownFences(raw))
    } catch {
      console.error('[updateHotelAnalysis] Failed to parse ai_questions', raw)
      ai_questions = []
    }
  }

  // 5. Upsert hotel_analysis
  const upsertPayload: Record<string, unknown> = {
    eg_property_id: propertyId,
    priority_scores,
    top_features,
    weight_config: weights,
    last_updated: new Date().toISOString(),
  }
  if (ai_questions !== undefined) {
    upsertPayload.ai_questions = ai_questions
  }

  const { error: upsertError } = await supabase
    .from('hotel_analysis')
    .upsert(upsertPayload, { onConflict: 'eg_property_id' })

  if (upsertError) throw new Error(`upsert hotel_analysis: ${upsertError.message}`)

  return { priority_scores, top_features, orderChanged }
}
