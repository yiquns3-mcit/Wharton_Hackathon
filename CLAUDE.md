# CLAUDE.md — Expedia Hotel Review Web App

> This file is the single source of truth for this project.
> Read it in full before writing any code. Every architectural decision documented here was deliberately chosen.

---

## 1. Project Overview

A two-page web application built on top of Expedia hotel data stored in Supabase.

- **Page 1 (`/`)** — A review submission form for **users**. Users select a hotel, answer AI-generated guided questions, give star ratings for specific features, write a free-text review, optionally upload images, and optionally use AI to polish their text before submitting.
- **Page 2 (`/dashboard`)** — A **BI analytics dashboard for admins**. Shows data quality metrics for each hotel's reviews: missing rate, time-based confidence decay, and text coverage. Admins can adjust weighting sliders to change feature priority rankings.

These two pages are **completely independent** — no shared UI components, no navigation links between them, no awareness of each other. They share only the underlying Supabase data layer. Users never see any BI metrics. Admins access `/dashboard` directly by URL.

---

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) |
| Database | Supabase (remote, already deployed) |
| Styling | Tailwind CSS |
| Deployment | Vercel |
| AI — review analysis | OpenAI API (`gpt-4o`) |
| AI — guided questions + polish | OpenAI API (`gpt-4o-mini`) |

---

## 3. Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
OPENAI_API_KEY=
```

---

## 4. Database Schema

### 4.1 `description_proc` (existing, do not modify structure)

Stores hotel metadata. One row per hotel.

```sql
description_proc (
    eg_property_id TEXT PRIMARY KEY,
    guestrating_avg_expedia NUMERIC,

    city TEXT,
    province TEXT,
    country TEXT,
    star_rating NUMERIC,

    area_description TEXT,
    property_description TEXT,

    popular_amenities_list JSONB,

    property_amenity_accessibility      JSONB,
    property_amenity_activities_nearby  JSONB,
    property_amenity_business_services  JSONB,
    property_amenity_conveniences       JSONB,
    property_amenity_family_friendly    JSONB,
    property_amenity_food_and_drink     JSONB,
    property_amenity_guest_services     JSONB,
    property_amenity_internet           JSONB,
    property_amenity_langs_spoken       JSONB,
    property_amenity_more               JSONB,
    property_amenity_outdoor            JSONB,
    property_amenity_parking            JSONB,
    property_amenity_spa                JSONB,
    property_amenity_things_to_do       JSONB,

    check_in_start_time TEXT,
    check_in_end_time   TEXT,
    check_out_time      TEXT,

    check_out_policy              JSONB,
    pet_policy                    JSONB,
    children_and_extra_bed_policy JSONB,
    check_in_instructions         JSONB,
    know_before_you_go            JSONB
);
```

### 4.2 `reviews_proc` (fully migrated — schema is final)

Stores individual reviews. One row per review.

The actual column order in Supabase (confirmed):

```sql
reviews_proc (
    eg_property_id   TEXT,              -- FK → description_proc
    acquisition_date DATE,
    lob              TEXT,
    rating           JSONB,             -- fixed schema, see below
    review_title     TEXT,
    review_text      TEXT,
    text_analysis    JSONB DEFAULT '{}'::jsonb,   -- populated by AI (Scene 3)
    images           TEXT[] DEFAULT '{}',          -- Supabase Storage URLs
    review_id        UUID PRIMARY KEY DEFAULT gen_random_uuid()
);
```

**Migration already applied — do not run again:**
```sql
-- These have already been executed on the live database:
ALTER TABLE reviews_proc ADD COLUMN text_analysis JSONB DEFAULT '{}'::jsonb;
ALTER TABLE reviews_proc ADD COLUMN images TEXT[] DEFAULT '{}';
ALTER TABLE reviews_proc ADD COLUMN review_id UUID DEFAULT gen_random_uuid();
ALTER TABLE reviews_proc ADD PRIMARY KEY (review_id);
```

**Important for INSERT statements:** `review_id` is auto-generated. Never supply it manually when inserting a new review — omit it entirely and Supabase will fill it in automatically.

#### `rating` JSONB fixed schema

```json
{
  "checkin": 0,
  "overall": 5,
  "service": 5,
  "location": 0,
  "roomcomfort": 0,
  "roomquality": 0,
  "communication": 0,
  "onlinelisting": 0,
  "valueformoney": 0,
  "hotelcondition": 5,
  "ecofriendliness": 5,
  "roomcleanliness": 5,
  "roomamenitiesscore": 5,
  "convenienceoflocation": 0,
  "neighborhoodsatisfaction": 0
}
```

Rules:
- `0` means the user did not score this feature (missing data), **not** a bad score.
- Valid scores are `1` to `5` only.
- The set of keys is fixed and identical across all reviews.

#### `text_analysis` JSONB schema

This field is populated by the AI (OpenAI Scene 3 — see Section 7). It is never set by the user.

```json
{
  "area_description": 2,
  "property_amenity_spa": 5,
  "popular_amenities_list": 1,
  "roomquality": 4,
  "checkin": 0,
  "valueformoney": 3
}
```

Rules:
- Keys come from **two sources**: (a) column names in `description_proc`, and (b) feature names from the `rating` JSONB.
- Value `0` = the review text did not mention this feature/column at all.
- Values `1–5` = the review mentioned this topic; score reflects alignment:
  - For **description columns** (e.g. `area_description`): high score = review aligns with what the description claims; low score = review contradicts the description.
  - For **rating features** (e.g. `roomquality`): high score = positive sentiment; low score = negative sentiment.
- **Critical**: `text_analysis` and `rating` are kept completely separate. `text_analysis` is never merged into `rating`. They serve different purposes — `rating` is user intent, `text_analysis` is AI inference from text.

#### `images` TEXT[]

Array of Supabase Storage URLs for photos the user uploads with their review.

### 4.3 `hotel_analysis` (new table — create from scratch)

Stores computed BI results and AI-generated questions per hotel. Cached so Page 1 can load questions instantly without calling OpenAI on each page load.

```sql
CREATE TABLE hotel_analysis (
    eg_property_id  TEXT PRIMARY KEY REFERENCES description_proc(eg_property_id),
    priority_scores JSONB,       -- { "roomquality": 0.87, "checkin": 0.74, ... }
    top_features    TEXT[],      -- ["roomquality", "checkin", "location"] sorted descending by score
    ai_questions    JSONB,       -- [{ "feature": "roomquality", "question": "您对房间..." }]
    weight_config   JSONB,       -- { "w1": 0.4, "w2": 0.3, "w3": 0.3 }
    last_updated    TIMESTAMPTZ DEFAULT now()
);
```

---

## 5. File & Folder Structure

```
/
├── CLAUDE.md                          ← this file
├── .env.local
├── next.config.ts
├── tailwind.config.ts
│
├── app/
│   ├── page.tsx                       ← Page 1: user review submission
│   ├── dashboard/
│   │   └── page.tsx                   ← Page 2: admin BI dashboard
│   │
│   └── api/
│       ├── hotels/
│       │   └── route.ts               ← GET: list all hotels from description_proc
│       ├── hotels/
│       │   └── [id]/
│       │       └── questions/
│       │           └── route.ts       ← GET: read ai_questions from hotel_analysis
│       ├── reviews/
│       │   └── route.ts               ← POST: submit new review → trigger async Scene 3
│       ├── analyze/
│       │   └── route.ts               ← POST: Scene 3 for a single review
│       ├── batch-analyze/
│       │   └── route.ts               ← POST: Scene 3 across all historical reviews
│       ├── bi/
│       │   └── [id]/
│       │       └── route.ts           ← GET: full BI metrics / POST: recalculate with new weights
│       └── ai/
│           ├── polish/
│           │   └── route.ts           ← POST: Scene 1, AI text polish
│           └── questions/
│               └── route.ts           ← POST: Scene 2, generate guided questions
│
└── lib/
    ├── supabase.ts                    ← Supabase client initialisation
    ├── openai.ts                      ← OpenAI client initialisation
    ├── scoring.ts                     ← Pure function: priority score calculation
    └── prompts.ts                     ← All OpenAI prompt templates (Scenes 1, 2, 3)
```

---

## 6. BI Priority Score Calculation (`lib/scoring.ts`)

This is a pure function — no side effects, no API calls. Input: aggregated review data for one hotel. Output: a score per feature, sorted descending.

### Three dimensions

**Dimension 1 — Missing rate (w1)**
```
missing_rate(feature) = count(reviews where rating[feature] == 0) / total_reviews
```
Higher = more data missing = higher priority.

**Dimension 2 — Time confidence decay (w2)**
Based on `acquisition_date`. Each review gets a weight:
- ≤ 1 year old → weight 1.0
- 1–2 years old → weight 0.5
- > 2 years old → weight 0.2

```
time_confidence(feature) = weighted_avg_of_non_zero_ratings / 5
```
We want features with LOW confidence to have HIGH priority, so the contribution to priority score is `(1 - time_confidence)`.

**Dimension 3 — Text coverage (w3)**
```
text_coverage(feature) = count(reviews where text_analysis[feature] != 0) / total_reviews
```
Features already well-covered in review text are less urgent. So the contribution to priority score is `(1 - text_coverage)`, which **reduces** urgency.

### Combined formula

```
priority_score(feature) = w1 × missing_rate
                        + w2 × (1 - time_confidence)
                        - w3 × text_coverage
```

Where `w1 + w2 + w3 = 1`. Default weights: `{ w1: 0.4, w2: 0.3, w3: 0.3 }`.

`top_features` is the list of feature keys sorted by `priority_score` descending. Default Top-N = 5.

---

## 7. OpenAI Integration (`lib/prompts.ts`)

### Scene 1 — AI text polish (`/api/ai/polish`)
- **Trigger**: User clicks "AI 润色" button in Page 1.
- **Model**: `gpt-4o-mini`
- **Input**: user's draft review text + their star ratings for each feature.
- **Output**: polished version of the review text (string).
- **Storage**: not persisted. User reads it, edits if needed, then submits.

```ts
// Prompt structure
system: "你是一个酒店评论润色助手，帮助用户把口语化的评论改写得更清晰、具体、有参考价值。保持用户原本的语气和立场，不要改变评分倾向。"
user: `用户评分：${ratingsJson}\n\n用户原文：${draftText}\n\n请润色上面的评论。`
```

### Scene 2 — AI guided questions (`/api/ai/questions`)
- **Trigger**: When `hotel_analysis` is first created, or when `top_features` order changes after a recalculation.
- **Model**: `gpt-4o-mini`
- **Input**: `top_features` array + relevant hotel description fields from `description_proc`.
- **Output**: JSON array `[{ feature: string, question: string }]`, one question per top feature.
- **Storage**: saved to `hotel_analysis.ai_questions`.
- **Page 1 reads this directly** — no OpenAI call happens at page load time.

```ts
// Prompt structure
system: "你是一个酒店评论引导助手。只返回合法 JSON，不输出任何其他内容。"
user: `
以下是酒店的描述信息：
${hotelDescriptionJson}

以下是最需要用户补充评价的功能点（按优先级排序）：
${topFeatures.join(', ')}

请为每个功能点生成一条简短的中文引导问题，帮助用户针对性地评价。
返回格式：[{"feature": "功能点名称", "question": "引导问题"}]
`
```

### Scene 3 — Review text alignment analysis (`/api/analyze`, `/api/batch-analyze`)
- **Trigger A**: New review submitted via Page 1 → async call after writing to DB.
- **Trigger B**: Admin clicks "批量分析历史评论" in Page 2 → `/api/batch-analyze` processes all reviews with empty `text_analysis` one by one.
- **Model**: `gpt-4o`
- **Input**: `review_text` + all `description_proc` column values for that hotel + fixed list of rating feature names.
- **Output**: JSON object where keys are `description_proc` column names OR rating feature names, values are 0–5.
- **Storage**: written to `reviews_proc.text_analysis` for that review.

```ts
// Prompt structure
system: `你是一个酒店评论分析助手。只返回合法 JSON，不输出任何其他内容，不要加 markdown 代码块。`
user: `
以下是酒店的描述信息（按字段分组）：
${hotelDescriptionJson}

Rating 中的功能点名称列表：
${ratingFeatureNames.join(', ')}

以下是一条用户评论：
"${reviewText}"

请分析这条评论涉及了哪些字段或功能点，并给出 1-5 分：
- 针对描述字段（如 area_description）：评论内容与描述相符→高分，相左→低分
- 针对 rating 功能点（如 roomquality）：正面评价→高分，负面→低分
- 未提及的字段或功能点→ 0

返回格式：{"字段名或功能点名": 分数, ...}
只输出 JSON，不输出任何解释。
`
```

**Critical implementation notes for Scene 3:**
- Parse response with `JSON.parse()` after stripping any accidental markdown fences.
- Wrap in try/catch — if parse fails, skip this review and log the error, do not crash.
- In `/api/batch-analyze`, process reviews one at a time (not in parallel) to avoid rate limits. Write each result to DB immediately after receiving it.
- `/api/batch-analyze` should return a streaming response or use SSE so Page 2 can show a live progress bar.

---

## 8. Auto-update Logic for `hotel_analysis`

When Scene 3 completes for a review (either from a new submission or batch), trigger this logic:

```
1. Recalculate priority_scores + top_features using current weight_config
2. Compare new top_features array with old top_features array (order-sensitive)
3. If order changed:
   → Call Scene 2 to regenerate ai_questions
   → Save new priority_scores + top_features + ai_questions + last_updated to hotel_analysis
4. If order unchanged:
   → Save only priority_scores + last_updated to hotel_analysis
   → Skip Scene 2 (no OpenAI call)
```

This controls OpenAI costs — Scene 2 is only called when the ranking actually changes.

When admin adjusts weights in Page 2 (`POST /api/bi/[id]`), apply the same logic starting from step 1 with the new weights.

---

## 9. Page 1 — User Review Submission (`app/page.tsx`)

### User flow (in order)

1. **Hotel selector** — dropdown populated from `GET /api/hotels`. On selection, fetch `GET /api/hotels/[id]/questions` to load `ai_questions` from `hotel_analysis`.
2. **Guided questions + star ratings** — for each item in `ai_questions`, show the question text and a 1–5 star selector. These map to the `rating` JSONB fields.
3. **Free text review** — a textarea for the user's own comments. Optional voice input (browser Web Speech API).
4. **AI polish button** — calls `POST /api/ai/polish`, shows result in the textarea for user to accept/edit. Optional.
5. **Image upload** — upload photos to Supabase Storage, store returned URLs.
6. **Submit** — `POST /api/reviews` with: `eg_property_id`, `rating` (from star selections), `review_text`, `images`.

### What Page 1 must NEVER show
- Any BI metrics (missing rate, priority scores, confidence values).
- Any raw feature names (show the AI-generated question instead).
- Any `text_analysis` data.
- Any indication that there is an admin dashboard at `/dashboard`.

---

## 10. Page 2 — Admin BI Dashboard (`app/dashboard/page.tsx`)

### Layout

1. **Hotel selector** — dropdown from `GET /api/hotels`.
2. **Summary cards** — total reviews, % reviews with `text_analysis` populated, last updated timestamp.
3. **Missing rate chart** — bar chart per rating feature showing `% of reviews where rating[feature] == 0`.
4. **Time confidence chart** — per feature, showing the weighted confidence score.
5. **Text coverage chart** — per feature, showing `% of reviews where text_analysis[feature] != 0`.
6. **Priority ranking** — sorted list of features with their combined priority score.
7. **Weight sliders** — three sliders for w1, w2, w3 that always sum to 1. On change, call `POST /api/bi/[id]` with new weights, refresh all charts.
8. **Batch analysis button** — triggers `POST /api/batch-analyze` for selected hotel. Shows live progress bar using SSE or polling.

### No auth required (this is a demo).

---

## 11. Development Phases (follow in order)

### Phase 1 — Database ✓ COMPLETE
- All three tables confirmed readable in Supabase.
- `reviews_proc` migrated: `text_analysis`, `images`, `review_id` (UUID PK) all added and verified.
- `hotel_analysis` table created and confirmed.
- Do not re-run any migration SQL — the database is in its final state.

### Phase 2 — Project scaffold
- `npx create-next-app@latest` with App Router + Tailwind.
- Add env vars to `.env.local`.
- Create all folders and empty placeholder files per Section 5.
- Write `lib/supabase.ts` and `lib/openai.ts`.
- Verify Supabase connection with a simple test query.

### Phase 3 — Core API layer (no UI)
Build and test each route with curl/Postman before moving to the next:
1. `GET /api/hotels`
2. `POST /api/analyze` (Scene 3, single review)
3. `POST /api/batch-analyze` (loop over reviews missing `text_analysis`)
4. `GET /api/bi/[id]` (returns all three dimensions + priority scores)

### Phase 4 — Remaining OpenAI routes
1. `POST /api/ai/questions` (Scene 2)
2. `POST /api/bi/[id]` (weight adjustment + auto-update logic)
3. `POST /api/reviews` (write review + async Scene 3 trigger)
4. `POST /api/ai/polish` (Scene 1)
5. `GET /api/hotels/[id]/questions`

End-to-end test: submit a review → wait for async → check `hotel_analysis` updated.

### Phase 5 — Frontend
- Build Page 2 first (data display, easier to verify API correctness visually).
- Then build Page 1 (more interaction complexity).
- Pages share nothing except `lib/` utilities.

### Phase 6 — Deploy
- Add env vars to Vercel project settings.
- Deploy. Verify both pages work.
- Run batch analysis from Page 2 to initialise all `hotel_analysis` rows.

---

## 12. Key Invariants — Never Violate These

1. `rating` (user scores) and `text_analysis` (AI inferred scores) are **always separate**. Never merge or copy values between them.
2. `0` in `rating` means **missing data**, not zero stars. All missing-rate calculations must filter `== 0` as missing, not as a score.
3. Page 1 never calls `GET /api/bi/[id]`. Page 2 never calls `POST /api/reviews`.
4. Scene 2 (question generation) is only called when `top_features` order changes. Do not call it on every review submission.
5. `/api/batch-analyze` processes reviews **sequentially**, not in parallel.
6. All OpenAI responses in Scene 3 must be parsed as JSON. Never trust raw text output — always strip markdown fences before parsing, always wrap in try/catch.
7. `hotel_analysis.weight_config` is the source of truth for current weights. Always read from it before recalculating.
