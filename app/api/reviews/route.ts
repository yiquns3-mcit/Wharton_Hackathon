// POST /api/reviews
// Submit a new review. Writes to DB, then triggers Scene 3 asynchronously.
import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { eg_property_id, rating, review_text, review_title, images } = body

  if (!eg_property_id || !rating) {
    return NextResponse.json(
      { error: 'eg_property_id and rating are required' },
      { status: 400 }
    )
  }

  // Insert — never supply review_id, let Supabase generate UUID
  const { data, error } = await supabase
    .from('reviews_proc')
    .insert({
      eg_property_id,
      acquisition_date: new Date().toISOString().split('T')[0],
      lob: 'HOTELS',
      rating,
      review_title: review_title ?? null,
      review_text: review_text ?? null,
      images: images ?? [],
      // text_analysis intentionally omitted — defaults to {}
    })
    .select('review_id')
    .single()

  if (error) {
    console.error('[POST /api/reviews]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const review_id = data.review_id

  // Trigger Scene 3 asynchronously — don't block the user's response
  if (review_text) {
    fetch(`${req.nextUrl.origin}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ review_id }),
    }).catch((err) => console.error('[POST /api/reviews] async analyze failed', err))
  }

  return NextResponse.json({ ok: true, review_id }, { status: 201 })
}
