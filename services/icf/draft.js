// Drafts the ICF ACC Session Observation Form from the mentor's Upbuild form and the transcript,
// then checks the AI's quotes, timestamps and consistency so the mentor sees anything uncertain.
const OpenAI = require('openai');
const { allStatements, RATING_OPTIONS } = require('./structure');
const { verifyQuote, asText, cleanTimestamp } = require('./transcript');
const { SYSTEM_PROMPT, contextMessage, competencyTask, feedbackTask, statementsSchema, FEEDBACK_SCHEMA } = require('./prompt');

const MODEL = () => process.env.ICF_MODEL || 'gpt-5.5';
// How much the model thinks before answering. 'medium' matched a mentor's ratings as well as 'high'
// in testing at about a third of the output tokens; set ICF_REASONING_EFFORT=high to compare.
const REASONING = () => process.env.ICF_REASONING_EFFORT || 'medium';

// Upbuild skills that correspond to ICF Competencies 3–8
const SKILL_TO_COMPETENCY = {
  'Establishes and Maintains Agreements': 3,
  'Cultivates Trust and Safety': 4,
  'Maintains Presence': 5,
  'Listens Actively': 6,
  'Evokes Awareness': 7,
  'Facilitates Client Growth': 8,
};

const NO_TIMESTAMPS = 'No timestamps were recorded in the session.';

// The Upbuild form uses a 1-4 scale; its ratings become the ICF form's starting points
const UPBUILD_TO_ICF = {
  '4. Exceptional': 'Exceeds Standard',
  '3. Competent': 'Meets Standard',
  '2. Emerging': 'Below Standard',
  '1. Not Demonstrated': 'Does Not Meet Standard',
};

function mentorInputs(feedback) {
  const ratings = feedback?.mentor_ratings || {};
  const text = feedback?.feedback_text || {};
  const answer = prefix => Object.entries(text).find(([q]) => q.startsWith(prefix))?.[1] || '';
  const competencyRatings = {};
  for (const [skill, n] of Object.entries(SKILL_TO_COMPETENCY)) {
    const icf = UPBUILD_TO_ICF[ratings[skill]] || (RATING_OPTIONS.includes(ratings[skill]) ? ratings[skill] : null);
    if (icf) competencyRatings[n] = icf;
  }
  return {
    competencyRatings,
    strengths: answer('Strengths:'),
    development: answer('Development areas:'),
    practices: answer('Development practices:'),
  };
}

function addUsage(total, usage) {
  if (!usage) return;
  total.calls += 1;
  total.inputTokens += usage.prompt_tokens || 0;
  total.cachedInputTokens += usage.prompt_tokens_details?.cached_tokens || 0;
  total.outputTokens += usage.completion_tokens || 0;
  total.reasoningTokens += usage.completion_tokens_details?.reasoning_tokens || 0;
}

function newUsage() {
  return { model: MODEL(), reasoning: REASONING(), calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
}

// Drafts are not needed instantly, so use OpenAI's discounted "flex" tier and fall back to the
// standard tier if flex capacity is unavailable
async function createCompletion(client, request) {
  try {
    return await client.chat.completions.create({ ...request, service_tier: 'flex' }, { timeout: 15 * 60 * 1000, maxRetries: 2 });
  } catch (err) {
    if (err.status === 429 || err.status >= 500 || err.name === 'APIConnectionTimeoutError') {
      return client.chat.completions.create(request, { timeout: 15 * 60 * 1000 });
    }
    throw err;
  }
}

async function callModel(client, context, task, schema, usage, cacheKey) {
  const response = await createCompletion(client, {
    model: MODEL(),
    reasoning_effort: REASONING(),
    // Routes all of one draft's calls to the same cache so the shared context is reused
    prompt_cache_key: cacheKey,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: context },
      { role: 'user', content: task },
    ],
    response_format: { type: 'json_schema', json_schema: schema },
  });
  addUsage(usage, response.usage);
  return JSON.parse(response.choices[0].message.content);
}

const TIMESTAMP_IN_TEXT = /\b\d{1,2}:\d{1,2}(?::\d{2})?\b/g;

// The model sometimes returns "A3.2 Coach and client..." instead of "A3.2"
function statementIds(list) {
  return [...new Set((list || []).map(s => (String(s).match(/A\d\.\d/) || [])[0]).filter(Boolean))];
}

function formatEvidence(s, hasTimestamps) {
  const lines = [];
  if (!hasTimestamps) lines.push(NO_TIMESTAMPS);
  const labelled = s.evidence_groups.length > 1 || s.evidence_groups.some(g => g.label);
  for (const group of s.evidence_groups) {
    if (labelled && group.label) lines.push(group.label);
    for (const item of group.items) {
      const who = hasTimestamps && item.timestamp ? `${item.speaker} (${item.timestamp})` : item.speaker;
      lines.push(`${who}: "${item.quote}"`);
    }
  }
  if (s.missing_or_instead) lines.push(`What was missing or happened instead: ${s.missing_or_instead}`);
  const comment = [s.comment, s.minimum_skills_item && !s.comment.includes(s.minimum_skills_item) ? s.minimum_skills_item : '']
    .filter(Boolean).join(' ');
  return `${lines.join('\n')}\n\nComment: ${comment}`;
}

const PROHIBITED = /\b(must|needs to|need to|you should|completely missed|great coaching|nice work|pass(ed|es)?|fail(ed|s)?|ready for (the )?(acc|pcc|mcc|credential)|credential[- ]ready)\b/i;

// Turns the model's answers into the editable form plus the review notes the mentor sees
function assembleDraft({ structure, parsed, mentor, admin, statementResults, feedbackResult }) {
  const statements = allStatements(structure);
  const hasTimestamps = parsed.hasTimestamps;
  const general = [];
  const review = { statements: {}, ethics: [], feedback: [], general };

  if (!hasTimestamps) general.push(`The transcript has no timestamps, so each evidence field says "${NO_TIMESTAMPS}" and quotes could not be located by time.`);
  for (const [label, value] of [
    ['Date of Client’s Coaching Session', admin.sessionDate],
    ['Date of Mentor Coaching Session', admin.mentorSessionDate],
    ['Level of the mentor coaching services provider', admin.level],
  ]) if (!value) general.push(`Administrative information needed: ${label} is not stored in the app. Please fill it in.`);

  const formStatements = {};
  const byId = Object.fromEntries(statementResults.map(s => [s.id, s]));
  for (const st of statements) {
    const s = byId[st.id];
    const flags = [];
    const starting = mentor.competencyRatings[st.competency] || '';
    if (!starting) flags.push({ type: 'input', message: `The mentor's Upbuild form has no ICF-scale rating for Competency ${st.competency}, so this rating comes from the transcript alone.` });
    if (!s) {
      formStatements[st.id] = { rating: '', evidence: '' };
      review.statements[st.id] = { startingRating: starting, aiRating: '', flags: [...flags, { type: 'missing', message: 'The AI did not return a draft for this statement. Please complete it.' }] };
      continue;
    }

    // Check every quote against the transcript; correct a timestamp when the quote sits elsewhere
    for (const group of s.evidence_groups) {
      for (const item of group.items) {
        item.timestamp = cleanTimestamp(item.timestamp);
        const check = verifyQuote(parsed, item);
        if (check.status === 'missing') {
          flags.push({ type: 'quote', message: `Quote not found word for word in the transcript: "${item.quote}"${item.timestamp ? ` (${item.timestamp})` : ''}. Check or remove it.` });
        } else if (check.status === 'moved' || check.status === 'speaker') {
          const was = `${item.speaker} ${item.timestamp || ''}`.trim();
          item.timestamp = check.turn.timestamp || item.timestamp;
          item.speaker = check.turn.speaker || item.speaker;
          flags.push({ type: 'quote', message: `Corrected where a quote appears (was ${was}, now ${item.speaker} ${item.timestamp || ''}): "${item.quote}".` });
        }
        if (!hasTimestamps) item.timestamp = '';
      }
    }

    if (!s.evidence_groups.some(g => g.items.length)) flags.push({ type: 'evidence', message: 'No transcript evidence was listed. Add evidence or confirm the rating.' });
    if (starting && s.rating !== starting) flags.push({ type: 'differs', message: `Your Competency ${st.competency} rating was ${starting}; the draft rates this behavior ${s.rating}. ${s.rating_reason}` });
    if (s.borderline_alternative && s.borderline_alternative !== s.rating) flags.push({ type: 'borderline', message: `Borderline ${s.rating} / ${s.borderline_alternative}. ${s.borderline_note}` });
    if (s.verify_against_recording) flags.push({ type: 'verify', message: `Verify against the recording: ${s.verify_against_recording}` });
    if (s.confidence === 'low') flags.push({ type: 'confidence', message: `Low confidence in this rating. ${s.rating_reason}` });
    if (s.rating === 'N/A') flags.push({ type: 'na', message: 'Rated N/A. ICF allows this only in rare cases where there was no opportunity to demonstrate the behavior. Please confirm.' });
    if (['Below Standard', 'Does Not Meet Standard'].includes(s.rating) && !s.missing_or_instead) flags.push({ type: 'evidence', message: 'Rated below Meets, but the draft does not say what was missing or happened instead.' });
    if (hasTimestamps) {
      const evidenceTimes = new Set(s.evidence_groups.flatMap(g => g.items.map(i => i.timestamp)));
      const stray = [...new Set((s.comment.match(TIMESTAMP_IN_TEXT) || []))].filter(t => !evidenceTimes.has(t));
      if (stray.length) flags.push({ type: 'consistency', message: `The comment cites ${stray.join(', ')}, which is not in the evidence list.` });
    }
    if (PROHIBITED.test(s.comment)) flags.push({ type: 'wording', message: 'The comment may use prescriptive or pass/fail wording. Please review.' });

    formStatements[st.id] = { rating: s.rating, evidence: formatEvidence(s, hasTimestamps) };
    review.statements[st.id] = { startingRating: starting, aiRating: s.rating, reason: s.rating_reason, confidence: s.confidence, flags };
  }

  // Observation Feedback: one slot per competency in each section
  const ratingOf = id => formStatements[id]?.rating;
  const strengths = {};
  const development = {};
  const place = (section, target, item, comments) => {
    item = { ...item, statements: statementIds(item.statements) };
    if (target[item.competency]) {
      review.feedback.push({ type: 'slot', message: `The draft had two ${section} items for Competency ${item.competency}; they were combined. Please review.` });
      target[item.competency].statements = [...new Set([...target[item.competency].statements, ...item.statements])];
      target[item.competency].timestamps = [target[item.competency].timestamps, item.timestamps.join(', ')].filter(Boolean).join(', ');
      target[item.competency].comments += `\n\n${comments}`;
    } else {
      target[item.competency] = { statements: item.statements, timestamps: hasTimestamps ? item.timestamps.join(', ') : '', comments };
    }
  };
  for (const item of feedbackResult.strengths) place('strength', strengths, item, item.feedback);
  for (const item of feedbackResult.development) place('development', development, item, [item.observation, item.suggestions].filter(Boolean).join('\n\n'));

  const strengthCount = Object.keys(strengths).length;
  const developmentCount = Object.keys(development).length;
  if (strengthCount < 2) review.feedback.push({ type: 'minimum', message: `ICF requires at least 2-3 areas of strength; the draft has ${strengthCount}.` });
  if (developmentCount < 2) review.feedback.push({ type: 'minimum', message: `ICF requires at least 2-3 areas for development; the draft has ${developmentCount}.` });
  const strengthIds = Object.values(strengths).flatMap(i => i.statements);
  for (const id of Object.values(development).flatMap(i => i.statements)) {
    if (strengthIds.includes(id)) review.feedback.push({ type: 'overlap', message: `${id} appears in both strengths and development. ICF feedback should not cover the same statement in both.` });
    if (['Exceeds Standard'].includes(ratingOf(id))) review.feedback.push({ type: 'alignment', message: `${id} is a development area but is rated ${ratingOf(id)}.` });
  }
  for (const id of strengthIds) {
    if (['Below Standard', 'Does Not Meet Standard'].includes(ratingOf(id))) review.feedback.push({ type: 'alignment', message: `${id} is listed as a strength but is rated ${ratingOf(id)}.` });
  }
  const feedbackText = [...Object.values(strengths), ...Object.values(development)].map(i => i.comments).join('\n');
  if (PROHIBITED.test(feedbackText.replace(/\(suggested wording\)/gi, ''))) review.feedback.push({ type: 'wording', message: 'The feedback may use prescriptive or pass/fail wording. Please review.' });

  // Ethics: no mentor answers are collected, so both default to Observed; concerns are shown to the mentor
  const { ethics } = feedbackResult;
  if (ethics.q1_concern) review.ethics.push({ type: 'concern', message: `Possible Code of Ethics concern (Q1): ${ethics.q1_concern}` });
  if (ethics.q2_concern) review.ethics.push({ type: 'concern', message: `Possible coach-role concern (Q2): ${ethics.q2_concern}` });
  for (const note of feedbackResult.notes_for_mentor) general.push(note);

  const form = {
    admin,
    selfReview: [false, false, false],
    ethics: { q1: 'Observed', q2: 'Observed', comments: ethics.comment, standard: '' },
    statements: formStatements,
    strengths,
    development,
    signoff: { attestations: [false, false, false, false], flagsReviewed: false, printedName: '', signature: '', dateSigned: '' },
  };
  return { form, review };
}

async function draftIcfForm({ structure, references, parsed, mentor, admin }) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const context = contextMessage({ references, structure, transcriptText: asText(parsed), hasTimestamps: parsed.hasTimestamps, mentor });

  const usage = newUsage();
  const cacheKey = `icf-draft-${require('crypto').randomUUID()}`;
  const rated = structure.competencies.filter(c => c.statements.length);
  const draftCompetency = c => callModel(client, context, competencyTask(c, mentor.competencyRatings[c.number], references), statementsSchema(c.statements.map(s => s.id)), usage, cacheKey);
  // The first call stores the shared context in OpenAI's cache; the rest then reuse it at a lower price
  const first = await draftCompetency(rated[0]);
  const rest = await Promise.all(rated.slice(1).map(draftCompetency));
  const statementResults = [first, ...rest].flatMap(r => r.statements);

  const drafts = statementResults.map(s => ({ id: s.id, rating: s.rating, evidence: s.evidence_groups, comment: s.comment }));
  const feedbackResult = await callModel(client, context, feedbackTask(drafts), FEEDBACK_SCHEMA, usage, cacheKey);

  const result = assembleDraft({ structure, parsed, mentor, admin, statementResults, feedbackResult });
  result.review.usage = usage;
  console.log('ICF draft OpenAI usage:', JSON.stringify(usage));
  return result;
}

module.exports = { draftIcfForm, assembleDraft, mentorInputs, UPBUILD_TO_ICF, statementIds, addUsage, newUsage, createCompletion, SKILL_TO_COMPETENCY, NO_TIMESTAMPS };
