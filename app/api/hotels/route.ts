// GET /api/hotels
// Returns all hotels from description_proc (id + display info + review_count)
import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET() {
  const hotelsRes = await supabase
    .from('description_proc')
    .select('eg_property_id, property_name, property_image_url, city, province, country, star_rating, guestrating_avg_expedia')
    .order('eg_property_id')

  if (hotelsRes.error) {
    console.error('[GET /api/hotels] hotels query failed', hotelsRes.error)
    return NextResponse.json({ error: hotelsRes.error.message }, { status: 500 })
  }

  // Paginate through all reviews to get accurate per-hotel counts
  // (Supabase JS client caps at 1000 rows by default without pagination)
  const counts: Record<string, number> = {}
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('reviews_proc')
      .select('eg_property_id')
      .range(from, from + PAGE - 1)
    if (error) break
    for (const row of data ?? []) {
      counts[row.eg_property_id] = (counts[row.eg_property_id] ?? 0) + 1
    }
    if (!data || data.length < PAGE) break
    from += PAGE
  }

  const data = (hotelsRes.data ?? []).map(h => ({
    ...h,
    review_count: counts[h.eg_property_id] ?? 0,
  }))

  return NextResponse.json(data)
}
