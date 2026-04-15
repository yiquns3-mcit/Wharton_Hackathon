// GET /api/hotels/[id]/questions
// Returns ai_questions from hotel_analysis for a given hotel.
// Page 1 reads this directly — no OpenAI call at page load time.
import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data, error } = await supabase
    .from('hotel_analysis')
    .select('ai_questions, top_features, last_updated')
    .eq('eg_property_id', id)
    .single()

  if (error || !data) {
    // hotel_analysis not yet initialised for this hotel
    return NextResponse.json({ ai_questions: [], top_features: [] })
  }

  return NextResponse.json({
    ai_questions: data.ai_questions ?? [],
    top_features: data.top_features ?? [],
    last_updated: data.last_updated,
  })
}
