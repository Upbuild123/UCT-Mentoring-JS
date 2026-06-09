const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const supabase = require('../services/supabase');
const { processAssessment } = require('../services/processor');
const { isAdmin, requireAdmin } = require('./admin');

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024 * 1024 },
});

async function requireMentorAccess(req, res, next) {
  if (isAdmin(req)) return next();
  const token = req.query.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const { data } = await supabase.from('assessments').select('mentor_token').eq('id', req.params.id).single();
  if (!data || data.mentor_token !== token) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

async function requireDashboardAccess(req, res, next) {
  if (isAdmin(req)) return next();
  const token = req.query.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const { data } = await supabase.from('mentors').select('dashboard_token').eq('id', req.params.mentor_id).single();
  if (!data || data.dashboard_token !== token) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

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
    const mentor_token = crypto.randomUUID();
    const { data, error } = await supabase
      .from('assessments')
      .insert({
        student_id: parseInt(student_id),
        round: parseInt(round),
        competency_ratings: JSON.parse(competency_ratings),
        reflections: JSON.parse(reflections),
        status: 'submitted',
        mentor_token,
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

router.get('/all', requireAdmin, async (req, res, next) => {
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

router.get('/by-mentor/:mentor_id', requireDashboardAccess, async (req, res, next) => {
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

router.get('/:id', requireMentorAccess, async (req, res, next) => {
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

router.post('/:id/mentor-feedback', requireMentorAccess, async (req, res, next) => {
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

router.post('/:id/retry', requireAdmin, async (req, res, next) => {
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

router.post('/:id/regenerate-ai-review', requireAdmin, async (req, res, next) => {
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

router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { error } = await supabase.from('assessments').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/transcript/docx', requireMentorAccess, async (req, res, next) => {
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

router.get('/:id/ai-review/docx', requireMentorAccess, async (req, res, next) => {
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
