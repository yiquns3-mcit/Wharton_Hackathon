'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// ── Types ────────────────────────────────────────────────────────────────────
interface Hotel {
  eg_property_id: string
  city: string
  province: string
  country: string
  star_rating: number
  guestrating_avg_expedia: number
}

interface AiQuestion {
  feature: string
  question: string
}

type AiPanelState = 'hidden' | 'loading' | 'result'

// ── Sub-components ────────────────────────────────────────────────────────────

function NavBar() {
  return (
    <nav className="bg-white border-b border-outline-variant sticky top-0 z-50"
         style={{ borderBottomColor: 'rgba(194,198,214,0.15)' }}>
      <div className="flex justify-between items-center w-full px-6 py-3 max-w-screen-2xl mx-auto">
        <div className="flex items-center gap-8">
          <span className="text-2xl font-black plusJakartaSans" style={{ color: '#0050b8' }}>
            Expedia
          </span>
          <div className="hidden md:flex items-center gap-6">
            <a href="#" className="text-slate-600 hover:text-[#0050b8] plusJakartaSans text-sm font-medium transition-colors">
              Trips
            </a>
            <a href="#" className="text-slate-600 hover:text-[#0050b8] plusJakartaSans text-sm font-medium transition-colors">
              Support
            </a>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-4">
            <span className="text-slate-600 hover:text-[#0050b8] plusJakartaSans text-sm font-medium cursor-pointer">
              Language
            </span>
            <span className="text-slate-600 hover:text-[#0050b8] plusJakartaSans text-sm font-medium cursor-pointer">
              List your property
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="material-symbols-outlined cursor-pointer hover:bg-slate-50 p-2 rounded-full transition-colors"
                  style={{ color: '#424654' }}>
              notifications
            </span>
            <button className="font-semibold text-sm hover:underline" style={{ color: '#0050b8' }}>
              Sign in
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}

function Footer() {
  const cols = [
    { title: 'Company', links: ['About', 'Jobs', 'Advertising'] },
    { title: 'Legal',   links: ['Privacy Policy', 'Terms of Use', 'Accessibility'] },
    { title: 'Support', links: ['Help Center', 'Cancel booking', 'Refund timelines'] },
    { title: 'Connect', links: ['Facebook', 'Twitter', 'Instagram'] },
  ]
  return (
    <footer className="w-full py-12 px-6 flex flex-col md:flex-row justify-between mt-12 border-t"
            style={{ backgroundColor: '#f4f2ff', borderTopColor: '#c2c6d6' }}>
      <div className="max-w-screen-2xl mx-auto w-full flex flex-col md:flex-row justify-between gap-8">
        <div className="mb-8 md:mb-0">
          <span className="text-lg font-bold plusJakartaSans" style={{ color: '#0050b8' }}>Expedia</span>
          <p className="inter text-xs leading-relaxed text-slate-500 mt-4 max-w-xs">
            © 2024 Expedia, Inc., an Expedia Group company. All rights reserved.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
          {cols.map(col => (
            <div key={col.title} className="flex flex-col gap-3">
              <span className="text-on-surface font-bold text-sm mb-1">{col.title}</span>
              {col.links.map(link => (
                <a key={link} href="#"
                   className="inter text-xs leading-relaxed text-slate-500 hover:underline hover:text-[#0050b8] transition-colors">
                  {link}
                </a>
              ))}
            </div>
          ))}
        </div>
      </div>
    </footer>
  )
}

function StarQuestion({
  label,
  feature,
  ratings,
  setRating,
}: {
  label: string
  feature: string
  ratings: Record<string, number>
  setRating: (feature: string, value: number) => void
}) {
  const [hovered, setHovered] = useState(0)
  const current = ratings[feature] ?? 0

  return (
    <div className="space-y-3">
      <label className="text-base font-semibold block" style={{ color: '#141936' }}>
        {label}
      </label>
      <div className="flex gap-2 items-center">
        {[1, 2, 3, 4, 5].map(star => {
          const filled = (hovered || current) >= star
          return (
            <button
              key={star}
              type="button"
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              onClick={() => setRating(feature, star)}
              className="material-symbols-outlined text-4xl transition-colors cursor-pointer select-none"
              style={{
                color: filled ? '#ffe25f' : '#c2c6d6',
                fontVariationSettings: filled
                  ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
                  : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
              }}
            >
              star
            </button>
          )
        })}
        {current > 0 && (
          <button
            type="button"
            onClick={() => setRating(feature, 0)}
            className="text-xs ml-1 self-center transition-colors"
            style={{ color: '#727785' }}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

function PropertyHighlights({ hotel }: { hotel: Hotel }) {
  const starPct       = Math.round((hotel.star_rating / 5) * 100)
  const guestRating   = hotel.guestrating_avg_expedia ?? 0
  // Expedia guest ratings are typically 0–10
  const guestPct      = Math.round((guestRating / 10) * 100)

  return (
    <div className="space-y-8">
      <section className="bg-white p-8 rounded-xl shadow-sm"
               style={{ border: '1px solid rgba(194,198,214,0.3)' }}>
        <h2 className="text-xl font-bold plusJakartaSans mb-6" style={{ color: '#141936' }}>
          Property Highlights
        </h2>
        <div className="space-y-6">
          {/* Hotel class */}
          <div>
            <div className="flex justify-between text-sm font-medium mb-2">
              <span style={{ color: '#141936' }}>Hotel Class</span>
              <span className="font-bold" style={{ color: '#0050b8' }}>
                {hotel.star_rating} ★
              </span>
            </div>
            <div className="h-2 w-full rounded-full overflow-hidden" style={{ backgroundColor: '#f4f2ff' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${starPct}%`, backgroundColor: '#0050b8' }} />
            </div>
          </div>

          {/* Guest rating */}
          {guestRating > 0 && (
            <div>
              <div className="flex justify-between text-sm font-medium mb-2">
                <span style={{ color: '#141936' }}>Guest Rating</span>
                <span className="font-bold" style={{ color: '#0050b8' }}>
                  {guestRating.toFixed(1)} / 10
                </span>
              </div>
              <div className="h-2 w-full rounded-full overflow-hidden" style={{ backgroundColor: '#f4f2ff' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${guestPct}%`, backgroundColor: '#0050b8' }} />
              </div>
            </div>
          )}

          {/* Location */}
          <div className="flex items-center gap-2 pt-2">
            <span className="material-symbols-outlined text-base" style={{ color: '#0050b8' }}>location_on</span>
            <span className="text-sm font-medium" style={{ color: '#141936' }}>
              {[hotel.city, hotel.province, hotel.country].filter(Boolean).join(', ')}
            </span>
          </div>
        </div>
      </section>

      {/* Inspirational quote */}
      <div className="p-6 rounded-xl" style={{ backgroundColor: '#f4f2ff' }}>
        <p className="text-sm italic leading-relaxed" style={{ color: '#424654' }}>
          &ldquo;Your reviews help millions of other travelers find their perfect stay.
          We value your honest feedback!&rdquo;
        </p>
      </div>
    </div>
  )
}

// ── Main Page Component ───────────────────────────────────────────────────────
export default function ReviewPage() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [hotels, setHotels]                 = useState<Hotel[]>([])
  const [selectedId, setSelectedId]         = useState('')
  const [selectedHotel, setSelectedHotel]   = useState<Hotel | null>(null)
  const [questions, setQuestions]           = useState<AiQuestion[]>([])
  const [ratings, setRatings]               = useState<Record<string, number>>({})
  const [reviewText, setReviewText]         = useState('')
  const [reviewTitle, setReviewTitle]       = useState('')
  const [images, setImages]                 = useState<string[]>([])
  const [uploading, setUploading]           = useState(false)
  const [submitting, setSubmitting]         = useState(false)
  const [submitted, setSubmitted]           = useState(false)
  const [loadingQuestions, setLoadingQuestions] = useState(false)
  const [listening, setListening]           = useState(false)
  const [termsAccepted, setTermsAccepted]   = useState(false)

  // AI 3-state panel
  const [aiPanelState, setAiPanelState]     = useState<AiPanelState>('hidden')
  const [polishedText, setPolishedText]     = useState('')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const textareaRef    = useRef<HTMLTextAreaElement>(null)
  const fileInputRef   = useRef<HTMLInputElement>(null)

  // ── Load hotels ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/hotels')
      .then(r => r.json())
      .then(setHotels)
  }, [])

  // ── Hotel selector ─────────────────────────────────────────────────────────
  const handleHotelChange = useCallback(async (id: string) => {
    setSelectedId(id)
    setSelectedHotel(hotels.find(h => h.eg_property_id === id) ?? null)
    setQuestions([])
    setRatings({})
    setAiPanelState('hidden')
    setPolishedText('')
    if (!id) return

    setLoadingQuestions(true)
    const res = await fetch(`/api/hotels/${id}/questions`)
    const data = await res.json()
    setQuestions(data.ai_questions ?? [])
    setLoadingQuestions(false)
  }, [hotels])

  // ── Star rating ────────────────────────────────────────────────────────────
  const setRating = (feature: string, value: number) => {
    setRatings(prev => ({ ...prev, [feature]: value }))
  }

  // ── AI Help Me Write (3-state panel) ──────────────────────────────────────
  const handleHelpMeWrite = async () => {
    if (reviewText.trim().length < 10) return
    setAiPanelState('loading')
    try {
      const res = await fetch('/api/ai/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_text: reviewText, ratings }),
      })
      const data = await res.json()
      setPolishedText(data.polished ?? '')
      setAiPanelState('result')
    } catch {
      setAiPanelState('hidden')
    }
  }

  const handleKeepOriginal = () => setAiPanelState('hidden')

  const handleEdit = () => {
    setReviewText(polishedText)
    setAiPanelState('hidden')
    setTimeout(() => textareaRef.current?.focus(), 100)
  }

  const handleUseThis = () => {
    setReviewText(polishedText)
    setAiPanelState('hidden')
  }

  // ── Voice input ────────────────────────────────────────────────────────────
  const toggleVoice = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      alert('Your browser does not support voice input')
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
    rec.lang = 'en-US'
    rec.continuous = true
    rec.interimResults = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transcript = Array.from(e.results).map((r: any) => r[0].transcript).join('')
      setReviewText(prev => prev + transcript)
    }
    rec.onend = () => setListening(false)
    rec.start()
    recognitionRef.current = rec
    setListening(true)
  }

  // ── Image upload (Supabase Storage) ───────────────────────────────────────
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    const urls: string[] = []
    for (const file of files) {
      const ext  = file.name.split('.').pop()
      const path = `reviews/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('review-images').upload(path, file)
      if (!error) {
        const { data } = supabase.storage.from('review-images').getPublicUrl(path)
        if (data.publicUrl) urls.push(data.publicUrl)
      }
    }
    setImages(prev => [...prev, ...urls])
    setUploading(false)
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedId || !termsAccepted) return
    setSubmitting(true)

    // Build full 15-key rating object — 0 = not rated (never a score)
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
        review_text:  reviewText  || null,
        images,
      }),
    })

    if (res.ok) {
      setSubmitted(true)
    } else {
      const err = await res.json()
      alert(`Submission failed: ${err.error}`)
    }
    setSubmitting(false)
  }

  const resetForm = () => {
    setSubmitted(false); setSelectedId(''); setSelectedHotel(null)
    setQuestions([]); setRatings({}); setReviewText(''); setReviewTitle('')
    setImages([]); setTermsAccepted(false); setAiPanelState('hidden'); setPolishedText('')
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#fbf8ff' }}>
        <NavBar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-8 space-y-5">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
                 style={{ backgroundColor: 'rgba(0,80,184,0.1)' }}>
              <span className="material-symbols-outlined text-4xl" style={{ color: '#0050b8',
                fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 48" }}>
                check_circle
              </span>
            </div>
            <h2 className="text-2xl font-extrabold plusJakartaSans" style={{ color: '#141936' }}>
              Thank you for your review!
            </h2>
            <p style={{ color: '#424654' }}>
              Your feedback is being analyzed and will help other travelers make better choices.
            </p>
            <button
              onClick={resetForm}
              className="mt-4 px-8 py-3 rounded-full font-semibold text-white transition-colors"
              style={{ backgroundColor: '#0050b8' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#00429a')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#0050b8')}
            >
              Write another review
            </button>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col inter" style={{ backgroundColor: '#fbf8ff', color: '#141936' }}>
      <NavBar />

      <main className="flex-1">
        {/* ── Step 1: Hotel selector (shown when nothing selected) ── */}
        {!selectedId ? (
          <div className="max-w-4xl mx-auto px-6 py-20 text-center">
            <span className="material-symbols-outlined text-5xl block mb-4"
                  style={{ color: '#0050b8', fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 48" }}>
              rate_review
            </span>
            <h1 className="text-3xl font-extrabold plusJakartaSans mb-2" style={{ color: '#141936' }}>
              Write a Review
            </h1>
            <p className="mb-8" style={{ color: '#424654' }}>
              Select a property to get started
            </p>
            <div className="max-w-md mx-auto">
              <select
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                style={{
                  backgroundColor: '#f4f2ff',
                  border: '1px solid #c2c6d6',
                  color: '#141936',
                }}
                value={selectedId}
                onChange={e => handleHotelChange(e.target.value)}
              >
                <option value="">— Select a property —</option>
                {hotels.map(h => (
                  <option key={h.eg_property_id} value={h.eg_property_id}>
                    {h.eg_property_id} · {h.city}, {h.country}
                    {h.star_rating ? ` ⭐ ${h.star_rating}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          /* ── Hotel selected: property header + two-column layout ── */
          <div className="max-w-4xl mx-auto px-6 py-12">

            {/* Property header */}
            <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="flex items-center gap-6">
                {/* Hotel avatar / placeholder */}
                <div className="w-24 h-24 rounded-xl overflow-hidden shadow-sm flex-shrink-0 flex items-center justify-center"
                     style={{ backgroundColor: '#e5e6ff' }}>
                  <span className="material-symbols-outlined text-4xl" style={{ color: '#727785' }}>hotel</span>
                </div>

                <div>
                  {/* Breadcrumb */}
                  <nav className="flex items-center gap-2 text-sm mb-2" style={{ color: '#424654' }}>
                    <span className="hover:underline cursor-pointer">My Trips</span>
                    <span className="material-symbols-outlined text-xs">chevron_right</span>
                    <span style={{ color: '#141936' }}>Review Property</span>
                  </nav>

                  <h1 className="text-3xl font-extrabold plusJakartaSans tracking-tight" style={{ color: '#141936' }}>
                    {selectedHotel?.city
                      ? `${selectedHotel.city}${selectedHotel.star_rating ? ` — ${selectedHotel.star_rating}★ Hotel` : ''}`
                      : selectedId}
                  </h1>

                  <div className="flex items-center gap-2 mt-1">
                    <span className="material-symbols-outlined text-sm" style={{ color: '#0050b8' }}>location_on</span>
                    <span className="text-sm" style={{ color: '#424654' }}>
                      {[selectedHotel?.city, selectedHotel?.province, selectedHotel?.country].filter(Boolean).join(', ')}
                    </span>
                  </div>

                  <button
                    onClick={() => handleHotelChange('')}
                    className="text-xs mt-1 hover:underline block"
                    style={{ color: '#0050b8' }}
                  >
                    Change property
                  </button>
                </div>
              </div>
            </header>

            {/* Two-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

              {/* ── Left: Property Highlights ── */}
              <div className="lg:col-span-4">
                {selectedHotel && <PropertyHighlights hotel={selectedHotel} />}
              </div>

              {/* ── Right: Review form ── */}
              <div className="lg:col-span-8">
                <form onSubmit={handleSubmit}>
                  <section className="bg-white p-8 rounded-xl shadow-sm"
                           style={{ border: '1px solid rgba(194,198,214,0.15)' }}>
                    <h2 className="text-2xl font-bold plusJakartaSans mb-8" style={{ color: '#141936' }}>
                      Tell us about your stay
                    </h2>

                    <div className="space-y-10">

                      {/* ── 1. AI Guided Star Questions ── */}
                      <div className="space-y-6">
                        {loadingQuestions ? (
                          /* Loading shimmer */
                          <div className="space-y-6">
                            {[1, 2, 3].map(i => (
                              <div key={i} className="space-y-3">
                                <div className="shimmer-line h-4 w-2/3" />
                                <div className="shimmer-line h-8 w-48" />
                              </div>
                            ))}
                          </div>
                        ) : questions.length === 0 ? (
                          /* Fallback static questions if no AI questions yet */
                          <>
                            <StarQuestion
                              label="How was your overall stay?"
                              feature="overall"
                              ratings={ratings}
                              setRating={setRating}
                            />
                            <StarQuestion
                              label="How would you rate the service?"
                              feature="service"
                              ratings={ratings}
                              setRating={setRating}
                            />
                          </>
                        ) : (
                          questions.map(q => (
                            <StarQuestion
                              key={q.feature}
                              label={q.question}
                              feature={q.feature}
                              ratings={ratings}
                              setRating={setRating}
                            />
                          ))
                        )}
                      </div>

                      {/* ── 2. Review Title ── */}
                      <div>
                        <label className="text-sm font-semibold block mb-2" style={{ color: '#424654' }}>
                          Review Title{' '}
                          <span className="font-normal opacity-60">(optional)</span>
                        </label>
                        <input
                          type="text"
                          maxLength={120}
                          placeholder="Summarize your stay in one sentence"
                          className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                          style={{
                            backgroundColor: '#f4f2ff',
                            border: 'none',
                            color: '#141936',
                          }}
                          onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 2px #0050b8'; e.currentTarget.style.backgroundColor = '#fff' }}
                          onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.backgroundColor = '#f4f2ff' }}
                          value={reviewTitle}
                          onChange={e => setReviewTitle(e.target.value)}
                        />
                      </div>

                      {/* ── 3. Review text + Voice + Help Me Write AI panel ── */}
                      <div className="space-y-2">
                        {/* Label row */}
                        <div className="flex justify-between items-end mb-2">
                          <label className="text-sm font-semibold" style={{ color: '#424654' }}>
                            Your Review
                          </label>
                          <button
                            type="button"
                            onClick={toggleVoice}
                            className="flex items-center gap-2 font-bold text-sm px-3 py-1.5 rounded-full transition-colors"
                            style={listening ? {
                              color: '#dc2626',
                              backgroundColor: '#fef2f2',
                              border: '1px solid #fca5a5',
                            } : {
                              color: '#0050b8',
                              backgroundColor: 'rgba(0,80,184,0.05)',
                              border: '1px solid rgba(0,80,184,0.2)',
                            }}
                          >
                            <span className="material-symbols-outlined text-xl">mic</span>
                            <span>{listening ? 'Stop Recording' : 'Voice Input'}</span>
                          </button>
                        </div>

                        {/* Textarea */}
                        <div className="relative">
                          <textarea
                            ref={textareaRef}
                            rows={6}
                            placeholder="What did you love? What could be improved? Mention specific details like the room, pool, or dining options."
                            className="w-full px-4 py-4 rounded-xl text-sm outline-none resize-none transition-all"
                            style={{
                              backgroundColor: '#f4f2ff',
                              border: 'none',
                              color: '#141936',
                              opacity: aiPanelState === 'loading' ? 0.5 : 1,
                              transition: 'opacity 0.3s, box-shadow 0.2s, background-color 0.2s',
                            }}
                            onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 2px #0050b8'; e.currentTarget.style.backgroundColor = '#fff' }}
                            onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.backgroundColor = '#f4f2ff' }}
                            value={reviewText}
                            onChange={e => setReviewText(e.target.value)}
                          />
                        </div>

                        {/* Help Me Write button */}
                        <div className="flex items-center gap-3 mt-3">
                          <button
                            type="button"
                            onClick={handleHelpMeWrite}
                            disabled={reviewText.trim().length < 10 || aiPanelState === 'loading'}
                            className="flex items-center gap-2 font-semibold text-sm px-4 py-2 rounded-full transition-all"
                            style={{
                              color: '#0050b8',
                              backgroundColor: 'rgba(0,80,184,0.05)',
                              border: '1px solid rgba(0,80,184,0.2)',
                            }}
                          >
                            <span className="material-symbols-outlined text-lg">auto_awesome</span>
                            <span>Help me write</span>
                          </button>
                          {reviewText.length > 0 && reviewText.trim().length < 10 && (
                            <span className="text-xs" style={{ color: '#424654' }}>
                              Keep typing to enable
                            </span>
                          )}
                        </div>

                        {/* ── AI Panel (3 states via CSS transition) ── */}
                        <div className={`ai-panel mt-4${aiPanelState !== 'hidden' ? ' visible' : ''}`}>

                          {/* Loading state */}
                          {aiPanelState === 'loading' && (
                            <div className="p-6 rounded-xl" style={{ backgroundColor: '#f4f2ff' }}>
                              <div className="flex items-center gap-3 mb-4">
                                <span className="material-symbols-outlined text-xl animate-spin"
                                      style={{ color: '#0050b8' }}>
                                  progress_activity
                                </span>
                                <span className="text-sm font-medium" style={{ color: '#424654' }}>
                                  Enhancing your review…
                                </span>
                              </div>
                              <div className="space-y-3">
                                <div className="shimmer-line h-4 w-full" />
                                <div className="shimmer-line h-4 w-5/6" />
                                <div className="shimmer-line h-4 w-4/6" />
                              </div>
                            </div>
                          )}

                          {/* Result state */}
                          {aiPanelState === 'result' && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <span className="material-symbols-outlined text-lg" style={{ color: '#0050b8' }}>
                                  auto_awesome
                                </span>
                                <span className="text-sm font-semibold" style={{ color: '#424654' }}>
                                  AI-enhanced review
                                </span>
                              </div>

                              <div className="rounded-xl p-5 bg-white" style={{ border: '2px solid rgba(0,80,184,0.2)' }}>
                                <p className="text-sm leading-relaxed" style={{ color: '#141936' }}>
                                  {polishedText}
                                </p>
                              </div>

                              {/* Action buttons */}
                              <div className="flex items-center justify-between mt-4">
                                <button
                                  type="button"
                                  onClick={handleKeepOriginal}
                                  className="text-sm font-medium transition-colors flex items-center gap-1.5"
                                  style={{ color: '#424654' }}
                                >
                                  <span className="material-symbols-outlined text-base">undo</span>
                                  Keep original
                                </button>
                                <div className="flex gap-3">
                                  <button
                                    type="button"
                                    onClick={handleEdit}
                                    className="text-sm font-semibold px-4 py-2 rounded-full transition-colors"
                                    style={{
                                      color: '#0050b8',
                                      border: '1px solid rgba(0,80,184,0.2)',
                                      backgroundColor: 'transparent',
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleUseThis}
                                    className="text-sm font-semibold px-5 py-2 rounded-full text-white transition-colors shadow-sm"
                                    style={{ backgroundColor: '#0050b8' }}
                                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#00429a')}
                                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#0050b8')}
                                  >
                                    Use this review
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ── 4. Photo upload ── */}
                      <div className="space-y-4">
                        <label className="text-sm font-semibold block" style={{ color: '#424654' }}>
                          Add photos
                        </label>

                        <div
                          role="button"
                          tabIndex={0}
                          className="rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer group transition-colors"
                          style={{
                            border: '2px dashed #c2c6d6',
                            backgroundColor: '#f4f2ff',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#e5e6ff')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f4f2ff')}
                          onClick={() => fileInputRef.current?.click()}
                          onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
                        >
                          <div className="w-14 h-14 rounded-full bg-white shadow-sm flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
                            <span className="material-symbols-outlined text-3xl" style={{ color: '#0050b8' }}>
                              add_a_photo
                            </span>
                          </div>
                          <p className="text-sm font-bold mb-1" style={{ color: '#141936' }}>
                            Click to upload or drag and drop
                          </p>
                          <p className="text-xs" style={{ color: '#424654' }}>
                            High-quality JPEG, PNG or HEIC (max. 10MB)
                          </p>
                        </div>

                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={handleImageUpload}
                        />

                        {uploading && (
                          <p className="text-xs animate-pulse" style={{ color: '#424654' }}>Uploading…</p>
                        )}

                        {images.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {images.map((url, i) => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                key={i}
                                src={url}
                                alt={`Photo ${i + 1}`}
                                className="w-20 h-20 object-cover rounded-lg"
                                style={{ border: '1px solid #c2c6d6' }}
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      {/* ── 5. Terms + Submit ── */}
                      <div className="pt-6 flex flex-col md:flex-row items-center justify-between gap-6"
                           style={{ borderTop: '1px solid rgba(194,198,214,0.15)' }}>
                        <div className="flex items-start gap-3 max-w-sm">
                          <div className="pt-1">
                            <input
                              type="checkbox"
                              id="terms"
                              checked={termsAccepted}
                              onChange={e => setTermsAccepted(e.target.checked)}
                              className="rounded"
                              style={{ accentColor: '#0050b8' }}
                            />
                          </div>
                          <label htmlFor="terms" className="text-xs leading-relaxed" style={{ color: '#424654' }}>
                            I certify that this review is based on my own experience and is my genuine opinion
                            of this hotel, and that I have no personal or business relationship with this establishment.
                          </label>
                        </div>

                        <button
                          type="submit"
                          disabled={!termsAccepted || submitting}
                          className="w-full md:w-auto px-10 py-4 rounded-full font-bold text-lg text-white transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{
                            backgroundColor: '#0050b8',
                            boxShadow: '0 8px 24px rgba(0,80,184,0.25)',
                          }}
                          onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#00429a' }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#0050b8' }}
                        >
                          {submitting ? 'Submitting…' : 'Submit Review'}
                        </button>
                      </div>

                    </div>
                  </section>
                </form>
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
