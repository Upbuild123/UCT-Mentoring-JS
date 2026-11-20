// ICF Competency Review Form (ACC): rolls up the mentor-signed Session Observation Forms for a
// student's engagement, drafts cumulative feedback, and fills the official form once the mentor signs.
const JSZip = require('jszip');
const OpenAI = require('openai');
const { parseTranscript, asText, normalize } = require('./transcript');
const { tickBox, fillTextControl, appendToParagraph, paragraphText, balancedEnd, escapeXml, cleanRunProps, feedbackStatementLine, feedbackComments } = require('./fill');
const { LEVELS } = require('./structure');
const { statementIds } = require('./draft');

const DEMONSTRATED = 'Proficiency Demonstrated';
const NOT_YET = 'Proficiency Not Yet Demonstrated';
const RESULTS = [DEMONSTRATED, NOT_YET];
const COMPETENT = ['Meets Standard', 'Exceeds Standard'];
const MINIMUM_SESSIONS = 3;
const LOG_ROWS = 5;

function parseReviewStructure(paragraphs) {
  const p = paragraphs;
  const fail = what => { throw new Error(`Could not find ${what} in the ICF Competency Review Form.`); };
  const find = (re, what) => p.find(t => re.test(t)) || fail(what);

  const competencies = [];
  let current = null;
  for (const t of p) {
    if (/^Cumulative Feedback/i.test(t)) break;
    const comp = t.match(/^Competency (\d): (.+)$/);
    if (comp && (!current || current.number !== Number(comp[1]))) {
      current = { number: Number(comp[1]), name: comp[2].trim(), definition: '', statements: [], threshold: null };
      competencies.push(current);
      continue;
    }
    if (!current) continue;
    if (/^Definition:/.test(t) && !current.definition) current.definition = t.replace(/^Definition:\s*/, '');
    const st = t.match(/^(A\d\.\d) (.+)$/);
    if (st) current.statements.push({ id: st[1], text: st[2].trim() });
    const th = t.match(/at least (\d+) of the statements/i);
    if (th) current.threshold = Number(th[1]);
  }
  const rated = competencies.filter(c => c.statements.length);
  if (rated.length !== 6 || rated.some(c => !c.threshold)) fail('the six rated competencies and their thresholds');

  const reflections = {
    pre: find(/^Pre-Review Reflection:/i, 'the pre-review reflection prompt').replace(/^Pre-Review Reflection:\s*/i, ''),
    post: find(/^Post Review Reflection:/i, 'the post-review reflection prompt').replace(/^Post Review Reflection:\s*/i, ''),
  };
  const selfReviewStart = p.findIndex(t => /^Complete this self-review checklist/i.test(t));
  const selfReview = p.slice(selfReviewStart + 1, selfReviewStart + 4).map(t => t.replace(/^☐\s*/, ''));

  return {
    competencies,
    reflections,
    selfReview,
    levels: LEVELS,
    ethicsVerify: find(/^I verify that the client has demonstrated understanding/i, 'the ethics verification').replace(/\s*☐.*$/, ''),
    ethicsNotesLabel: find(/^Notes \(e\.g\., confidentiality/i, 'the ethics notes field'),
    cumulativeInstruction: p[p.findIndex(t => /^Cumulative Feedback/i.test(t)) + 1] || '',
    determinations: p.filter(t => /^☐ The mentor coaching client has (not yet )?demonstrated proficiency in coaching skills/i.test(t)).map(t => t.replace(/^☐\s*/, '')),
    reviewConfirmation: find(/^☐ The mentor coaching client has reviewed this form/i, 'the feedback review confirmation').replace(/^☐\s*/, ''),
    signatureLabels: ['Mentor Coach’s Printed Name:', 'Mentor Coach’s Signature:', 'Date Signed:'],
    results: RESULTS,
  };
}

function allReviewStatements(structure) {
  return structure.competencies.flatMap(c => c.statements.map(s => ({ ...s, competency: c.number })));
}

// sessions: [{ number, round, form }] from signed Session Observation Forms, in round order
function rollUp(structure, sessions) {
  const statements = {};
  for (const s of allReviewStatements(structure)) {
    const demonstratedIn = sessions.filter(x => COMPETENT.includes(x.form.statements?.[s.id]?.rating)).map(x => x.number);
    statements[s.id] = { result: demonstratedIn.length ? DEMONSTRATED : NOT_YET, sessions: demonstratedIn };
  }
  const thresholds = {};
  for (const c of structure.competencies.filter(c => c.statements.length)) {
    const count = c.statements.filter(s => statements[s.id].result === DEMONSTRATED).length;
    thresholds[c.number] = { met: count >= c.threshold, count, required: c.threshold, of: c.statements.length };
  }
  const ethicsAllObserved = sessions.every(x => x.form.ethics?.q1 === 'Observed' && x.form.ethics?.q2 === 'Observed');
  return { statements, thresholds, ethicsAllObserved };
}

const FEEDBACK_SCHEMA = {
  name: 'competency_review_feedback',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['ethics_notes', 'strengths', 'development', 'notes_for_mentor'],
    properties: {
      ethics_notes: { type: 'string' },
      strengths: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['competency', 'statements', 'evidence', 'feedback'],
          properties: {
            competency: { type: 'integer', enum: [3, 4, 5, 6, 7, 8] },
            statements: { type: 'array', items: { type: 'string' } },
            evidence: { type: 'string', description: 'Sessions and timestamps, e.g. "Session 1 (04:12), Session 3 (10:05)".' },
            feedback: { type: 'string' },
          },
        },
      },
      development: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['competency', 'statements', 'evidence', 'observation', 'suggestions'],
          properties: {
            competency: { type: 'integer', enum: [3, 4, 5, 6, 7, 8] },
            statements: { type: 'array', items: { type: 'string' } },
            evidence: { type: 'string' },
            observation: { type: 'string' },
            suggestions: { type: 'string' },
          },
        },
      },
      notes_for_mentor: { type: 'array', items: { type: 'string' } },
    },
  },
};

const SYSTEM_PROMPT = `You help an ICF specialized mentor coach draft the Cumulative Feedback and the Competency 1 notes of the ICF Mentor Coaching Competency Review Form (ACC). The mentor coach reviews, edits, and signs it; you never sign, attest, or make the final determination.

SOURCE OF TRUTH
- The mentor-signed Session Observation Forms are the record. Their behavior ratings are final: never re-rate a behavior, never contradict a signed rating, and never describe a behavior as demonstrated or not demonstrated differently from the roll-up you are given.
- Use the transcripts only to find supporting examples and to write cumulative, engagement-level feedback. Quote transcripts verbatim, with the session number and timestamp (e.g., Session 2, 14:57). Never invent or alter quotes.
- The client's reflections and self-ratings are not inputs.

CUMULATIVE FEEDBACK
- Provide clear, evidence-based feedback for 2-3 competencies as strengths and 2-3 competencies as development areas, as the form requires.
- The form has one strength slot and one development slot per competency (3 to 8), so give each item a different competency within its section.
- Strengths should come from behaviors demonstrated at a competent level, ideally across more than one session. Development areas should come from behaviors not yet demonstrated, or demonstrated only once or inconsistently.
- Do not give strength and development feedback on the same behavioral statement.
- Describe growth across the engagement where the sessions show it (for example, a behavior first rated Below that later met the standard).
- Development feedback is mentoring: explain why the skill matters and give actionable suggestions, ideally a sample question marked "(suggested wording)". Put suggestions in the suggestions field, separate from the observation.
- Write respectfully and neutrally about "the coach," commenting on observable actions and skills, never personality. Use developmental language ("Consider...", "The coach can...", "It may be helpful to..."). Avoid prescriptive phrases ("must," "needs to," "you should") and empty praise. Make no pass/fail or credential-readiness statements; the mentor makes the final determination.
- Use clear, simple, jargon-free language.

COMPETENCY 1 NOTES
- Briefly summarize what the signed forms record about ethical practice across the engagement (e.g., confidentiality, boundaries, the coach role). If any signed form marked a qualifier Not Observed, say so factually and add a note for the mentor.

NOTES FOR THE MENTOR
- List anything the mentor should check: competencies below threshold, behaviors demonstrated in only one session, inconsistencies between forms, or thin evidence.`;

function contextFor(structure, sessions, roll) {
  const lines = [];
  for (const c of structure.competencies.filter(c => c.statements.length)) {
    const t = roll.thresholds[c.number];
    lines.push(`Competency ${c.number}: ${c.name} — ${t.count} of ${t.of} demonstrated (needs at least ${t.required}): ${t.met ? 'threshold met' : 'threshold NOT yet met'}`);
    for (const s of c.statements) {
      const r = roll.statements[s.id];
      const bySession = sessions.map(x => `Session ${x.number}: ${x.form.statements?.[s.id]?.rating || 'not rated'}`).join('; ');
      lines.push(`  ${s.id} ${s.text} => ${r.result}${r.sessions.length ? ` (Session ${r.sessions.join(', ')})` : ''} | ${bySession}`);
    }
  }
  const forms = sessions.map(x => {
    const f = x.form;
    const evidence = Object.entries(f.statements || {}).map(([id, v]) => `${id} [${v.rating}]\n${v.evidence}`).join('\n\n');
    const fb = section => Object.entries(f[section] || {})
      .map(([c, i]) => `Competency ${c} (${(i.statements || []).join(', ')}): ${i.comments}`).join('\n');
    return `=== SESSION ${x.number} (Upbuild Round ${x.round}) — MENTOR-SIGNED SESSION OBSERVATION FORM ===
Ethics: Q1 ${f.ethics?.q1}, Q2 ${f.ethics?.q2}. ${f.ethics?.comments || ''}
${evidence}

Strengths feedback:
${fb('strengths') || '(none)'}

Development feedback:
${fb('development') || '(none)'}`;
  }).join('\n\n');
  const transcripts = sessions.map(x => `=== SESSION ${x.number} TRANSCRIPT ===\n${x.transcriptText || '(no transcript)'}`).join('\n\n');
  return `=== ROLL-UP FROM THE SIGNED FORMS (final; do not change) ===\n${lines.join('\n')}\n\n${forms}\n\n${transcripts}`;
}

// Quoted passages of four or more words that are not marked as suggested wording
function unverifiedQuotes(text, sessions) {
  const haystacks = sessions.map(x => normalize(x.transcriptText || ''));
  const out = [];
  for (const m of String(text || '').matchAll(/"([^"]{12,})"/g)) {
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 25);
    if (/suggested wording/i.test(after) || m[1].split(/\s+/).length < 4) continue;
    const fragments = m[1].split(/\.{3}|…|--/).map(normalize).filter(Boolean);
    if (!haystacks.some(h => fragments.every(f => h.includes(f)))) out.push(m[1]);
  }
  return out;
}

async function draftCompetencyReview({ structure, sessions, admin, pendingRounds }) {
  const roll = rollUp(structure, sessions);
  const general = [];
  const review = { statements: {}, competencies: {}, general, feedback: [], ethics: [] };

  // Records and thresholds the mentor needs to see
  if (sessions.length < MINIMUM_SESSIONS) general.push(`ICF requires at least ${MINIMUM_SESSIONS} observed sessions; only ${sessions.length} signed Session Observation Form(s) were found.`);
  for (const r of pendingRounds) general.push(`Round ${r.round} has an ICF Session Observation Form that is ${r.status === 'draft' ? 'not yet signed' : r.status}, so it is not included. Sign it and regenerate if it should count.`);
  if (sessions.some(x => !x.transcriptText)) general.push('At least one session has no transcript, so feedback for that session relies on the signed form only.');
  const levels = [...new Set(sessions.map(x => x.form.admin?.level).filter(Boolean))];
  if (levels.length > 1) general.push(`The signed forms list different mentor coaching levels (${levels.join(', ')}). Please choose the right one.`);
  general.push('The app does not yet collect the client’s engagement-level Pre-Review and Post Review Reflections for the Competency Review. Give the client these prompts and keep their written responses in the engagement file.');
  for (const [label, value] of [
    ['Date of Competency Skills Review Feedback Session with the Client', admin.reviewSessionDate],
    ['Total hours with the client (individual, group, total)', admin.totalHours],
  ]) if (!value) general.push(`Administrative information needed: ${label} is not stored in the app. Please fill it in.`);
  general.push('Session log: modality and duration of each feedback session are not stored in the app. Please fill them in.');

  for (const c of structure.competencies.filter(c => c.statements.length)) {
    const t = roll.thresholds[c.number];
    if (!t.met) {
      const missing = c.statements.filter(s => roll.statements[s.id].result === NOT_YET).map(s => s.id);
      review.competencies[c.number] = [{ type: 'threshold', message: `Threshold not yet met: ${t.count} of ${t.of} behaviors demonstrated; ICF requires at least ${t.required}. Not yet demonstrated: ${missing.join(', ')}.` }];
    }
  }
  for (const s of allReviewStatements(structure)) {
    if (roll.statements[s.id].sessions.length === 1) review.statements[s.id] = [{ type: 'single', message: `Demonstrated in one session only (Session ${roll.statements[s.id].sessions[0]}).` }];
  }
  if (!roll.ethicsAllObserved) review.ethics.push({ type: 'ethics', message: 'At least one signed Session Observation Form marked an ethics qualifier Not Observed. Review before verifying ethics.' });

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: process.env.ICF_MODEL || 'gpt-5.5',
    reasoning_effort: 'high',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: contextFor(structure, sessions, roll) },
      { role: 'user', content: 'Draft the Competency 1 notes, the Cumulative Feedback (2-3 strengths and 2-3 development areas), and notes for the mentor.' },
    ],
    response_format: { type: 'json_schema', json_schema: FEEDBACK_SCHEMA },
  }, { timeout: 15 * 60 * 1000 });
  const ai = JSON.parse(response.choices[0].message.content);

  const strengths = {};
  const development = {};
  const place = (section, target, item, comments) => {
    item = { ...item, statements: statementIds(item.statements) };
    const entry = { statements: item.statements, timestamps: item.evidence, comments };
    if (target[item.competency]) {
      review.feedback.push({ type: 'slot', message: `Two ${section} items were drafted for Competency ${item.competency}; they were combined.` });
      target[item.competency].statements = [...new Set([...target[item.competency].statements, ...item.statements])];
      target[item.competency].comments += `\n\n${comments}`;
    } else target[item.competency] = entry;
  };
  ai.strengths.forEach(i => place('strength', strengths, i, i.feedback));
  ai.development.forEach(i => place('development', development, i, [i.observation, i.suggestions].filter(Boolean).join('\n\n')));

  if (Object.keys(strengths).length < 2) review.feedback.push({ type: 'minimum', message: 'ICF asks for feedback on 2-3 competencies as strengths.' });
  if (Object.keys(development).length < 2) review.feedback.push({ type: 'minimum', message: 'ICF asks for feedback on 2-3 competencies as development areas.' });
  for (const i of Object.values(strengths)) for (const id of i.statements) {
    if (roll.statements[id]?.result === NOT_YET) review.feedback.push({ type: 'alignment', message: `${id} is drafted as a strength but was not demonstrated in any signed form.` });
  }
  for (const q of unverifiedQuotes([...Object.values(strengths), ...Object.values(development)].map(i => i.comments).join('\n'), sessions)) {
    review.feedback.push({ type: 'quote', message: `Quote not found word for word in the transcripts: "${q}". Check or remove it.` });
  }
  ai.notes_for_mentor.forEach(n => general.push(n));

  const form = {
    admin: { ...admin, level: levels.length === 1 ? levels[0] : '', observedSessions: String(sessions.length) },
    selfReview: [false, false, false],
    sessionLog: sessions.slice(0, LOG_ROWS).map(x => ({
      session: `Session ${x.number} (Round ${x.round})`,
      date: x.form.admin?.mentorSessionDate || '',
      modality: '',
      duration: '',
    })),
    ethics: { verified: '', notes: ai.ethics_notes },
    statements: Object.fromEntries(Object.entries(roll.statements).map(([id, r]) => [id, { result: r.result, sessions: r.sessions.join(', ') }])),
    thresholds: Object.fromEntries(Object.entries(roll.thresholds).map(([c, t]) => [c, t.met ? 'Yes' : 'No'])),
    strengths,
    development,
    signoff: { determination: '', reviewedWithClient: false, flagsReviewed: false, printedName: '', signature: '', dateSigned: '' },
  };
  if (sessions.length > LOG_ROWS) general.push(`The form's session log has ${LOG_ROWS} rows; only the first ${LOG_ROWS} sessions are listed.`);
  return { form, review, suggested: { ethics: roll.ethicsAllObserved ? 'Yes' : 'No', determination: Object.values(roll.thresholds).every(t => t.met) && roll.ethicsAllObserved ? 0 : 1 } };
}

function reviewProblems(form, review, structure) {
  const problems = [];
  const a = form.admin || {};
  for (const [key, label] of [
    ['mentorName', 'Mentor Coach Name'], ['mentorEmail', 'Mentor Coach Email'], ['clientName', 'Mentor Coach Client Name'],
    ['clientEmail', 'Mentor Coach Client Email'], ['reviewSessionDate', 'Date of Competency Skills Review Feedback Session'],
    ['individualHours', 'Total Individual Hours with Client'], ['groupHours', 'Total Group Hours with Client'],
    ['totalHours', 'Total Hours with Client'], ['observedSessions', 'Total observed coaching sessions reviewed individually'],
  ]) if (!String(a[key] || '').trim()) problems.push(`${label} is blank.`);
  if (!LEVELS.includes(a.level)) problems.push('Choose the level of the mentor coaching services provided.');
  if (!(form.selfReview || []).every(Boolean) || (form.selfReview || []).length !== 3) problems.push('Tick all three Mentor Coach Self-Review Checklist items.');
  const log = (form.sessionLog || []).filter(r => Object.values(r).some(v => String(v || '').trim()));
  if (!log.length) problems.push('Add the session log.');
  log.forEach((r, i) => { if (!['session', 'date', 'modality', 'duration'].every(k => String(r[k] || '').trim())) problems.push(`Session log row ${i + 1}: fill in session, date, modality and duration.`); });
  if (!['Yes', 'No'].includes(form.ethics?.verified)) problems.push('Answer Yes or No for the Competency 1 ethics verification.');
  for (const s of allReviewStatements(structure)) if (!RESULTS.includes(form.statements?.[s.id]?.result)) problems.push(`${s.id}: choose Proficiency Demonstrated or Not Yet Demonstrated.`);
  for (const c of structure.competencies.filter(c => c.statements.length)) if (!['Yes', 'No'].includes(form.thresholds?.[c.number])) problems.push(`Competency ${c.number}: answer the threshold question.`);
  const filled = section => Object.values(form[section] || {}).filter(i => (i.statements || []).length && String(i.comments || '').trim()).length;
  if (filled('strengths') < 2) problems.push('Add feedback for at least 2 competencies as strengths.');
  if (filled('development') < 2) problems.push('Add feedback for at least 2 competencies as development areas.');
  const so = form.signoff || {};
  if (![0, 1].includes(so.determination)) problems.push('Select the determination that reflects the client’s demonstrated proficiency.');
  const allMet = Object.values(form.thresholds || {}).every(v => v === 'Yes') && form.ethics?.verified === 'Yes';
  if (so.determination === 0 && !allMet) problems.push('You selected “has demonstrated proficiency” but a competency threshold or the ethics verification is No. Please reconcile them.');
  if (!so.reviewedWithClient) problems.push('Confirm the client has reviewed this form with you and you discussed the feedback in real time.');
  const hasFlags = review && (review.general?.length || review.feedback?.length || review.ethics?.length || Object.keys(review.competencies || {}).length || Object.keys(review.statements || {}).length);
  if (hasFlags && !so.flagsReviewed) problems.push('Confirm you have reviewed the items flagged for you.');
  for (const [k, label] of [['printedName', 'Printed name'], ['signature', 'Signature'], ['dateSigned', 'Date signed']]) if (!String(so[k] || '').trim()) problems.push(`${label} is blank.`);
  return problems;
}

function setCellText(tcXml, value, rPr) {
  if (!value) return tcXml;
  // Empty cells often hold a self-closing paragraph
  tcXml = tcXml.replace(/<w:p( [^>]*)?\/>/, '<w:p$1></w:p>');
  const m = tcXml.match(/<w:p(?: [^>]*[^\/])?>[\s\S]*?<\/w:p>/);
  if (!m) return tcXml;
  const close = m[0].lastIndexOf('</w:p>');
  const para = m[0].slice(0, close) + `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r>` + m[0].slice(close);
  return tcXml.replace(m[0], para);
}

// Fill table rows after the row containing `afterText`, styled like the table's first row of text
function fillTableRows(xml, marker, afterText, rows) {
  const at = xml.indexOf(marker);
  if (at < 0) throw new Error(`The Competency Review Form layout has changed ("${marker}" not found).`);
  const start = xml.lastIndexOf('<w:tbl>', at);
  const end = balancedEnd(xml, start, '<w:tbl>', '</w:tbl>');
  // A floating table makes the following text wrap around it in the PDF; keep it in line
  let table = xml.slice(start, end).replace(/<w:tblpPr [^>]*\/>/g, '');
  const trs = [...table.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)];
  const firstRow = trs.findIndex(tr => paragraphText(tr[0]).includes(afterText)) + 1;
  if (firstRow < 1) throw new Error(`The Competency Review Form layout has changed ("${afterText}" not found).`);
  const textRun = trs[0][0].match(/<w:r(?: [^>]*)?>\s*(<w:rPr>[\s\S]*?<\/w:rPr>)\s*<w:t/);
  const rPr = cleanRunProps(textRun ? textRun[1] : '').replace(/<w:[bi]\/>|<w:[bi]Cs\/>/g, '');
  for (let r = rows.length - 1; r >= 0; r--) {
    const tr = trs[firstRow + r];
    if (!tr) continue;
    const tcs = [...tr[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)];
    let rowXml = tr[0];
    for (let c = tcs.length - 1; c >= 0; c--) {
      rowXml = rowXml.slice(0, tcs[c].index) + setCellText(tcs[c][0], rows[r][c], rPr) + rowXml.slice(tcs[c].index + tcs[c][0].length);
    }
    table = table.slice(0, tr.index) + rowXml + table.slice(tr.index + tr[0].length);
  }
  return xml.slice(0, start) + table + xml.slice(end);
}

// The hours table floats next to item 7 in Word; once it is in line, put it back under item 7
function moveTableAfter(xml, tableMarker, label) {
  const at = xml.indexOf(tableMarker);
  const start = xml.lastIndexOf('<w:tbl>', at);
  const end = balancedEnd(xml, start, '<w:tbl>', '</w:tbl>');
  const table = xml.slice(start, end);
  const rest = xml.slice(0, start) + xml.slice(end);
  const m = [...rest.matchAll(/<w:p(?: [^>]*[^\/])?>[\s\S]*?<\/w:p>/g)].find(p => paragraphText(p[0]).trim().startsWith(label));
  if (!m) return xml;
  const after = m.index + m[0].length;
  return rest.slice(0, after) + table + rest.slice(after);
}

async function fillCompetencyReviewForm(formBuffer, structure, form) {
  const zip = await JSZip.loadAsync(formBuffer);
  let xml = await zip.file('word/document.xml').async('string');
  const statements = allReviewStatements(structure);
  const rated = structure.competencies.filter(c => c.statements.length);

  // 1. Tick-box lines: level, 3 checklist items, ethics, each competency's statements then its threshold, 2 determinations, confirmation
  const lines = [];
  for (const m of xml.matchAll(/<w:p(?: [^>]*[^\/])?>[\s\S]*?<\/w:p>/g)) if (paragraphText(m[0]).includes('☐')) lines.push({ start: m.index, xml: m[0] });
  const expected = 5 + statements.length + rated.length + 3;
  if (lines.length !== expected) throw new Error(`The Competency Review Form layout has changed (expected ${expected} tick-box lines, found ${lines.length}).`);

  const plan = [];
  plan.push({ ticks: [LEVELS.indexOf(form.admin.level)] });
  form.selfReview.forEach(on => plan.push({ ticks: on ? [0] : [] }));
  plan.push({ ticks: [['Yes', 'No'].indexOf(form.ethics.verified)] });
  for (const c of rated) {
    for (const s of c.statements) {
      const v = form.statements[s.id] || {};
      plan.push({ ticks: [RESULTS.indexOf(v.result)], suffix: v.result === DEMONSTRATED && v.sessions ? `Session(s): ${v.sessions}` : '' });
    }
    plan.push({ ticks: [['Yes', 'No'].indexOf(form.thresholds[c.number])] });
  }
  plan.push({ ticks: form.signoff.determination === 0 ? [0] : [] });
  plan.push({ ticks: form.signoff.determination === 1 ? [0] : [] });
  plan.push({ ticks: form.signoff.reviewedWithClient ? [0] : [] });

  for (let i = lines.length - 1; i >= 0; i--) {
    let para = lines[i].xml;
    for (const n of plan[i].ticks) if (n >= 0) para = tickBox(para, n);
    if (plan[i].suffix) para = appendToParagraph(para, `   ${plan[i].suffix}`);
    xml = xml.slice(0, lines[i].start) + para + xml.slice(lines[i].start + lines[i].xml.length);
  }

  // 2. Text fields: Competency 1 notes, then 6 strength and 6 development slots
  const controls = [];
  for (const m of xml.matchAll(/<w:sdt>/g)) {
    const end = balancedEnd(xml, m.index, '<w:sdt>', '</w:sdt>');
    const sdt = xml.slice(m.index, end);
    const pr = sdt.slice(0, sdt.indexOf('</w:sdtPr>'));
    if (pr.includes('w14:checkbox') || sdt.indexOf('<w:sdt>', 1) > 0) continue;
    controls.push({ start: m.index, end });
  }
  const values = [form.ethics.notes || ''];
  for (const section of ['strengths', 'development']) {
    for (const c of [3, 4, 5, 6, 7, 8]) {
      const item = form[section][c] || {};
      values.push(feedbackStatementLine(item, statements), feedbackComments(item).replace(/^Timestamps:/, 'Evidence:'));
    }
  }
  if (controls.length !== values.length) throw new Error(`The Competency Review Form layout has changed (expected ${values.length} text fields, found ${controls.length}).`);
  for (let i = controls.length - 1; i >= 0; i--) {
    const { start, end } = controls[i];
    xml = xml.slice(0, start) + fillTextControl(xml.slice(start, end), values[i]) + xml.slice(end);
  }

  // 3. Tables: hours, then the session log (row 0 is ICF's example)
  const a = form.admin;
  xml = fillTableRows(xml, 'Total Individual', 'Total Individual', [[a.individualHours, a.groupHours, a.totalHours]]);
  xml = moveTableAfter(xml, 'Total Individual', 'Total hours with the client:');
  xml = fillTableRows(xml, 'Example: Session 1', 'Example: Session 1', (form.sessionLog || []).slice(0, LOG_ROWS).map(r => [r.session, r.date, r.modality, r.duration]));

  // 4. Admin and signature lines
  const s = form.signoff;
  for (const [label, value] of [
    ['Mentor Coach Name:', a.mentorName], ['Mentor Coach Email:', a.mentorEmail],
    ['Mentor Coach Client Name:', a.clientName], ['Mentor Coach Client Email:', a.clientEmail],
    ['Date of Competency Skills Review Feedback Session with the Client:', a.reviewSessionDate],
    ['Total observed coaching sessions reviewed individually with the client:', a.observedSessions],
    ['Mentor Coach’s Printed Name:', s.printedName], ['Mentor Coach’s Signature:', s.signature], ['Date Signed:', s.dateSigned],
  ]) {
    const m = [...xml.matchAll(/<w:p(?: [^>]*[^\/])?>[\s\S]*?<\/w:p>/g)]
      .find(p => paragraphText(p[0]).replace(/&#8217;|&apos;/g, '’').replace(/\s+/g, ' ').trim().startsWith(label));
    if (!m) throw new Error(`The Competency Review Form layout has changed ("${label}" not found).`);
    xml = xml.slice(0, m.index) + appendToParagraph(m[0], value) + xml.slice(m.index + m[0].length);
  }

  zip.file('word/document.xml', xml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = {
  parseReviewStructure, rollUp, draftCompetencyReview, reviewProblems, fillCompetencyReviewForm,
  allReviewStatements, unverifiedQuotes, DEMONSTRATED, NOT_YET, MINIMUM_SESSIONS, transcriptForSession: t => (t ? asText(parseTranscript(t)) : ''),
};
