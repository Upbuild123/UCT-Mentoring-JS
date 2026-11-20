const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { isAdmin } = require('./admin');
const workflow = require('../services/icf/review-workflow');

// The student's mentor (via their dashboard token) or an admin
async function requireStudentMentor(req, res, next) {
  if (isAdmin(req)) return next();
  const token = req.query.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const { data } = await supabase.from('students').select('mentors(dashboard_token)').eq('id', req.params.studentId).single();
  if (!data?.mentors?.dashboard_token || data.mentors.dashboard_token !== token) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

router.get('/:studentId/status', requireStudentMentor, async (req, res, next) => {
  try {
    res.json(await workflow.engagementStatus(parseInt(req.params.studentId)));
  } catch (err) {
    next(err);
  }
});

router.get('/:studentId', requireStudentMentor, async (req, res, next) => {
  try {
    const id = parseInt(req.params.studentId);
    const [row, status, { structure }] = await Promise.all([
      workflow.getReview(id), workflow.engagementStatus(id), workflow.getStructure(),
    ]);
    const { data: student } = await supabase.from('students').select('name').eq('id', id).single();
    res.json({
      status: row?.status || 'none',
      error_message: row?.error_message || null,
      form: row?.form || null,
      review: row?.review || null,
      suggested: row?.suggested || null,
      signed_at: row?.signed_at || null,
      pdf_drive_url: row?.pdf_drive_url || null,
      engagement: status,
      student_name: student?.name,
      structure,
    });
  } catch (err) {
    next(err);
  }
});

router.put('/:studentId', requireStudentMentor, async (req, res, next) => {
  try {
    const id = parseInt(req.params.studentId);
    const row = await workflow.getReview(id);
    if (!row || row.status !== 'draft') return res.status(409).json({ error: row?.status === 'signed' ? 'This Competency Review is signed and can no longer be edited.' : 'There is no draft to save.' });
    await workflow.saveReview(id, { form: req.body.form, edited: true });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:studentId/generate', requireStudentMentor, async (req, res, next) => {
  try {
    const id = parseInt(req.params.studentId);
    const [row, status] = await Promise.all([workflow.getReview(id), workflow.engagementStatus(id)]);
    if (row?.status === 'signed') return res.status(409).json({ error: 'This Competency Review is already signed.' });
    if (row?.status === 'generating') return res.status(409).json({ error: 'A draft is already being generated.' });
    if (!status.canGenerate) return res.status(409).json({ error: `The Competency Review needs at least 3 signed ICF Session Observation Forms; ${status.signedForms} so far.` });
    workflow.generateCompetencyReview(id).catch(err => console.error(`Competency Review draft failed for student ${id}:`, err));
    res.status(202).json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:studentId/sign', requireStudentMentor, async (req, res, next) => {
  try {
    const pdfDriveUrl = await workflow.signCompetencyReview(parseInt(req.params.studentId), req.body.form);
    res.json({ success: true, pdf_drive_url: pdfDriveUrl });
  } catch (err) {
    if (err.problems) return res.status(400).json({ error: err.message, problems: err.problems });
    next(err);
  }
});

router.get('/:studentId/docx', requireStudentMentor, async (req, res, next) => {
  try {
    const id = parseInt(req.params.studentId);
    const row = await workflow.getReview(id);
    if (!row?.form) return res.status(404).json({ error: 'No draft yet.' });
    const { data: student } = await supabase.from('students').select('name').eq('id', id).single();
    const buffer = await workflow.buildDocx(row.form);
    const filename = `Mentoring. ${student.name}. ICF Competency Review Form${row.status === 'signed' ? '' : ' (DRAFT)'}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
