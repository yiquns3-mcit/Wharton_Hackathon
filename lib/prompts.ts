// lib/prompts.ts
// All OpenAI prompt templates for Scene 1, 2, 3.

// ─── Scene 1: AI text polish ───────────────────────────────────────────────
export function buildPolishPrompt(
  draftText: string,
  ratings: Record<string, number>
) {
  return {
    system:
      'You are a hotel review writing assistant. Rewrite the user\'s draft review to be clearer, more specific, and more useful to other travelers. Preserve the user\'s original tone and stance — do not alter the sentiment implied by their ratings.',
    user: `User ratings: ${JSON.stringify(ratings, null, 2)}\n\nUser draft: ${draftText}\n\nPlease polish the review above. Keep the output in the same language as the draft.`,
  }
}

// ─── Scene 2: AI guided questions ──────────────────────────────────────────
export function buildQuestionsPrompt(
  topFeatures: string[],
  hotelDescription: Record<string, unknown>
) {
  return {
    system: 'You are a hotel review guidance assistant. Return only valid JSON with no markdown fences or extra text.',
    user: `Here is the hotel description:
${JSON.stringify(hotelDescription, null, 2)}

The following features are most in need of user feedback (sorted by priority):
${topFeatures.join(', ')}

For each feature, generate one short Chinese guidance question to help the user give targeted feedback.
Return format: [{"feature": "feature_name", "question": "引导问题"}]`,
  }
}

// ─── Scene 3: Review mention-flag analysis ──────────────────────────────────
// Output: { feature: 0 | 1 } — 1 = review mentions this feature, 0 = not mentioned.
export function buildAnalysisPrompt(
  reviewText: string,
  ratingFeatureNames: string[]
) {
  return {
    system:
      'You are a hotel review analysis assistant. Return only valid JSON with no markdown fences or extra text.',
    user: `The following is a list of hotel rating features:
${ratingFeatureNames.join(', ')}

Review text:
"${reviewText}"

For each feature, output 1 if the review mentions anything related to that feature, or 0 if it does not.
Return format: {"feature_name": 0 or 1, ...}
Output JSON only.`,
  }
}

// Helper: strip accidental markdown fences before JSON.parse
export function stripMarkdownFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
}
