// Competency Review workflow for one student's engagement: gather the mentor-signed Session
// Observation Forms, draft the review, let the mentor edit and sign, then file the PDF.
const supabase = require('../supabase');
const drive = require('../drive');
const email = require('../email');
const { loadCompetencyReviewForm } = require('./reference');
const cr = require('./competency-review');

async function getStructure() {
  const ref = await loadCompetencyReviewForm();
  return { formBuffer: ref.formBuffer, structure: cr.parseReviewStructure(ref.formParagraphs) };
}

async function getReview(studentId) {
  const { data, error } = await supabase.from('competency_reviews').select('*').eq('student_id', studentId).maybeSingle();
  if (error) throw error;
  return data;
}

async function saveReview(studentId, fields) {
  const { error } = await supabase
    .from('competency_reviews')
    .upsert({ student_id: studentId, ...fields, updated_at: new Date().toISOString() }, { onConflict: 'student_id' });
  if (error) throw error;
}

async function loadEngagement(studentId) {
  const { data: student, error } = await supabase
    .from('students')
    .select('id, name, email, mentor_id, mentors(id, name, email, dashboard_token)')
    .eq('id', studentId)
    .single();
  if (error) throw error;
  const { data: assessments, error: aErr } = await supabase
    .from('assessments')
    .select('id, round, transcript, drive_folder_id, icf_forms(status, form)')
    .eq('student_id', studentId)
    .order('round');
  if (aErr) throw aErr;
  const signed = [];
  const pending = [];
  for (const a of assessments) {
    const icf = Array.isArray(a.icf_forms) ? a.icf_forms[0] : a.icf_forms;
    if (icf?.status === 'signed') signed.push(a);
    else if (icf) pending.push({ round: a.round, status: icf.status });
  }
  return { student, assessments, signed, pending };
}

// Counts used by the mentor dashboard to decide when to offer the button
async function engagementStatus(studentId) {
  const { signed, pending } = await loadEngagement(studentId);
  const review = await getReview(studentId);
  return {
    signedForms: signed.length,
    pendingForms: pending.length,
    canGenerate: signed.length >= cr.MINIMUM_SESSIONS,
    reviewStatus: review?.status || 'none',
  };
}

async function generateCompetencyReview(studentId) {
  const existing = await getReview(studentId);
  if (existing?.status === 'signed') return;
  await saveReview(studentId, { status: 'generating', error_message: null });
  let student;
  try {
    const engagement = await loadEngagement(studentId);
    student = engagement.student;
    if (engagement.signed.length < cr.MINIMUM_SESSIONS) {
      throw new Error(`The Competency Review needs at least ${cr.MINIMUM_SESSIONS} signed ICF Session Observation Forms; ${engagement.signed.length} found.`);
    }
    const { structure } = await getStructure();
    const sessions = engagement.signed.map((a, i) => {
      const icf = Array.isArray(a.icf_forms) ? a.icf_forms[0] : a.icf_forms;
      return { number: i + 1, round: a.round, assessmentId: a.id, form: icf.form, transcriptText: cr.transcriptForSession(a.transcript) };
    });
    const mentor = student.mentors;
    const { form, review, suggested } = await cr.draftCompetencyReview({
      structure,
      sessions,
      pendingRounds: engagement.pending,
      admin: {
        mentorName: mentor?.name || '', mentorEmail: mentor?.email || '',
        clientName: student.name || '', clientEmail: student.email || '',
        reviewSessionDate: '', individualHours: '', groupHours: '', totalHours: '',
      },
    });
    await saveReview(studentId, {
      status: 'draft', form, ai_draft: form, review, suggested, edited: false,
      source_assessment_ids: sessions.map(s => s.assessmentId), generated_at: new Date().toISOString(),
    });
  } catch (err) {
    await saveReview(studentId, { status: 'error', error_message: err.message }).catch(() => {});
    await email.sendAdminErrorAlert({
      assessmentId: '-', studentName: student?.name || `student ${studentId}`, roundNum: '-',
      errorMessage: `Competency Review draft failed: ${err.message}`,
    }).catch(() => {});
    throw err;
  }
}

async function buildDocx(form) {
  const { formBuffer, structure } = await getStructure();
  return cr.fillCompetencyReviewForm(formBuffer, structure, form);
}

async function signCompetencyReview(studentId, form) {
  const row = await getReview(studentId);
  if (!row || row.status !== 'draft') {
    const err = new Error(row?.status === 'signed' ? 'This Competency Review is already signed.' : 'There is no draft to sign yet.');
    err.status = 409;
    throw err;
  }
  const { structure } = await getStructure();
  const problems = cr.reviewProblems(form, row.review, structure);
  if (problems.length) {
    const err = new Error('The form is not ready to sign.');
    err.status = 400;
    err.problems = problems;
    throw err;
  }
  const { student, assessments } = await loadEngagement(studentId);
  const folderId = assessments.find(a => a.drive_folder_id)?.drive_folder_id;
  if (!folderId) throw new Error('No Drive folder is recorded for this student.');
  const name = `Mentoring. ${student.name}. ICF Competency Review Form`;
  const pdf = await drive.convertDocxToPdf(await buildDocx(form), name);
  const pdfDriveUrl = await drive.uploadBuffer(pdf, folderId, `${name}.pdf`, 'application/pdf');
  await saveReview(studentId, { status: 'signed', form, signed_at: new Date().toISOString(), pdf_drive_url: pdfDriveUrl });
  await email.sendCompetencyReviewSigned({
    mentorEmail: student.mentors?.email,
    studentEmail: student.email || '',
    studentName: student.name,
    pdfDriveUrl,
  });
  return pdfDriveUrl;
}

module.exports = { getStructure, getReview, saveReview, loadEngagement, engagementStatus, generateCompetencyReview, signCompetencyReview, buildDocx };
