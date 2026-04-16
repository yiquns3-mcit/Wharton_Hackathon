'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

// ─── Types ─────────────────────────────────────────────────────────────────
interface Hotel {
  eg_property_id: string
  property_name: string | null
  city: string
  province: string
  country: string
  star_rating: number
}

interface FactTagItem {
  tag_id: string
  fact_claim: string
  source_field: string
  volatility: 'high' | 'medium'
  gap_score: number
  coverage_count_last_year: number
  total_reviews_last_year: number
  last_verified_at: string | null
}

interface BiData {
  eg_property_id: string
  total_reviews: number
  text_analysis_coverage: number
  last_updated: string | null
  weights: { w1: number; w2: number; w3: number }
  priority_scores: Record<string, number>
  top_features: string[]
  dimensions: {
    missing_rate: Record<string, number>
    time_confidence: Record<string, number>
    text_coverage: Record<string, number>
  }
  fact_inventory: FactTagItem[]
}

interface SseEvent {
  type: 'start' | 'progress' | 'done' | 'error'
  total?: number
  processed?: number
  failed?: number
  message?: string
}

// ─── Constants ─────────────────────────────────────────────────────────────
const FEATURE_LABELS: Record<string, string> = {
  checkin: 'Check-in',
  overall: 'Overall',
  service: 'Service',
  location: 'Location',
  roomcomfort: 'Room Comfort',
  roomquality: 'Room Quality',
  communication: 'Communication',
  onlinelisting: 'Online Listing',
  valueformoney: 'Value for Money',
  hotelcondition: 'Hotel Condition',
  ecofriendliness: 'Eco-friendliness',
  roomcleanliness: 'Room Cleanliness',
  roomamenitiesscore: 'Room Amenities',
  convenienceoflocation: 'Location Convenience',
  neighborhoodsatisfaction: 'Neighborhood',
}

const toChartData = (record: Record<string, number>) =>
  Object.entries(record).map(([key, val]) => ({
    name: FEATURE_LABELS[key] ?? key,
    value: Math.round(val * 100),
  }))

// ─── Sub-components ─────────────────────────────────────────────────────────

function HelpModal({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onMouse)
    return () => document.removeEventListener('mousedown', onMouse)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
         style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div ref={ref}
           className="bg-white rounded-2xl w-full max-h-[85vh] overflow-y-auto"
           style={{
             maxWidth: '680px',
             margin: '0 16px',
             boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
             border: '1px solid rgba(194,198,214,0.4)',
           }}>
        {/* Header */}
        <div className="sticky top-0 bg-white flex items-center justify-between px-8 pt-7 pb-5"
             style={{ borderBottom: '1px solid rgba(194,198,214,0.3)' }}>
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-2xl" style={{ color: '#0050b8' }}>menu_book</span>
            <div>
              <h2 className="text-lg font-extrabold plusJakartaSans" style={{ color: '#141936' }}>
                Dashboard Documentation
              </h2>
              <p className="text-xs" style={{ color: '#727785' }}>How this dashboard works and how to use it</p>
            </div>
          </div>
          <button onClick={onClose}
                  className="p-2 rounded-full transition-colors"
                  style={{ color: '#727785' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f4f2ff')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="px-8 py-7 space-y-8 text-sm" style={{ color: '#424654', lineHeight: '1.65' }}>

          {/* Section 1 */}
          <section>
            <h3 className="text-base font-bold plusJakartaSans mb-2" style={{ color: '#141936' }}>
              What is this dashboard?
            </h3>
            <p>
              This is an admin-only analytics tool that measures <strong style={{ color: '#141936' }}>review data quality</strong> across
              15 rating features and a set of AI-extracted fact tags for each hotel property.
              The goal is to identify which features have the most missing, stale, or unconfirmed data —
              so the review form on Page 1 can prioritise asking users the most valuable questions.
            </p>
            <p className="mt-2">
              Users on Page 1 never see these metrics. They only see the guided questions that this system generates.
            </p>
          </section>

          <div style={{ borderTop: '1px solid rgba(194,198,214,0.3)' }} />

          {/* Section 2 */}
          <section>
            <h3 className="text-base font-bold plusJakartaSans mb-3" style={{ color: '#141936' }}>
              The Priority Score Formula
            </h3>
            <p className="mb-3">
              Each of the 15 rating features gets a composite priority score calculated from three dimensions:
            </p>
            <div className="rounded-xl p-4 font-mono text-xs leading-relaxed"
                 style={{ backgroundColor: '#f8f8fc', border: '1px solid rgba(194,198,214,0.4)', color: '#141936' }}>
              priority_score = w1 × missing_rate<br />
              {'               '}+ w2 × (1 − time_confidence)<br />
              {'               '}− w3 × text_coverage
            </div>
            <div className="mt-4 space-y-3">
              {[
                {
                  label: 'Missing Rate (w1)',
                  color: '#0050b8',
                  desc: 'Fraction of reviews where the user left this feature unrated. A rating of 0 means the user skipped it — not that they gave it zero stars. Higher = more data missing = higher priority.',
                },
                {
                  label: 'Time Confidence (w2)',
                  color: '#585c7d',
                  desc: 'Weighted average of non-zero ratings, where older reviews count less (>2 yrs = 0.2×, 1–2 yrs = 0.5×, <1 yr = 1×), normalised to 0–1. The term (1 − time_confidence) means low-confidence data drives higher priority.',
                },
                {
                  label: 'Text Coverage (w3)',
                  color: '#10b981',
                  desc: 'Fraction of reviews whose text was detected (by AI) to mention this feature. Higher coverage means the feature is already well-discussed, so it reduces urgency.',
                },
              ].map(d => (
                <div key={d.label} className="flex gap-3">
                  <div className="w-2 rounded-full flex-shrink-0 mt-1.5 self-stretch"
                       style={{ backgroundColor: d.color, minHeight: '8px' }} />
                  <div>
                    <span className="font-semibold" style={{ color: '#141936' }}>{d.label} — </span>
                    {d.desc}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs" style={{ color: '#727785' }}>
              w1 + w2 + w3 = 1. Default: w1 = 0.4, w2 = 0.3, w3 = 0.3. Adjust with the sliders and click "Apply Weights & Recalculate".
            </p>
          </section>

          <div style={{ borderTop: '1px solid rgba(194,198,214,0.3)' }} />

          {/* Section 3 */}
          <section>
            <h3 className="text-base font-bold plusJakartaSans mb-3" style={{ color: '#141936' }}>
              Chart Guide
            </h3>
            <div className="space-y-3">
              {[
                {
                  title: 'Missing Rate chart',
                  color: '#0050b8',
                  desc: 'Taller bar = more users skipped scoring this feature. A feature at 80% missing means 4 in 5 reviewers never rated it.',
                },
                {
                  title: 'Time Confidence chart',
                  color: '#585c7d',
                  desc: 'Lower bar = the available ratings for this feature are old and less trustworthy. Ideal is close to 100% (fresh, reliable data).',
                },
                {
                  title: 'Text Coverage chart',
                  color: '#10b981',
                  desc: 'Taller bar = more review texts naturally mention this topic. If coverage is high but missing rate is also high, users discuss it but don\'t rate it explicitly.',
                },
              ].map(c => (
                <div key={c.title} className="flex items-start gap-3">
                  <div className="w-3 h-3 rounded flex-shrink-0 mt-0.5"
                       style={{ backgroundColor: c.color }} />
                  <div>
                    <span className="font-semibold" style={{ color: '#141936' }}>{c.title} — </span>
                    {c.desc}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div style={{ borderTop: '1px solid rgba(194,198,214,0.3)' }} />

          {/* Section 4 */}
          <section>
            <h3 className="text-base font-bold plusJakartaSans mb-3" style={{ color: '#141936' }}>
              Fact Gap System
            </h3>
            <p className="mb-3">
              In addition to the 15 rating features, the system extracts <strong style={{ color: '#141936' }}>fact tags</strong> —
              verifiable claims from the hotel description (e.g. "Heated outdoor pool", "Free airport shuttle").
              Each tag is tagged as high or medium volatility depending on how likely it is to change.
            </p>
            <p className="mb-3">
              The <strong style={{ color: '#141936' }}>gap score</strong> for each fact tag is:
            </p>
            <div className="rounded-xl p-4 font-mono text-xs"
                 style={{ backgroundColor: '#f8f8fc', border: '1px solid rgba(194,198,214,0.4)', color: '#141936' }}>
              gap_score = 0.5 × (1 − coverage_rate) + 0.5 × staleness
            </div>
            <p className="mt-3">
              Higher gap score = fewer recent reviews confirmed this fact, meaning users should be asked about it.
              These fact tags feed directly into the guided questions shown on the review form.
            </p>
          </section>

          <div style={{ borderTop: '1px solid rgba(194,198,214,0.3)' }} />

          {/* Section 5 */}
          <section>
            <h3 className="text-base font-bold plusJakartaSans mb-4" style={{ color: '#141936' }}>
              How to Operate — Step by Step
            </h3>
            <div className="space-y-4">
              {[
                {
                  step: '1',
                  title: 'Select a hotel',
                  desc: 'Use the property dropdown at the top of the page. All metrics below are scoped to the selected hotel.',
                },
                {
                  step: '2',
                  title: 'Generate Fact Tags (first time only)',
                  desc: 'Click "Generate Fact Tags". The AI reads the hotel description and extracts verifiable factual claims. This only needs to run once unless the description changes.',
                },
                {
                  step: '3',
                  title: 'Run Batch Analysis',
                  desc: 'Check "Re-analyze all reviews" to process historical data, then click "Run Batch Analysis". The AI processes each review one by one — this updates text_analysis in the database and refreshes all three chart dimensions. Wait for the progress bar to complete.',
                },
                {
                  step: '4',
                  title: 'Adjust weights (optional)',
                  desc: 'Drag the w1 / w2 sliders to change how much each dimension contributes to priority. w3 is auto-calculated. Click "Apply Weights & Recalculate" to save.',
                },
                {
                  step: '5',
                  title: 'Regenerate Gap Questions (if needed)',
                  desc: 'If the priority ranking changed or fact tags were updated, click "Regenerate Gap Questions". This updates the questions shown to users on the review form.',
                },
                {
                  step: '6',
                  title: 'Repeat for each hotel',
                  desc: 'Each property has its own independent dataset. Return to step 1 and repeat for every hotel you want to activate.',
                },
              ].map(s => (
                <div key={s.step} className="flex gap-4">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5"
                       style={{ backgroundColor: '#0050b8', color: '#fff' }}>
                    {s.step}
                  </div>
                  <div>
                    <p className="font-semibold mb-0.5" style={{ color: '#141936' }}>{s.title}</p>
                    <p>{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Footer note */}
          <div className="rounded-xl p-4 flex gap-3"
               style={{ backgroundColor: '#f4f2ff', border: '1px solid rgba(0,80,184,0.15)' }}>
            <span className="material-symbols-outlined text-base flex-shrink-0 mt-0.5" style={{ color: '#0050b8' }}>
              info
            </span>
            <p className="text-xs" style={{ color: '#585c7d' }}>
              Batch analysis uses GPT-4o and processes reviews sequentially to avoid rate limits.
              OpenAI API costs are incurred during Step 3 and when regenerating questions.
              The review form on Page 1 reads cached results — no AI calls happen at user load time.
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}

function NavBar({ onHelpClick }: { onHelpClick: () => void }) {
  return (
    <nav className="bg-white sticky top-0 z-50"
         style={{ borderBottom: '1px solid rgba(194,198,214,0.3)' }}>
      <div className="flex justify-between items-center w-full px-6 py-3 max-w-screen-2xl mx-auto">
        <div className="flex items-center gap-4">
          <span className="text-2xl font-black plusJakartaSans" style={{ color: '#0050b8' }}>
            Expedia
          </span>
          <span className="hidden md:inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full"
                style={{ backgroundColor: '#f4f2ff', color: '#0050b8' }}>
            <span className="material-symbols-outlined text-sm">admin_panel_settings</span>
            Admin Dashboard
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onHelpClick}
            title="Documentation"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
            style={{ backgroundColor: '#f4f2ff', color: '#0050b8', border: '1px solid rgba(0,80,184,0.18)' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#ece9ff'; e.currentTarget.style.borderColor = '#0050b8' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f4f2ff'; e.currentTarget.style.borderColor = 'rgba(0,80,184,0.18)' }}
          >
            <span className="material-symbols-outlined text-base">menu_book</span>
            How it works
          </button>
          <span className="material-symbols-outlined text-sm"
                style={{ color: '#727785' }}>
            lock
          </span>
          <span className="text-sm font-medium" style={{ color: '#424654' }}>Internal only</span>
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
              <span className="font-bold text-sm mb-1" style={{ color: '#141936' }}>{col.title}</span>
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

function SummaryCard({ title, value, icon }: { title: string; value: string | number; icon: string }) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm"
         style={{ border: '1px solid rgba(194,198,214,0.3)' }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="material-symbols-outlined text-lg" style={{ color: '#0050b8' }}>{icon}</span>
        <p className="text-sm font-medium" style={{ color: '#424654' }}>{title}</p>
      </div>
      <p className="text-2xl font-extrabold plusJakartaSans" style={{ color: '#141936' }}>{value}</p>
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6"
         style={{ border: '1px solid rgba(194,198,214,0.3)' }}>
      <div className="flex items-center gap-2 mb-5">
        <span className="material-symbols-outlined text-xl" style={{ color: '#0050b8' }}>{icon}</span>
        <h2 className="text-base font-bold plusJakartaSans" style={{ color: '#141936' }}>{title}</h2>
      </div>
      {children}
    </div>
  )
}

function HotelSelect({ hotels, value, onChange }: {
  hotels: Hotel[]
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const selected = hotels.find(h => h.eg_property_id === value)
  const filtered = search
    ? hotels.filter(h =>
        (h.property_name ?? h.eg_property_id).toLowerCase().includes(search.toLowerCase()) ||
        (h.city ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : hotels

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative min-w-64">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm transition-all text-left"
        style={{
          backgroundColor: open ? '#fff' : '#f4f2ff',
          border: `1px solid ${open ? '#0050b8' : '#c2c6d6'}`,
          boxShadow: open ? '0 0 0 3px rgba(0,80,184,0.12)' : 'none',
          color: selected ? '#141936' : '#727785',
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-outlined text-base flex-shrink-0"
                style={{ color: open ? '#0050b8' : '#c2c6d6' }}>
            apartment
          </span>
          <span className="truncate">
            {selected
              ? `${selected.property_name ?? selected.eg_property_id}${selected.city ? ` · ${selected.city}` : ''}`
              : '— Select a property —'}
          </span>
        </div>
        <span className="material-symbols-outlined text-base flex-shrink-0 transition-transform"
              style={{ color: '#727785', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          expand_more
        </span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 w-full mt-1 rounded-xl overflow-hidden"
             style={{
               backgroundColor: '#fff',
               border: '1px solid #c2c6d6',
               boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
             }}>
          {/* Search */}
          <div className="p-2" style={{ borderBottom: '1px solid rgba(194,198,214,0.4)' }}>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                 style={{ backgroundColor: '#f4f2ff' }}>
              <span className="material-symbols-outlined text-base" style={{ color: '#727785' }}>search</span>
              <input
                type="text"
                placeholder="Search properties..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: '#141936' }}
                autoFocus
              />
              {search && (
                <button type="button" onClick={() => setSearch('')}
                        className="text-xs leading-none" style={{ color: '#727785' }}>✕</button>
              )}
            </div>
          </div>
          {/* List */}
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm" style={{ color: '#727785' }}>No properties found</div>
            ) : (
              filtered.map(h => {
                const isSelected = h.eg_property_id === value
                return (
                  <button
                    key={h.eg_property_id}
                    type="button"
                    onClick={() => { onChange(h.eg_property_id); setOpen(false); setSearch('') }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors"
                    style={{ backgroundColor: isSelected ? 'rgba(0,80,184,0.06)' : 'transparent' }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.backgroundColor = '#f4f2ff' }}
                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
                  >
                    <span className="material-symbols-outlined text-base flex-shrink-0"
                          style={{ color: isSelected ? '#0050b8' : '#c2c6d6' }}>
                      {isSelected ? 'check_circle' : 'apartment'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate" style={{ color: '#141936' }}>
                        {h.property_name ?? h.eg_property_id}
                      </p>
                      <p className="text-xs truncate" style={{ color: '#727785' }}>
                        {[h.city, h.star_rating ? `${'★'.repeat(Math.round(h.star_rating))} ${h.star_rating}` : ''].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ChartCard({ title, subtitle, data, color }: {
  title: string
  subtitle: string
  data: { name: string; value: number }[]
  color: string
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6"
         style={{ border: '1px solid rgba(194,198,214,0.3)' }}>
      <h2 className="text-sm font-bold plusJakartaSans mb-1" style={{ color: '#141936' }}>{title}</h2>
      <p className="text-xs mb-4" style={{ color: '#727785' }}>{subtitle}</p>
      <ResponsiveContainer width="100%" height={Math.max(240, data.length * 32)}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
          <XAxis
            type="number"
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 10, fill: '#727785', fontFamily: 'Inter' }}
            axisLine={{ stroke: '#c2c6d6' }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={88}
            tick={{ fontSize: 10, fill: '#424654', fontFamily: 'Inter' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(v) => [`${v}%`]}
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid rgba(194,198,214,0.5)',
              borderRadius: '8px',
              fontSize: '12px',
              fontFamily: 'Inter',
              color: '#141936',
            }}
            cursor={{ fill: 'rgba(0,80,184,0.04)' }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map((_, i) => <Cell key={i} fill={color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function SliderRow({ label, sublabel, value, onChange, auto }: {
  label: string
  sublabel: string
  value: number
  onChange?: (v: number) => void
  auto?: boolean
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-end">
        <div>
          <p className="text-sm font-semibold" style={{ color: '#141936' }}>{label}</p>
          <p className="text-xs" style={{ color: '#727785' }}>{sublabel}</p>
        </div>
        <span className="text-base font-extrabold plusJakartaSans" style={{ color: '#0050b8' }}>
          {value.toFixed(1)}
        </span>
      </div>
      {auto ? (
        <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#f4f2ff' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${value * 100}%`, backgroundColor: '#0050b8', opacity: 0.4 }} />
        </div>
      ) : (
        <input
          type="range"
          min={0.1}
          max={0.8}
          step={0.1}
          value={value}
          onChange={(e) => onChange?.(parseFloat(e.target.value))}
          className="w-full"
          style={{ accentColor: '#0050b8' }}
        />
      )}
      {auto && (
        <p className="text-xs" style={{ color: '#727785' }}>Auto-calculated (= 1 − w1 − w2)</p>
      )}
    </div>
  )
}

// ─── Fact Gap Ranking ───────────────────────────────────────────────────────
function FactGapRanking({ facts }: { facts: FactTagItem[] }) {
  if (facts.length === 0) {
    return (
      <div className="flex flex-col items-center py-10 gap-3">
        <span className="material-symbols-outlined text-4xl"
              style={{ color: '#c2c6d6', fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 48" }}>
          label_off
        </span>
        <p className="text-sm" style={{ color: '#727785' }}>
          No fact tags generated yet. Use &ldquo;Generate Fact Tags&rdquo; below.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {facts.map((tag, i) => {
        const coverageRate = tag.total_reviews_last_year > 0
          ? tag.coverage_count_last_year / tag.total_reviews_last_year
          : 0
        const lastVerified = tag.last_verified_at
          ? new Date(tag.last_verified_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : 'Never'

        return (
          <div key={tag.tag_id} className="flex items-start gap-3">
            {/* Rank badge */}
            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5"
                 style={{ backgroundColor: i === 0 ? '#0050b8' : '#f4f2ff', color: i === 0 ? '#fff' : '#0050b8' }}>
              {i + 1}
            </div>

            <div className="flex-1 min-w-0">
              {/* Fact claim + badges */}
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className="text-sm font-medium" style={{ color: '#141936' }}>
                  {tag.fact_claim}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: '#f4f2ff', color: '#585c7d' }}>
                  {tag.source_field}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{
                        backgroundColor: tag.volatility === 'high' ? '#fff0f0' : '#f0f7ff',
                        color: tag.volatility === 'high' ? '#ba1a1a' : '#0050b8',
                      }}>
                  {tag.volatility}
                </span>
              </div>

              {/* Coverage bar */}
              <div className="flex items-center gap-3 mb-1">
                <div className="flex-1 rounded-full h-2 overflow-hidden" style={{ backgroundColor: '#f4f2ff' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.max(coverageRate * 100, 2)}%`,
                      backgroundColor: coverageRate > 0.5 ? '#10b981' : coverageRate > 0.2 ? '#f59e0b' : '#ba1a1a',
                    }}
                  />
                </div>
                <span className="text-xs tabular-nums w-20 text-right" style={{ color: '#727785' }}>
                  {Math.round(coverageRate * 100)}% coverage
                </span>
              </div>

              {/* Meta row */}
              <div className="flex items-center gap-4">
                <span className="text-xs" style={{ color: '#727785' }}>
                  Last verified: {lastVerified}
                </span>
                <span className="text-xs font-semibold tabular-nums" style={{ color: '#424654' }}>
                  gap {tag.gap_score.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [hotels, setHotels] = useState<Hotel[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [selectedHotel, setSelectedHotel] = useState<Hotel | null>(null)
  const [bi, setBi] = useState<BiData | null>(null)
  const [loading, setLoading] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  const [w1, setW1] = useState(0.4)
  const [w2, setW2] = useState(0.3)
  const [w3, setW3] = useState(0.3)

  const [batchRunning, setBatchRunning] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{ processed: number; total: number; failed: number } | null>(null)
  const [forceReanalyze, setForceReanalyze] = useState(false)
  const [analysisMode, setAnalysisMode] = useState<'both' | 'facts_only'>('both')
  const abortRef = useRef<AbortController | null>(null)

  const [factGenRunning, setFactGenRunning] = useState(false)
  const [factGenMessage, setFactGenMessage] = useState<string | null>(null)
  const [questionRegenRunning, setQuestionRegenRunning] = useState(false)
  const [questionRegenMessage, setQuestionRegenMessage] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/hotels')
      .then((r) => r.json())
      .then(setHotels)
  }, [])

  const loadBi = useCallback(async (id: string) => {
    if (!id) return
    setLoading(true)
    const res = await fetch(`/api/bi/${id}`)
    const data = await res.json()
    setBi(data)
    setW1(data.weights.w1)
    setW2(data.weights.w2)
    setW3(data.weights.w3)
    setLoading(false)
  }, [])

  const handleHotelChange = (id: string) => {
    setSelectedId(id)
    setSelectedHotel(hotels.find(h => h.eg_property_id === id) ?? null)
    setBi(null)
    setBatchProgress(null)
    setFactGenMessage(null)
    if (id) loadBi(id)
  }

  const handleW1 = (v: number) => {
    const clamped = Math.min(v, 1 - w2 - 0.1)
    setW1(Math.round(clamped * 10) / 10)
    setW3(Math.round((1 - clamped - w2) * 10) / 10)
  }
  const handleW2 = (v: number) => {
    const clamped = Math.min(v, 1 - w1 - 0.1)
    setW2(Math.round(clamped * 10) / 10)
    setW3(Math.round((1 - w1 - clamped) * 10) / 10)
  }

  const applyWeights = async () => {
    if (!selectedId) return
    setLoading(true)
    const res = await fetch(`/api/bi/${selectedId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ w1, w2, w3 }),
    })
    const data = await res.json()
    setBi((prev) => prev ? { ...prev, ...data, weights: { w1, w2, w3 } } : prev)
    setLoading(false)
  }

  const startBatch = async () => {
    if (!selectedId || batchRunning) return
    setBatchRunning(true)
    setBatchProgress({ processed: 0, total: 0, failed: 0 })

    const ctrl = new AbortController()
    abortRef.current = ctrl

    const res = await fetch('/api/batch-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eg_property_id: selectedId, force: forceReanalyze, mode: analysisMode }),
      signal: ctrl.signal,
    })

    const reader = res.body?.getReader()
    const decoder = new TextDecoder()
    let buf = ''

    while (reader) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        try {
          const evt: SseEvent = JSON.parse(line.slice(5).trim())
          if (evt.type === 'progress' || evt.type === 'start') {
            setBatchProgress({
              processed: evt.processed ?? 0,
              total: evt.total ?? 0,
              failed: evt.failed ?? 0,
            })
          }
          if (evt.type === 'done') {
            setBatchRunning(false)
            loadBi(selectedId)
          }
        } catch { /* ignore parse errors */ }
      }
    }
    setBatchRunning(false)
  }

  const handleGenerateFacts = async () => {
    if (!selectedId) return
    setFactGenRunning(true)
    setFactGenMessage(null)
    try {
      const res = await fetch('/api/ai/facts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eg_property_id: selectedId }),
      })
      const data = await res.json()
      if (res.ok) {
        setFactGenMessage(`✓ ${data.count} fact tags generated. Run Batch Analysis to rebuild coverage data.`)
        loadBi(selectedId)
      } else {
        setFactGenMessage(`Error: ${data.error}`)
      }
    } catch (err) {
      setFactGenMessage(`Error: ${String(err)}`)
    }
    setFactGenRunning(false)
  }

  const handleRegenerateQuestions = async () => {
    if (!selectedId || !bi) return
    setQuestionRegenRunning(true)
    setQuestionRegenMessage(null)
    try {
      const { w1, w2, w3 } = bi.weights
      const res = await fetch(`/api/bi/${selectedId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ w1, w2, w3, force_questions: true }),
      })
      const data = await res.json()
      if (res.ok) {
        setQuestionRegenMessage('✓ Gap questions regenerated.')
        loadBi(selectedId)
      } else {
        setQuestionRegenMessage(`Error: ${data.error}`)
      }
    } catch (err) {
      setQuestionRegenMessage(`Error: ${String(err)}`)
    }
    setQuestionRegenRunning(false)
  }

  const hasFactTags = (bi?.fact_inventory?.length ?? 0) > 0

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col inter" style={{ backgroundColor: '#fbf8ff', color: '#141936' }}>
      <NavBar onHelpClick={() => setHelpOpen(true)} />

      <main className="flex-1">
        {/* ── Page header + hotel selector ── */}
        <div className="max-w-6xl mx-auto px-6 pt-10 pb-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="material-symbols-outlined text-3xl" style={{ color: '#0050b8' }}>analytics</span>
                <h1 className="text-3xl font-extrabold plusJakartaSans" style={{ color: '#141936' }}>
                  Hotel Review Analytics
                </h1>
              </div>
              <p className="text-sm" style={{ color: '#424654' }}>
                Data quality metrics and priority scoring for hotel reviews
              </p>
            </div>

            {/* Hotel selector */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: '#424654' }}>Select property</label>
              <HotelSelect
                hotels={hotels}
                value={selectedId}
                onChange={handleHotelChange}
              />
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-6 pb-16 space-y-6">

          {/* ── Empty state ── */}
          {!selectedId && (
            <div className="text-center py-24">
              <span className="material-symbols-outlined text-5xl block mb-4"
                    style={{ color: '#c2c6d6', fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 48" }}>
                bar_chart
              </span>
              <p className="text-base font-medium" style={{ color: '#727785' }}>
                Select a property above to view analytics
              </p>
            </div>
          )}

          {/* ── Loading shimmer ── */}
          {selectedId && loading && !bi && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-white rounded-xl p-6 shadow-sm space-y-3"
                       style={{ border: '1px solid rgba(194,198,214,0.3)' }}>
                    <div className="shimmer-line h-3 w-1/2" />
                    <div className="shimmer-line h-7 w-2/3" />
                  </div>
                ))}
              </div>
              <div className="bg-white rounded-xl p-6 shadow-sm space-y-4"
                   style={{ border: '1px solid rgba(194,198,214,0.3)' }}>
                <div className="shimmer-line h-4 w-1/4" />
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="shimmer-line h-4 w-full" />
                ))}
              </div>
            </div>
          )}

          {/* ── Dashboard content ── */}
          {selectedId && bi && (
            <>
              {/* Selected hotel info bar */}
              {selectedHotel && (
                <div className="flex items-center gap-3 px-1">
                  <span className="material-symbols-outlined text-base" style={{ color: '#0050b8' }}>hotel</span>
                  <span className="text-sm font-semibold" style={{ color: '#141936' }}>
                    {selectedHotel.property_name ?? selectedHotel.eg_property_id}
                  </span>
                  {selectedHotel.city && (
                    <span className="text-sm" style={{ color: '#424654' }}>
                      · {[selectedHotel.city, selectedHotel.province, selectedHotel.country].filter(Boolean).join(', ')}
                    </span>
                  )}
                  {loading && (
                    <span className="material-symbols-outlined text-base animate-spin ml-auto" style={{ color: '#0050b8' }}>
                      progress_activity
                    </span>
                  )}
                </div>
              )}

              {/* Summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <SummaryCard
                  title="Total Reviews"
                  value={bi.total_reviews}
                  icon="reviews"
                />
                <SummaryCard
                  title="AI Analysis Coverage"
                  value={`${(bi.text_analysis_coverage * 100).toFixed(1)}%`}
                  icon="psychology"
                />
                <SummaryCard
                  title="Last Updated"
                  value={bi.last_updated ? new Date(bi.last_updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never'}
                  icon="update"
                />
              </div>

              {/* Priority ranking (rating features) */}
              <Section title="Rating Feature Priority" icon="leaderboard">
                <p className="text-xs mb-5" style={{ color: '#727785' }}>
                  Rating features ranked by composite priority score — higher score means more data is needed.
                </p>
                <div className="space-y-3">
                  {bi.top_features.map((f, i) => (
                    <div key={f} className="flex items-center gap-4">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                           style={{ backgroundColor: i === 0 ? '#0050b8' : '#f4f2ff', color: i === 0 ? '#fff' : '#0050b8' }}>
                        {i + 1}
                      </div>
                      <span className="w-36 text-sm font-medium flex-shrink-0" style={{ color: '#141936' }}>
                        {FEATURE_LABELS[f] ?? f}
                      </span>
                      <div className="flex-1 rounded-full h-2 overflow-hidden" style={{ backgroundColor: '#f4f2ff' }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.max(bi.priority_scores[f] * 100, 2)}%`,
                            backgroundColor: '#0050b8',
                            opacity: 1 - i * 0.05,
                          }}
                        />
                      </div>
                      <span className="w-14 text-right text-sm font-semibold tabular-nums" style={{ color: '#424654' }}>
                        {bi.priority_scores[f].toFixed(3)}
                      </span>
                    </div>
                  ))}
                </div>
              </Section>

              {/* Fact Gap Ranking */}
              <Section title="Fact Gap Ranking" icon="fact_check">
                <p className="text-xs mb-5" style={{ color: '#727785' }}>
                  Verifiable facts extracted from the hotel description, ranked by gap score — higher means fewer recent reviews confirmed this fact.
                  Gap score = 0.5 × (1 − coverage rate) + 0.5 × staleness.
                </p>
                <FactGapRanking facts={bi.fact_inventory ?? []} />
              </Section>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <ChartCard
                  title="Missing Rate"
                  subtitle="Higher = more reviews missing this score"
                  data={toChartData(bi.dimensions.missing_rate)}
                  color="#0050b8"
                />
                <ChartCard
                  title="Time Confidence"
                  subtitle="Lower = data is stale and needs refreshing"
                  data={toChartData(bi.dimensions.time_confidence)}
                  color="#585c7d"
                />
                <ChartCard
                  title="Text Coverage"
                  subtitle="Higher = topic already covered in review text"
                  data={toChartData(bi.dimensions.text_coverage)}
                  color="#10b981"
                />
              </div>

              {/* Weight configuration */}
              <Section title="Weight Configuration" icon="tune">
                <p className="text-xs mb-6" style={{ color: '#727785' }}>
                  Adjust how each dimension contributes to the rating feature priority score. w1 + w2 + w3 must equal 1.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-6">
                  <SliderRow
                    label="w1 — Missing Rate"
                    sublabel="Weight for data completeness"
                    value={w1}
                    onChange={handleW1}
                  />
                  <SliderRow
                    label="w2 — Time Decay"
                    sublabel="Weight for data freshness"
                    value={w2}
                    onChange={handleW2}
                  />
                  <SliderRow
                    label="w3 — Text Coverage"
                    sublabel="Weight for text description coverage"
                    value={w3}
                    auto
                  />
                </div>
                <div className="flex items-center justify-between pt-4"
                     style={{ borderTop: '1px solid rgba(194,198,214,0.3)' }}>
                  <p className="text-xs" style={{ color: '#727785' }}>
                    w1 + w2 + w3 = <span className="font-bold" style={{ color: '#141936' }}>{(w1 + w2 + w3).toFixed(1)}</span>
                  </p>
                  <button
                    onClick={applyWeights}
                    disabled={loading}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-full font-semibold text-sm text-white transition-all disabled:opacity-50"
                    style={{ backgroundColor: '#0050b8' }}
                    onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#00429a' }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#0050b8' }}
                  >
                    <span className="material-symbols-outlined text-base">refresh</span>
                    Apply Weights & Recalculate
                  </button>
                </div>
              </Section>

              {/* Batch analysis */}
              <Section title="Batch Historical Analysis" icon="batch_prediction">
                <p className="text-sm mb-5" style={{ color: '#424654' }}>
                  Run AI analysis (Scene 3) on reviews for this property.
                  Choose a mode below, then click Run.
                </p>

                {/* Mode selector */}
                <div className="flex gap-3 mb-5 flex-wrap">
                  {([
                    { value: 'both', label: 'Both', desc: 'Rating features + fact tags (first-time setup)' },
                    { value: 'facts_only', label: 'Facts only', desc: 'Re-tag after updating fact tags — skips rating analysis' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setAnalysisMode(opt.value)}
                      disabled={batchRunning}
                      className="flex-1 min-w-48 text-left px-4 py-3 rounded-xl transition-all disabled:opacity-50"
                      style={{
                        border: analysisMode === opt.value ? '2px solid #0050b8' : '1.5px solid #c2c6d6',
                        backgroundColor: analysisMode === opt.value ? '#f4f2ff' : '#fff',
                      }}
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <div className="w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                             style={{ borderColor: analysisMode === opt.value ? '#0050b8' : '#c2c6d6' }}>
                          {analysisMode === opt.value && (
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#0050b8' }} />
                          )}
                        </div>
                        <span className="text-sm font-semibold" style={{ color: '#141936' }}>{opt.label}</span>
                      </div>
                      <p className="text-xs ml-5.5" style={{ color: '#727785' }}>{opt.desc}</p>
                    </button>
                  ))}
                </div>

                {batchProgress && (
                  <div className="mb-5 p-4 rounded-xl" style={{ backgroundColor: '#f4f2ff' }}>
                    <div className="flex justify-between text-xs font-medium mb-2" style={{ color: '#424654' }}>
                      <span>
                        {batchProgress.processed} / {batchProgress.total} reviews processed
                        {batchProgress.failed > 0 && (
                          <span className="ml-3 font-semibold" style={{ color: '#ba1a1a' }}>
                            {batchProgress.failed} failed
                          </span>
                        )}
                      </span>
                      <span style={{ color: '#0050b8' }}>
                        {batchProgress.total > 0
                          ? Math.round((batchProgress.processed / batchProgress.total) * 100)
                          : 0}%
                      </span>
                    </div>
                    <div className="w-full rounded-full h-2 overflow-hidden" style={{ backgroundColor: '#e5e6ff' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: batchProgress.total > 0
                            ? `${(batchProgress.processed / batchProgress.total) * 100}%`
                            : '0%',
                          backgroundColor: '#0050b8',
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-4 flex-wrap">
                  <button
                    onClick={startBatch}
                    disabled={batchRunning}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-full font-semibold text-sm text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: batchRunning ? '#727785' : '#0050b8' }}
                    onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#00429a' }}
                    onMouseLeave={e => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#0050b8' }}
                  >
                    {batchRunning ? (
                      <>
                        <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                        Analyzing…
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-base">play_arrow</span>
                        Run Batch Analysis
                      </>
                    )}
                  </button>

                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none" style={{ color: '#424654' }}>
                    <input
                      type="checkbox"
                      checked={forceReanalyze}
                      onChange={e => setForceReanalyze(e.target.checked)}
                      disabled={batchRunning}
                      className="w-4 h-4 rounded accent-blue-700"
                    />
                    Re-analyze all reviews
                  </label>
                </div>
              </Section>

              {/* Fact Tag Management */}
              <Section title="Fact Tag Management" icon="label">
                <p className="text-sm mb-5" style={{ color: '#424654' }}>
                  Fact tags are verifiable claims extracted from the hotel description (e.g. &ldquo;Heated outdoor pool&rdquo;,
                  &ldquo;Free airport shuttle&rdquo;). They track whether recent reviews confirm or miss key facts about the property.
                </p>

                {hasFactTags && (
                  <div className="mb-4 p-3 rounded-lg flex items-start gap-2"
                       style={{ backgroundColor: '#fff8e1', border: '1px solid #fde68a' }}>
                    <span className="material-symbols-outlined text-base mt-0.5" style={{ color: '#b45309' }}>warning</span>
                    <p className="text-xs" style={{ color: '#78350f' }}>
                      Regenerating will clear existing fact coverage data from all reviews.
                      Run Batch Analysis afterwards to rebuild coverage stats with the new tags.
                    </p>
                  </div>
                )}

                {factGenMessage && (
                  <div className="mb-4 p-3 rounded-lg"
                       style={{
                         backgroundColor: factGenMessage.startsWith('Error') ? '#fff0f0' : '#f0fdf4',
                         border: `1px solid ${factGenMessage.startsWith('Error') ? '#fecaca' : '#bbf7d0'}`,
                       }}>
                    <p className="text-sm font-medium"
                       style={{ color: factGenMessage.startsWith('Error') ? '#ba1a1a' : '#166534' }}>
                      {factGenMessage}
                    </p>
                  </div>
                )}

                <button
                  onClick={handleGenerateFacts}
                  disabled={factGenRunning}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-full font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: hasFactTags ? '#fff' : '#0050b8',
                    color: hasFactTags ? '#0050b8' : '#fff',
                    border: hasFactTags ? '1.5px solid #0050b8' : 'none',
                  }}
                  onMouseEnter={e => {
                    if (!e.currentTarget.disabled) {
                      e.currentTarget.style.backgroundColor = hasFactTags ? '#f4f2ff' : '#00429a'
                    }
                  }}
                  onMouseLeave={e => {
                    if (!e.currentTarget.disabled) {
                      e.currentTarget.style.backgroundColor = hasFactTags ? '#fff' : '#0050b8'
                    }
                  }}
                >
                  {factGenRunning ? (
                    <>
                      <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                      Generating…
                    </>
                  ) : hasFactTags ? (
                    <>
                      <span className="material-symbols-outlined text-base">refresh</span>
                      Regenerate Fact Tags
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-base">auto_awesome</span>
                      Generate Fact Tags
                    </>
                  )}
                </button>

                {hasFactTags && (
                  <p className="text-xs mt-3" style={{ color: '#727785' }}>
                    {bi.fact_inventory.length} fact tags currently active
                  </p>
                )}
              </Section>

              {/* Gap Question Regeneration */}
              <Section title="Gap Questions" icon="help">
                <p className="text-sm mb-5" style={{ color: '#424654' }}>
                  Gap questions are shown to users on the review form. Regenerate them if the prompt or fact tags have changed.
                </p>

                {questionRegenMessage && (
                  <div className="mb-4 p-3 rounded-lg"
                       style={{
                         backgroundColor: questionRegenMessage.startsWith('Error') ? '#fff0f0' : '#f0fdf4',
                         border: `1px solid ${questionRegenMessage.startsWith('Error') ? '#fecaca' : '#bbf7d0'}`,
                       }}>
                    <p className="text-sm font-medium"
                       style={{ color: questionRegenMessage.startsWith('Error') ? '#ba1a1a' : '#166534' }}>
                      {questionRegenMessage}
                    </p>
                  </div>
                )}

                <button
                  onClick={handleRegenerateQuestions}
                  disabled={questionRegenRunning}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-full font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: '#fff', color: '#0050b8', border: '1.5px solid #0050b8' }}
                  onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#f4f2ff' }}
                  onMouseLeave={e => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#fff' }}
                >
                  {questionRegenRunning ? (
                    <>
                      <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                      Regenerating…
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-base">refresh</span>
                      Regenerate Gap Questions
                    </>
                  )}
                </button>
              </Section>
            </>
          )}

        </div>
      </main>

      <Footer />

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </div>
  )
}
