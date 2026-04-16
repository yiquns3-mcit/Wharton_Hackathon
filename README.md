# Expedia AI Review System

> An AI-powered hotel review platform with intelligent guided questions, real-time text analysis, and a BI analytics dashboard for data quality monitoring.

**Live Demo:**
- User Review Form → https://wharton-hackathon.vercel.app/
- Admin BI Dashboard → https://wharton-hackathon.vercel.app/dashboard

---

## Overview

A two-page web application built on top of Expedia hotel data stored in Supabase.

**Page 1 — User Review Form (`/`)**
Users select a hotel, answer AI-generated guided questions tailored to the hotel's data gaps, give star ratings for specific features, write a free-text review, optionally use AI to polish their text, and submit with optional photo uploads.

**Page 2 — Admin BI Dashboard (`/dashboard`)**
Admins see data quality metrics per hotel: missing rating rates, time-based confidence decay, and text coverage per feature. They can tune weighting sliders to reprioritize features and run batch AI analysis over historical reviews.

The two pages are completely independent — no shared UI, no navigation links. They share only the Supabase data layer.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router) |
| Database | Supabase (PostgreSQL) |
| Storage | Supabase Storage (review images) |
| Styling | Tailwind CSS |
| Charts | Recharts |
| Deployment | Vercel |
| AI — Review Analysis | OpenAI `gpt-4o` |
| AI — Questions & Polish | OpenAI `gpt-4o-mini` |

---

## Features

### Page 1 — User Review Form

- **Hotel selector** — searchable dropdown listing all hotels with review counts
- **AI-guided questions** — dynamically generated questions targeting the hotel's current data gaps (e.g. "How was the spa compared to the description?")
- **Two-tier star ratings** — required ratings for overall + top 2 priority features; optional ratings for remaining 13 features
- **Voice input** — browser Web Speech API for hands-free dictation
- **AI polish** — "Help me write" button rewrites the draft while preserving the user's tone and ratings stance (powered by `gpt-4o-mini`)
- **Dynamic follow-up questions** — as the user types, the system detects which unverified hotel facts are already addressed and surfaces the top 2 most urgent remaining questions in real time
- **Photo upload** — images stored in Supabase Storage, URLs saved with the review
- **Clean submission flow** — success screen with option to submit another review

### Page 2 — Admin BI Dashboard

- **Summary cards** — total reviews, % with AI text analysis, last updated timestamp
- **Three metric charts** (Recharts horizontal bar charts):
  - Missing Rate — % of reviews where each feature was left unscored
  - Time Confidence — weighted average rating per feature with age-based decay
  - Text Coverage — % of reviews whose text mentions each feature
- **Priority ranking** — all 15 features ranked by composite priority score
- **Fact gap ranking** — verifiable hotel facts (e.g. "free breakfast", "pet fee $50/night") ranked by gap score (coverage rate + staleness)
- **Weight sliders** — adjust w1 (missing rate), w2 (time decay), w3 (text coverage); always sum to 1; triggers live recalculation
- **Batch analysis** — process all historical reviews through Scene 3 AI analysis with a live SSE progress bar
- **Fact tag management** — regenerate verifiable fact tags from hotel description on demand
- **Help modal** — embedded documentation of the full system

---

## Architecture: Three-Scene AI Pipeline

### Scene 1 — Text Polish (`POST /api/ai/polish`)
Triggered when user clicks "Help me write". Sends the draft text and current ratings to `gpt-4o-mini`, returns a polished version. Never persisted — user accepts, edits, or discards.

### Scene 2 — Guided Question Generation (`POST /api/ai/questions`)
Triggered only when the top-2 priority fact tags change order. Sends the hotel description and top-priority gap facts to `gpt-4o-mini`, returns a JSON array of targeted questions. Cached in `hotel_analysis.gap_questions` so Page 1 loads instantly with no OpenAI call at page load time.

### Scene 3 — Review Text Analysis (`POST /api/analyze`, `POST /api/batch-analyze`)
Triggered after every new review submission (async) and during batch processing. Sends review text and the 15 rating feature names to `gpt-4o`. Returns a JSON object with `0` (not mentioned) or `1` (mentioned) for each feature, plus fact tag mention flags. Written to `reviews_proc.text_analysis` and `reviews_proc.fact_analysis`.

After Scene 3 completes, `updateHotelAnalysis()` runs:
1. Recalculates priority scores and gap scores with current weights
2. Compares new top-2 gap facts with previous — if order changed, triggers Scene 2
3. Upserts `hotel_analysis` with updated scores, questions, and timestamp

### Fact Gap System
One-time fact extraction (idempotent) uses `gpt-4o` to identify high-volatility verifiable facts from the hotel description (amenities, policies, fees, hours). Each fact is tracked by:
- **Coverage rate** — % of reviews in the past year that mention it
- **Staleness** — time decay based on the most recent verified review
- **Gap score** = `0.5 × (1 − coverage_rate) + 0.5 × staleness`

---

## BI Priority Score Formula

```
priority_score(feature) = w1 × missing_rate
                        + w2 × (1 − time_confidence)
                        − w3 × text_coverage
```

| Dimension | Default Weight | Meaning |
|---|---|---|
| Missing rate (w1) | 0.4 | % of reviews where user skipped this rating |
| Time confidence (w2) | 0.3 | Low-confidence features (old/sparse data) rank higher |
| Text coverage (w3) | 0.3 | Features already well-covered in text rank lower |

Time decay weights per review age:
- ≤ 1 year → 1.0×
- 1–2 years → 0.5×
- > 2 years → 0.2×

---

## File Structure

```
/
├── app/
│   ├── page.tsx                          # Page 1: user review form
│   ├── dashboard/page.tsx                # Page 2: admin BI dashboard
│   └── api/
│       ├── hotels/route.ts               # GET: list all hotels
│       ├── hotels/[id]/questions/route.ts # GET: pre-generated gap questions
│       ├── reviews/route.ts              # POST: submit review + async Scene 3
│       ├── analyze/route.ts              # POST: Scene 3 single review
│       ├── batch-analyze/route.ts        # POST: Scene 3 batch (SSE streaming)
│       ├── bi/[id]/route.ts              # GET/POST: BI metrics + weight recalc
│       └── ai/
│           ├── polish/route.ts           # POST: Scene 1 text polish
│           ├── questions/route.ts        # POST: Scene 2 question generation
│           ├── facts/route.ts            # POST: force-regenerate fact tags
│           └── followup/route.ts         # POST: dynamic follow-up questions
├── lib/
│   ├── supabase.ts                       # Supabase client
│   ├── openai.ts                         # OpenAI client
│   ├── prompts.ts                        # All OpenAI prompt templates
│   ├── scoring.ts                        # Pure priority + gap score functions
│   ├── hotelAnalysisUpdater.ts           # Auto-update hotel_analysis after reviews
│   └── factExtractor.ts                  # One-time fact extraction + storage
├── .env.local
└── CLAUDE.md                             # Full architecture specification
```

---

## Database Schema

### `description_proc`
Hotel metadata (city, star rating, amenity lists, policies, area/property descriptions). Read-only — do not modify structure.

### `reviews_proc`
One row per review.

| Column | Type | Description |
|---|---|---|
| `review_id` | UUID PK | Auto-generated |
| `eg_property_id` | TEXT | FK to hotel |
| `acquisition_date` | DATE | Review date |
| `rating` | JSONB | 15 feature scores (0 = not rated, 1–5 = rated) |
| `review_text` | TEXT | User's free-text review |
| `text_analysis` | JSONB | AI mention flags for 15 rating features (0 or 1) |
| `images` | TEXT[] | Supabase Storage URLs |

### `hotel_analysis`
One row per hotel. Cached BI results and AI questions.

| Column | Type | Description |
|---|---|---|
| `eg_property_id` | TEXT PK | FK to hotel |
| `priority_scores` | JSONB | `{ "roomquality": 0.87, ... }` |
| `top_features` | TEXT[] | Features sorted descending by priority score |
| `gap_questions` | JSONB | Current fact-gap guided questions |
| `fact_inventory` | JSONB | Extracted verifiable facts with gap scores |
| `weight_config` | JSONB | `{ "w1": 0.4, "w2": 0.3, "w3": 0.3 }` |
| `last_updated` | TIMESTAMPTZ | Last recalculation time |

---

## API Routes

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/hotels` | GET | List all hotels with review counts |
| `/api/hotels/[id]/questions` | GET | Load pre-generated gap questions for hotel |
| `/api/reviews` | POST | Submit new review; triggers async Scene 3 |
| `/api/analyze` | POST | Scene 3: analyze single review text |
| `/api/batch-analyze` | POST | Scene 3: batch process all reviews (SSE) |
| `/api/bi/[id]` | GET | Full BI metrics for a hotel |
| `/api/bi/[id]` | POST | Recalculate with new weights |
| `/api/ai/polish` | POST | Scene 1: polish review draft |
| `/api/ai/questions` | POST | Scene 2: generate guided questions |
| `/api/ai/facts` | POST | Force-regenerate fact tags from description |
| `/api/ai/followup` | POST | Dynamic follow-up questions as user types |

---

## Local Setup

### 1. Clone & install

```bash
git clone <repo-url>
cd expedia_ai_review_system
npm install
```

### 2. Environment variables

Create `.env.local` in the project root:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_api_key
```

### 3. Run development server

```bash
npm run dev
```

Open http://localhost:3000 for the review form and http://localhost:3000/dashboard for the admin dashboard.

---

## Deployment

The project is deployed on Vercel. To redeploy:

1. Push to the main branch — Vercel auto-deploys.
2. Ensure all three environment variables are set in Vercel project settings.
3. After first deploy, open `/dashboard`, select a hotel, and click **Run Batch Analysis** to initialize `hotel_analysis` rows for all hotels.

---

## Key Invariants

1. `rating` (user scores) and `text_analysis` (AI mention flags) are always separate — never merged.
2. `0` in `rating` means the user skipped that feature (missing data), not a zero-star rating.
3. Page 1 never calls `/api/bi/[id]`. Page 2 never calls `/api/reviews`.
4. Scene 2 (question generation) only runs when the top-2 gap facts change order — not on every review.
5. `/api/batch-analyze` processes reviews sequentially, never in parallel.
6. All Scene 3 JSON responses are stripped of markdown fences and wrapped in try/catch before parsing.
7. `hotel_analysis.weight_config` is the single source of truth for current BI weights.
