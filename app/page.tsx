'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Types ──────────────────────────────────────────────────────────────────
interface Hotel {
  eg_property_id: string
  city: string
  country: string
  star_rating: number
}

interface AiQuestion {
  feature: string
  question: string
}

// ─── Star Rating Component ───────────────────────────────────────────────────
function StarRating({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  const [hovered, setHovered] = useState(0)
  return (
    <div className="flex gap-1 items-center">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(star)}
          className="text-2xl transition-transform hover:scale-110 leading-none"
        >
          <span className={(hovered || value) >= star ? 'text-yellow-400' : 'text-gray-300'}>
            ★
          </span>
        </button>
      ))}
      {value > 0 && (
        <button
          type="button"
          onClick={() => onChange(0)}
          className="text-xs text-gray-400 ml-1 hover:text-gray-600"
        >
          清除
        </button>
      )}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function ReviewPage() {
  const [hotels, setHotels] = useState<Hotel[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [questions, setQuestions] = useState<AiQuestion[]>([])
  const [ratings, setRatings] = useState<Record<string, number>>({})
  const [reviewText, setReviewText] = useState('')
  const [reviewTitle, setReviewTitle] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [polishing, setPolishing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [loadingQuestions, setLoadingQuestions] = useState(false)

  // Voice input
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const [listening, setListening] = useState(false)

  // Load hotels on mount
  useEffect(() => {
    fetch('/api/hotels')
      .then((r) => r.json())
      .then(setHotels)
  }, [])

  // When hotel changes, load ai_questions
  const handleHotelChange = async (id: string) => {
    setSelectedId(id)
    setQuestions([])
    setRatings({})
    if (!id) return

    setLoadingQuestions(true)
    const res = await fetch(`/api/hotels/${id}/questions`)
    const data = await res.json()
    setQuestions(data.ai_questions ?? [])
    setLoadingQuestions(false)
  }

  // Star rating change
  const setRating = (feature: string, value: number) => {
    setRatings((prev) => ({ ...prev, [feature]: value }))
  }

  // Image upload to Supabase Storage
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setUploading(true)
    const urls: string[] = []
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const path = `reviews/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('review-images').upload(path, file)
      if (!error) {
        const { data: urlData } = supabase.storage.from('review-images').getPublicUrl(path)
        if (urlData.publicUrl) urls.push(urlData.publicUrl)
      }
    }
    setImages((prev) => [...prev, ...urls])
    setUploading(false)
  }

  // AI polish
  const handlePolish = async () => {
    if (!reviewText.trim()) return
    setPolishing(true)
    const res = await fetch('/api/ai/polish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft_text: reviewText, ratings }),
    })
    const data = await res.json()
    if (data.polished) setReviewText(data.polished)
    setPolishing(false)
  }

  // Voice input (Web Speech API)
  const toggleVoice = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      alert('您的浏览器不支持语音输入')
      return
    }
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = new SR()
    rec.lang = 'zh-CN'
    rec.continuous = true
    rec.interimResults = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => r[0].transcript)
        .join('')
      setReviewText((prev) => prev + transcript)
    }
    rec.onend = () => setListening(false)
    rec.start()
    recognitionRef.current = rec
    setListening(true)
  }

  // Submit review
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedId) return
    setSubmitting(true)

    // Build full rating JSONB — 0 means not rated
    const fullRating: Record<string, number> = {
      checkin: 0, overall: 0, service: 0, location: 0, roomcomfort: 0,
      roomquality: 0, communication: 0, onlinelisting: 0, valueformoney: 0,
      hotelcondition: 0, ecofriendliness: 0, roomcleanliness: 0,
      roomamenitiesscore: 0, convenienceoflocation: 0, neighborhoodsatisfaction: 0,
    }
    for (const [k, v] of Object.entries(ratings)) {
      if (k in fullRating) fullRating[k] = v
    }

    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eg_property_id: selectedId,
        rating: fullRating,
        review_title: reviewTitle || null,
        review_text: reviewText || null,
        images,
      }),
    })

    if (res.ok) {
      setSubmitted(true)
    } else {
      const err = await res.json()
      alert(`提交失败：${err.error}`)
    }
    setSubmitting(false)
  }

  // ─── Success state ──────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white flex items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <div className="text-6xl">🎉</div>
          <h2 className="text-2xl font-bold text-gray-800">感谢您的评论！</h2>
          <p className="text-gray-500">您的反馈正在后台分析，将帮助其他旅客做出更好的选择。</p>
          <button
            onClick={() => {
              setSubmitted(false)
              setSelectedId('')
              setQuestions([])
              setRatings({})
              setReviewText('')
              setReviewTitle('')
              setImages([])
            }}
            className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          >
            再写一条评论
          </button>
        </div>
      </div>
    )
  }

  // ─── Main form ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-800">✍️ 写一条酒店评论</h1>
          <p className="text-gray-500 mt-1">分享您的真实住宿体验，帮助其他旅客</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Hotel selector */}
          <div className="bg-white rounded-2xl shadow-sm border p-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">选择酒店</label>
            <select
              required
              className="w-full border rounded-lg px-4 py-2 text-sm bg-white"
              value={selectedId}
              onChange={(e) => handleHotelChange(e.target.value)}
            >
              <option value="">— 请选择您入住的酒店 —</option>
              {hotels.map((h) => (
                <option key={h.eg_property_id} value={h.eg_property_id}>
                  {h.eg_property_id} · {h.city}, {h.country} ⭐{h.star_rating}
                </option>
              ))}
            </select>
          </div>

          {/* Guided questions + star ratings */}
          {selectedId && (
            <div className="bg-white rounded-2xl shadow-sm border p-5 space-y-5">
              <h2 className="text-base font-semibold text-gray-700">请为以下方面评分</h2>
              {loadingQuestions ? (
                <p className="text-sm text-gray-400 animate-pulse">加载引导问题中...</p>
              ) : questions.length === 0 ? (
                <p className="text-sm text-gray-400">暂无引导问题，请直接填写文字评论。</p>
              ) : (
                questions.map((q) => (
                  <div key={q.feature} className="space-y-1">
                    <p className="text-sm text-gray-700">{q.question}</p>
                    <StarRating
                      value={ratings[q.feature] ?? 0}
                      onChange={(v) => setRating(q.feature, v)}
                    />
                  </div>
                ))
              )}
            </div>
          )}

          {/* Review title */}
          {selectedId && (
            <div className="bg-white rounded-2xl shadow-sm border p-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">评论标题（可选）</label>
              <input
                type="text"
                maxLength={120}
                placeholder="用一句话总结您的体验"
                className="w-full border rounded-lg px-4 py-2 text-sm"
                value={reviewTitle}
                onChange={(e) => setReviewTitle(e.target.value)}
              />
            </div>
          )}

          {/* Free text review */}
          {selectedId && (
            <div className="bg-white rounded-2xl shadow-sm border p-5 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">详细评论（可选）</label>
                <button
                  type="button"
                  onClick={toggleVoice}
                  className={`text-xs px-3 py-1 rounded-full border transition ${
                    listening
                      ? 'bg-red-100 border-red-400 text-red-600 animate-pulse'
                      : 'bg-gray-100 border-gray-300 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {listening ? '🎙 停止录音' : '🎙 语音输入'}
                </button>
              </div>
              <textarea
                rows={5}
                placeholder="请描述您的入住体验，如房间状况、服务质量、周边环境等..."
                className="w-full border rounded-lg px-4 py-2 text-sm resize-none"
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
              />
              <button
                type="button"
                onClick={handlePolish}
                disabled={!reviewText.trim() || polishing}
                className="text-sm px-4 py-2 bg-violet-100 text-violet-700 rounded-lg hover:bg-violet-200 transition disabled:opacity-40"
              >
                {polishing ? '✨ AI 润色中...' : '✨ AI 润色'}
              </button>
            </div>
          )}

          {/* Image upload */}
          {selectedId && (
            <div className="bg-white rounded-2xl shadow-sm border p-5 space-y-3">
              <label className="block text-sm font-medium text-gray-700">上传图片（可选）</label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="text-sm text-gray-500"
              />
              {uploading && <p className="text-xs text-gray-400 animate-pulse">上传中...</p>}
              {images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {images.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={url}
                      alt={`上传图片 ${i + 1}`}
                      className="w-20 h-20 object-cover rounded-lg border"
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Submit */}
          {selectedId && (
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-indigo-600 text-white rounded-2xl font-semibold text-base hover:bg-indigo-700 transition disabled:opacity-50 shadow-md"
            >
              {submitting ? '提交中...' : '提交评论'}
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
