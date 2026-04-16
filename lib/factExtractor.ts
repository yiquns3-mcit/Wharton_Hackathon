// lib/factExtractor.ts
// One-time (idempotent) fact extraction for a hotel.
// Reads description_proc, calls GPT-4o to extract verifiable Fact Tags,
// initialises gap stats, and upserts to hotel_analysis.fact_inventory.

import { supabase } from './supabase'
import { openai } from './openai'
import { buildFactExtractionPrompt, stripMarkdownFences } from './prompts'
import type { FactTag } from './scoring'

// Fetch full description_proc for a hotel
async function fetchDescription(propertyId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('description_proc')
    .select('*')
    .eq('eg_property_id', propertyId)
    .single()
  if (error || !data) throw new Error(`fetchDescription: ${error?.message ?? 'not found'}`)
  return data as Record<string, unknown>
}

// Check whether fact_inventory is already populated for a hotel
async function hasFactInventory(propertyId: string): Promise<boolean> {
  const { data } = await supabase
    .from('hotel_analysis')
    .select('fact_inventory')
    .eq('eg_property_id', propertyId)
    .single()
  const inventory = data?.fact_inventory
  return Array.isArray(inventory) && inventory.length > 0
}

// Extract facts from description using GPT-4o, initialise gap stats, upsert.
// Idempotent: skips if fact_inventory is already populated.
export async function extractAndStoreFacts(propertyId: string): Promise<FactTag[]> {
  if (await hasFactInventory(propertyId)) {
    // Already seeded — fetch and return existing inventory
    const { data } = await supabase
      .from('hotel_analysis')
      .select('fact_inventory')
      .eq('eg_property_id', propertyId)
      .single()
    return (data?.fact_inventory as FactTag[]) ?? []
  }

  const hotelDescription = await fetchDescription(propertyId)
  const { system, user } = buildFactExtractionPrompt(hotelDescription)

  let rawFacts: Array<{ tag_id: string; source_field: string; fact_claim: string; volatility: 'high' | 'medium' }> = []
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    })
    const raw = completion.choices[0].message.content ?? '[]'
    rawFacts = JSON.parse(stripMarkdownFences(raw))
  } catch (err) {
    console.error('[extractAndStoreFacts] Failed to parse GPT response', err)
    rawFacts = []
  }

  // Initialise each fact with empty coverage stats; unverified = max gap score
  const factInventory: FactTag[] = rawFacts.map((f) => ({
    tag_id: f.tag_id,
    source_field: f.source_field,
    fact_claim: f.fact_claim,
    volatility: f.volatility ?? 'high',
    last_verified_at: null,
    coverage_count_last_year: 0,
    total_reviews_last_year: 0,
    gap_score: 1.0,
  }))

  // Upsert into hotel_analysis (create row if missing)
  await supabase
    .from('hotel_analysis')
    .upsert(
      { eg_property_id: propertyId, fact_inventory: factInventory },
      { onConflict: 'eg_property_id' }
    )

  return factInventory
}
