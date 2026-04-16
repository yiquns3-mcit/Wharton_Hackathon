// POST /api/ai/facts
// Force-regenerates fact tags from hotel description.
// Clears stale fact_analysis on all reviews for the hotel (old tag_ids become invalid).

import { supabase } from '@/lib/supabase'
import { extractAndStoreFacts } from '@/lib/factExtractor'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { eg_property_id } = body as { eg_property_id: string }

  if (!eg_property_id) {
    return NextResponse.json({ error: 'eg_property_id is required' }, { status: 400 })
  }

  try {
    // Force re-extract facts from description (skips idempotency check)
    const factInventory = await extractAndStoreFacts(eg_property_id, true)

    // Clear stale fact_analysis on all reviews — old tag_ids are now invalid
    const { error: clearError } = await supabase
      .from('reviews_proc')
      .update({ fact_analysis: {} })
      .eq('eg_property_id', eg_property_id)

    if (clearError) {
      console.error('[POST /api/ai/facts] Failed to clear fact_analysis:', clearError.message)
    }

    return NextResponse.json({
      ok: true,
      count: factInventory.length,
      fact_inventory: factInventory,
    })
  } catch (err) {
    console.error('[POST /api/ai/facts]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
