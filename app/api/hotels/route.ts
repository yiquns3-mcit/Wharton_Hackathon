// GET /api/hotels
// Returns all hotels from description_proc (id + display info)
import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET() {
  const { data, error } = await supabase
    .from('description_proc')
    .select('eg_property_id, city, province, country, star_rating, guestrating_avg_expedia')
    .order('eg_property_id')

  if (error) {
    console.error('[GET /api/hotels]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
