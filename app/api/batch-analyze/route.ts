// POST /api/batch-analyze
// Scene 3 across all reviews with empty text_analysis for a given hotel.
// Uses SSE so Page 2 can show a live progress bar.
// Processes reviews sequentially (not in parallel) to avoid rate limits.
import { supabase } from '@/lib/supabase'
import { openai } from '@/lib/openai'
import { RATING_FEATURES } from '@/lib/scoring'
import { buildAnalysisPrompt, stripMarkdownFences } from '@/lib/prompts'
import { fetchHotelDescription, updateHotelAnalysis } from '@/lib/hotelAnalysisUpdater'
import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  const { eg_property_id } = await req.json()

  if (!eg_property_id) {
    return new Response(JSON.stringify({ error: 'eg_property_id is required' }), { status: 400 })
  }

  // Fetch reviews with empty text_analysis ({} or null)
  const { data: reviews, error } = await supabase
    .from('reviews_proc')
    .select('review_id, review_text, text_analysis')
    .eq('eg_property_id', eg_property_id)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  // Filter: only reviews where text_analysis is empty ({}) or null
  const pending = (reviews ?? []).filter((r) => {
    const ta = r.text_analysis
    return !ta || Object.keys(ta).length === 0
  })

  const total = pending.length

  // SSE stream
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      send({ type: 'start', total })

      if (total === 0) {
        send({ type: 'done', processed: 0, total: 0 })
        controller.close()
        return
      }

      // Fetch hotel description once
      let hotelDesc: Record<string, unknown>
      try {
        hotelDesc = await fetchHotelDescription(eg_property_id)
      } catch (err) {
        send({ type: 'error', message: String(err) })
        controller.close()
        return
      }

      let processed = 0
      let failed = 0

      for (const review of pending) {
        if (!review.review_text) {
          processed++
          send({ type: 'progress', processed, total, failed, review_id: review.review_id, skipped: true })
          continue
        }

        try {
          const { system, user } = buildAnalysisPrompt(
            review.review_text,
            hotelDesc,
            [...RATING_FEATURES]
          )

          const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          })

          const raw = completion.choices[0].message.content ?? '{}'
          let text_analysis: Record<string, number> = {}
          try {
            text_analysis = JSON.parse(stripMarkdownFences(raw))
          } catch {
            console.error('[batch-analyze] JSON parse failed for', review.review_id)
            failed++
            processed++
            send({ type: 'progress', processed, total, failed, review_id: review.review_id, error: 'parse_failed' })
            continue
          }

          // Write immediately to DB
          await supabase
            .from('reviews_proc')
            .update({ text_analysis })
            .eq('review_id', review.review_id)

          processed++
          send({ type: 'progress', processed, total, failed, review_id: review.review_id })
        } catch (err) {
          console.error('[batch-analyze] Error for', review.review_id, err)
          failed++
          processed++
          send({ type: 'progress', processed, total, failed, review_id: review.review_id, error: String(err) })
        }
      }

      // After all reviews processed, update hotel_analysis
      try {
        await updateHotelAnalysis(eg_property_id)
      } catch (err) {
        console.error('[batch-analyze] updateHotelAnalysis failed', err)
      }

      send({ type: 'done', processed, total, failed })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
