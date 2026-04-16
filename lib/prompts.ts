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

// ─── Scene 2 (legacy): Rating-feature guided questions ─────────────────────
// Kept for backward compatibility. New flow uses buildGapQuestionsPrompt.
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

For each feature, generate one short guidance question to help the user give targeted feedback.
Return format: [{"feature": "feature_name", "question": "question_here"}]`,
  }
}

// ─── Scene 2 (new): Fact Gap questions ─────────────────────────────────────
// Generates 2–5 questions targeting the highest-gap fact tags.
// topGapFacts: sorted descending by gap_score, already sliced to desired count.
export function buildGapQuestionsPrompt(
  topGapFacts: Array<{ tag_id: string; fact_claim: string; source_field: string }>
) {
  return {
    system:
      'You are a hotel data verification assistant. Return only valid JSON with no markdown fences or extra text.',
    user: `The following are verifiable facts from a hotel's official description that have NOT been recently confirmed or mentioned by guests. Each fact may be outdated or unverified.

Facts to verify (sorted by data gap priority):
${topGapFacts.map((f, i) => `${i + 1}. [${f.tag_id}] (from: ${f.source_field}) "${f.fact_claim}"`).join('\n')}

For each fact, write ONE concise question that naturally prompts a reviewer to confirm or update this specific fact. The question should:
- Reference the specific claim (e.g., "The official website shows...")
- Ask whether the reality matched the description
- Sound natural and conversational, not clinical
- Be answerable with a brief factual description or yes/no

Return format: [{"tag_id": "tag_id_here", "question": "question_here"}]
Output JSON only.`,
  }
}

// ─── Scene 3: Review mention-flag analysis ──────────────────────────────────
// Returns two separate objects:
//   text_analysis: { feature: 0|1 } for the 15 RATING_FEATURES
//   fact_analysis: { tag_id: 0|1 } for the hotel's fact tags
// If factTags is empty, fact_analysis section is omitted from the prompt.
export function buildAnalysisPrompt(
  reviewText: string,
  ratingFeatureNames: string[],
  factTags?: Array<{ tag_id: string; fact_claim: string }>
) {
  const factSection =
    factTags && factTags.length > 0
      ? `

Additionally, the following are specific verifiable facts from the hotel's description:
${factTags.map((f) => `- [${f.tag_id}]: "${f.fact_claim}"`).join('\n')}

For each fact tag, output 1 if the review mentions or references anything related to that specific fact, or 0 if it does not.`
      : ''

  const factOutputNote =
    factTags && factTags.length > 0
      ? `
"fact_analysis": {"tag_id": 0 or 1, ...},`
      : ''

  return {
    system:
      'You are a hotel review analysis assistant. Return only valid JSON with no markdown fences or extra text.',
    user: `The following is a list of hotel rating features:
${ratingFeatureNames.join(', ')}
${factSection}

Review text:
"${reviewText}"

For each rating feature, output 1 if the review mentions anything related to that feature, or 0 if it does not.${factTags && factTags.length > 0 ? '\nDo the same for each fact tag.' : ''}

Return format:
{
  "text_analysis": {"feature_name": 0 or 1, ...},${factOutputNote}
}
Output JSON only.`,
  }
}

// ─── Scene 3 (facts only): re-analyze fact tag coverage without touching text_analysis ──
// Used when fact tags are regenerated and only fact_analysis needs to be rebuilt.
export function buildFactsOnlyPrompt(
  reviewText: string,
  factTags: Array<{ tag_id: string; fact_claim: string }>
) {
  return {
    system:
      'You are a hotel review analysis assistant. Return only valid JSON with no markdown fences or extra text.',
    user: `The following are specific verifiable facts from a hotel's description:
${factTags.map((f) => `- [${f.tag_id}]: "${f.fact_claim}"`).join('\n')}

Review text:
"${reviewText}"

For each fact tag, output 1 if the review mentions or references anything related to that specific fact, or 0 if it does not.

Return format: {"tag_id": 0 or 1, ...}
Output JSON only.`,
  }
}

// ─── Dynamic follow-up: detect covered gaps, return uncovered ones ──────────
// currentText: the user's in-progress review text
// topGapFacts: top N gap facts for this hotel (with pre-generated questions)
// Returns 2 questions for the facts NOT addressed in currentText.
export function buildDynamicFollowupPrompt(
  currentText: string,
  topGapFacts: Array<{ tag_id: string; fact_claim: string; question: string }>
) {
  return {
    system:
      'You are a hotel data gap analyst. Return only valid JSON with no markdown fences or extra text.',
    user: `A guest is writing a hotel review. Here is their review so far:
"${currentText}"

The following are verifiable hotel facts that are currently unverified in our database (sorted by data gap priority):
${topGapFacts.map((f, i) => `${i + 1}. [${f.tag_id}]: "${f.fact_claim}"`).join('\n')}

## Coverage Rules (apply ALL of these)

A fact is considered COVERED if ANY of the following is true:
1. **Entity mention**: The review mentions the same real-world subject as the fact, even if only in passing. Example: if the fact is about parking and the guest writes "the parking fee was expensive," parking is COVERED — they clearly experienced it.
2. **Contradiction = covered**: If the review directly contradicts the fact claim (e.g., fact says "free parking" but guest says "parking was expensive"), this is the highest-quality verification data possible. Mark it as COVERED immediately — do not ask about it.
3. **Indirect reference**: Synonyms and paraphrases count. "Wi-Fi was slow" covers a fact about internet/WiFi. "Breakfast was included" covers a fact about complimentary meals.
4. **Sentiment about the topic**: Positive or negative sentiment about a subject counts as coverage. The guest doesn't need to confirm the exact claim — any mention of the topic is enough.

## What is NOT covered
- Topics the review has not mentioned at all (different subject matter entirely).

## Task
Apply the coverage rules above. Identify which facts are covered. Then return the 2 facts with the HIGHEST gap priority that are genuinely NOT covered by the review.

Return format: [{"tag_id": "tag_id_here", "question": "pre_generated_question_here"}]
- Use exactly the pre-generated question text for each selected tag
- Return exactly 2 items (or fewer if fewer than 2 uncovered facts exist)
- Output JSON only

Pre-generated questions for reference:
${topGapFacts.map((f) => `[${f.tag_id}]: "${f.question}"`).join('\n')}`,
  }
}

// ─── Fact extraction: extract verifiable facts from hotel description ───────
// Returns atomic, high-volatility, physically verifiable facts from the
// hotel's official description. Used once per hotel to seed fact_inventory.
export function buildFactExtractionPrompt(
  hotelDescription: Record<string, unknown>
) {
  return {
    system: `You are a hotel data fact extractor. Your job is to read a hotel's official description and extract a list of specific, verifiable facts that guests could confirm or contradict during their stay.

## Extraction Rules
- Only extract facts that are PHYSICALLY VERIFIABLE by a guest (e.g., "pool is available", "pets allowed under 10kg", "free breakfast included")
- Prioritize HIGH-VOLATILITY facts: policies, amenity availability, fees, time restrictions, seasonal items
- Ignore aesthetic/subjective descriptions (e.g., "elegant decor", "great location", "luxurious feel")
- Ignore fixed infrastructure unlikely to change (e.g., "has an elevator", "3-star hotel")
- Balance granularity: a complex policy field may yield 1–3 facts; a large amenities list may yield 3–6 facts

## Tag Merging Rule (CRITICAL)
Group all closely related facts about the same real-world subject into a SINGLE tag. Do NOT split facts that a guest would naturally address together.

Examples of what must be merged into one tag:
- "parking is available" + "parking is free/paid" + "parking fee amount" → ONE tag: parking_policy
- "pets allowed" + "pet weight limit" + "pet fee" → ONE tag: pet_policy
- "breakfast available" + "breakfast is included/paid" + "breakfast price" → ONE tag: breakfast_policy
- "pool available" + "pool is seasonal/year-round" + "pool hours" → ONE tag: pool_policy

The fact_claim for a merged tag should capture all key details in one sentence.
Generate a snake_case tag_id named after the subject (e.g., "parking_policy", "breakfast_policy").

Return only valid JSON with no markdown fences or extra text.`,
    user: `Hotel description data:
${JSON.stringify(hotelDescription, null, 2)}

Extract all high-volatility, verifiable facts from this description.
Return format:
[
  {
    "tag_id": "snake_case_unique_id",
    "source_field": "description_proc_column_name",
    "fact_claim": "Concise English description of the verifiable fact",
    "volatility": "high" | "medium"
  }
]
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
