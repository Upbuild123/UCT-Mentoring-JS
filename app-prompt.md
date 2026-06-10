Build a complete web application called the "Upbuild Mentoring App" using only HTML, CSS, and vanilla JavaScript on the frontend, with Supabase as the database and a Node.js/Express backend to handle server-side operations (file uploads, OpenAI API calls, Google Drive, email). Do NOT use any frontend framework (no React, Vue, Angular). The app already exists as a Python/Streamlit app — you are rebuilding it faithfully.

---

## OVERVIEW

This is a coaching mentoring assessment platform for Upbuild. Students upload coaching session recordings, the app transcribes them with OpenAI Whisper, generates an AI coaching review with GPT-4o, and notifies their mentor. The mentor then submits feedback and ratings, which triggers PDF generation and emails both parties.

---

## TECH STACK

- **Frontend**: Pure HTML, CSS, JavaScript (ES6+) — no frameworks
- **Backend**: Node.js + Express (handles file uploads, API calls, background processing)
- **Database**: Supabase (PostgreSQL)
- **File storage**: Google Drive (via service account)
- **AI**: OpenAI Whisper (transcription) + GPT-4o (speaker labeling + AI review)
- **Email**: Resend API
- **PDF**: PDFKit (Node.js) or similar server-side PDF library
- **Video processing**: ffmpeg (via fluent-ffmpeg npm package)

---

## BRAND / UI

- **Primary color**: Purple `#5E328C` (rgb 94, 50, 140)
- **Light purple**: `#EDE7F6`
- **Font**: System sans-serif (or Inter if available)
- **Logo**: Display "Upbuild" text in the purple pill style in the top-left of each page header
- **Style**: Clean, professional, minimal. White background, purple accents, subtle borders/shadows on cards. Match the aesthetic of a professional coaching tool.
- **Layout**: Centered content with max-width ~800px for forms, ~1100px for dashboards

---

## SUPABASE DATABASE SCHEMA

Create these tables. Use Supabase SQL editor or migrations.

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

---

## ENVIRONMENT VARIABLES (.env)

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
GOOGLE_DRIVE_PARENT_FOLDER_ID=
GOOGLE_CLIENT_EMAIL=
GOOGLE_PRIVATE_KEY=
RESEND_API_KEY=
EMAIL_FROM=Upbuild Mentoring <mentoring@upbuild.com>
APP_URL=http://localhost:3000
ADMIN_PASSWORD=
PORT=3000
```

---

## PAGES / ROUTES

Build the following pages as separate HTML files served by Express:

### 1. `/` — Student Submission (`index.html`)

**Purpose**: Students submit their coaching session recording.

**UI Flow**:
1. Narrow form (max-width 480px), centered
2. **Name dropdown**: Populated from `GET /api/students` — shows all student names. Placeholder: "Select your name"
3. **Round selector**: Radio buttons or a select for Round 1, 2, 3, 4
4. **Duplicate round warning**: After selecting name + round, check `GET /api/assessments/check-duplicate?student_id=X&round=Y`. If a submission exists for that round, show a yellow warning banner: "You already submitted Round X. Submitting again will create a second entry. Continue anyway?" with a checkbox to confirm.
5. **Video file upload**: File input accepting `.mp4, .mov, .webm, .avi`. Label: "Upload your coaching session recording". Show file size after selection.
6. **Competency Self-Ratings**: Two sections:
   - **Meta-Skills**: Know Yourself, Experiment and Learn, Serve Not Fix, Call on the Creative
   - **Skills**: Co-Creating and Maintaining the Relationship, Structuring the Coaching Session, Listening, Asking Curious and Powerful Questions, Balancing Action and Learning

   For each competency, show a label and a `<select>` with options: `-- select --`, `1. Not Demonstrated`, `2. Emerging`, `3. Competent`, `4. Exceptional`

7. **Reflection Questions** (text areas):
   - "What did you do well in this coaching session?"
   - "What opportunities were there to improve the coaching?"
   - "What are you learning about your style as a coach? How would your clients describe you?"
   - "What is your next developmental opportunity?"
   - "Questions you have about this session or coaching in general" *(optional)*
   - "If your session is longer than 30 minutes, which portion of the recording should your mentor listen to?" *(optional — show as grayed label)*

8. **Submit button**: "Submit Recording" — primary purple button
9. **On submit**: POST to `/api/assessments/submit` with multipart form data. Show a progress indicator while processing. On success, show success message. On error, show error message.

**Validation**: All competencies must be rated; first 4 reflection questions required; duplicate confirmation required if warning shown.

---

### 2. `/mentor-review.html?assessment_id=N` — Mentor Review

**Purpose**: Mentor views a student's submission and submits their feedback.

**UI**:
- Header: "Coach: [Student Name] — Round [N]" + submitted date
- **Competency Ratings Table**: Side-by-side coach self-rating vs mentor rating for all 9 competencies, grouped by category. For each row: competency name | Coach's rating (read-only text) | Mentor rating (`<select>`)
- **Coach Reflections**: Read-only display of the student's 6 reflection answers (Q&A format)
- **Mentor Reflections** (4 text areas, all required):
  - "What did the coach do well in this coaching session?"
  - "What opportunities were there to strengthen this coaching session?"
  - "What are the developmental opportunities for the coach?"
  - "What are 1-2 development practices for the coach?"
- **Submit Feedback button**: POST to `/api/assessments/:id/mentor-feedback`. After submit, trigger PDF generation server-side, show success + link to PDF Drive URL.

---

### 3. `/mentor-dashboard.html?mentor_id=N` — Mentor Dashboard

**Purpose**: Mentor sees all their students and assessment status.

**UI**:
- Header: "Welcome, [First Name]"
- For each student (sorted by name): an expandable card/accordion showing:
  - Student name + number of rounds submitted
  - For each assessment: Round # | date submitted | feedback status (green "Feedback submitted" or orange "Awaiting your feedback") | links: [Review] [Drive folder]

---

### 4. `/admin.html` — Admin Dashboard

**Purpose**: Admin manages mentors, students, and assessments.

**Auth**: On page load, prompt for password (POST to `/api/admin/auth`). Store token in sessionStorage. Include as `Authorization: Bearer <token>` header on all admin API calls.

**Tabs**: Assessments | Mentors | Students | Student Overview

**Assessments tab**:
- Filter dropdown: all / submitted / processing / complete / error
- Card per assessment: student name (mentor name) | Round N | date | status badge (green/red/orange/gray) | error message if any | [Review] link | "Retry" button (if error) | "Regenerate AI Review" button (if complete)

**Mentors tab**:
- List of mentors in expandable cards: name, email, their students
- Inline edit form: name + email fields + Save button
- Show dashboard token and dashboard link
- "Add Mentor" form at bottom

**Students tab**:
- List of students in expandable cards: name, email, current mentor
- Inline edit form: name, email, mentor dropdown + Save
- **Bulk Import** section: paste tab-separated rows (`Name\tEmail\tMentor Name`), click Import
- "Add Student" form at bottom

**Student Overview tab**:
- Table: Student | Mentor | Rounds Submitted | Total
- One row per student, sorted alphabetically

---

### 5. `/transcript.html?assessment_id=N` — Session Transcript

**UI**:
- Caption: "[Student Name] — Round N"
- Divider
- Transcript text displayed (preserve newlines, show Coach: / Client: labels)
- Two download buttons: "Download as .txt" and "Download as .docx"
  - .txt: client-side blob download
  - .docx: `GET /api/assessments/:id/transcript/docx` which streams the file

---

### 6. `/ai-review.html?assessment_id=N` — AI Coaching Review

**UI**:
- Caption: "[Student Name] — Round N"
- Divider
- AI review content rendered as markdown (use a lightweight markdown renderer like `marked.js`)
- Two download buttons: "Download as .txt" and "Download as .docx"
  - .txt: client-side blob download
  - .docx: `GET /api/assessments/:id/ai-review/docx`

---

## BACKEND API ROUTES (Express)

### Students & Mentors

- `GET /api/students` → `[{id, name, mentor_id, email}]`
- `GET /api/mentors` → `[{id, name, email, dashboard_token}]`
- `GET /api/mentors/:id` → mentor object
- `POST /api/mentors` → add mentor `{name, email}`
- `PUT /api/mentors/:id` → update mentor `{name, email}`
- `POST /api/students` → add student `{name, email, mentor_id}`
- `PUT /api/students/:id` → update student `{name, email, mentor_id}`
- `POST /api/students/bulk-import` → import array of `{name, email, mentor_name}`

### Assessments

- `GET /api/assessments/check-duplicate?student_id=X&round=Y` → `{exists: bool}`
- `POST /api/assessments/submit` — multipart upload:
  - Fields: `student_id`, `round`, `competency_ratings` (JSON string), `reflections` (JSON string)
  - File: `video` (mp4/mov/etc)
  - Creates assessment record with status "submitted"
  - Runs `processAssessment()` asynchronously (do not await — respond immediately with `{assessment_id}`)
  - Client polls `GET /api/assessments/:id/status` to track progress

- `GET /api/assessments/:id` → full assessment object
- `GET /api/assessments/:id/status` → `{status, error_message}`
- `GET /api/assessments/by-mentor/:mentor_id` → assessments with student/mentor names joined
- `GET /api/assessments/all` → all assessments with student_name and mentor_name
- `POST /api/assessments/:id/mentor-feedback` — body: `{feedback_text: {}, mentor_ratings: {}}`
  - Saves mentor_feedback record
  - Runs `generateAndSendPdf()` asynchronously
  - Returns `{success: true}`

- `POST /api/assessments/:id/retry` — admin only: retry failed assessment
- `POST /api/assessments/:id/regenerate-ai-review` — admin only
- `GET /api/assessments/:id/transcript/docx` → streams .docx file
- `GET /api/assessments/:id/ai-review/docx` → streams .docx file

### Admin

- `POST /api/admin/auth` — body: `{password}` → `{success: bool, token: string}`
- All admin-only routes require `Authorization: Bearer <token>` header

---

## PROCESSING PIPELINE (`services/processor.js`)

```js
async function processAssessment(assessmentId, videoPath)
```

Steps (update assessment status at each stage via Supabase):

1. **Create Google Drive folder**: `Mentoring Round [N]. [Student Name]` inside `GOOGLE_DRIVE_PARENT_FOLDER_ID`. Share with student email if available. Save `drive_folder_id` and `drive_folder_url` to DB.

2. **Upload video to Drive**: Upload the video file to the folder. Save `video_drive_url` to DB.

3. **Extract audio**: Use `fluent-ffmpeg` to extract mono mp3 at 16kHz from the video. Output to a temp file.

4. **Transcribe**: POST to OpenAI Whisper API (`whisper-1` model) with the mp3 file. Then send raw transcript to GPT-4o to add speaker labels (`Coach:` / `Client:` prefixes). Save `transcript` to DB.

5. **Upload transcript**: Create a .docx file with the transcript using the `docx` npm package. Upload to Drive. Clean up local files.

6. **Generate AI review**: Send transcript + assessment data to GPT-4o with the exact prompt below. Save to `ai_reviews` table.

7. **Send mentor notification email** via Resend.

8. **Send student confirmation email** via Resend (if student has email).

9. **Set status to "complete"**. On any error, set status to "error" and save error_message.

---

## GPT-4O PROMPTS

### Speaker Labeling Prompt

```
Below is a raw transcript of a coaching session between a coach and their client.

Reformat it with speaker labels on each turn. Use exactly "Coach:" and "Client:" as labels.
- The coach typically asks questions, reflects back, and facilitates exploration.
- The client shares their experience, challenges, and goals.

Return only the formatted transcript — no commentary, no preamble.

Raw transcript:
{rawTranscript}
```

### AI Review Prompt

```
You are an experienced coaching mentor reviewing a coaching session transcript.

Your audience is NOT the coach.

Your audience is the coach's mentor, who will use your observations to guide a mentoring conversation.

Provide an honest, nuanced assessment of the coaching.

Do not soften feedback unnecessarily. Do not inflate praise. Do not focus on encouragement. Focus on accurate diagnosis.

Assume the mentor wants to understand:
- What the coach does well.
- What the coach tends to do repeatedly.
- What coaching habits are helping.
- What coaching habits are limiting depth.
- What developmental edge would most improve the coach's effectiveness.

Refer to the coach as "the coach" and the other person as "the client."

Support observations with specific examples and quotes.

---

## SESSION TRANSCRIPT

{transcript}

---

## OUTPUT STRUCTURE

Use this exact structure. Use bold headings only — no large markdown headings (do not use # or ##). Format as a clean professional document.

**Summary**

In 1-3 paragraphs:
- What was the session really about?
- What was the coach's overall effectiveness?
- What stands out most about the coach's style?
- What appears to be the coach's primary developmental edge?

**Meta-Skills**

Assess the coach specifically on two meta-skills:

*Serve Not Fix (Coaching the Person, Not the Problem)*
- Was the coach working with the whole person or focused on solving the presenting problem?
- Were there moments of advice-giving, rescuing, or fixing disguised as coaching?
- Did the client do their own work, or did the coach do it for them?
- Specific examples from the transcript.

*Experiment and Learn*
- Did the coach try anything new, unexpected, or risky for the sake of the client?
- Was there evidence of following intuition or taking an exploratory risk?
- Or did the coach stay in comfortable, predictable patterns?
- Specific examples from the transcript.

**Coaching Strengths**

Identify between 3 and 7 strengths — no fewer than 3, no more than 7. For each:

*[Strength title]*
- What the coach did.
- Why it worked.
- How it affected the client.
- Evidence from the transcript.

Focus on recurring strengths, not isolated moments.

**Developmental Edges**

Identify between 3 and 5 developmental edges. For each:

*[Developmental edge title]*
- What the coach did.
- Why it may limit coaching effectiveness.
- What a more advanced coach might have done.
- Example questions or approaches that could have deepened the work.

**Deepest Doorways**

Identify 1-5 moments with the greatest transformational potential. For each:
- Quote the client's statement.
- Explain why it mattered.
- Explain what the coach did.
- Explain where the coaching might have gone if the coach had stayed there longer.

Focus on moments where identity, values, fear, assumptions, tension, purpose, or meaning emerged.

**Developmental Opportunities and Practices**

Identify 1-3 specific coaching behaviors that would most improve this coach's effectiveness based on what occurred in this session.

Do NOT recommend books, workshops, courses, certifications, supervision, reflective practice, or other generic professional development activities unless there is a clear and significant knowledge gap.

Each developmental opportunity must:
- Be directly tied to a specific observation from this session
- Focus on a coaching behavior, not coaching knowledge
- Be actionable in the coach's very next session
- Be phrased as a developmental practice, not an educational recommendation
- Prioritize high-leverage coaching fundamentals over advanced techniques
- Use concepts from the Upbuild methodology when relevant

For each developmental opportunity use this format:

*[Development Opportunity Title]*

Observation:
[What specifically happened in the session.]

Why It Matters:
[Why this limits coaching effectiveness.]

Developmental Practice:
[A concrete, specific practice the coach can implement in their next session — phrased as an action, not a recommendation to study or learn.]

---

Base your evaluation entirely on what you observe in the transcript. Do not reference any self-ratings or written reflections submitted separately.
```

---

## PDF GENERATION (`services/pdf.js`)

Use `pdfkit` (npm) to generate the assessment PDF.

**Document structure**:

1. **Header**: "Upbuild" logo-style text top-left (purple pill), "Mentoring Assessment - Round N" title in purple, purple horizontal rule
2. **Meta block**: Coach (student name) | Mentor (mentor name) | Date Submitted
3. **Competency Ratings table**:
   - Header row: Competency | Coach | Mentor (purple background)
   - Grouped by category (Meta-Skills, Skills) with category header rows in light purple
   - Alternating row backgrounds (white / very light purple)
   - 9 rows total
4. **Coach Reflections**: Q&A format, bold question then indented answer
5. **Mentor Feedback**: Same Q&A format for the 4 mentor questions
6. **Footer**: "Upbuild Mentoring Program" centered, every page

**Colors**:
- Purple: `#5E328C`
- Light purple: `#EDE7F6`
- Dark text: `#1E1E1E`
- Gray: `#787878`

Upload the PDF to the student's Drive folder. Email it to both mentor and student via Resend. Save `pdf_drive_url` to DB.

---

## EMAIL TEMPLATES (Resend)

### Mentor Notification (sent after transcription + AI review complete)

**Subject**: `Mentoring Recording. [Student Name]. Round [N]`
**To**: mentor email

```html
<p>Hi [MentorFirstName],</p>
<p>There is a new mentoring recording to review from [StudentFirstName].</p>
<ul>
  <li><a href="[video_drive_url]">Video recording</a></li>
  <li><a href="[APP_URL]/transcript.html?assessment_id=[id]">Transcript</a></li>
  <li><a href="[APP_URL]/ai-review.html?assessment_id=[id]">AI-generated review</a></li>
</ul>
<p>After your mentoring meeting, <a href="[APP_URL]/mentor-review.html?assessment_id=[id]">submit mentor feedback</a>.</p>
<p><a href="[APP_URL]/mentor-dashboard.html?mentor_id=[mentor_id]">View your mentor dashboard</a></p>
```

### Student Confirmation (sent at same time)

**Subject**: `Your Round [N] Recording Has Been Received`
**To**: student email

```html
<p>Hi [StudentFirstName],</p>
<p>Your Round [N] mentoring recording has been successfully uploaded, and your mentor has been notified.</p>
<p>You can access your recording and transcript in your Google Drive <a href="[drive_folder_url]">folder</a>.</p>
```

### Completion Notification (sent after mentor submits feedback + PDF generated)

**To mentor** — Subject: `[StudentName]'s Round [N] Mentoring Assessment is Ready`
```html
<p>View <a href="[pdf_drive_url]">[StudentFirstName]'s Round [N] assessment PDF</a></p>
```

**To student** — Subject: `Your UCT Mentoring Round [N] Assessment is Ready`
```html
<p>Hi [StudentFirstName],</p>
<p>Your Round [N] assessment PDF is now complete and available to view.</p>
<p><a href="[pdf_drive_url]">Round [N] assessment PDF</a></p>
```

---

## GOOGLE DRIVE INTEGRATION (`services/drive.js`)

Use the `googleapis` npm package with a service account (JSON key from env vars).

- `createStudentRoundFolder(studentName, round, studentEmail)` → `{folderId, folderUrl}`
  - Creates folder named `Mentoring Round [N]. [StudentName]` inside `GOOGLE_DRIVE_PARENT_FOLDER_ID`
  - If studentEmail provided, share the folder with them (reader role)
- `uploadFile(localPath, folderId, driveFileName)` → `driveUrl` (web view link)
- `uploadBuffer(buffer, folderId, driveFileName, mimeType)` → `driveUrl`

### Google Drive Auth (Service Account)

```js
const { google } = require('googleapis');

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive'],
});
```

---

## FILE UPLOAD HANDLING

- Use `multer` for multipart form handling in Express
- Store uploaded video temporarily in `uploads/` directory
- After processing is complete, delete temp files
- Set multer limits to 5GB (or no limit — rely on network/nginx)
- Use streaming/chunked upload to Google Drive for large files

---

## COMPETENCIES DATA

Hardcode in `shared/competencies.js` — used by both frontend and backend:

```js
const RATING_OPTIONS = [
  "1. Not Demonstrated",
  "2. Emerging",
  "3. Competent",
  "4. Exceptional",
];

const COMPETENCIES = [
  { name: "Know Yourself", category: "Meta-Skills" },
  { name: "Experiment and Learn", category: "Meta-Skills" },
  { name: "Serve Not Fix", category: "Meta-Skills" },
  { name: "Call on the Creative", category: "Meta-Skills" },
  { name: "Co-Creating and Maintaining the Relationship", category: "Skills" },
  { name: "Structuring the Coaching Session", category: "Skills" },
  { name: "Listening", category: "Skills" },
  { name: "Asking Curious and Powerful Questions", category: "Skills" },
  { name: "Balancing Action and Learning", category: "Skills" },
];

const REFLECTION_QUESTIONS = [
  "What did you do well in this coaching session?",
  "What opportunities were there to improve the coaching?",
  "What are you learning about your style as a coach? How would your clients describe you?",
  "What is your next developmental opportunity?",
  "Questions you have about this session or coaching in general",
  "If your session is longer than 30 minutes, which portion of the recording should your mentor listen to?",
];

const MENTOR_QUESTIONS = [
  "What did the coach do well in this coaching session?",
  "What opportunities were there to strengthen this coaching session?",
  "What are the developmental opportunities for the coach?",
  "What are 1-2 development practices for the coach?",
];
```

---

## PROJECT STRUCTURE

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
│   ├── css/
│   │   └── style.css
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

## IMPLEMENTATION NOTES

1. **Express serves all HTML pages** as static files from `public/`. Configure `express.static('public')`.

2. **Assessment status polling**: After submission, the frontend polls `GET /api/assessments/:id/status` every 3 seconds. Show progress messages mapped to status: submitted → "Uploading to Drive..." → processing → "Transcribing... Generating AI review..." → complete/error.

3. **Supabase on server only** — do NOT expose Supabase keys to the frontend. All DB access goes through Express API routes.

4. **Mentor review pre-population**: If mentor_feedback already exists for the assessment, pre-fill all text areas and selects (idempotent re-submission).

5. **Admin auth**: On page load, check sessionStorage for `adminToken`. If missing, show a password modal. All admin API calls include `Authorization: Bearer <token>` header. Token is a UUID generated server-side on successful auth.

6. **Error handling**: All API routes return `{error: "message"}` with appropriate HTTP status codes. Frontend shows user-friendly error banners.

7. **ffmpeg**: Use `fluent-ffmpeg` npm package with `ffmpeg-static`. Extract: mono mp3, 16kHz, `-q:a 5`.

8. **OpenAI Whisper file limit**: 25MB. The mp3 extraction at 16kHz mono quality 5 compresses a 45-60 min session well under 25MB. No chunking needed.

9. **docx generation**: Use the `docx` npm package for transcript and AI review download endpoints. Generate in memory and stream.

10. **CORS**: Not needed — frontend and backend served from same Express server.

Build the complete application end-to-end. Start with `server.js`, the Supabase client, then routes, then services, then all HTML pages with their JavaScript. Complete the student submission flow first (most complex), then mentor review, then admin, then the read-only transcript/AI-review pages.
