// lib/prompts.ts
// All OpenAI prompt templates for Scene 1, 2, 3.

// ─── Scene 1: AI text polish ───────────────────────────────────────────────
export function buildPolishPrompt(
  draftText: string,
  ratings: Record<string, number>
) {
  return {
    system:
      '你是一个酒店评论润色助手，帮助用户把口语化的评论改写得更清晰、具体、有参考价值。保持用户原本的语气和立场，不要改变评分倾向。',
    user: `用户评分：${JSON.stringify(ratings, null, 2)}\n\n用户原文：${draftText}\n\n请润色上面的评论。`,
  }
}

// ─── Scene 2: AI guided questions ──────────────────────────────────────────
export function buildQuestionsPrompt(
  topFeatures: string[],
  hotelDescription: Record<string, unknown>
) {
  return {
    system: '你是一个酒店评论引导助手。只返回合法 JSON，不输出任何其他内容。',
    user: `以下是酒店的描述信息：
${JSON.stringify(hotelDescription, null, 2)}

以下是最需要用户补充评价的功能点（按优先级排序）：
${topFeatures.join(', ')}

请为每个功能点生成一条简短的中文引导问题，帮助用户针对性地评价。
返回格式：[{"feature": "功能点名称", "question": "引导问题"}]`,
  }
}

// ─── Scene 3: Review text alignment analysis ────────────────────────────────
export function buildAnalysisPrompt(
  reviewText: string,
  hotelDescription: Record<string, unknown>,
  ratingFeatureNames: string[]
) {
  return {
    system:
      '你是一个酒店评论分析助手。只返回合法 JSON，不输出任何其他内容，不要加 markdown 代码块。',
    user: `以下是酒店的描述信息（按字段分组）：
${JSON.stringify(hotelDescription, null, 2)}

Rating 中的功能点名称列表：
${ratingFeatureNames.join(', ')}

以下是一条用户评论：
"${reviewText}"

请分析这条评论涉及了哪些字段或功能点，并给出 1-5 分：
- 针对描述字段（如 area_description）：评论内容与描述相符→高分，相左→低分
- 针对 rating 功能点（如 roomquality）：正面评价→高分，负面→低分
- 未提及的字段或功能点→ 0

返回格式：{"字段名或功能点名": 分数, ...}
只输出 JSON，不输出任何解释。`,
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
