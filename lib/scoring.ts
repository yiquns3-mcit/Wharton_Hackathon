// lib/scoring.ts
// Pure functions — no side effects, no API calls.

export const RATING_FEATURES = [
  'checkin',
  'overall',
  'service',
  'location',
  'roomcomfort',
  'roomquality',
  'communication',
  'onlinelisting',
  'valueformoney',
  'hotelcondition',
  'ecofriendliness',
  'roomcleanliness',
  'roomamenitiesscore',
  'convenienceoflocation',
  'neighborhoodsatisfaction',
] as const

export type RatingFeature = (typeof RATING_FEATURES)[number]

export interface ReviewRow {
  acquisition_date: string | null
  rating: Record<string, number>
  review_text?: string | null
  text_analysis: Record<string, number>
  fact_analysis?: Record<string, number>
}

// ─── Fact Tag types ────────────────────────────────────────────────────────
export interface FactTag {
  tag_id: string
  source_field: string
  fact_claim: string
  volatility: 'high' | 'medium'
  last_verified_at: string | null  // ISO date string of most recent review that mentioned this fact
  coverage_count_last_year: number // how many reviews in the past year mentioned this fact
  total_reviews_last_year: number  // total reviews in the past year (for this hotel)
  gap_score: number                // computed: 0–1, higher = more urgent to ask about
}

export interface WeightConfig {
  w1: number // missing rate weight
  w2: number // time confidence weight
  w3: number // text coverage weight
}

export const DEFAULT_WEIGHTS: WeightConfig = { w1: 0.4, w2: 0.3, w3: 0.3 }
export const TOP_N = 5

// Returns age-based time weight for a review
function timeWeight(acquisitionDate: string | null): number {
  if (!acquisitionDate) return 0.2
  const now = new Date()
  const date = new Date(acquisitionDate)
  const diffMs = now.getTime() - date.getTime()
  const diffYears = diffMs / (1000 * 60 * 60 * 24 * 365.25)
  if (diffYears <= 1) return 1.0
  if (diffYears <= 2) return 0.5
  return 0.2
}

export interface PriorityResult {
  priority_scores: Record<string, number>
  top_features: string[]
  dimensions: {
    missing_rate: Record<string, number>
    time_confidence: Record<string, number>
    text_coverage: Record<string, number>
  }
}

export function calculatePriorityScores(
  reviews: ReviewRow[],
  weights: WeightConfig = DEFAULT_WEIGHTS,
  topN: number = TOP_N
): PriorityResult {
  const total = reviews.length
  if (total === 0) {
    return {
      priority_scores: {},
      top_features: [],
      dimensions: { missing_rate: {}, time_confidence: {}, text_coverage: {} },
    }
  }

  const features = RATING_FEATURES as readonly string[]

  const missing_rate: Record<string, number> = {}
  const time_confidence: Record<string, number> = {}
  const text_coverage: Record<string, number> = {}

  for (const feature of features) {
    // Dimension 1: missing rate
    const missingCount = reviews.filter(
      (r) => (r.rating?.[feature] ?? 0) === 0
    ).length
    missing_rate[feature] = missingCount / total

    // Dimension 2: time confidence decay
    // Only non-zero ratings contribute to weighted avg
    let weightedSum = 0
    let weightSum = 0
    for (const r of reviews) {
      const score = r.rating?.[feature] ?? 0
      if (score !== 0) {
        const w = timeWeight(r.acquisition_date)
        weightedSum += score * w
        weightSum += w
      }
    }
    // weighted avg / 5, or 0 if no data
    const weightedAvg = weightSum > 0 ? weightedSum / weightSum : 0
    time_confidence[feature] = weightedAvg / 5

    // Dimension 3: text coverage
    const coveredCount = reviews.filter(
      (r) => (r.text_analysis?.[feature] ?? 0) !== 0
    ).length
    text_coverage[feature] = coveredCount / total
  }

  // Combined score
  const priority_scores: Record<string, number> = {}
  for (const feature of features) {
    const score =
      weights.w1 * missing_rate[feature] +
      weights.w2 * (1 - time_confidence[feature]) -
      weights.w3 * text_coverage[feature]
    priority_scores[feature] = Math.round(score * 10000) / 10000
  }

  // Sort descending, take top N
  const top_features = Object.entries(priority_scores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN)
    .map(([f]) => f)

  return {
    priority_scores,
    top_features,
    dimensions: { missing_rate, time_confidence, text_coverage },
  }
}

// ─── Gap score calculation for Fact Tags ───────────────────────────────────
// Pure function — no side effects.
// Input: current fact_inventory (from hotel_analysis) + all reviews with fact_analysis.
// Output: updated fact_inventory with recalculated coverage stats and gap_scores, sorted desc.

const ONE_YEAR_MS = 365.25 * 24 * 60 * 60 * 1000

function stalenessScore(lastVerifiedAt: string | null): number {
  if (!lastVerifiedAt) return 1.0
  const now = new Date()
  const verified = new Date(lastVerifiedAt)
  const diffMs = now.getTime() - verified.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  if (diffDays < 90) return 0.0
  if (diffDays < 180) return 0.3
  if (diffDays < 365) return 0.6
  return 1.0
}

export function calculateGapScores(
  factInventory: FactTag[],
  reviews: ReviewRow[]
): FactTag[] {
  if (factInventory.length === 0) return []

  const now = new Date()
  const oneYearAgo = new Date(now.getTime() - ONE_YEAR_MS)

  // Reviews from the past year
  const recentReviews = reviews.filter((r) => {
    if (!r.acquisition_date) return false
    return new Date(r.acquisition_date) >= oneYearAgo
  })
  const totalRecentReviews = recentReviews.length

  return factInventory.map((tag) => {
    // Count how many recent reviews mention this fact
    const coverageCount = recentReviews.filter(
      (r) => (r.fact_analysis?.[tag.tag_id] ?? 0) === 1
    ).length

    // Find the most recent review that mentioned this fact (across all reviews, not just recent)
    let lastVerifiedAt: string | null = null
    for (const r of reviews) {
      if ((r.fact_analysis?.[tag.tag_id] ?? 0) === 1 && r.acquisition_date) {
        if (!lastVerifiedAt || r.acquisition_date > lastVerifiedAt) {
          lastVerifiedAt = r.acquisition_date
        }
      }
    }

    const coverageRate =
      totalRecentReviews > 0 ? coverageCount / totalRecentReviews : 0

    const gapScore =
      0.5 * (1 - coverageRate) + 0.5 * stalenessScore(lastVerifiedAt)

    return {
      ...tag,
      last_verified_at: lastVerifiedAt,
      coverage_count_last_year: coverageCount,
      total_reviews_last_year: totalRecentReviews,
      gap_score: Math.round(gapScore * 10000) / 10000,
    }
  }).sort((a, b) => b.gap_score - a.gap_score)
}
