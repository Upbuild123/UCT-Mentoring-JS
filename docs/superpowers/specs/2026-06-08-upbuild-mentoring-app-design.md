# Upbuild Mentoring App — Design Spec

**Date**: 2026-06-08
**Stack**: Node.js/Express + Supabase + Vanilla HTML/CSS/JS
**Deployment**: Railway
**Reference**: Rebuilding existing Python/Streamlit app faithfully

---

## Overview

A coaching mentoring assessment platform for Upbuild. Students upload coaching session recordings; the app transcribes them with OpenAI Whisper, generates an AI coaching review with GPT-4o, and notifies their mentor. The mentor submits feedback and ratings, which triggers PDF generation and emails both parties.

---

## Architecture

Single Express server on Railway serves both the static frontend (`public/`) and all API routes. No frontend framework — pure HTML/CSS/JS (ES6+). Supabase accessed only server-side via service role key. All heavy processing runs asynchronously after submission; client polls for status.

**Tech stack**:
- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Node.js + Express
- Database: Supabase (PostgreSQL)
- File storage: Google Drive (service account)
- AI: OpenAI Whisper (transcription) + GPT-4o (speaker labeling + AI review)
- Email: Resend API
- PDF: PDFKit
- Video processing: ffmpeg via `ffmpeg-static` + `fluent-ffmpeg`
- Deployment: Railway (ffmpeg-static bundles ffmpeg, no system dependency needed)

---

## Database Schema

```sql
create table mentors (
  id serial primary key,
  name text not null,
  email text not null unique,
  dashboard_token text not null unique default gen_random_uuid()::text
);

create table students (
  id serial primary key,
  name text not null,
  mentor_id integer references mentors(id),
  email text
);

create table assessments (
  id serial primary key,
  student_id integer references students(id),
  round integer not null,
  video_drive_url text,
  transcript text,
  competency_ratings jsonb,
  reflections jsonb,
  status text default 'submitted',
  student_token text default gen_random_uuid()::text,
  mentor_token text default gen_random_uuid()::text,
  drive_folder_url text,
  drive_folder_id text,
  pdf_drive_url text,
  error_message text,
  submitted_at timestamptz default now()
);

create table ai_reviews (
  id serial primary key,
  assessment_id integer references assessments(id),
  content text,
  created_at timestamptz default now()
);

create table mentor_feedback (
  id serial primary key,
  assessment_id integer references assessments(id),
  feedback_text jsonb,
  mentor_ratings jsonb,
  submitted_at timestamptz default now()
);
```

**Status progression**: `submitted` → `processing` → `complete` / `error`

---

## Data Flow

1. Student submits form → multipart POST to `/api/assessments/submit`
2. Server creates assessment record (status: `submitted`), responds immediately with `{assessment_id}`
3. Client polls `/api/assessments/:id/status` every 3s, showing progress messages
4. Background `processAssessment()` runs 9-step pipeline, updating status at each stage
5. On completion: mentor receives email with video, transcript, AI review, and feedback link
6. Mentor clicks link → submits feedback → async `generateAndSendPdf()` → PDF emailed to both parties

Admin accesses `/admin.html` via password modal → `sessionStorage` token → `Authorization: Bearer` header on all admin API calls.

---

## Processing Pipeline (`services/processor.js`)

Steps run sequentially; status updated in DB at each stage; any failure sets `status: "error"` with `error_message`:

1. Create Google Drive folder: `Mentoring Round [N]. [StudentName]`
2. Upload video to Drive folder; save `video_drive_url`
3. Extract audio: ffmpeg → mono mp3, 16kHz, `-q:a 5` (keeps ~60min sessions under Whisper 25MB limit)
4. Transcribe with Whisper (`whisper-1`); label speakers with GPT-4o (`Coach:` / `Client:`); save `transcript`
5. Generate transcript .docx; upload to Drive; delete local temp files
6. Generate AI review with GPT-4o; save to `ai_reviews`
7. Send mentor notification email (Resend)
8. Send student confirmation email (Resend, if student has email)
9. Set `status: "complete"`

---

## Services

| File | Responsibility |
|------|---------------|
| `services/supabase.js` | Supabase client (service role key, server-only) |
| `services/processor.js` | 9-step assessment processing pipeline |
| `services/drive.js` | Google Drive: create folder, upload file, upload buffer |
| `services/openai.js` | Whisper transcription, GPT-4o speaker labeling, GPT-4o AI review |
| `services/email.js` | Resend: mentor notification, student confirmation, completion emails |
| `services/pdf.js` | PDFKit: generate assessment PDF, upload to Drive, email both parties |

---

## API Routes

### Students & Mentors
- `GET /api/students`
- `GET /api/mentors`, `GET /api/mentors/:id`
- `POST /api/mentors`, `PUT /api/mentors/:id`
- `POST /api/students`, `PUT /api/students/:id`
- `POST /api/students/bulk-import`

### Assessments
- `GET /api/assessments/check-duplicate?student_id=X&round=Y`
- `POST /api/assessments/submit` — multipart; async processing; returns `{assessment_id}` immediately
- `GET /api/assessments/:id`, `GET /api/assessments/:id/status`
- `GET /api/assessments/by-mentor/:mentor_id`
- `GET /api/assessments/all`
- `POST /api/assessments/:id/mentor-feedback` — async PDF generation
- `POST /api/assessments/:id/retry` (admin)
- `POST /api/assessments/:id/regenerate-ai-review` (admin)
- `GET /api/assessments/:id/transcript/docx`
- `GET /api/assessments/:id/ai-review/docx`

### Admin
- `POST /api/admin/auth` — returns UUID token on success

---

## Frontend Pages

All served as static files from `public/`. Shared `css/style.css` (purple `#5E328C` brand) and `js/api.js` (fetch wrapper).

| Page | Purpose |
|------|---------|
| `index.html` | Student submission: name dropdown, round, duplicate warning, file upload, 9 competency self-ratings, 6 reflection questions, submit + polling |
| `mentor-review.html` | Side-by-side competency table, read-only student reflections, 4 mentor text areas, submit feedback |
| `mentor-dashboard.html` | Accordion cards per student: all rounds, status badges, Review/Drive links |
| `admin.html` | Password-gated; 4 tabs: Assessments, Mentors, Students, Student Overview |
| `transcript.html` | Read-only transcript, .txt and .docx download |
| `ai-review.html` | Markdown-rendered AI review (marked.js), .txt and .docx download |

**Competency groupings**:
- Meta-Skills: Know Yourself, Experiment and Learn, Serve Not Fix, Call on the Creative
- Skills: Co-Creating and Maintaining the Relationship, Structuring the Coaching Session, Listening, Asking Curious and Powerful Questions, Balancing Action and Learning

**Rating options**: `1. Not Demonstrated`, `2. Emerging`, `3. Competent`, `4. Exceptional`

---

## PDF Structure (`services/pdf.js`)

1. Header: "Upbuild" purple pill + "Mentoring Assessment - Round N" title + purple rule
2. Meta block: Coach | Mentor | Date Submitted
3. Competency ratings table (grouped, alternating row backgrounds)
4. Coach reflections (Q&A format)
5. Mentor feedback (Q&A format)
6. Footer: "Upbuild Mentoring Program" on every page

Upload to Drive, email to both parties, save `pdf_drive_url` to DB.

---

## Email Templates

| Trigger | To | Subject |
|---------|-----|---------|
| After AI review complete | Mentor | `Mentoring Recording. [Student Name]. Round [N]` |
| After AI review complete | Student (if email exists) | `Your Round [N] Recording Has Been Received` |
| After PDF generated | Mentor | `[StudentName]'s Round [N] Mentoring Assessment is Ready` |
| After PDF generated | Student | `Your UCT Mentoring Round [N] Assessment is Ready` |

---

## Project Structure

```
/
├── server.js
├── package.json
├── .env
├── routes/
│   ├── students.js
│   ├── mentors.js
│   ├── assessments.js
│   └── admin.js
├── services/
│   ├── supabase.js
│   ├── processor.js
│   ├── drive.js
│   ├── openai.js
│   ├── email.js
│   └── pdf.js
├── shared/
│   └── competencies.js
├── public/
│   ├── index.html
│   ├── mentor-review.html
│   ├── mentor-dashboard.html
│   ├── admin.html
│   ├── transcript.html
│   ├── ai-review.html
│   ├── css/style.css
│   └── js/
│       ├── api.js
│       ├── submission.js
│       ├── mentor-review.js
│       ├── mentor-dashboard.js
│       ├── admin.js
│       ├── transcript.js
│       └── ai-review.js
└── uploads/
```

---

## Implementation Order

1. `server.js` + Supabase client + Express scaffold
2. All backend routes + services (processor, drive, openai, email, pdf)
3. Student submission flow (`index.html` + `js/submission.js`) — most complex
4. Mentor review (`mentor-review.html`)
5. Mentor dashboard (`mentor-dashboard.html`)
6. Admin (`admin.html`)
7. Transcript + AI review pages

---

## Key Constraints

- Supabase keys never exposed to frontend — all DB access through Express API
- `ffmpeg-static` bundles ffmpeg binary for Railway compatibility
- Whisper 25MB limit handled by mono mp3 @ 16kHz `-q:a 5` — no chunking needed
- Multer handles multipart uploads; temp files deleted after processing
- Admin auth token is a UUID generated server-side, stored in `sessionStorage`
- Mentor feedback submission is idempotent (pre-populates if feedback exists)
