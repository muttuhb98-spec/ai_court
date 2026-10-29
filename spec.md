# AI Court – Mystery Challenge: Product & Technical Spec

**Version:** 1.0  
**Audience:** Codex (implementation agent). This document is the single source of truth. If something is not specified here, choose the simplest option consistent with this spec and record the decision in `docs/DECISIONS.md`.  
**Stack:** MongoDB, Express, React, Node.js (MERN) + Google Gemini API

---

## 1. Project Overview

AI Court is a web game. The player types a short scenario or story seed (for example: "Someone stole the trophy from the college fest storage room"). The backend uses Gemini to invent a complete fictional investigation: a setting, a set of suspects, one hidden culprit, and a bundle of evidence (WhatsApp-style chats, images, CCTV-style footage, plus supporting documents). The player studies the evidence, reasons about it, and accuses one suspect. The game then reveals whether the player was right, along with the full explanation of what really happened.

Everything in a case is **fictional and AI-generated**. No real people, brands' private data or real events are used.

### 1.1 Goals

1. Turn any short user seed into a playable, **solvable** mystery in under about 90 seconds.
2. Present evidence in realistic, interactive viewers (chat UI, image gallery, CCTV player).
3. Guarantee fairness: the culprit must be deducible from the evidence, with red herrings but no impossible logic.
4. Keep the hidden solution secret from the client until the player accuses.

### 1.2 Non-Goals (v1)

- No multiplayer or real-time collaboration.
- No real video generation by default (see 7.4; an optional flag is allowed).
- No payments, no admin dashboard, no mobile native app.
- No user-generated content sharing publicly.

---

## 2. Core User Flow

1. **Landing page** → player reads a short pitch and clicks "Start a Case".
2. **Create case page** → player enters a scenario seed (10–600 chars), optionally picks difficulty (Easy / Medium / Hard) and tone (Realistic / Dramatic / Light-hearted). Submits.
3. **Generation screen** → progress indicator with live stage labels (Writing the story → Creating suspects → Forging evidence → Rendering images → Final checks). Poll the case status.
4. **Case file page** (main game screen):
   - Case briefing (victim/incident, location, time window).
   - Suspect cards (name, role, relation to incident, short bio).
   - Evidence board with tabs: Chats, Images, Footage, Documents.
   - Notes panel (player's private notes, saved locally per case).
   - Hints button (limited uses).
5. **Accuse** → player selects one suspect and writes a short reasoning (optional, up to 500 chars), then confirms.
6. **Verdict page** → shows correct/incorrect, the real culprit, the full timeline of what happened, the decisive clues highlighted, the red herrings explained, and the score.
7. **My cases page** → list of past cases with result; player can replay a case (without re-generating) or start a new one.

---

## 3. Architecture

```
[React SPA (Vite)]  <--REST/JSON-->  [Express API]  <-->  [MongoDB]
                                          |
                                          +--> [Gemini API: text/JSON, image generation]
                                          +--> [File storage: GridFS or /uploads]
```

- **Monorepo** with two packages: `server/` and `client/`.
- Generation runs as an **async job** inside the Express process (simple in-process queue; no Redis required in v1). The client polls `GET /api/cases/:id/status`.
- The Gemini API key lives only on the server. The client never calls Gemini.

### 3.1 Tech Choices (fixed)

| Area | Choice |
|---|---|
| Runtime | Node.js 20+ |
| Server | Express 4, ES modules |
| DB | MongoDB with Mongoose |
| Client | React 18 + Vite, React Router v6 |
| Styling | Tailwind CSS |
| State/data | TanStack Query for server state; React state/context for UI |
| AI SDK | `@google/genai` (official Google Gen AI SDK) |
| Validation | Zod (both server request validation and Gemini JSON output validation) |
| Auth | Email + password, JWT in httpOnly cookie, bcrypt |
| Security | helmet, cors (allowlist), express-rate-limit |
| Testing | Vitest (client + server), Supertest (API) |
| Lint/format | ESLint + Prettier |

### 3.2 Repository Layout

```
ai-court/
  package.json              # npm workspaces: client, server
  .env.example
  README.md
  docs/DECISIONS.md
  server/
    src/
      index.js              # app bootstrap
      config/env.js         # zod-validated env
      config/db.js
      models/               # User.js, Case.js, EvidenceAsset (GridFS helper)
      routes/               # auth.routes.js, cases.routes.js, assets.routes.js
      controllers/
      middleware/           # auth.js, rateLimit.js, errorHandler.js, validate.js
      services/
        gemini/
          client.js         # SDK wrapper, retries, timeouts
          prompts.js        # all prompt templates (Section 7)
          schemas.js        # zod schemas for Gemini JSON (Section 7)
          caseGenerator.js  # pipeline orchestrator
          imageGenerator.js
          footageBuilder.js
          validator.js      # solvability checks
        scoring.js
        jobQueue.js
      utils/
    tests/
  client/
    src/
      main.jsx, App.jsx
      api/                  # fetch wrappers
      pages/                # Landing, Login, Register, CreateCase, Generating, CaseFile, Verdict, MyCases
      components/
        evidence/           # ChatViewer, ImageGallery, FootagePlayer, DocumentViewer
        case/               # SuspectCard, Briefing, NotesPanel, AccuseModal, HintButton
        ui/                 # Button, Card, Modal, Tabs, Spinner, Toast
      hooks/
      styles/
    tests/
```

---

## 4. Data Models (Mongoose)

### 4.1 User

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `email` | String | unique, lowercase, required |
| `passwordHash` | String | bcrypt, never returned by API |
| `displayName` | String | 2–40 chars |
| `createdAt` | Date | |

### 4.2 Case

One document per case. Hidden fields are stored in the same document but are **stripped by the serializer** until the case status is `solved`.

```js
Case {
  _id,
  userId,                      // owner
  seed: String,                // user's scenario
  difficulty: 'easy'|'medium'|'hard',
  tone: 'realistic'|'dramatic'|'lighthearted',
  status: 'queued'|'generating'|'ready'|'failed'|'solved',
  stage: String,               // current pipeline stage label for UI
  error: { code, message } | null,

  // PUBLIC (sent to client once status is ready)
  title: String,
  briefing: {
    incidentSummary: String,
    location: String,
    timeWindow: { start: String, end: String },   // ISO or human string
    victimOrTarget: String
  },
  suspects: [{
    id: String,                // 's1'..'s5'
    name: String,
    role: String,
    relationToIncident: String,
    bio: String,
    portraitAssetId: ObjectId | null
  }],
  evidence: [Evidence],        // see 4.3
  hintsAvailable: Number,      // default 3
  hintsUsed: Number,

  // HIDDEN (stripped until solved)
  solution: {
    culpritId: String,
    motive: String,
    method: String,
    timeline: [{ time: String, event: String }],
    decisiveEvidenceIds: [String],     // at least 2
    redHerrings: [{ evidenceId: String, explanation: String }],
    suspectAlibis: [{ suspectId: String, alibi: String, holds: Boolean }]
  },
  hints: [{ level: Number, text: String }],   // hidden until requested, served one at a time

  // Player result
  accusation: { suspectId, reasoning, submittedAt } | null,
  result: { correct: Boolean, score: Number, breakdown: Object } | null,

  createdAt, updatedAt
}
```

Indexes: `{ userId: 1, createdAt: -1 }`, `{ status: 1 }`.

### 4.3 Evidence (embedded subdocument)

Common fields: `id` (e.g. `e1`), `type` (`chat` | `image` | `footage` | `document`), `title`, `description`, `source` (who/what produced it), `timestamp` (when it was created in the story), `relatedSuspectIds[]`.

Type-specific payload:

- **chat**: `{ appStyle: 'whatsapp', participants: [{id, name}], messages: [{ id, senderId, text, time, status?: 'sent'|'delivered'|'read', attachmentEvidenceId? }] }`
- **image**: `{ prompt, assetId, altText, caption }`
- **footage**: `{ cameraName, location, frames: [{ assetId, timestampLabel, caption }], frameDurationMs, mode: 'frames'|'video', videoAssetId?: ObjectId }`
- **document**: `{ docKind: 'receipt'|'email'|'note'|'log'|'report', content: String (markdown, sanitized on render) }`

### 4.4 Assets

Generated images are stored in **MongoDB GridFS** (bucket `assets`). Served via `GET /api/assets/:id` with ownership check and long cache headers. Max 2 MB per image after compression (server resizes to max 1024 px on the long side using `sharp`, output WebP).

---

## 5. REST API

Base path `/api`. All responses JSON except assets. Errors use shape `{ "error": { "code": "STRING", "message": "human readable" } }`.

### 5.1 Auth

| Method & Path | Body | Response |
|---|---|---|
| `POST /auth/register` | `{ email, password, displayName }` | `201 { user }`, sets cookie |
| `POST /auth/login` | `{ email, password }` | `200 { user }`, sets cookie |
| `POST /auth/logout` | – | `204` |
| `GET /auth/me` | – | `200 { user }` or `401` |

Password: min 8 chars. Cookie: httpOnly, sameSite=lax, secure in production, 7-day expiry.

### 5.2 Cases (all require auth)

| Method & Path | Purpose |
|---|---|
| `POST /cases` | Body `{ seed, difficulty, tone }`. Creates a case with status `queued`, starts generation, returns `202 { caseId }`. |
| `GET /cases/:id/status` | Returns `{ status, stage, progress (0-100), error }`. Used for polling every 2 s. |
| `GET /cases/:id` | Returns the **public** case view. Returns `409 CASE_NOT_READY` if not `ready`/`solved`. After `solved`, includes the `solution`, `result`, and `accusation`. |
| `GET /cases` | List current user's cases: `{ id, title, status, difficulty, result?.correct, createdAt }`, paginated (`?page=&limit=`). |
| `POST /cases/:id/hint` | Reveals next hint (level 1..3). Returns `{ level, text, hintsRemaining }`. `403 NO_HINTS_LEFT` if exhausted. Persists to `hintsUsed`. |
| `POST /cases/:id/accuse` | Body `{ suspectId, reasoning? }`. One-time. Computes result, sets status `solved`, returns the full solved view. `409 ALREADY_SOLVED` on repeat. |
| `POST /cases/:id/retry` | Only if status `failed`; re-queues generation. |
| `DELETE /cases/:id` | Deletes case and its assets. |

### 5.3 Assets

`GET /assets/:id` → image bytes (`image/webp`), owner-only, `Cache-Control: private, max-age=31536000, immutable`.

### 5.4 Health

`GET /health` → `{ ok: true }` (no auth).

### 5.5 Rate limits

- Global: 100 req / 15 min / IP.
- `POST /cases`: 5 per hour per user (configurable via env).
- `POST /auth/*`: 20 per 15 min / IP.

---

## 6. Game Rules and Scoring

### 6.1 Case composition by difficulty

| | Easy | Medium | Hard |
|---|---|---|---|
| Suspects | 3 | 4 | 5 |
| Chat threads | 2 | 3 | 4 |
| Images | 3 | 4 | 5 |
| Footage clips | 1 (3–4 frames) | 2 (4–6 frames) | 2 (5–8 frames) |
| Documents | 1 | 2 | 3 |
| Red herrings | 1 | 2 | 3 |
| Decisive evidence items | 3 | 2–3 | 2 |
| Hints | 3 | 3 | 2 |

### 6.2 Fairness rules (must be enforced by the validator, Section 7.6)

1. Exactly one culprit.
2. At least 2 evidence items independently point to the culprit (decisive evidence).
3. Every innocent suspect has either a verifiable alibi or a clear contradicting piece of evidence.
4. No evidence item may name the culprit outright (e.g. a confession). Clues must require inference.
5. Timeline is internally consistent (times, locations, who was where).
6. Red herrings must be explainable after the fact.

### 6.3 Scoring (computed server-side in `scoring.js`)

- Correct accusation: **base 1000**. Incorrect: **base 0** (still reveals solution).
- Hint penalty: **−150 per hint used** (floor at 0 for the correct-answer score).
- Time bonus (correct only): up to **+200**, linearly decreasing from 0 to 30 minutes since `ready` time.
- Result stored as `{ correct, score, breakdown: { base, hintPenalty, timeBonus } }`.
- Reasoning text is stored but not graded in v1 (display only on verdict page).

---

## 7. Gemini Integration

All model names come from env vars so they can be changed without code edits.

| Purpose | Env var | Suggested default |
|---|---|---|
| Story, chats, documents (structured JSON) | `GEMINI_TEXT_MODEL` | `gemini-2.5-flash` |
| Validation / repair pass | `GEMINI_TEXT_MODEL` (same) | `gemini-2.5-flash` |
| Image generation | `GEMINI_IMAGE_MODEL` | `gemini-2.5-flash-image` |
| Optional video (flag) | `GEMINI_VIDEO_MODEL` | `veo-3.0-fast-generate-001` |

> Codex: verify current model IDs against Google's official documentation at implementation time and update defaults in `.env.example` if they changed.

### 7.1 Pipeline stages (`caseGenerator.js`)

Stages and the `stage` label / `progress` value written to the DB:

1. **Case Bible** (10%) – one Gemini call returning the full hidden truth and the public skeleton (7.2).
2. **Evidence Plan** (25%) – one Gemini call that, given the bible, outputs an array of evidence specs (type, title, what it proves/misleads, which suspects it relates to) respecting the quotas in 6.1.
3. **Evidence Content** (45%) – generate chats and documents in parallel (concurrency 3), each as strict JSON (7.3).
4. **Image Prompts and Rendering** (75%) – for each image evidence and each footage frame and each suspect portrait, generate the image (7.4). Concurrency 2, retry up to 2 times.
5. **Hints** (85%) – generate 3 graded hints (vague → specific) from the bible.
6. **Validation** (95%) – run solvability validator (7.6). If it fails, run **one** repair pass, then re-validate. If it still fails, mark `failed` with code `VALIDATION_FAILED`.
7. **Finalize** (100%) – persist, set status `ready`.

All Gemini text calls use JSON output mode (`responseMimeType: "application/json"`) with a response schema, `temperature` 0.9 for creative stages and 0.2 for validation. Every response is parsed and validated with Zod; on failure retry up to 2 times with the validation error appended to the prompt.

### 7.2 Case Bible prompt (system + user)

**System prompt (verbatim intent):**

```
You are a mystery-case designer for a detective game. You invent fully fictional
cases. You never use real people, real companies, or real events. You always
design a case that is fair and solvable by logical deduction. Output must follow
the provided JSON schema exactly.
```

**User prompt template:**

```
Player scenario seed: "{{seed}}"
Difficulty: {{difficulty}}
Tone: {{tone}}
Number of suspects: {{suspectCount}}

Design a case with exactly one culprit. Rules:
- The culprit must be deducible from at least {{decisiveCount}} independent clues.
- Every innocent suspect needs an alibi or a clue that clears them.
- Include {{redHerringCount}} red herrings that look suspicious but are explainable.
- No clue may state the culprit's guilt directly.
- Keep the timeline consistent (who was where, and when).
- Names should be culturally varied, plausible, and fictional.
- Content must be PG-13: no graphic violence, no sexual content, no real hate speech.
Return JSON only.
```

**Output schema (`CaseBibleSchema`):**

```json
{
  "title": "string",
  "briefing": { "incidentSummary": "string", "location": "string",
                "timeWindow": { "start": "string", "end": "string" },
                "victimOrTarget": "string" },
  "suspects": [{ "id": "s1", "name": "string", "role": "string",
                 "relationToIncident": "string", "bio": "string",
                 "appearance": "string (for portrait prompt)" }],
  "solution": { "culpritId": "s?", "motive": "string", "method": "string",
                "timeline": [{ "time": "string", "event": "string" }],
                "suspectAlibis": [{ "suspectId": "s?", "alibi": "string", "holds": true }],
                "keyFacts": ["string"] }
}
```

### 7.3 Evidence generation

**Evidence plan item schema:** `{ id, type, title, purpose: 'decisive'|'supporting'|'red_herring'|'context', pointsTo: string[], explanation: string }`.

**Chat generation requirements** (prompt must include these):

- Realistic WhatsApp-style tone: abbreviations, emojis where natural, typos sparingly, timestamps in order.
- 8–25 messages per thread, 2–4 participants (participants must be suspects or other fictional named people).
- The clue must be embedded naturally (e.g. a slip about timing, a mismatch of detail), never a confession.
- Output follows the `chat` payload shape in 4.3.

**Document generation requirements:** short (80–250 words), realistic format (receipt, email, access log, note, report), consistent with the bible's timeline.

### 7.4 Images and footage

1. For each image evidence and each suspect, first ask Gemini text to write a concise **image prompt** (no text-heavy imagery; avoid readable text/letters in images since AI renders them poorly; no real faces of public figures; no logos).
2. Call the Gemini image model with the prompt plus a consistent global style string from env `IMAGE_STYLE` (default: `"photorealistic, natural lighting, candid, slightly grainy smartphone photo"` for images; `"low-resolution CCTV still, fisheye-ish, monochrome-greenish tint, high noise"` for footage frames).
3. Post-process with `sharp`: resize, convert to WebP, store in GridFS.
4. **Footage mode `frames` (default):** a footage evidence item is a sequence of 3–8 generated frames with `timestampLabel` text (e.g. `CAM 02 · 21:47:12`) that the **client overlays** as HTML on top of each frame (so the timestamp text is crisp and correct). The `FootagePlayer` plays them like a CCTV feed (see 9.3).
5. **Optional `video` mode:** if `ENABLE_VIDEO_GENERATION=true`, attempt short video generation for footage using the video model; on any failure or timeout (120 s) fall back to `frames` mode silently. Default is `false`.
6. If an image fails after retries, use a deterministic placeholder asset and set `altText` to the prompt-derived description, so a single failed image never fails the whole case. Log a warning.
7. Safety: if Gemini blocks a prompt, rewrite it once with a softer instruction; otherwise fall back to the placeholder.

### 7.5 Hints

Three hints, each stored with `level` 1–3. Level 1 is a general nudge (where to look), level 2 narrows to an evidence item or suspect group, level 3 nearly points to the key contradiction but does **not** name the culprit.

### 7.6 Solvability validator (`validator.js`)

Two layers:

1. **Deterministic checks (code):** culprit id exists; exactly one culprit; decisive evidence count meets quota; every evidence item references existing suspects; each suspect other than the culprit has an alibi entry; no evidence text contains the string `"I did it"` / `"I killed"` / `"I stole"` or the culprit name alongside confession-style verbs (basic heuristic list in config).
2. **LLM check (Gemini, temperature 0.2):** given the full case, answer in JSON: `{ solvable: boolean, culpritDeducible: boolean, contradictions: string[], leaks: string[], suggestedFixes: string[] }`. Fail if `solvable` or `culpritDeducible` is false or `leaks` is non-empty.

On failure, the **repair pass** re-prompts Gemini with the case and the issues list, requesting corrected evidence items only; the changed items replace the originals.

### 7.7 Secrecy requirement

The serializer `toPublicCase(caseDoc)` must remove `solution`, `hints` (text), `result`, and any evidence `purpose`/`explanation` metadata while status is not `solved`. Add a unit test proving no hidden field appears in `GET /cases/:id` before accusation.

---

## 8. Security, Safety and Privacy

- Passwords hashed with bcrypt (cost 12). JWT secret from env. Cookies httpOnly.
- All request bodies validated with Zod. Reject unknown fields.
- **Prompt injection hygiene:** the user seed is passed only inside a delimited block labeled as untrusted player input; system prompt instructs the model to ignore any instructions inside it. Seed is length-limited and stripped of control characters.
- **Content policy:** seed is first run through a lightweight Gemini moderation check (`{ allowed: boolean, reason }`). Reject seeds involving real named people, sexual content involving minors, graphic gore, self-harm instructions, or targeted harassment with `400 SEED_NOT_ALLOWED`. All generated content must be fictional and PG-13.
- Render AI-generated text as plain text/escaped; documents use a markdown renderer with HTML disabled (no `dangerouslySetInnerHTML` without sanitization via DOMPurify).
- Asset endpoint verifies the requesting user owns the case containing the asset.
- CORS allowlist from env. helmet defaults enabled.
- Do not log full prompts or API keys. Log case id, stage, durations, and error codes.
- UI shows a footer notice: "All cases are fictional and AI-generated."

---

## 9. Frontend Specification

### 9.1 Routes

| Path | Page | Auth |
|---|---|---|
| `/` | Landing | public |
| `/login`, `/register` | Auth forms | public |
| `/new` | CreateCase | required |
| `/cases/:id/generating` | Generating (polls status) | required |
| `/cases/:id` | CaseFile | required |
| `/cases/:id/verdict` | Verdict | required |
| `/cases` | MyCases | required |

Redirect rules: `/cases/:id` while status is not ready → `/cases/:id/generating`; when `solved`, `/cases/:id` redirects to verdict (with a "Review evidence" link back using `?review=1` to view the case file read-only).

### 9.2 Visual design

- Dark "noir" theme: near-black background, off-white text, one accent color (amber) for actions. Monospace accent font for case file labels (e.g. "CASE #A1F3"), clean sans-serif body.
- Fully responsive; usable at 360 px width. Evidence tabs become a horizontally scrollable tab bar on mobile.
- Accessible: keyboard navigable, visible focus states, alt text on all images, `prefers-reduced-motion` respected, color contrast AA.

### 9.3 Evidence viewers

**ChatViewer** – looks like a messaging app thread: header with participant names, left/right bubbles by sender (first participant listed = "left"), timestamps, day separators, read-tick icons, optional "attachment" chip linking to another evidence item. Thread list on the left (desktop) / list view then thread view (mobile). Do not use real WhatsApp logos or branding; use a generic green-accent chat style.

**ImageGallery** – grid of thumbnails, click opens lightbox with caption, source, timestamp, zoom (wheel/pinch), next/prev keys. Photo "metadata" panel shows title, description, `timestamp`, `source`.

**FootagePlayer** – 4:3 frame with CCTV styling (scanlines, noise overlay via CSS), HTML overlay with camera name and live-updating timestamp label from each frame's `timestampLabel`. Controls: play/pause, previous/next frame, scrub bar, speed (0.5x, 1x, 2x). Default frame duration from `frameDurationMs` (default 1500). Pause on blur. Reduced-motion users start paused.

**DocumentViewer** – paper-style card per `docKind`, rendering sanitized markdown.

### 9.4 Case file page features

- Sticky header: case title, difficulty badge, elapsed timer, hints remaining, "Make an accusation" button.
- **Notes panel:** textarea per case persisted in `localStorage` key `aicourt:notes:{caseId}`. Also allow "pin" on any evidence item (stored in the same local storage record) with a Pinned filter.
- **Suspect cards:** portrait, name, role, bio; clicking filters evidence to items whose `relatedSuspectIds` include the suspect.
- **HintButton:** confirm dialog that states the penalty; shows hints revealed so far.
- **AccuseModal:** select suspect (radio cards), optional reasoning textarea (max 500 chars), confirm checkbox "I understand this is final". Calls `POST /cases/:id/accuse`.

### 9.5 Verdict page

Shows: big result banner (correct / incorrect), the real culprit with portrait, motive, method, interactive timeline (list ordered by time), decisive evidence (clickable links back to the evidence), red herrings with explanations, each suspect's alibi (holds / broken), score breakdown, player's reasoning, buttons: "New case", "Play again with same seed" (creates new case with same seed/difficulty/tone), "Back to my cases".

### 9.6 States every page must handle

Loading skeletons, empty states, error states with retry, and offline/network failure toasts. On the Generating page: show stage labels with progress bar; if `failed`, show the error with a "Try again" button calling `/retry`; if generation exceeds 5 minutes, show a "This is taking longer than usual" notice but keep polling.

---

## 10. Environment Variables

`.env.example` must contain:

```
# Server
PORT=5000
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:5173
MONGODB_URI=mongodb://localhost:27017/ai-court
JWT_SECRET=change-me
COOKIE_SECURE=false

# Gemini
GEMINI_API_KEY=
GEMINI_TEXT_MODEL=gemini-2.5-flash
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
GEMINI_VIDEO_MODEL=veo-3.0-fast-generate-001
ENABLE_VIDEO_GENERATION=false
IMAGE_STYLE=photorealistic, natural lighting, candid, slightly grainy smartphone photo
CCTV_STYLE=low-resolution CCTV still, monochrome greenish tint, high noise

# Limits
CASES_PER_HOUR=5
GEMINI_TIMEOUT_MS=60000
IMAGE_CONCURRENCY=2
TEXT_CONCURRENCY=3

# Client (client/.env)
VITE_API_BASE_URL=http://localhost:5000/api
```

The server must fail fast at startup with a clear message if required variables (`MONGODB_URI`, `JWT_SECRET`, `GEMINI_API_KEY`) are missing. When `MOCK_GEMINI=true`, `GEMINI_API_KEY` is not required.

---

## 11. Non-Functional Requirements

- **Performance:** case generation target ≤ 90 s for Medium (p50), ≤ 180 s hard timeout per case overall; API non-generation endpoints respond < 300 ms p95 locally.
- **Reliability:** generation is idempotent per case id; on server restart, any case stuck in `generating` for > 10 minutes is marked `failed` by a startup sweep.
- **Cost control:** per-user case quota (Section 5.5); cap output tokens per call; cache nothing across users.
- **Observability:** structured JSON logs (pino) with request id.
- **Code quality:** no `any`-style shortcuts (use JSDoc types or TypeScript-free JS with Zod schemas as the contract); small modules; each service has unit tests.

---

## 12. Testing Requirements

1. **Unit:** scoring, serializer secrecy (`toPublicCase`), Zod schemas, deterministic validator checks, prompt builders.
2. **Integration (Supertest + mongodb-memory-server):** auth flow, create case → status polling → get public case → hint → accuse → solved view. Gemini client must be **mocked** with fixture JSON so tests are deterministic and free.
3. **Client:** component tests for ChatViewer, FootagePlayer controls, AccuseModal validation.
4. Provide `server/tests/fixtures/sampleCase.json` containing one complete valid case so the whole UI can be developed with `MOCK_GEMINI=true` (env flag that makes the pipeline return the fixture after a short delay).

---

## 13. Build Order (milestones)

Codex should implement in this order, committing after each milestone and keeping the app runnable:

1. **M1 – Scaffold:** monorepo, env validation, Express + Mongo connection, health route, Vite + Tailwind client, lint/test tooling.
2. **M2 – Auth:** register/login/logout/me, protected routes on client.
3. **M3 – Mock case flow:** Case model, `MOCK_GEMINI` fixture pipeline, status polling, CaseFile page with all four evidence viewers rendering fixture data.
4. **M4 – Game loop:** hints, accusation, scoring, secrecy serializer, Verdict page, My Cases.
5. **M5 – Real Gemini pipeline:** case bible, evidence plan, chats/docs generation with Zod validation and retries.
6. **M6 – Images/footage:** image generation, `sharp` processing, GridFS storage, assets endpoint, placeholders, CCTV player polish.
7. **M7 – Validator and repair pass,** moderation check, rate limits, startup sweep.
8. **M8 – Polish:** accessibility pass, responsive pass, empty/error states, README with setup instructions, final test run.

---

## 14. Acceptance Criteria (definition of done)

- [ ] A new user can register, create a case from a short seed, see progress, and land on a populated case file.
- [ ] The case contains suspects, chats, images, at least one footage clip and documents matching the quotas for the chosen difficulty.
- [ ] `GET /cases/:id` before accusation never contains `solution`, hint text, or `result` (verified by test).
- [ ] Accusing a suspect returns the solved view with correct/incorrect, timeline, decisive evidence, red herrings and score.
- [ ] A hint can be used up to the limit and reduces the score as specified.
- [ ] A failed image generation does not fail the case (placeholder is used).
- [ ] Validator rejects a fixture case with a confession leak and a fixture with two culprits.
- [ ] App works at 360 px width; all interactive elements are keyboard accessible.
- [ ] `npm run dev` starts both client and server; `npm test` passes; README documents setup including how to get a Gemini API key.
- [ ] With `MOCK_GEMINI=true` the full flow works with no API key and no network.

---

## 15. Open Decisions Codex May Make Itself (record in `docs/DECISIONS.md`)

- Exact Tailwind palette and component styling within the noir theme.
- Whether to use `pino-http` or a simple custom request logger.
- Exact wording of UI microcopy.
- Pagination size on My Cases (default 10).

## 16. Explicitly Out of Scope for v1

Social login, sharing cases by public link, leaderboards, multiplayer, voice narration, real-time streaming of generation output, native mobile apps, internationalization, payments.
