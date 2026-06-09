const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const tokens = new Set();

function isAdmin(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  return tokens.has(token);
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

router.post('/process-reminders', async (req, res, next) => {
  // Accept admin session token or a static cron secret for external schedulers
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = req.query.secret || req.headers['x-cron-secret'];
  if (!isAdmin(req) && !(cronSecret && providedSecret === cronSecret)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const supabase = require('../services/supabase');
    const { sendMentorReminder } = require('../services/email');
    const APP_URL = process.env.APP_URL || 'http://localhost:3000';

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const { data: assessments, error } = await supabase
      .from('assessments')
      .select('id, round, mentor_token, reminders_sent, submitted_at, students(name, mentor_id, mentors(id, name, email, dashboard_token))')
      .eq('status', 'complete')
      .lt('reminders_sent', 2);
    if (error) throw error;

    // Filter to those with no mentor_feedback
    const { data: feedbackIds } = await supabase.from('mentor_feedback').select('assessment_id');
    const hasFeedback = new Set((feedbackIds || []).map(f => f.assessment_id));

    let sent = 0;
    for (const a of assessments) {
      if (hasFeedback.has(a.id)) continue;
      const mentor = a.students?.mentors;
      if (!mentor?.email) continue;

      const isFirst = a.reminders_sent === 0 && a.submitted_at < sevenDaysAgo;
      const isSecond = a.reminders_sent === 1 && a.submitted_at < fourteenDaysAgo;
      if (!isFirst && !isSecond) continue;

      await sendMentorReminder({
        mentorEmail: mentor.email,
        mentorName: mentor.name,
        studentName: a.students.name,
        roundNum: a.round,
        assessmentId: a.id,
        mentorToken: a.mentor_token || '',
        dashboardToken: mentor.dashboard_token || '',
        mentorId: mentor.id,
        reminderNum: a.reminders_sent + 1,
      });
      await supabase.from('assessments').update({ reminders_sent: a.reminders_sent + 1 }).eq('id', a.id);
      sent++;
    }

    res.json({ success: true, sent });
  } catch (err) {
    next(err);
  }
});

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
module.exports.isAdmin = isAdmin;
