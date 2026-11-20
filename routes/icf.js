const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { isAdmin } = require('./admin');
const icf = require('../services/icf');

// Same access as the mentor review page: the assessment's mentor token, or an admin
async function requireMentorAccess(req, res, next) {
  if (isAdmin(req)) return next();
  const token = req.query.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const { data } = await supabase.from('assessments').select('mentor_token').eq('id', req.params.assessmentId).single();
  if (!data || data.mentor_token !== token) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

router.get('/:assessmentId', requireMentorAccess, async (req, res, next) => {
  try {
    const id = parseInt(req.params.assessmentId);
    const [row, { data: assessment, error }] = await Promise.all([
      icf.getRow(id),
      supabase.from('assessments').select('round, students(name)').eq('id', id).single(),
    ]);
    if (error) throw error;
    const { structure } = await icf.getStructure();
    res.json({
      status: row?.status || 'none',
      error_message: row?.error_message || null,
      form: row?.form || null,
      review: row?.review || null,
      generated_at: row?.generated_at || null,
      signed_at: row?.signed_at || null,
      pdf_drive_url: row?.pdf_drive_url || null,
      student_name: assessment.students?.name,
      round: assessment.round,
      structure,
    });
  } catch (err) {
    next(err);
  }
});

router.put('/:assessmentId', requireMentorAccess, async (req, res, next) => {
  try {
    const id = parseInt(req.params.assessmentId);
    const row = await icf.getRow(id);
    if (!row || row.status !== 'draft') return res.status(409).json({ error: row?.status === 'signed' ? 'This form is signed and can no longer be edited.' : 'There is no draft to save.' });
    await icf.saveRow(id, { form: req.body.form, edited: true });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:assessmentId/generate', requireMentorAccess, async (req, res, next) => {
  try {
    const id = parseInt(req.params.assessmentId);
    const row = await icf.getRow(id);
    if (row?.status === 'signed') return res.status(409).json({ error: 'This form is already signed.' });
    // A draft interrupted by a server restart stays 'generating'; allow a retry after 30 minutes
    if (row?.status === 'generating' && Date.now() - new Date(row.updated_at).getTime() < 30 * 60 * 1000) return res.status(409).json({ error: 'A draft is already being generated.' });
    icf.generateIcfDraft(id, { force: true }).catch(err =>
      console.error(`ICF draft failed for assessment ${id}:`, err)
    );
    res.status(202).json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:assessmentId/sign', requireMentorAccess, async (req, res, next) => {
  try {
    const pdfDriveUrl = await icf.signIcfForm(parseInt(req.params.assessmentId), req.body.form);
    res.json({ success: true, pdf_drive_url: pdfDriveUrl });
  } catch (err) {
    if (err.problems) return res.status(400).json({ error: err.message, problems: err.problems });
    next(err);
  }
});

// Word copy of the form as it stands, for mentors who prefer to read or edit offline
router.get('/:assessmentId/docx', requireMentorAccess, async (req, res, next) => {
  try {
    const id = parseInt(req.params.assessmentId);
    const row = await icf.getRow(id);
    if (!row?.form) return res.status(404).json({ error: 'No draft yet.' });
    const { data: assessment } = await supabase.from('assessments').select('round, students(name)').eq('id', id).single();
    const buffer = await icf.buildDocx(row.form);
    const filename = `Mentoring Round ${assessment.round}. ${assessment.students.name}. ICF Session Observation Form${row.status === 'signed' ? '' : ' (DRAFT)'}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
