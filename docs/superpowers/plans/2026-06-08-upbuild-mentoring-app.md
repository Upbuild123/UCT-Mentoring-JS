# Upbuild Mentoring App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Upbuild Mentoring App as a Node.js/Express + vanilla HTML/CSS/JS app deployed on Railway.

**Architecture:** Single Express server serves static HTML pages from `public/` and all API routes. Supabase is accessed server-side only. Heavy processing (ffmpeg, Whisper, Drive) runs asynchronously after submission; client polls for status.

**Tech Stack:** Node.js, Express, Supabase JS client, multer, fluent-ffmpeg, ffmpeg-static, openai, googleapis, resend, pdfkit, docx, Jest, supertest

**Reference:** Python/Streamlit version in `sample Mentoring Automation Streamlit/` — use for business logic validation.

---

## File Map

**Create:**
- `package.json`
- `server.js`
- `.env.example`
- `shared/competencies.js`
- `services/supabase.js`
- `services/drive.js`
- `services/openai.js`
- `services/email.js`
- `services/processor.js`
- `services/pdf.js`
- `routes/students.js`
- `routes/mentors.js`
- `routes/assessments.js`
- `routes/admin.js`
- `public/css/style.css`
- `public/js/api.js`
- `public/index.html`
- `public/js/submission.js`
- `public/mentor-review.html`
- `public/js/mentor-review.js`
- `public/mentor-dashboard.html`
- `public/js/mentor-dashboard.js`
- `public/admin.html`
- `public/js/admin.js`
- `public/transcript.html`
- `public/js/transcript.js`
- `public/ai-review.html`
- `public/js/ai-review.js`
- `tests/students.test.js`
- `tests/mentors.test.js`
- `tests/assessments.test.js`
- `tests/admin.test.js`
- `railway.toml`

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `server.js`
- Create: `.env.example`
- Create: `uploads/.gitkeep`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "upbuild-mentoring-app",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js",
    "test": "jest --runInBand"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "docx": "^8.5.0",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "ffmpeg-static": "^5.2.0",
    "fluent-ffmpeg": "^2.1.3",
    "googleapis": "^140.0.0",
    "multer": "^1.4.5-lts.1",
    "openai": "^4.52.7",
    "pdfkit": "^0.15.0",
    "resend": "^3.5.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^7.0.0"
  },
  "jest": {
    "testEnvironment": "node",
    "testMatch": ["**/tests/**/*.test.js"]
  }
}
```

- [ ] **Step 2: Create server.js**

```js
require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/students', require('./routes/students'));
app.use('/api/mentors', require('./routes/mentors'));
app.use('/api/assessments', require('./routes/assessments'));
app.use('/api/admin', require('./routes/admin'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
}

module.exports = app;
```

- [ ] **Step 3: Create .env.example**

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

- [ ] **Step 4: Create uploads/.gitkeep**

```bash
mkdir -p uploads && touch uploads/.gitkeep
```

- [ ] **Step 5: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 6: Verify server starts**

```bash
node server.js
```

Expected: `Listening on port 3000` (Ctrl+C to stop)

- [ ] **Step 7: Commit**

```bash
git init
git add package.json server.js .env.example uploads/.gitkeep
git commit -m "feat: project scaffold"
```

---

## Task 2: Shared Competencies + Supabase Client

**Files:**
- Create: `shared/competencies.js`
- Create: `services/supabase.js`

- [ ] **Step 1: Create shared/competencies.js**

```js
const RATING_OPTIONS = [
  '1. Not Demonstrated',
  '2. Emerging',
  '3. Competent',
  '4. Exceptional',
];

const COMPETENCIES = [
  { name: 'Know Yourself', category: 'Meta-Skills' },
  { name: 'Experiment and Learn', category: 'Meta-Skills' },
  { name: 'Serve Not Fix', category: 'Meta-Skills' },
  { name: 'Call on the Creative', category: 'Meta-Skills' },
  { name: 'Co-Creating and Maintaining the Relationship', category: 'Skills' },
  { name: 'Structuring the Coaching Session', category: 'Skills' },
  { name: 'Listening', category: 'Skills' },
  { name: 'Asking Curious and Powerful Questions', category: 'Skills' },
  { name: 'Balancing Action and Learning', category: 'Skills' },
];

const REFLECTION_QUESTIONS = [
  'What did you do well in this coaching session?',
  'What opportunities were there to improve the coaching?',
  'What are you learning about your style as a coach? How would your clients describe you?',
  'What is your next developmental opportunity?',
  'Questions you have about this session or coaching in general',
  'If your session is longer than 30 minutes, which portion of the recording should your mentor listen to?',
];

const MENTOR_QUESTIONS = [
  'What did the coach do well in this coaching session?',
  'What opportunities were there to strengthen this coaching session?',
  'What are the developmental opportunities for the coach?',
  'What are 1-2 development practices for the coach?',
];

module.exports = { RATING_OPTIONS, COMPETENCIES, REFLECTION_QUESTIONS, MENTOR_QUESTIONS };
```

- [ ] **Step 2: Create services/supabase.js**

```js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = supabase;
```

- [ ] **Step 3: Commit**

```bash
git add shared/competencies.js services/supabase.js
git commit -m "feat: shared competencies and supabase client"
```

---

## Task 3: Students & Mentors Routes

**Files:**
- Create: `routes/students.js`
- Create: `routes/mentors.js`
- Create: `tests/students.test.js`
- Create: `tests/mentors.test.js`

- [ ] **Step 1: Write failing test for GET /api/students**

Create `tests/students.test.js`:

```js
const request = require('supertest');
const app = require('../server');

jest.mock('../services/supabase', () => ({
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  order: jest.fn().mockResolvedValue({
    data: [{ id: 1, name: 'Alice', mentor_id: 1, email: 'alice@example.com' }],
    error: null,
  }),
}));

test('GET /api/students returns student list', async () => {
  const res = await request(app).get('/api/students');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  expect(res.body[0].name).toBe('Alice');
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- --testPathPattern=students
```

Expected: FAIL — `Cannot find module '../routes/students'`

- [ ] **Step 3: Create routes/students.js**

```js
const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('students')
      .select('id, name, mentor_id, email')
      .order('name');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, email, mentor_id } = req.body;
    const { data, error } = await supabase
      .from('students')
      .insert({ name, email, mentor_id })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, email, mentor_id } = req.body;
    const { data, error } = await supabase
      .from('students')
      .update({ name, email, mentor_id })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/bulk-import', async (req, res, next) => {
  try {
    const { rows } = req.body; // [{ name, email, mentor_name }]
    const { data: mentors, error: mErr } = await supabase.from('mentors').select('id, name');
    if (mErr) throw mErr;

    const mentorMap = {};
    for (const m of mentors) mentorMap[m.name.toLowerCase()] = m.id;

    const toInsert = [];
    const skipped = [];
    for (const row of rows) {
      const mentorId = mentorMap[row.mentor_name?.toLowerCase()];
      if (!mentorId) { skipped.push(row.name); continue; }
      toInsert.push({ name: row.name, email: row.email || null, mentor_id: mentorId });
    }

    if (toInsert.length) {
      const { error } = await supabase.from('students').insert(toInsert);
      if (error) throw error;
    }

    res.json({ imported: toInsert.length, skipped });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm test -- --testPathPattern=students
```

Expected: PASS

- [ ] **Step 5: Write and run mentors test**

Create `tests/mentors.test.js`:

```js
const request = require('supertest');
const app = require('../server');

jest.mock('../services/supabase', () => ({
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  order: jest.fn().mockResolvedValue({
    data: [{ id: 1, name: 'Bob', email: 'bob@example.com', dashboard_token: 'abc' }],
    error: null,
  }),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({
    data: { id: 1, name: 'Bob', email: 'bob@example.com', dashboard_token: 'abc' },
    error: null,
  }),
}));

test('GET /api/mentors returns mentor list', async () => {
  const res = await request(app).get('/api/mentors');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
});

test('GET /api/mentors/:id returns one mentor', async () => {
  const res = await request(app).get('/api/mentors/1');
  expect(res.status).toBe(200);
  expect(res.body.name).toBe('Bob');
});
```

- [ ] **Step 6: Create routes/mentors.js**

```js
const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('mentors')
      .select('id, name, email, dashboard_token')
      .order('name');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('mentors')
      .select('id, name, email, dashboard_token')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, email } = req.body;
    const { data, error } = await supabase
      .from('mentors')
      .insert({ name, email })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, email } = req.body;
    const { data, error } = await supabase
      .from('mentors')
      .update({ name, email })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

- [ ] **Step 7: Run all tests — expect PASS**

```bash
npm test -- --testPathPattern="students|mentors"
```

Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add routes/students.js routes/mentors.js tests/students.test.js tests/mentors.test.js
git commit -m "feat: students and mentors routes"
```

---

## Task 4: Assessments Routes (CRUD + Status)

**Files:**
- Create: `routes/assessments.js`
- Create: `tests/assessments.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/assessments.test.js`:

```js
const request = require('supertest');
const app = require('../server');

const mockAssessment = {
  id: 1, student_id: 1, round: 1, status: 'complete',
  competency_ratings: {}, reflections: {}, transcript: 'test',
  drive_folder_url: null, video_drive_url: null, pdf_drive_url: null,
  error_message: null, submitted_at: new Date().toISOString(),
};

const mockSupabase = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data: mockAssessment, error: null }),
  maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
};

jest.mock('../services/supabase', () => mockSupabase);
jest.mock('../services/processor', () => ({ processAssessment: jest.fn() }));

test('GET /api/assessments/check-duplicate returns exists false', async () => {
  const res = await request(app).get('/api/assessments/check-duplicate?student_id=1&round=1');
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('exists');
});

test('GET /api/assessments/:id/status returns status', async () => {
  const res = await request(app).get('/api/assessments/1/status');
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('status');
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- --testPathPattern=assessments
```

Expected: FAIL — `Cannot find module '../routes/assessments'`

- [ ] **Step 3: Create routes/assessments.js**

```js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const supabase = require('../services/supabase');
const { processAssessment } = require('../services/processor');

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024 * 1024 },
});

router.get('/check-duplicate', async (req, res, next) => {
  try {
    const { student_id, round } = req.query;
    const { data, error } = await supabase
      .from('assessments')
      .select('id')
      .eq('student_id', student_id)
      .eq('round', round)
      .maybeSingle();
    if (error) throw error;
    res.json({ exists: !!data });
  } catch (err) {
    next(err);
  }
});

router.post('/submit', upload.single('video'), async (req, res, next) => {
  try {
    const { student_id, round, competency_ratings, reflections } = req.body;
    const { data, error } = await supabase
      .from('assessments')
      .insert({
        student_id: parseInt(student_id),
        round: parseInt(round),
        competency_ratings: JSON.parse(competency_ratings),
        reflections: JSON.parse(reflections),
        status: 'submitted',
      })
      .select()
      .single();
    if (error) throw error;

    const videoPath = req.file ? req.file.path : null;
    processAssessment(data.id, videoPath).catch(err =>
      console.error(`Processing failed for assessment ${data.id}:`, err)
    );

    res.json({ assessment_id: data.id });
  } catch (err) {
    next(err);
  }
});

router.get('/all', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('assessments')
      .select(`*, students(name, mentor_id, mentors(name))`)
      .order('submitted_at', { ascending: false });
    if (error) throw error;
    const mapped = data.map(a => ({
      ...a,
      student_name: a.students?.name,
      mentor_name: a.students?.mentors?.name,
    }));
    res.json(mapped);
  } catch (err) {
    next(err);
  }
});

router.get('/by-mentor/:mentor_id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('assessments')
      .select(`*, students!inner(name, mentor_id)`)
      .eq('students.mentor_id', req.params.mentor_id)
      .order('submitted_at', { ascending: false });
    if (error) throw error;
    res.json(data.map(a => ({ ...a, student_name: a.students?.name })));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/status', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('assessments')
      .select('status, error_message')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('assessments')
      .select(`*, students(name, email, mentor_id, mentors(name, email)), ai_reviews(content), mentor_feedback(feedback_text, mentor_ratings)`)
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/mentor-feedback', async (req, res, next) => {
  try {
    const { feedback_text, mentor_ratings } = req.body;
    const { error: delErr } = await supabase
      .from('mentor_feedback')
      .delete()
      .eq('assessment_id', req.params.id);
    if (delErr) throw delErr;

    const { error } = await supabase
      .from('mentor_feedback')
      .insert({ assessment_id: parseInt(req.params.id), feedback_text, mentor_ratings });
    if (error) throw error;

    const { generateAndSendPdf } = require('../services/processor');
    generateAndSendPdf(parseInt(req.params.id)).catch(err =>
      console.error(`PDF generation failed for assessment ${req.params.id}:`, err)
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/retry', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('assessments')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;

    await supabase
      .from('assessments')
      .update({ status: 'submitted', error_message: null })
      .eq('id', req.params.id);

    processAssessment(data.id, null).catch(err =>
      console.error(`Retry failed for assessment ${data.id}:`, err)
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/regenerate-ai-review', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('assessments')
      .select(`*, students(name)`)
      .eq('id', req.params.id)
      .single();
    if (error) throw error;

    const { generateAiReview } = require('../services/openai');
    const content = await generateAiReview(data, data.transcript);

    await supabase.from('ai_reviews').insert({ assessment_id: data.id, content });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/transcript/docx', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('assessments')
      .select(`transcript, round, students(name)`)
      .eq('id', req.params.id)
      .single();
    if (error) throw error;

    const { Document, Paragraph, Packer } = require('docx');
    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({ text: `${data.students.name} — Round ${data.round}`, heading: 'Heading1' }),
          ...(data.transcript || '').split('\n').map(line => new Paragraph({ text: line })),
        ],
      }],
    });
    const buffer = await Packer.toBuffer(doc);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="transcript-${req.params.id}.docx"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/ai-review/docx', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('assessments')
      .select(`round, students(name), ai_reviews(content)`)
      .eq('id', req.params.id)
      .single();
    if (error) throw error;

    const content = data.ai_reviews?.[0]?.content || '';
    const { Document, Paragraph, Packer } = require('docx');
    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({ text: `${data.students.name} — Round ${data.round} AI Review`, heading: 'Heading1' }),
          ...(content).split('\n').map(line => new Paragraph({ text: line })),
        ],
      }],
    });
    const buffer = await Packer.toBuffer(doc);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="ai-review-${req.params.id}.docx"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- --testPathPattern=assessments
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add routes/assessments.js tests/assessments.test.js
git commit -m "feat: assessments routes"
```

---

## Task 5: Admin Route

**Files:**
- Create: `routes/admin.js`
- Create: `tests/admin.test.js`

- [ ] **Step 1: Write failing test**

Create `tests/admin.test.js`:

```js
const request = require('supertest');
const app = require('../server');

test('POST /api/admin/auth with wrong password returns 401', async () => {
  process.env.ADMIN_PASSWORD = 'secret';
  const res = await request(app).post('/api/admin/auth').send({ password: 'wrong' });
  expect(res.status).toBe(401);
  expect(res.body.success).toBe(false);
});

test('POST /api/admin/auth with correct password returns token', async () => {
  process.env.ADMIN_PASSWORD = 'secret';
  const res = await request(app).post('/api/admin/auth').send({ password: 'secret' });
  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
  expect(typeof res.body.token).toBe('string');
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- --testPathPattern=admin
```

Expected: FAIL

- [ ] **Step 3: Create routes/admin.js**

```js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const tokens = new Set();

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!tokens.has(token)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

router.post('/auth', (req, res) => {
  const { password } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ success: false });
  }
  const token = crypto.randomUUID();
  tokens.add(token);
  res.json({ success: true, token });
});

module.exports = router;
module.exports.requireAdmin = requireAdmin;
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- --testPathPattern=admin
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add routes/admin.js tests/admin.test.js
git commit -m "feat: admin auth route"
```

---

## Task 6: Google Drive Service

**Files:**
- Create: `services/drive.js`

- [ ] **Step 1: Create services/drive.js**

```js
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
}

async function getDrive() {
  const auth = getAuth();
  return google.drive({ version: 'v3', auth });
}

async function findFolder(drive, name, parentId) {
  const query = `name = '${name}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const res = await drive.files.list({
    q: query,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files?.[0]?.id || null;
}

async function createFolder(drive, name, parentId) {
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
    supportsAllDrives: true,
  });
  return res.data.id;
}

async function getWebLink(drive, fileId) {
  const res = await drive.files.get({
    fileId,
    fields: 'webViewLink',
    supportsAllDrives: true,
  });
  return res.data.webViewLink;
}

async function shareFolder(drive, folderId, email) {
  await drive.permissions.create({
    fileId: folderId,
    requestBody: { type: 'user', role: 'writer', emailAddress: email },
    supportsAllDrives: true,
    sendNotificationEmail: false,
  });
}

async function createStudentRoundFolder(studentName, round, studentEmail = '') {
  const drive = await getDrive();
  const parentId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;

  let studentFolderId = await findFolder(drive, studentName, parentId);
  const isNew = !studentFolderId;
  if (isNew) {
    studentFolderId = await createFolder(drive, studentName, parentId);
  }

  if (isNew && studentEmail) {
    await shareFolder(drive, studentFolderId, studentEmail);
  }

  const roundFolderId = await createFolder(drive, `Round ${round}`, studentFolderId);
  const folderUrl = await getWebLink(drive, roundFolderId);
  return { folderId: roundFolderId, folderUrl };
}

async function uploadFile(localPath, folderId, driveFileName) {
  const drive = await getDrive();
  const res = await drive.files.create({
    requestBody: {
      name: driveFileName,
      parents: [folderId],
    },
    media: {
      body: fs.createReadStream(localPath),
    },
    fields: 'id',
    supportsAllDrives: true,
  });
  return getWebLink(drive, res.data.id);
}

async function uploadBuffer(buffer, folderId, driveFileName, mimeType) {
  const drive = await getDrive();
  const { Readable } = require('stream');
  const stream = Readable.from(buffer);
  const res = await drive.files.create({
    requestBody: {
      name: driveFileName,
      parents: [folderId],
    },
    media: { mimeType, body: stream },
    fields: 'id',
    supportsAllDrives: true,
  });
  return getWebLink(drive, res.data.id);
}

module.exports = { createStudentRoundFolder, uploadFile, uploadBuffer };
```

- [ ] **Step 2: Commit**

```bash
git add services/drive.js
git commit -m "feat: google drive service"
```

---

## Task 7: OpenAI Service

**Files:**
- Create: `services/openai.js`

- [ ] **Step 1: Create services/openai.js**

```js
const OpenAI = require('openai');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegStatic);

function getClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function extractAudio(videoPath, audioPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioFrequency(16000)
      .audioChannels(1)
      .outputOptions(['-q:a 5'])
      .output(audioPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

async function transcribe(audioPath) {
  const client = getClient();
  const result = await client.audio.transcriptions.create({
    model: 'whisper-1',
    file: fs.createReadStream(audioPath),
  });
  return addSpeakerLabels(client, result.text);
}

async function addSpeakerLabels(client, rawTranscript) {
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: `Below is a raw transcript of a coaching session between a coach and their client.\n\nReformat it with speaker labels on each turn. Use exactly "Coach:" and "Client:" as labels.\n- The coach typically asks questions, reflects back, and facilitates exploration.\n- The client shares their experience, challenges, and goals.\n\nReturn only the formatted transcript — no commentary, no preamble.\n\nRaw transcript:\n${rawTranscript}`,
    }],
  });
  return response.choices[0].message.content;
}

async function generateAiReview(assessment, transcript) {
  const client = getClient();
  const prompt = `You are an experienced coaching mentor reviewing a coaching session transcript.

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

${transcript}

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

Base your evaluation entirely on what you observe in the transcript. Do not reference any self-ratings or written reflections submitted separately.`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
  });
  return response.choices[0].message.content;
}

module.exports = { extractAudio, transcribe, generateAiReview };
```

- [ ] **Step 2: Commit**

```bash
git add services/openai.js
git commit -m "feat: openai service (whisper + gpt-4o)"
```

---

## Task 8: Email Service

**Files:**
- Create: `services/email.js`

- [ ] **Step 1: Create services/email.js**

```js
const { Resend } = require('resend');

function getClient() {
  return new Resend(process.env.RESEND_API_KEY);
}

const FROM = () => process.env.EMAIL_FROM || 'Upbuild Mentoring <mentoring@upbuild.com>';
const APP_URL = () => process.env.APP_URL || 'http://localhost:3000';

async function sendMentorNotification({ mentorEmail, mentorName, mentorId, studentName, roundNum, videoDriveUrl, assessmentId }) {
  const mentorFirst = mentorName.split(' ')[0];
  const studentFirst = studentName.split(' ')[0];
  const appUrl = APP_URL();
  await getClient().emails.send({
    from: FROM(),
    to: mentorEmail,
    subject: `Mentoring Recording. ${studentName}. Round ${roundNum}`,
    html: `<p>Hi ${mentorFirst},</p>
<p>There is a new mentoring recording to review from ${studentFirst}.</p>
<ul>
  <li><a href="${videoDriveUrl}">Video recording</a></li>
  <li><a href="${appUrl}/transcript.html?assessment_id=${assessmentId}">Transcript</a></li>
  <li><a href="${appUrl}/ai-review.html?assessment_id=${assessmentId}">AI-generated review</a></li>
</ul>
<p>After your mentoring meeting, <a href="${appUrl}/mentor-review.html?assessment_id=${assessmentId}">submit mentor feedback</a>.</p>
<p><a href="${appUrl}/mentor-dashboard.html?mentor_id=${mentorId}">View your mentor dashboard</a></p>`,
  });
}

async function sendStudentConfirmation({ studentEmail, studentName, roundNum, driveFolderUrl }) {
  const first = studentName.split(' ')[0];
  await getClient().emails.send({
    from: FROM(),
    to: studentEmail,
    subject: `Your Round ${roundNum} Recording Has Been Received`,
    html: `<p>Hi ${first},</p>
<p>Your Round ${roundNum} mentoring recording has been successfully uploaded, and your mentor has been notified.</p>
<p>You can access your recording and transcript in your Google Drive <a href="${driveFolderUrl}">folder</a>.</p>`,
  });
}

async function sendCompletionNotification({ mentorEmail, mentorName, studentEmail, studentName, roundNum, pdfDriveUrl }) {
  const studentFirst = studentName.split(' ')[0];
  const client = getClient();
  await client.emails.send({
    from: FROM(),
    to: mentorEmail,
    subject: `${studentName}'s Round ${roundNum} Mentoring Assessment is Ready`,
    html: `<p>View <a href="${pdfDriveUrl}">${studentFirst}'s Round ${roundNum} assessment PDF</a></p>`,
  });
  if (studentEmail) {
    await client.emails.send({
      from: FROM(),
      to: studentEmail,
      subject: `Your UCT Mentoring Round ${roundNum} Assessment is Ready`,
      html: `<p>Hi ${studentFirst},</p>
<p>Your Round ${roundNum} assessment PDF is now complete and available to view.</p>
<p><a href="${pdfDriveUrl}">Round ${roundNum} assessment PDF</a></p>`,
    });
  }
}

module.exports = { sendMentorNotification, sendStudentConfirmation, sendCompletionNotification };
```

- [ ] **Step 2: Commit**

```bash
git add services/email.js
git commit -m "feat: email service (resend)"
```

---

## Task 9: Processing Pipeline

**Files:**
- Create: `services/processor.js`

- [ ] **Step 1: Create services/processor.js**

```js
const fs = require('fs');
const path = require('path');
const { Document, Paragraph, Packer } = require('docx');
const supabase = require('./supabase');
const drive = require('./drive');
const openai = require('./openai');
const email = require('./email');

async function updateAssessment(id, fields) {
  const { error } = await supabase.from('assessments').update(fields).eq('id', id);
  if (error) throw error;
}

async function processAssessment(assessmentId, videoPath) {
  await updateAssessment(assessmentId, { status: 'processing' });
  try {
    const { data: assessment } = await supabase
      .from('assessments')
      .select('*, students(name, email, mentor_id, mentors(name, email, id))')
      .eq('id', assessmentId)
      .single();

    const student = assessment.students;
    const mentor = student.mentors;
    const baseName = `Mentoring Round ${assessment.round}. ${student.name}`;

    // Step 1: Create Drive folder
    const { folderId, folderUrl } = await drive.createStudentRoundFolder(
      student.name, assessment.round, student.email || ''
    );
    await updateAssessment(assessmentId, { drive_folder_id: folderId, drive_folder_url: folderUrl });

    // Step 2: Upload video
    let videoDriveUrl = null;
    if (videoPath && fs.existsSync(videoPath)) {
      videoDriveUrl = await drive.uploadFile(videoPath, folderId, `${baseName}. Recording.mp4`);
      await updateAssessment(assessmentId, { video_drive_url: videoDriveUrl });
    }

    // Step 3: Extract audio
    const audioPath = videoPath ? videoPath.replace(/\.[^.]+$/, '.mp3') : null;
    if (videoPath && fs.existsSync(videoPath)) {
      await openai.extractAudio(videoPath, audioPath);
    }

    // Step 4: Transcribe
    let transcript = '';
    if (audioPath && fs.existsSync(audioPath)) {
      transcript = await openai.transcribe(audioPath);
    }

    // Cleanup local files
    for (const p of [audioPath, videoPath]) {
      if (p) try { fs.unlinkSync(p); } catch {}
    }

    // Step 5: Upload transcript docx
    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({ text: `${baseName}. Transcript`, heading: 'Heading1' }),
          ...transcript.split('\n').map(line => new Paragraph({ text: line })),
        ],
      }],
    });
    const docBuffer = await Packer.toBuffer(doc);
    await drive.uploadBuffer(
      docBuffer, folderId, `${baseName}. Transcript.docx`,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );

    // Save transcript to DB
    await updateAssessment(assessmentId, { transcript });

    // Step 6: Generate AI review
    const aiContent = await openai.generateAiReview(assessment, transcript);
    await supabase.from('ai_reviews').insert({ assessment_id: assessmentId, content: aiContent });

    // Step 7: Send mentor notification
    await email.sendMentorNotification({
      mentorEmail: mentor.email,
      mentorName: mentor.name,
      mentorId: mentor.id,
      studentName: student.name,
      roundNum: assessment.round,
      videoDriveUrl: videoDriveUrl || '',
      assessmentId,
    });

    // Step 8: Send student confirmation
    if (student.email) {
      await email.sendStudentConfirmation({
        studentEmail: student.email,
        studentName: student.name,
        roundNum: assessment.round,
        driveFolderUrl: folderUrl,
      });
    }

    // Step 9: Mark complete
    await updateAssessment(assessmentId, { status: 'complete', error_message: null });
  } catch (err) {
    await supabase
      .from('assessments')
      .update({ status: 'error', error_message: err.message })
      .eq('id', assessmentId);
    throw err;
  }
}

async function generateAndSendPdf(assessmentId) {
  const { data: assessment } = await supabase
    .from('assessments')
    .select('*, students(name, email, mentor_id, mentors(name, email)), mentor_feedback(feedback_text, mentor_ratings)')
    .eq('id', assessmentId)
    .single();

  const student = assessment.students;
  const mentor = student.mentors;
  const feedback = assessment.mentor_feedback?.[0];
  const baseName = `Mentoring Round ${assessment.round}. ${student.name}`;

  const { generatePdf } = require('./pdf');
  const pdfBuffer = await generatePdf({
    assessment,
    studentName: student.name,
    mentorName: mentor.name,
    feedbackText: feedback?.feedback_text || {},
    mentorRatings: feedback?.mentor_ratings || {},
  });

  const pdfDriveUrl = await drive.uploadBuffer(
    pdfBuffer,
    assessment.drive_folder_id,
    `${baseName}. Assessment.pdf`,
    'application/pdf'
  );

  await updateAssessment(assessmentId, { pdf_drive_url: pdfDriveUrl });

  await email.sendCompletionNotification({
    mentorEmail: mentor.email,
    mentorName: mentor.name,
    studentEmail: student.email || '',
    studentName: student.name,
    roundNum: assessment.round,
    pdfDriveUrl,
  });

  return pdfDriveUrl;
}

module.exports = { processAssessment, generateAndSendPdf };
```

- [ ] **Step 2: Commit**

```bash
git add services/processor.js
git commit -m "feat: assessment processing pipeline"
```

---

## Task 10: PDF Service

**Files:**
- Create: `services/pdf.js`

- [ ] **Step 1: Create services/pdf.js**

```js
const PDFDocument = require('pdfkit');
const { COMPETENCIES } = require('../shared/competencies');

const PURPLE = '#5E328C';
const LIGHT_PURPLE = '#EDE7F6';
const DARK_TEXT = '#1E1E1E';
const GRAY = '#787878';
const RULE_COLOR = '#DCD2F0';

function generatePdf({ assessment, studentName, mentorName, feedbackText, mentorRatings }) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - 100; // margins 50 each side

    // Footer on every page
    doc.on('pageAdded', () => {
      const savedY = doc.y;
      doc.fontSize(8).fillColor(GRAY)
        .text('Upbuild Mentoring Program', 50, doc.page.height - 30, { align: 'center', width: pageWidth });
      doc.y = savedY;
    });

    // Header
    doc.fontSize(14).fillColor(PURPLE).font('Helvetica-Bold')
      .text(`Mentoring Assessment — Round ${assessment.round}`, 50, 50);

    // Purple rule
    doc.moveTo(50, 75).lineTo(50 + pageWidth, 75).strokeColor(PURPLE).lineWidth(1).stroke();

    // Meta block
    doc.y = 85;
    const metaLines = [
      ['COACH', studentName],
      ['MENTOR', mentorName || '—'],
      ['DATE SUBMITTED', assessment.submitted_at ? new Date(assessment.submitted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A'],
    ];
    for (const [label, value] of metaLines) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY).text(label, 50, doc.y, { continued: true, width: 100 });
      doc.font('Helvetica').fillColor(DARK_TEXT).text(value);
    }

    // Section heading helper
    function sectionHeading(text) {
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(12).fillColor(PURPLE).text(text, 50);
      doc.moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).strokeColor(RULE_COLOR).lineWidth(0.5).stroke();
      doc.moveDown(0.3);
      doc.fillColor(DARK_TEXT);
    }

    // Competency Ratings Table
    sectionHeading('Competency Ratings');
    const coachRatings = assessment.competency_ratings || {};
    const colComp = pageWidth * 0.52;
    const colSide = pageWidth * 0.24;
    const rowH = 16;

    // Table header
    doc.rect(50, doc.y, pageWidth, rowH).fill(LIGHT_PURPLE);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(PURPLE);
    doc.text('Competency', 54, doc.y - rowH + 4, { width: colComp });
    doc.text('Coach', 54 + colComp, doc.y, { width: colSide });
    doc.text('Mentor', 54 + colComp + colSide, doc.y, { width: colSide });
    doc.moveDown(0.2);

    let fill = false;
    let currentCategory = null;
    for (const comp of COMPETENCIES) {
      if (comp.category !== currentCategory) {
        currentCategory = comp.category;
        doc.rect(50, doc.y, pageWidth, rowH).fill('#F8F5FF');
        doc.font('Helvetica-Bold').fontSize(9).fillColor(PURPLE)
          .text(`  ${currentCategory}`, 54, doc.y - rowH + 4, { width: pageWidth });
        doc.moveDown(0.2);
        fill = false;
      }
      const bg = fill ? '#FAF8FF' : '#FFFFFF';
      doc.rect(50, doc.y, pageWidth, rowH).fill(bg);
      doc.font('Helvetica').fontSize(9).fillColor(DARK_TEXT)
        .text(`  ${comp.name}`, 54, doc.y - rowH + 4, { width: colComp });
      doc.text(String(coachRatings[comp.name] || '—'), 54 + colComp, doc.y, { width: colSide });
      doc.text(String(mentorRatings[comp.name] || '—'), 54 + colComp + colSide, doc.y, { width: colSide });
      doc.moveDown(0.2);
      fill = !fill;
    }

    // Coach Reflections
    sectionHeading('Coach Reflections');
    const reflections = assessment.reflections || {};
    for (const [question, answer] of Object.entries(reflections)) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK_TEXT).text(question, 50);
      doc.font('Helvetica').fontSize(10).fillColor('#3C3C3C').text(answer || '(no answer)', 54, doc.y, { width: pageWidth - 4 });
      doc.moveDown(0.5);
    }

    // Mentor Feedback
    sectionHeading('Mentor Feedback');
    for (const [question, answer] of Object.entries(feedbackText || {})) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK_TEXT).text(question, 50);
      doc.font('Helvetica').fontSize(10).fillColor('#3C3C3C').text(answer || '(no answer)', 54, doc.y, { width: pageWidth - 4 });
      doc.moveDown(0.5);
    }

    doc.end();
  });
}

module.exports = { generatePdf };
```

- [ ] **Step 2: Commit**

```bash
git add services/pdf.js
git commit -m "feat: pdf generation service"
```

---

## Task 11: Shared CSS + JS API wrapper

**Files:**
- Create: `public/css/style.css`
- Create: `public/js/api.js`

- [ ] **Step 1: Create public/css/style.css**

```css
:root {
  --purple: #5E328C;
  --light-purple: #EDE7F6;
  --text: #1E1E1E;
  --gray: #787878;
  --border: #E0E0E0;
  --error-bg: #FFF3CD;
  --error-border: #FFCA2C;
  --success-bg: #D4EDDA;
  --success-border: #28A745;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'Inter', system-ui, sans-serif;
  background: #fff;
  color: var(--text);
  font-size: 15px;
  line-height: 1.6;
}

header {
  background: #fff;
  border-bottom: 1px solid var(--border);
  padding: 14px 24px;
  display: flex;
  align-items: center;
}

.logo {
  background: var(--purple);
  color: #fff;
  font-weight: 700;
  font-size: 16px;
  padding: 6px 18px;
  border-radius: 999px;
  text-decoration: none;
}

main {
  max-width: 800px;
  margin: 40px auto;
  padding: 0 24px;
}

main.wide { max-width: 1100px; }

h1 { font-size: 22px; font-weight: 700; margin-bottom: 24px; color: var(--purple); }
h2 { font-size: 16px; font-weight: 700; margin: 24px 0 12px; color: var(--purple); }

label { display: block; font-weight: 600; margin-bottom: 4px; font-size: 14px; }

input[type=text], input[type=email], select, textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 14px;
  font-family: inherit;
  color: var(--text);
}

textarea { min-height: 90px; resize: vertical; }

.form-group { margin-bottom: 18px; }

.btn {
  display: inline-block;
  padding: 10px 22px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  text-decoration: none;
}

.btn-primary { background: var(--purple); color: #fff; }
.btn-primary:hover { background: #4d2873; }
.btn-secondary { background: #f0f0f0; color: var(--text); }
.btn-danger { background: #dc3545; color: #fff; }
.btn-sm { padding: 6px 14px; font-size: 13px; }

.card {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 20px;
  margin-bottom: 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}

.badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}
.badge-green { background: #D4EDDA; color: #155724; }
.badge-orange { background: #FFF3CD; color: #856404; }
.badge-red { background: #F8D7DA; color: #721C24; }
.badge-gray { background: #E9ECEF; color: #495057; }

.alert {
  padding: 12px 16px;
  border-radius: 6px;
  margin-bottom: 16px;
  font-size: 14px;
}
.alert-warning { background: #FFF3CD; border: 1px solid #FFCA2C; }
.alert-success { background: #D4EDDA; border: 1px solid #28A745; }
.alert-error { background: #F8D7DA; border: 1px solid #dc3545; color: #721C24; }

.divider {
  border: none;
  border-top: 1px solid var(--border);
  margin: 24px 0;
}

.text-gray { color: var(--gray); font-size: 13px; }
.mt-16 { margin-top: 16px; }
.mb-16 { margin-bottom: 16px; }

table { width: 100%; border-collapse: collapse; font-size: 14px; }
th { background: var(--light-purple); color: var(--purple); font-weight: 700; padding: 8px 12px; text-align: left; }
td { padding: 8px 12px; border-bottom: 1px solid var(--border); }
tr:nth-child(even) td { background: #FAFAFA; }

.tabs { display: flex; border-bottom: 2px solid var(--border); margin-bottom: 24px; }
.tab {
  padding: 10px 20px;
  cursor: pointer;
  font-weight: 600;
  font-size: 14px;
  color: var(--gray);
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
}
.tab.active { color: var(--purple); border-bottom-color: var(--purple); }

details summary { cursor: pointer; font-weight: 600; padding: 12px 0; user-select: none; }
details summary:hover { color: var(--purple); }
```

- [ ] **Step 2: Create public/js/api.js**

```js
async function apiFetch(url, options = {}) {
  const token = sessionStorage.getItem('adminToken');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body && typeof options.body !== 'string') {
    options.body = JSON.stringify(options.body);
  }
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

function showBanner(container, message, type = 'error') {
  const div = document.createElement('div');
  div.className = `alert alert-${type}`;
  div.textContent = message;
  container.prepend(div);
  setTimeout(() => div.remove(), 8000);
}
```

- [ ] **Step 3: Commit**

```bash
git add public/css/style.css public/js/api.js
git commit -m "feat: shared CSS and JS API wrapper"
```

---

## Task 12: Student Submission Page

**Files:**
- Create: `public/index.html`
- Create: `public/js/submission.js`

- [ ] **Step 1: Create public/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Submit Recording — Upbuild</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <header><a class="logo" href="/">Upbuild</a></header>
  <main>
    <h1>Submit Your Coaching Recording</h1>

    <div id="banner-area"></div>

    <div class="form-group">
      <label for="student-select">Your Name</label>
      <select id="student-select"><option value="">Select your name</option></select>
    </div>

    <div class="form-group">
      <label>Round</label>
      <div style="display:flex;gap:16px;margin-top:4px;">
        <label style="font-weight:normal"><input type="radio" name="round" value="1"> Round 1</label>
        <label style="font-weight:normal"><input type="radio" name="round" value="2"> Round 2</label>
        <label style="font-weight:normal"><input type="radio" name="round" value="3"> Round 3</label>
        <label style="font-weight:normal"><input type="radio" name="round" value="4"> Round 4</label>
      </div>
    </div>

    <div id="duplicate-warning" class="alert alert-warning" style="display:none">
      <strong>You already submitted this round.</strong> Submitting again will create a second entry.
      <div style="margin-top:8px"><label><input type="checkbox" id="duplicate-confirm"> I understand, continue anyway</label></div>
    </div>

    <div class="form-group">
      <label for="video-file">Coaching Session Recording</label>
      <input type="file" id="video-file" accept=".mp4,.mov,.webm,.avi">
      <div id="file-size" class="text-gray mt-16"></div>
    </div>

    <h2>Meta-Skills Self-Rating</h2>
    <div id="meta-skills-ratings"></div>

    <h2>Skills Self-Rating</h2>
    <div id="skills-ratings"></div>

    <h2>Reflections</h2>
    <div id="reflection-questions"></div>

    <div id="progress-area" style="display:none">
      <div class="alert alert-warning" id="progress-msg">Processing your submission…</div>
    </div>

    <div id="success-area" style="display:none" class="alert alert-success"></div>

    <button class="btn btn-primary" id="submit-btn" style="margin-top:8px">Submit Recording</button>
  </main>

  <script src="/js/api.js"></script>
  <script src="/js/submission.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create public/js/submission.js**

```js
const RATING_OPTIONS = ['-- select --', '1. Not Demonstrated', '2. Emerging', '3. Competent', '4. Exceptional'];
const COMPETENCIES = [
  { name: 'Know Yourself', category: 'Meta-Skills' },
  { name: 'Experiment and Learn', category: 'Meta-Skills' },
  { name: 'Serve Not Fix', category: 'Meta-Skills' },
  { name: 'Call on the Creative', category: 'Meta-Skills' },
  { name: 'Co-Creating and Maintaining the Relationship', category: 'Skills' },
  { name: 'Structuring the Coaching Session', category: 'Skills' },
  { name: 'Listening', category: 'Skills' },
  { name: 'Asking Curious and Powerful Questions', category: 'Skills' },
  { name: 'Balancing Action and Learning', category: 'Skills' },
];
const REFLECTION_QUESTIONS = [
  { q: 'What did you do well in this coaching session?', required: true },
  { q: 'What opportunities were there to improve the coaching?', required: true },
  { q: 'What are you learning about your style as a coach? How would your clients describe you?', required: true },
  { q: 'What is your next developmental opportunity?', required: true },
  { q: 'Questions you have about this session or coaching in general', required: false },
  { q: 'If your session is longer than 30 minutes, which portion of the recording should your mentor listen to?', required: false },
];

async function init() {
  const students = await apiFetch('/api/students');
  const sel = document.getElementById('student-select');
  for (const s of students) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    sel.appendChild(opt);
  }

  // Render competency ratings
  for (const cat of ['Meta-Skills', 'Skills']) {
    const container = document.getElementById(cat === 'Meta-Skills' ? 'meta-skills-ratings' : 'skills-ratings');
    for (const comp of COMPETENCIES.filter(c => c.category === cat)) {
      const div = document.createElement('div');
      div.className = 'form-group';
      const label = document.createElement('label');
      label.textContent = comp.name;
      label.setAttribute('for', `rating-${comp.name}`);
      const select = document.createElement('select');
      select.id = `rating-${comp.name}`;
      select.dataset.competency = comp.name;
      select.className = 'competency-select';
      for (const opt of RATING_OPTIONS) {
        const o = document.createElement('option');
        o.value = opt === '-- select --' ? '' : opt;
        o.textContent = opt;
        select.appendChild(o);
      }
      div.appendChild(label);
      div.appendChild(select);
      container.appendChild(div);
    }
  }

  // Render reflection questions
  const reflContainer = document.getElementById('reflection-questions');
  for (const { q, required } of REFLECTION_QUESTIONS) {
    const div = document.createElement('div');
    div.className = 'form-group';
    const label = document.createElement('label');
    label.textContent = q + (required ? '' : ' (optional)');
    label.style.color = required ? '' : 'var(--gray)';
    const textarea = document.createElement('textarea');
    textarea.dataset.question = q;
    textarea.className = 'reflection-textarea';
    if (required) textarea.required = true;
    div.appendChild(label);
    div.appendChild(textarea);
    reflContainer.appendChild(div);
  }
}

// Duplicate check
let duplicateExists = false;
async function checkDuplicate() {
  const studentId = document.getElementById('student-select').value;
  const round = document.querySelector('input[name=round]:checked')?.value;
  if (!studentId || !round) return;
  try {
    const { exists } = await apiFetch(`/api/assessments/check-duplicate?student_id=${studentId}&round=${round}`);
    duplicateExists = exists;
    document.getElementById('duplicate-warning').style.display = exists ? 'block' : 'none';
    if (!exists) document.getElementById('duplicate-confirm').checked = false;
  } catch {}
}

document.getElementById('student-select').addEventListener('change', checkDuplicate);
document.querySelectorAll('input[name=round]').forEach(r => r.addEventListener('change', checkDuplicate));

document.getElementById('video-file').addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    document.getElementById('file-size').textContent = `File size: ${mb} MB`;
  }
});

document.getElementById('submit-btn').addEventListener('click', async () => {
  const bannerArea = document.getElementById('banner-area');
  const studentId = document.getElementById('student-select').value;
  const round = document.querySelector('input[name=round]:checked')?.value;
  const videoFile = document.getElementById('video-file').files[0];

  if (!studentId) return showBanner(bannerArea, 'Please select your name.');
  if (!round) return showBanner(bannerArea, 'Please select a round.');
  if (!videoFile) return showBanner(bannerArea, 'Please upload a recording.');

  if (duplicateExists && !document.getElementById('duplicate-confirm').checked) {
    return showBanner(bannerArea, 'Please confirm you want to submit a duplicate.');
  }

  // Validate competency ratings
  const ratings = {};
  for (const sel of document.querySelectorAll('.competency-select')) {
    if (!sel.value) return showBanner(bannerArea, `Please rate: ${sel.dataset.competency}`);
    ratings[sel.dataset.competency] = sel.value;
  }

  // Collect reflections
  const reflections = {};
  for (const ta of document.querySelectorAll('.reflection-textarea')) {
    if (ta.required && !ta.value.trim()) return showBanner(bannerArea, `Please answer: ${ta.dataset.question}`);
    reflections[ta.dataset.question] = ta.value.trim();
  }

  const formData = new FormData();
  formData.append('student_id', studentId);
  formData.append('round', round);
  formData.append('competency_ratings', JSON.stringify(ratings));
  formData.append('reflections', JSON.stringify(reflections));
  formData.append('video', videoFile);

  document.getElementById('submit-btn').disabled = true;
  document.getElementById('progress-area').style.display = 'block';

  try {
    const res = await fetch('/api/assessments/submit', { method: 'POST', body: formData });
    if (!res.ok) throw new Error((await res.json()).error || 'Submission failed');
    const { assessment_id } = await res.json();

    pollStatus(assessment_id);
  } catch (err) {
    document.getElementById('submit-btn').disabled = false;
    document.getElementById('progress-area').style.display = 'none';
    showBanner(bannerArea, err.message);
  }
});

const statusMessages = {
  submitted: 'Uploading to Drive…',
  processing: 'Transcribing and generating AI review… This may take a few minutes.',
  complete: 'Done!',
  error: null,
};

async function pollStatus(assessmentId) {
  const msg = document.getElementById('progress-msg');
  const interval = setInterval(async () => {
    try {
      const { status, error_message } = await apiFetch(`/api/assessments/${assessmentId}/status`);
      msg.textContent = statusMessages[status] || 'Processing…';
      if (status === 'complete') {
        clearInterval(interval);
        document.getElementById('progress-area').style.display = 'none';
        const successArea = document.getElementById('success-area');
        successArea.style.display = 'block';
        successArea.textContent = 'Your recording has been submitted successfully. Your mentor has been notified.';
      } else if (status === 'error') {
        clearInterval(interval);
        document.getElementById('progress-area').style.display = 'none';
        document.getElementById('submit-btn').disabled = false;
        showBanner(document.getElementById('banner-area'), `Processing failed: ${error_message || 'Unknown error'}`);
      }
    } catch {}
  }, 3000);
}

init();
```

- [ ] **Step 3: Commit**

```bash
git add public/index.html public/js/submission.js
git commit -m "feat: student submission page"
```

---

## Task 13: Mentor Review Page

**Files:**
- Create: `public/mentor-review.html`
- Create: `public/js/mentor-review.js`

- [ ] **Step 1: Create public/mentor-review.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mentor Review — Upbuild</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <header><a class="logo" href="/">Upbuild</a></header>
  <main>
    <h1 id="page-title">Mentor Review</h1>
    <div id="banner-area"></div>
    <div id="content" style="display:none">
      <table id="ratings-table">
        <thead>
          <tr><th>Competency</th><th>Coach's Rating</th><th>Your Rating</th></tr>
        </thead>
        <tbody id="ratings-body"></tbody>
      </table>

      <hr class="divider">
      <h2>Coach's Reflections</h2>
      <div id="coach-reflections"></div>

      <hr class="divider">
      <h2>Your Feedback</h2>
      <div id="mentor-feedback-fields"></div>

      <button class="btn btn-primary" id="submit-btn">Submit Feedback</button>
      <div id="submit-success" class="alert alert-success mt-16" style="display:none"></div>
    </div>
  </main>
  <script src="/js/api.js"></script>
  <script src="/js/mentor-review.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create public/js/mentor-review.js**

```js
const COMPETENCIES = [
  { name: 'Know Yourself', category: 'Meta-Skills' },
  { name: 'Experiment and Learn', category: 'Meta-Skills' },
  { name: 'Serve Not Fix', category: 'Meta-Skills' },
  { name: 'Call on the Creative', category: 'Meta-Skills' },
  { name: 'Co-Creating and Maintaining the Relationship', category: 'Skills' },
  { name: 'Structuring the Coaching Session', category: 'Skills' },
  { name: 'Listening', category: 'Skills' },
  { name: 'Asking Curious and Powerful Questions', category: 'Skills' },
  { name: 'Balancing Action and Learning', category: 'Skills' },
];

const RATING_OPTIONS = ['-- select --', '1. Not Demonstrated', '2. Emerging', '3. Competent', '4. Exceptional'];

const MENTOR_QUESTIONS = [
  'What did the coach do well in this coaching session?',
  'What opportunities were there to strengthen this coaching session?',
  'What are the developmental opportunities for the coach?',
  'What are 1-2 development practices for the coach?',
];

const params = new URLSearchParams(location.search);
const assessmentId = params.get('assessment_id');

async function init() {
  const data = await apiFetch(`/api/assessments/${assessmentId}`);
  const student = data.students;
  const date = data.submitted_at ? new Date(data.submitted_at).toLocaleDateString() : '';
  document.getElementById('page-title').textContent = `Coach: ${student.name} — Round ${data.round} (${date})`;
  document.getElementById('content').style.display = 'block';

  const coachRatings = data.competency_ratings || {};
  const existingMentorRatings = data.mentor_feedback?.[0]?.mentor_ratings || {};
  const tbody = document.getElementById('ratings-body');
  let currentCategory = null;

  for (const comp of COMPETENCIES) {
    if (comp.category !== currentCategory) {
      currentCategory = comp.category;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="3" style="background:var(--light-purple);font-weight:700;color:var(--purple)">${currentCategory}</td>`;
      tbody.appendChild(tr);
    }
    const tr = document.createElement('tr');
    const select = document.createElement('select');
    select.dataset.competency = comp.name;
    select.className = 'mentor-rating-select';
    for (const opt of RATING_OPTIONS) {
      const o = document.createElement('option');
      o.value = opt === '-- select --' ? '' : opt;
      o.textContent = opt;
      if (existingMentorRatings[comp.name] && opt === existingMentorRatings[comp.name]) o.selected = true;
      select.appendChild(o);
    }
    tr.innerHTML = `<td>${comp.name}</td><td>${coachRatings[comp.name] || '—'}</td><td></td>`;
    tr.lastElementChild.appendChild(select);
    tbody.appendChild(tr);
  }

  // Coach reflections
  const reflContainer = document.getElementById('coach-reflections');
  for (const [q, a] of Object.entries(data.reflections || {})) {
    const div = document.createElement('div');
    div.className = 'form-group';
    div.innerHTML = `<label style="font-weight:700">${q}</label><p style="margin-top:4px;color:#333">${a || '(no answer)'}</p>`;
    reflContainer.appendChild(div);
  }

  // Mentor feedback fields
  const existingFeedback = data.mentor_feedback?.[0]?.feedback_text || {};
  const feedbackContainer = document.getElementById('mentor-feedback-fields');
  for (const q of MENTOR_QUESTIONS) {
    const div = document.createElement('div');
    div.className = 'form-group';
    const label = document.createElement('label');
    label.textContent = q;
    const textarea = document.createElement('textarea');
    textarea.dataset.question = q;
    textarea.className = 'mentor-feedback-textarea';
    textarea.value = existingFeedback[q] || '';
    div.appendChild(label);
    div.appendChild(textarea);
    feedbackContainer.appendChild(div);
  }
}

document.getElementById('submit-btn').addEventListener('click', async () => {
  const bannerArea = document.getElementById('banner-area');
  const mentorRatings = {};
  for (const sel of document.querySelectorAll('.mentor-rating-select')) {
    if (!sel.value) return showBanner(bannerArea, `Please rate: ${sel.dataset.competency}`);
    mentorRatings[sel.dataset.competency] = sel.value;
  }

  const feedbackText = {};
  for (const ta of document.querySelectorAll('.mentor-feedback-textarea')) {
    if (!ta.value.trim()) return showBanner(bannerArea, `Please answer: ${ta.dataset.question}`);
    feedbackText[ta.dataset.question] = ta.value.trim();
  }

  document.getElementById('submit-btn').disabled = true;
  try {
    await apiFetch(`/api/assessments/${assessmentId}/mentor-feedback`, {
      method: 'POST',
      body: { feedback_text: feedbackText, mentor_ratings: mentorRatings },
    });
    const success = document.getElementById('submit-success');
    success.style.display = 'block';
    success.textContent = 'Feedback submitted. The assessment PDF is being generated and will be emailed to both you and the coach.';
  } catch (err) {
    document.getElementById('submit-btn').disabled = false;
    showBanner(bannerArea, err.message);
  }
});

init().catch(err => showBanner(document.getElementById('banner-area'), err.message));
```

- [ ] **Step 3: Commit**

```bash
git add public/mentor-review.html public/js/mentor-review.js
git commit -m "feat: mentor review page"
```

---

## Task 14: Mentor Dashboard Page

**Files:**
- Create: `public/mentor-dashboard.html`
- Create: `public/js/mentor-dashboard.js`

- [ ] **Step 1: Create public/mentor-dashboard.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mentor Dashboard — Upbuild</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <header><a class="logo" href="/">Upbuild</a></header>
  <main class="wide">
    <h1 id="page-title">Mentor Dashboard</h1>
    <div id="banner-area"></div>
    <div id="students-list"></div>
  </main>
  <script src="/js/api.js"></script>
  <script src="/js/mentor-dashboard.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create public/js/mentor-dashboard.js**

```js
const params = new URLSearchParams(location.search);
const mentorId = params.get('mentor_id');

async function init() {
  const [mentor, assessments, students] = await Promise.all([
    apiFetch(`/api/mentors/${mentorId}`),
    apiFetch(`/api/assessments/by-mentor/${mentorId}`),
    apiFetch('/api/students'),
  ]);

  const firstName = mentor.name.split(' ')[0];
  document.getElementById('page-title').textContent = `Welcome, ${firstName}`;

  const myStudents = students.filter(s => s.mentor_id === parseInt(mentorId));
  myStudents.sort((a, b) => a.name.localeCompare(b.name));

  const container = document.getElementById('students-list');
  for (const student of myStudents) {
    const studentAssessments = assessments.filter(a => a.student_id === student.id);
    studentAssessments.sort((a, b) => a.round - b.round);

    const details = document.createElement('details');
    details.className = 'card';
    const summary = document.createElement('summary');
    summary.textContent = `${student.name} — ${studentAssessments.length} round${studentAssessments.length !== 1 ? 's' : ''} submitted`;
    details.appendChild(summary);

    if (studentAssessments.length === 0) {
      const p = document.createElement('p');
      p.className = 'text-gray';
      p.style.marginTop = '8px';
      p.textContent = 'No submissions yet.';
      details.appendChild(p);
    } else {
      const table = document.createElement('table');
      table.innerHTML = '<thead><tr><th>Round</th><th>Date</th><th>Feedback Status</th><th>Links</th></tr></thead>';
      const tbody = document.createElement('tbody');
      for (const a of studentAssessments) {
        const hasFeedback = Array.isArray(a.mentor_feedback) ? a.mentor_feedback.length > 0 : !!a.mentor_feedback;
        const date = a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : '—';
        const badgeClass = hasFeedback ? 'badge-green' : 'badge-orange';
        const badgeText = hasFeedback ? 'Feedback submitted' : 'Awaiting your feedback';
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>Round ${a.round}</td>
          <td>${date}</td>
          <td><span class="badge ${badgeClass}">${badgeText}</span></td>
          <td>
            <a class="btn btn-secondary btn-sm" href="/mentor-review.html?assessment_id=${a.id}">Review</a>
            ${a.drive_folder_url ? `<a class="btn btn-secondary btn-sm" href="${a.drive_folder_url}" target="_blank" style="margin-left:6px">Drive</a>` : ''}
          </td>`;
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      details.appendChild(table);
    }

    container.appendChild(details);
  }
}

init().catch(err => showBanner(document.getElementById('banner-area'), err.message));
```

- [ ] **Step 3: Commit**

```bash
git add public/mentor-dashboard.html public/js/mentor-dashboard.js
git commit -m "feat: mentor dashboard page"
```

---

## Task 15: Admin Page

**Files:**
- Create: `public/admin.html`
- Create: `public/js/admin.js`

- [ ] **Step 1: Create public/admin.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin — Upbuild</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <header><a class="logo" href="/">Upbuild</a></header>

  <!-- Auth modal -->
  <div id="auth-modal" style="position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:100">
    <div class="card" style="width:340px">
      <h2 style="margin-bottom:16px">Admin Login</h2>
      <div class="form-group">
        <label for="admin-password">Password</label>
        <input type="password" id="admin-password">
      </div>
      <button class="btn btn-primary" id="auth-btn">Login</button>
      <div id="auth-error" class="alert alert-error mt-16" style="display:none"></div>
    </div>
  </div>

  <main class="wide" id="admin-main" style="display:none">
    <h1>Admin Dashboard</h1>
    <div id="banner-area"></div>

    <div class="tabs">
      <div class="tab active" data-tab="assessments">Assessments</div>
      <div class="tab" data-tab="mentors">Mentors</div>
      <div class="tab" data-tab="students">Students</div>
      <div class="tab" data-tab="overview">Student Overview</div>
    </div>

    <!-- Assessments Tab -->
    <div id="tab-assessments">
      <div class="form-group" style="max-width:200px">
        <select id="status-filter">
          <option value="">All statuses</option>
          <option value="submitted">Submitted</option>
          <option value="processing">Processing</option>
          <option value="complete">Complete</option>
          <option value="error">Error</option>
        </select>
      </div>
      <div id="assessments-list"></div>
    </div>

    <!-- Mentors Tab -->
    <div id="tab-mentors" style="display:none">
      <div id="mentors-list"></div>
      <div class="card">
        <h2>Add Mentor</h2>
        <div class="form-group"><label>Name</label><input type="text" id="new-mentor-name"></div>
        <div class="form-group"><label>Email</label><input type="email" id="new-mentor-email"></div>
        <button class="btn btn-primary" id="add-mentor-btn">Add Mentor</button>
      </div>
    </div>

    <!-- Students Tab -->
    <div id="tab-students" style="display:none">
      <div id="students-list"></div>
      <div class="card">
        <h2>Bulk Import</h2>
        <p class="text-gray mb-16">Paste tab-separated rows: Name &tab; Email &tab; Mentor Name</p>
        <textarea id="bulk-import-text" style="min-height:120px;font-family:monospace"></textarea>
        <button class="btn btn-secondary" id="bulk-import-btn" style="margin-top:8px">Import</button>
        <div id="bulk-result" class="text-gray mt-16"></div>
      </div>
      <div class="card">
        <h2>Add Student</h2>
        <div class="form-group"><label>Name</label><input type="text" id="new-student-name"></div>
        <div class="form-group"><label>Email</label><input type="email" id="new-student-email"></div>
        <div class="form-group"><label>Mentor</label><select id="new-student-mentor"></select></div>
        <button class="btn btn-primary" id="add-student-btn">Add Student</button>
      </div>
    </div>

    <!-- Overview Tab -->
    <div id="tab-overview" style="display:none">
      <table id="overview-table">
        <thead><tr><th>Student</th><th>Mentor</th><th>Rounds Submitted</th></tr></thead>
        <tbody id="overview-body"></tbody>
      </table>
    </div>
  </main>

  <script src="/js/api.js"></script>
  <script src="/js/admin.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create public/js/admin.js**

```js
// Auth
const token = sessionStorage.getItem('adminToken');
if (token) showAdmin();

document.getElementById('auth-btn').addEventListener('click', async () => {
  const password = document.getElementById('admin-password').value;
  try {
    const data = await apiFetch('/api/admin/auth', { method: 'POST', body: { password } });
    if (data.success) {
      sessionStorage.setItem('adminToken', data.token);
      showAdmin();
    }
  } catch {
    const el = document.getElementById('auth-error');
    el.style.display = 'block';
    el.textContent = 'Incorrect password.';
  }
});

document.getElementById('admin-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('auth-btn').click();
});

function showAdmin() {
  document.getElementById('auth-modal').style.display = 'none';
  document.getElementById('admin-main').style.display = 'block';
  loadAll();
}

// Tabs
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    ['assessments', 'mentors', 'students', 'overview'].forEach(t => {
      document.getElementById(`tab-${t}`).style.display = t === tab.dataset.tab ? 'block' : 'none';
    });
  });
});

const STATUS_BADGE = {
  submitted: 'badge-gray',
  processing: 'badge-orange',
  complete: 'badge-green',
  error: 'badge-red',
};

let allAssessments = [], allMentors = [], allStudents = [];

async function loadAll() {
  [allAssessments, allMentors, allStudents] = await Promise.all([
    apiFetch('/api/assessments/all'),
    apiFetch('/api/mentors'),
    apiFetch('/api/students'),
  ]);
  renderAssessments();
  renderMentors();
  renderStudents();
  renderOverview();
}

// Assessments
document.getElementById('status-filter').addEventListener('change', renderAssessments);

function renderAssessments() {
  const filter = document.getElementById('status-filter').value;
  const list = document.getElementById('assessments-list');
  const filtered = filter ? allAssessments.filter(a => a.status === filter) : allAssessments;
  list.innerHTML = '';
  for (const a of filtered) {
    const card = document.createElement('div');
    card.className = 'card';
    const badgeClass = STATUS_BADGE[a.status] || 'badge-gray';
    const date = a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : '—';
    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <strong>${a.student_name}</strong>
        <span class="text-gray">(${a.mentor_name})</span>
        <span>Round ${a.round}</span>
        <span class="text-gray">${date}</span>
        <span class="badge ${badgeClass}">${a.status}</span>
        ${a.error_message ? `<span class="text-gray" title="${a.error_message}">⚠ ${a.error_message.slice(0, 60)}</span>` : ''}
        <div style="margin-left:auto;display:flex;gap:6px">
          <a class="btn btn-secondary btn-sm" href="/mentor-review.html?assessment_id=${a.id}">Review</a>
          ${a.status === 'error' ? `<button class="btn btn-secondary btn-sm" onclick="retryAssessment(${a.id})">Retry</button>` : ''}
          ${a.status === 'complete' ? `<button class="btn btn-secondary btn-sm" onclick="regenerateReview(${a.id})">Regenerate AI Review</button>` : ''}
        </div>
      </div>`;
    list.appendChild(card);
  }
}

async function retryAssessment(id) {
  await apiFetch(`/api/assessments/${id}/retry`, { method: 'POST' });
  await loadAll();
}

async function regenerateReview(id) {
  await apiFetch(`/api/assessments/${id}/regenerate-ai-review`, { method: 'POST' });
  showBanner(document.getElementById('banner-area'), 'AI review regenerated.', 'success');
}

// Mentors
function renderMentors() {
  const list = document.getElementById('mentors-list');
  list.innerHTML = '';
  const appUrl = window.location.origin;
  for (const m of allMentors) {
    const myStudents = allStudents.filter(s => s.mentor_id === m.id);
    const details = document.createElement('details');
    details.className = 'card';
    details.innerHTML = `
      <summary>${m.name} — ${m.email}</summary>
      <div style="margin-top:12px">
        <p class="text-gray">Students: ${myStudents.map(s => s.name).join(', ') || 'None'}</p>
        <p class="text-gray mt-16">Dashboard: <a href="${appUrl}/mentor-dashboard.html?mentor_id=${m.id}" target="_blank">${appUrl}/mentor-dashboard.html?mentor_id=${m.id}</a></p>
        <div style="display:flex;gap:12px;margin-top:12px;flex-wrap:wrap">
          <div class="form-group" style="flex:1"><label>Name</label><input type="text" class="edit-mentor-name" value="${m.name}"></div>
          <div class="form-group" style="flex:1"><label>Email</label><input type="email" class="edit-mentor-email" value="${m.email}"></div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="saveMentor(${m.id}, this)">Save</button>
      </div>`;
    list.appendChild(details);
  }
}

async function saveMentor(id, btn) {
  const card = btn.closest('details');
  const name = card.querySelector('.edit-mentor-name').value;
  const email = card.querySelector('.edit-mentor-email').value;
  await apiFetch(`/api/mentors/${id}`, { method: 'PUT', body: { name, email } });
  await loadAll();
}

document.getElementById('add-mentor-btn').addEventListener('click', async () => {
  const name = document.getElementById('new-mentor-name').value.trim();
  const email = document.getElementById('new-mentor-email').value.trim();
  if (!name || !email) return;
  await apiFetch('/api/mentors', { method: 'POST', body: { name, email } });
  document.getElementById('new-mentor-name').value = '';
  document.getElementById('new-mentor-email').value = '';
  await loadAll();
});

// Students
function renderStudents() {
  const mentorSel = document.getElementById('new-student-mentor');
  mentorSel.innerHTML = '';
  for (const m of allMentors) {
    const o = document.createElement('option');
    o.value = m.id; o.textContent = m.name;
    mentorSel.appendChild(o);
  }

  const list = document.getElementById('students-list');
  list.innerHTML = '';
  const sorted = [...allStudents].sort((a, b) => a.name.localeCompare(b.name));
  for (const s of sorted) {
    const mentorName = allMentors.find(m => m.id === s.mentor_id)?.name || '—';
    const details = document.createElement('details');
    details.className = 'card';
    details.innerHTML = `
      <summary>${s.name} — ${mentorName}</summary>
      <div style="margin-top:12px;display:flex;gap:12px;flex-wrap:wrap">
        <div class="form-group" style="flex:1"><label>Name</label><input type="text" class="edit-student-name" value="${s.name}"></div>
        <div class="form-group" style="flex:1"><label>Email</label><input type="email" class="edit-student-email" value="${s.email || ''}"></div>
        <div class="form-group" style="flex:1"><label>Mentor</label>
          <select class="edit-student-mentor">${allMentors.map(m => `<option value="${m.id}" ${m.id === s.mentor_id ? 'selected' : ''}>${m.name}</option>`).join('')}</select>
        </div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="saveStudent(${s.id}, this)">Save</button>`;
    list.appendChild(details);
  }
}

async function saveStudent(id, btn) {
  const card = btn.closest('details');
  const name = card.querySelector('.edit-student-name').value;
  const email = card.querySelector('.edit-student-email').value;
  const mentor_id = parseInt(card.querySelector('.edit-student-mentor').value);
  await apiFetch(`/api/students/${id}`, { method: 'PUT', body: { name, email, mentor_id } });
  await loadAll();
}

document.getElementById('add-student-btn').addEventListener('click', async () => {
  const name = document.getElementById('new-student-name').value.trim();
  const email = document.getElementById('new-student-email').value.trim();
  const mentor_id = parseInt(document.getElementById('new-student-mentor').value);
  if (!name) return;
  await apiFetch('/api/students', { method: 'POST', body: { name, email, mentor_id } });
  document.getElementById('new-student-name').value = '';
  document.getElementById('new-student-email').value = '';
  await loadAll();
});

document.getElementById('bulk-import-btn').addEventListener('click', async () => {
  const text = document.getElementById('bulk-import-text').value.trim();
  const rows = text.split('\n').map(line => {
    const [name, email, mentor_name] = line.split('\t').map(s => s.trim());
    return { name, email, mentor_name };
  }).filter(r => r.name);
  const result = await apiFetch('/api/students/bulk-import', { method: 'POST', body: { rows } });
  document.getElementById('bulk-result').textContent = `Imported ${result.imported}. Skipped: ${result.skipped.join(', ') || 'none'}`;
  await loadAll();
});

// Overview
function renderOverview() {
  const tbody = document.getElementById('overview-body');
  tbody.innerHTML = '';
  const sorted = [...allStudents].sort((a, b) => a.name.localeCompare(b.name));
  for (const s of sorted) {
    const mentorName = allMentors.find(m => m.id === s.mentor_id)?.name || '—';
    const rounds = allAssessments.filter(a => a.student_id === s.id).length;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${s.name}</td><td>${mentorName}</td><td>${rounds}</td>`;
    tbody.appendChild(tr);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add public/admin.html public/js/admin.js
git commit -m "feat: admin dashboard page"
```

---

## Task 16: Transcript + AI Review Pages

**Files:**
- Create: `public/transcript.html`
- Create: `public/js/transcript.js`
- Create: `public/ai-review.html`
- Create: `public/js/ai-review.js`

- [ ] **Step 1: Create public/transcript.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Transcript — Upbuild</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <header><a class="logo" href="/">Upbuild</a></header>
  <main>
    <p id="caption" class="text-gray"></p>
    <hr class="divider">
    <div style="display:flex;gap:8px;margin-bottom:20px">
      <button class="btn btn-secondary btn-sm" id="download-txt">Download .txt</button>
      <a class="btn btn-secondary btn-sm" id="download-docx">Download .docx</a>
    </div>
    <pre id="transcript-content" style="white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.7"></pre>
  </main>
  <script src="/js/api.js"></script>
  <script src="/js/transcript.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create public/js/transcript.js**

```js
const params = new URLSearchParams(location.search);
const assessmentId = params.get('assessment_id');

async function init() {
  const data = await apiFetch(`/api/assessments/${assessmentId}`);
  document.getElementById('caption').textContent = `${data.students.name} — Round ${data.round}`;
  document.getElementById('transcript-content').textContent = data.transcript || '(No transcript available)';

  document.getElementById('download-txt').addEventListener('click', () => {
    const blob = new Blob([data.transcript || ''], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `transcript-${assessmentId}.txt`; a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('download-docx').href = `/api/assessments/${assessmentId}/transcript/docx`;
  document.getElementById('download-docx').download = `transcript-${assessmentId}.docx`;
}

init();
```

- [ ] **Step 3: Create public/ai-review.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Review — Upbuild</title>
  <link rel="stylesheet" href="/css/style.css">
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
</head>
<body>
  <header><a class="logo" href="/">Upbuild</a></header>
  <main>
    <p id="caption" class="text-gray"></p>
    <hr class="divider">
    <div style="display:flex;gap:8px;margin-bottom:20px">
      <button class="btn btn-secondary btn-sm" id="download-txt">Download .txt</button>
      <a class="btn btn-secondary btn-sm" id="download-docx">Download .docx</a>
    </div>
    <div id="review-content" style="line-height:1.7"></div>
  </main>
  <script src="/js/api.js"></script>
  <script src="/js/ai-review.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create public/js/ai-review.js**

```js
const params = new URLSearchParams(location.search);
const assessmentId = params.get('assessment_id');

async function init() {
  const data = await apiFetch(`/api/assessments/${assessmentId}`);
  document.getElementById('caption').textContent = `${data.students.name} — Round ${data.round}`;

  const content = data.ai_reviews?.[0]?.content || '(No AI review available)';
  document.getElementById('review-content').innerHTML = marked.parse(content);

  document.getElementById('download-txt').addEventListener('click', () => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `ai-review-${assessmentId}.txt`; a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('download-docx').href = `/api/assessments/${assessmentId}/ai-review/docx`;
  document.getElementById('download-docx').download = `ai-review-${assessmentId}.docx`;
}

init();
```

- [ ] **Step 5: Commit**

```bash
git add public/transcript.html public/js/transcript.js public/ai-review.html public/js/ai-review.js
git commit -m "feat: transcript and ai-review pages"
```

---

## Task 17: Railway Deployment

**Files:**
- Create: `railway.toml`
- Create: `.gitignore`

- [ ] **Step 1: Create railway.toml**

```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "node server.js"
healthcheckPath = "/"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
.env
uploads/*
!uploads/.gitkeep
```

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add railway.toml .gitignore
git commit -m "feat: railway deployment config"
```

- [ ] **Step 5: Deploy to Railway**

1. Go to [railway.app](https://railway.app) and create a new project
2. Connect your GitHub repo (or use `railway up` CLI)
3. Add all environment variables from `.env.example` in the Railway dashboard
4. Railway will auto-detect Node.js and run `node server.js`
5. Verify the app is live at the Railway-provided URL
6. Update `APP_URL` env var in Railway to match the deployed URL

---

## Self-Review Checklist

- [x] Student submission page with all 9 competency ratings, 6 reflections, duplicate warning, polling — Task 12
- [x] Mentor review with side-by-side ratings table, pre-population, 4 mentor questions — Task 13
- [x] Mentor dashboard with accordion per student, status badges — Task 14
- [x] Admin: 4 tabs, assessments filter, retry/regenerate, inline mentor/student edit, bulk import — Task 15
- [x] Transcript + AI review pages with .txt and .docx download — Task 16
- [x] 9-step processing pipeline with status updates — Task 9
- [x] PDF generation and email on mentor feedback submit — Tasks 10, 9
- [x] All 3 email types (mentor notification, student confirmation, completion) — Task 8
- [x] Google Drive folder creation with student sharing — Task 6
- [x] Admin auth with UUID token, sessionStorage — Tasks 5, 15
- [x] Supabase server-side only — Tasks 2, 3, 4, 5
- [x] ffmpeg-static for Railway compatibility — Tasks 1, 7
- [x] Railway deployment config — Task 17
