// GET /api/hotels/[id]/questions
// Returns gap_questions (new fact-gap system) from hotel_analysis for a given hotel.
// Falls back to ai_questions if gap_questions not yet populated.
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
    .select('gap_questions, ai_questions, top_features, last_updated')
    .eq('eg_property_id', id)
    .single()

  if (error || !data) {
    return NextResponse.json({ gap_questions: [], top_features: [] })
  }

  // Prefer gap_questions (new system); fall back to ai_questions (legacy)
  type GapQuestion = { tag_id: string; fact_claim: string; question: string; gap_score: number }
  type LegacyQuestion = { feature: string; question: string }

  const gapQuestions: GapQuestion[] = (data.gap_questions as GapQuestion[]) ?? []
  const legacyQuestions: LegacyQuestion[] = (data.ai_questions as LegacyQuestion[]) ?? []

  // Normalise to a single shape for the frontend:
  // { id: string, question: string } — id is tag_id (new) or feature (legacy)
  const questions =
    gapQuestions.length > 0
      ? gapQuestions.map((q) => ({ id: q.tag_id, question: q.question, gap_score: q.gap_score }))
      : legacyQuestions.map((q) => ({ id: q.feature, question: q.question, gap_score: 0 }))

  return NextResponse.json({
    questions,
    top_features: data.top_features ?? [],
    last_updated: data.last_updated,
  })
}
