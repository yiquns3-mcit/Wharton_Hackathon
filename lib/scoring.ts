// lib/scoring.ts
// Pure function — no side effects, no API calls.

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
  text_analysis: Record<string, number>
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
