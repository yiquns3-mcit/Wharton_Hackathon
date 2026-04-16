// POST /api/batch-analyze
// Scene 3 across all reviews with empty text_analysis for a given hotel.
// Uses SSE so Page 2 can show a live progress bar.
// Processes reviews sequentially (not in parallel) to avoid rate limits.
import { supabase } from '@/lib/supabase'
import { openai } from '@/lib/openai'
import { RATING_FEATURES, type FactTag } from '@/lib/scoring'
import { buildAnalysisPrompt, stripMarkdownFences } from '@/lib/prompts'
import { updateHotelAnalysis } from '@/lib/hotelAnalysisUpdater'
import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  const { eg_property_id, force = false } = await req.json()

  if (!eg_property_id) {
    return new Response(JSON.stringify({ error: 'eg_property_id is required' }), { status: 400 })
  }

  // Fetch hotel's fact_inventory once (used in every review's Scene 3 prompt)
  const { data: ha } = await supabase
    .from('hotel_analysis')
    .select('fact_inventory')
    .eq('eg_property_id', eg_property_id)
    .single()

  const factTags: Array<{ tag_id: string; fact_claim: string }> =
    ((ha?.fact_inventory as FactTag[]) ?? []).map((f) => ({
      tag_id: f.tag_id,
      fact_claim: f.fact_claim,
    }))

  // Fetch all reviews for this hotel
  const { data: reviews, error } = await supabase
    .from('reviews_proc')
    .select('review_id, review_text, text_analysis')
    .eq('eg_property_id', eg_property_id)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  // When force=true, re-process all reviews; otherwise only those with empty text_analysis
  const pending = (reviews ?? []).filter((r) => {
    if (force) return true
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
            [...RATING_FEATURES],
            factTags.length > 0 ? factTags : undefined
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
          let fact_analysis: Record<string, number> = {}

          try {
            const parsed = JSON.parse(stripMarkdownFences(raw))
            if (parsed.text_analysis) {
              text_analysis = parsed.text_analysis
              fact_analysis = parsed.fact_analysis ?? {}
            } else {
              text_analysis = parsed
            }
          } catch {
            console.error('[batch-analyze] JSON parse failed for', review.review_id)
            failed++
            processed++
            send({ type: 'progress', processed, total, failed, review_id: review.review_id, error: 'parse_failed' })
            continue
          }

          // Write immediately to DB
          const updatePayload: Record<string, unknown> = { text_analysis }
          if (factTags.length > 0) {
            updatePayload.fact_analysis = fact_analysis
          }

          await supabase
            .from('reviews_proc')
            .update(updatePayload)
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

      // After all reviews processed, update hotel_analysis (includes gap score recalculation)
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
