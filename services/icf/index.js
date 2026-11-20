// ICF Session Observation Form workflow: draft after the mentor submits the Upbuild form,
// mentor reviews and edits, then signs; only then is the PDF made and shared.
const supabase = require('../supabase');
const drive = require('../drive');
const email = require('../email');
const { loadReferences } = require('./reference');
const { parseFormStructure, allStatements, RATING_OPTIONS, ETHICS_OPTIONS, LEVELS } = require('./structure');
const { parseTranscript } = require('./transcript');
const { draftIcfForm, mentorInputs } = require('./draft');
const { fillIcfForm } = require('./fill');

async function getStructure() {
  const references = await loadReferences();
  return { references, structure: parseFormStructure(references.formParagraphs) };
}

async function getRow(assessmentId) {
  const { data, error } = await supabase.from('icf_forms').select('*').eq('assessment_id', assessmentId).maybeSingle();
  if (error) throw error;
  return data;
}

async function saveRow(assessmentId, fields) {
  const { error } = await supabase
    .from('icf_forms')
    .upsert({ assessment_id: assessmentId, ...fields, updated_at: new Date().toISOString() }, { onConflict: 'assessment_id' });
  if (error) throw error;
}

async function loadAssessment(assessmentId) {
  const { data, error } = await supabase
    .from('assessments')
    .select('id, round, transcript, mentor_token, drive_folder_id, students(name, email, mentors(id, name, email, dashboard_token)), mentor_feedback(feedback_text, mentor_ratings)')
    .eq('id', assessmentId)
    .single();
  if (error) throw error;
  return data;
}

// Skips a form the mentor has already edited or signed unless forced (the mentor's Regenerate button)
async function generateIcfDraft(assessmentId, { force = false } = {}) {
  const existing = await getRow(assessmentId);
  if (existing?.status === 'signed') return;
  if (existing?.status === 'generating' && !force) return;
  if (existing?.edited && !force) return;

  await saveRow(assessmentId, { status: 'generating', error_message: null });
  let assessment;
  try {
    assessment = await loadAssessment(assessmentId);
    const student = assessment.students;
    const mentor = student.mentors;
    const feedback = assessment.mentor_feedback?.[0];

    const missing = [];
    if (!assessment.transcript?.trim()) missing.push('the session transcript');
    if (!feedback) missing.push("the mentor's completed Upbuild form");
    if (missing.length) throw new Error(`Cannot draft the ICF form yet: missing ${missing.join(' and ')}.`);

    const { references, structure } = await getStructure();
    const { form, review } = await draftIcfForm({
      structure,
      references,
      parsed: parseTranscript(assessment.transcript),
      mentor: mentorInputs(feedback),
      admin: {
        mentorName: mentor.name || '',
        mentorEmail: mentor.email || '',
        clientName: student.name || '',
        clientEmail: student.email || '',
        sessionDate: '',
        mentorSessionDate: '',
        level: '',
      },
    });

    await saveRow(assessmentId, {
      status: 'draft', form, ai_draft: form, review, edited: false, generated_at: new Date().toISOString(),
    });

    await email.sendIcfDraftReady({
      mentorEmail: mentor.email,
      mentorName: mentor.name,
      studentName: student.name,
      roundNum: assessment.round,
      assessmentId,
      mentorToken: assessment.mentor_token,
    });
  } catch (err) {
    await saveRow(assessmentId, { status: 'error', error_message: err.message }).catch(() => {});
    await email.sendAdminErrorAlert({
      assessmentId,
      studentName: assessment?.students?.name || 'Unknown',
      roundNum: assessment?.round || '?',
      errorMessage: `ICF form draft failed: ${err.message}`,
    }).catch(() => {});
    throw err;
  }
}

// Everything ICF requires before the mentor can sign; returns a list of what is missing
function signOffProblems(form, review, structure) {
  const problems = [];
  const a = form.admin || {};
  const labels = {
    mentorName: 'Mentor Coach Name', mentorEmail: 'Mentor Coach Email', clientName: 'Mentor Coach Client Name',
    clientEmail: 'Mentor Coach Client Email', sessionDate: 'Date of Client’s Coaching Session',
    mentorSessionDate: 'Date of Mentor Coaching Session',
  };
  for (const [key, label] of Object.entries(labels)) if (!String(a[key] || '').trim()) problems.push(`${label} is blank.`);
  if (!LEVELS.includes(a.level)) problems.push('Choose the level of the mentor coaching services provider.');
  if (!(form.selfReview || []).every(Boolean) || (form.selfReview || []).length !== 3) problems.push('Tick all three Mentor Coach Self-Review Checklist items.');

  const e = form.ethics || {};
  if (!ETHICS_OPTIONS.includes(e.q1) || !ETHICS_OPTIONS.includes(e.q2)) problems.push('Choose Observed or Not Observed for both ethics qualifiers.');
  if ((e.q1 === 'Not Observed' || e.q2 === 'Not Observed') && (!String(e.comments || '').trim() || !String(e.standard || '').trim())) {
    problems.push('An ethics qualifier is Not Observed: add context in Comments and name the ICF Code of Ethics standard.');
  }

  for (const s of allStatements(structure)) {
    const v = form.statements?.[s.id] || {};
    if (!RATING_OPTIONS.includes(v.rating)) problems.push(`${s.id}: choose a rating.`);
    if (!String(v.evidence || '').trim()) problems.push(`${s.id}: add evidence of behavior.`);
  }

  const filled = section => Object.values(form[section] || {}).filter(i => (i.statements || []).length && String(i.comments || '').trim()).length;
  if (filled('strengths') < 2) problems.push('Add at least 2 areas of strength (each with a statement and feedback comments).');
  if (filled('development') < 2) problems.push('Add at least 2 areas for development (each with a statement and feedback comments).');

  const s = form.signoff || {};
  if (!(s.attestations || []).every(Boolean) || (s.attestations || []).length !== 4) problems.push('Confirm all four attestations.');
  const hasFlags = Object.values(review?.statements || {}).some(r => r.flags?.length) || review?.ethics?.length || review?.feedback?.length || review?.general?.length;
  if (hasFlags && !s.flagsReviewed) problems.push('Confirm you have reviewed the items the AI flagged.');
  for (const [key, label] of [['printedName', 'Printed name'], ['signature', 'Signature'], ['dateSigned', 'Date signed']]) {
    if (!String(s[key] || '').trim()) problems.push(`${label} is blank.`);
  }
  return problems;
}

async function buildDocx(form) {
  const { references, structure } = await getStructure();
  return fillIcfForm(references.formBuffer, structure, form);
}

async function signIcfForm(assessmentId, form) {
  const row = await getRow(assessmentId);
  if (!row || row.status !== 'draft') {
    const err = new Error(row?.status === 'signed' ? 'This form is already signed.' : 'There is no draft to sign yet.');
    err.status = 409;
    throw err;
  }
  const { structure } = await getStructure();
  const problems = signOffProblems(form, row.review, structure);
  if (problems.length) {
    const err = new Error('The form is not ready to sign.');
    err.status = 400;
    err.problems = problems;
    throw err;
  }

  const assessment = await loadAssessment(assessmentId);
  const student = assessment.students;
  const mentor = student.mentors;
  const name = `Mentoring Round ${assessment.round}. ${student.name}. ICF Session Observation Form`;
  const docx = await buildDocx(form);
  const pdf = await drive.convertDocxToPdf(docx, name);
  const pdfDriveUrl = await drive.uploadBuffer(pdf, assessment.drive_folder_id, `${name}.pdf`, 'application/pdf');

  await saveRow(assessmentId, { status: 'signed', form, signed_at: new Date().toISOString(), pdf_drive_url: pdfDriveUrl });

  await email.sendIcfSigned({
    mentorEmail: mentor.email,
    mentorName: mentor.name,
    studentEmail: student.email || '',
    studentName: student.name,
    roundNum: assessment.round,
    pdfDriveUrl,
  });
  return pdfDriveUrl;
}

module.exports = { generateIcfDraft, signIcfForm, signOffProblems, buildDocx, getRow, saveRow, getStructure };
