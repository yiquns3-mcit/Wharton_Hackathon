'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

// ─── Types ─────────────────────────────────────────────────────────────────
interface Hotel {
  eg_property_id: string
  city: string
  province: string
  country: string
  star_rating: number
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
  checkin: '入住', overall: '总体', service: '服务', location: '位置',
  roomcomfort: '房间舒适', roomquality: '房间质量', communication: '沟通',
  onlinelisting: '在线描述', valueformoney: '性价比', hotelcondition: '酒店状况',
  ecofriendliness: '环保', roomcleanliness: '房间清洁', roomamenitiesscore: '房间设施',
  convenienceoflocation: '位置便利', neighborhoodsatisfaction: '周边满意度',
}

const toChartData = (record: Record<string, number>) =>
  Object.entries(record).map(([key, val]) => ({
    name: FEATURE_LABELS[key] ?? key,
    value: Math.round(val * 100),
  }))

// ─── Main Component ─────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [hotels, setHotels] = useState<Hotel[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [bi, setBi] = useState<BiData | null>(null)
  const [loading, setLoading] = useState(false)

  // Weight slider state (local, uncommitted)
  const [w1, setW1] = useState(0.4)
  const [w2, setW2] = useState(0.3)
  const [w3, setW3] = useState(0.3)

  // Batch analysis
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{ processed: number; total: number; failed: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Load hotels on mount
  useEffect(() => {
    fetch('/api/hotels')
      .then((r) => r.json())
      .then(setHotels)
  }, [])

  // Load BI data when hotel selected
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

  useEffect(() => {
    if (selectedId) loadBi(selectedId)
  }, [selectedId, loadBi])

  // Slider helpers — keep sum = 1, adjust w3 as remainder
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

  // Apply weights → POST /api/bi/[id]
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

  // Batch analysis via SSE
  const startBatch = async () => {
    if (!selectedId || batchRunning) return
    setBatchRunning(true)
    setBatchProgress({ processed: 0, total: 0, failed: 0 })

    const ctrl = new AbortController()
    abortRef.current = ctrl

    const res = await fetch('/api/batch-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eg_property_id: selectedId }),
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
            loadBi(selectedId) // refresh data
          }
        } catch { /* ignore parse errors */ }
      }
    }
    setBatchRunning(false)
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">📊 酒店评论 BI 分析台</h1>
          <select
            className="border rounded-lg px-4 py-2 bg-white shadow-sm text-sm"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            <option value="">— 选择酒店 —</option>
            {hotels.map((h) => (
              <option key={h.eg_property_id} value={h.eg_property_id}>
                {h.eg_property_id} · {h.city}, {h.country} ⭐{h.star_rating}
              </option>
            ))}
          </select>
        </div>

        {!selectedId && (
          <div className="text-center py-24 text-gray-400">请选择一家酒店以查看分析数据</div>
        )}

        {selectedId && loading && (
          <div className="text-center py-24 text-gray-400 animate-pulse">加载中...</div>
        )}

        {selectedId && !loading && bi && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-4">
              <Card title="评论总数" value={bi.total_reviews} />
              <Card
                title="文本分析覆盖率"
                value={`${(bi.text_analysis_coverage * 100).toFixed(1)}%`}
              />
              <Card
                title="上次更新"
                value={bi.last_updated ? new Date(bi.last_updated).toLocaleString('zh-CN') : '从未'}
              />
            </div>

            {/* Priority ranking */}
            <Section title="🏆 优先级排名（综合得分）">
              <div className="space-y-2">
                {bi.top_features.map((f, i) => (
                  <div key={f} className="flex items-center gap-3">
                    <span className="w-6 text-sm font-bold text-gray-500">{i + 1}</span>
                    <span className="w-40 text-sm">{FEATURE_LABELS[f] ?? f}</span>
                    <div className="flex-1 bg-gray-200 rounded-full h-3">
                      <div
                        className="bg-indigo-500 h-3 rounded-full transition-all"
                        style={{ width: `${Math.max(bi.priority_scores[f] * 100, 2)}%` }}
                      />
                    </div>
                    <span className="w-16 text-right text-sm text-gray-600">
                      {bi.priority_scores[f].toFixed(3)}
                    </span>
                  </div>
                ))}
              </div>
            </Section>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <ChartCard
                title="缺失率（越高越需要补充）"
                data={toChartData(bi.dimensions.missing_rate)}
                color="#f59e0b"
              />
              <ChartCard
                title="时间置信度（越低越需要更新）"
                data={toChartData(bi.dimensions.time_confidence)}
                color="#6366f1"
              />
              <ChartCard
                title="文本覆盖率（越高已有描述）"
                data={toChartData(bi.dimensions.text_coverage)}
                color="#10b981"
              />
            </div>

            {/* Weight sliders */}
            <Section title="⚖️ 权重调节">
              <div className="grid grid-cols-3 gap-6 mb-4">
                <Slider label={`w1 缺失率权重 (${w1.toFixed(1)})`} value={w1} onChange={handleW1} />
                <Slider label={`w2 时间衰减权重 (${w2.toFixed(1)})`} value={w2} onChange={handleW2} />
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    w3 文本覆盖权重 ({w3.toFixed(1)}) — 自动计算
                  </label>
                  <div className="h-2 bg-gray-200 rounded-full">
                    <div
                      className="h-2 bg-emerald-400 rounded-full"
                      style={{ width: `${w3 * 100}%` }}
                    />
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-400 mb-3">w1 + w2 + w3 = {(w1 + w2 + w3).toFixed(1)}</p>
              <button
                onClick={applyWeights}
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition"
              >
                应用权重 & 重新计算
              </button>
            </Section>

            {/* Batch analysis */}
            <Section title="🔄 批量历史评论分析">
              <p className="text-sm text-gray-500 mb-3">
                对该酒店所有尚未分析的评论运行 Scene 3（text_analysis 为空的记录）。
              </p>
              {batchProgress && (
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>
                      {batchProgress.processed} / {batchProgress.total} 条
                      {batchProgress.failed > 0 && (
                        <span className="text-red-500 ml-2">失败 {batchProgress.failed} 条</span>
                      )}
                    </span>
                    <span>{batchProgress.total > 0
                      ? Math.round((batchProgress.processed / batchProgress.total) * 100)
                      : 0}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-indigo-500 h-2 rounded-full transition-all"
                      style={{
                        width: batchProgress.total > 0
                          ? `${(batchProgress.processed / batchProgress.total) * 100}%`
                          : '0%',
                      }}
                    />
                  </div>
                </div>
              )}
              <button
                onClick={startBatch}
                disabled={batchRunning}
                className="px-5 py-2 bg-amber-500 text-white rounded-lg text-sm hover:bg-amber-600 transition disabled:opacity-50"
              >
                {batchRunning ? '分析中...' : '开始批量分析历史评论'}
              </button>
            </Section>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────
function Card({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5 border">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5 border">
      <h2 className="text-base font-semibold text-gray-700 mb-4">{title}</h2>
      {children}
    </div>
  )
}

function ChartCard({ title, data, color }: { title: string; data: { name: string; value: number }[]; color: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5 border">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">{title}</h2>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} layout="vertical" margin={{ left: 16, right: 16 }}>
          <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
          <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 10 }} />
          <Tooltip formatter={(v) => [`${v}%`]} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map((_, i) => <Cell key={i} fill={color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-sm text-gray-600 mb-1">{label}</label>
      <input
        type="range"
        min={0.1}
        max={0.8}
        step={0.1}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-indigo-600"
      />
    </div>
  )
}
