const { parseTranscript, verifyQuote } = require('../services/icf/transcript');
const { assembleDraft, mentorInputs, NO_TIMESTAMPS } = require('../services/icf/draft');
const { parseFormStructure } = require('../services/icf/structure');
const { signOffProblems } = require('../services/icf');

jest.mock('../services/supabase', () => ({}));

// The ICF form's paragraphs in order, trimmed to what the parser reads
const FORM_PARAGRAPHS = [
  'ICF Mentor Coaching Session Observation Form - ACC', 'rev. 06.18.26',
  'Complete the following administrative information:',
  'Mentor Coach Name:', 'Mentor Coach Email:', 'Mentor Coach Client Name:', 'Mentor Coach Client Email:',
  'Date of Client’s Coaching Session or other Session Identification:',
  'Note: There is no recency requirement for client coaching sessions.',
  'Date of Mentor Coaching Session:', 'Level of the mentor coaching services provider:', '☐ ACC ☐ PCC ☐ MCC',
  'Complete this self-review checklist before completing the Mentor Coaching Session Observation form:',
  '☐ Item one.', '☐ Item two.', '☐ Item three.',
  'ACC Observed Coaching Behavior Performance Level',
  'Competency 1: Demonstrates Ethical Practice', 'Definition: Ethics.',
  'Q1. Coach demonstrates alignment with the ICF Code of Ethics.', 'Q2. Coach is in consistent alignment with the role of a coach.',
  'If either of these qualifiers is marked as not observed. Provide context.',
  'Competency 2: Embodies a Coaching Mindset', 'Definition: Mindset.',
  'For each behavioral statement listed under Competencies 3 through 8, please select the rating',
  'Exceeds the standard (exemplary demonstration).', 'Directions: Below each behavioral statement',
  ...[[3, 4], [4, 3], [5, 4], [6, 3], [7, 3], [8, 3]].flatMap(([c, n]) => [
    `Competency ${c}: Competency ${c} Name`, `Definition: Def ${c}.`,
    ...Array.from({ length: n }, (_, i) => `A${c}.${i + 1} Statement ${c}.${i + 1}`),
  ]),
  'Observation Feedback', 'Please provide detailed feedback based on the observed coaching session.',
  'By signing, I attest to the following:', 'Attest 1.', 'Attest 2.', 'Attest 3.', 'Attest 4.',
  'Mentor Coach’s Printed Name:', 'Mentor Coach’s Signature:', 'Date Signed:', 'DIRECTIONS TO COMPLETE THE SESSION OBSERVATION FORM',
];
const structure = parseFormStructure(FORM_PARAGRAPHS);

const TRANSCRIPT = [
  '[00:05] Coach: What would you like to focus on today?',
  '[00:12] Client: I want to plan my new role and feel less stuck.',
  '[01:30] Coach: What is important to you about that?',
].join('\n');

function statementResult(id, overrides = {}) {
  return {
    id,
    evidence_groups: [{ label: '', items: [{ timestamp: '00:05', speaker: 'Coach', quote: 'What would you like to focus on today?' }] }],
    missing_or_instead: '',
    rating: 'Meets Standard',
    rating_reason: 'Clear and consistent.',
    comment: 'The coach asked about focus (00:05).',
    minimum_skills_item: '',
    borderline_alternative: '',
    borderline_note: '',
    verify_against_recording: '',
    confidence: 'high',
    ...overrides,
  };
}

const allIds = structure.competencies.flatMap(c => c.statements.map(s => s.id));
const mentor = { competencyRatings: { 3: 'Meets Standard', 4: 'Meets Standard', 5: 'Meets Standard', 6: 'Meets Standard', 7: 'Meets Standard', 8: 'Meets Standard' } };
const admin = { mentorName: 'M', mentorEmail: 'm@x.com', clientName: 'C', clientEmail: 'c@x.com', sessionDate: '', mentorSessionDate: '', level: '' };
const feedbackResult = {
  ethics: { q1_concern: '', q2_concern: '', comment: 'Aligned.' },
  strengths: [
    { competency: 3, statements: ['A3.1'], timestamps: ['00:05'], feedback: 'Clear focus question.', mentor_note_used: '' },
    { competency: 4, statements: ['A4.1'], timestamps: ['00:05'], feedback: 'Acknowledged the client.', mentor_note_used: '' },
  ],
  development: [
    { competency: 5, statements: ['A5.4'], timestamps: ['01:30'], observation: 'Little silence.', suggestions: 'Consider pausing.', mentor_note_used: '' },
    { competency: 7, statements: ['A7.3'], timestamps: ['01:30'], observation: 'Stacked questions.', suggestions: 'Consider one question at a time.', mentor_note_used: '' },
  ],
  notes_for_mentor: [],
};

describe('form structure', () => {
  test('reads all 20 behavioral statements in order', () => {
    expect(allIds).toHaveLength(20);
    expect(allIds[0]).toBe('A3.1');
    expect(allIds[19]).toBe('A8.3');
    expect(structure.attestations).toHaveLength(4);
  });
});

describe('transcript', () => {
  test('parses timestamped and untimestamped formats', () => {
    expect(parseTranscript(TRANSCRIPT).turns[1]).toEqual({ timestamp: '00:12', speaker: 'Client', text: 'I want to plan my new role and feel less stuck.' });
    expect(parseTranscript('COACH [00:57] Hello there.').turns[0]).toMatchObject({ timestamp: '00:57', speaker: 'Coach' });
    expect(parseTranscript('Coach: Hi.\nClient: Hello.').hasTimestamps).toBe(false);
  });

  test('finds verbatim quotes, moved quotes, and missing quotes', () => {
    const parsed = parseTranscript(TRANSCRIPT);
    expect(verifyQuote(parsed, { timestamp: '00:12', speaker: 'Client', quote: 'plan my new role' }).status).toBe('ok');
    expect(verifyQuote(parsed, { timestamp: '00:05', speaker: 'Client', quote: 'plan my new role' }).status).toBe('moved');
    expect(verifyQuote(parsed, { timestamp: '00:12', speaker: 'Client', quote: 'plan my exciting new role' }).status).toBe('missing');
    expect(verifyQuote(parsed, { timestamp: '00:12', speaker: 'Client', quote: 'I want to plan ... feel less stuck' }).status).toBe('ok');
  });
});

describe('assembling the draft', () => {
  const build = (results, fb = feedbackResult, transcript = TRANSCRIPT) =>
    assembleDraft({ structure, parsed: parseTranscript(transcript), mentor, admin, statementResults: results, feedbackResult: fb });

  test('fills every statement and defaults ethics to Observed', () => {
    const { form } = build(allIds.map(id => statementResult(id)));
    expect(Object.keys(form.statements)).toHaveLength(20);
    expect(form.statements['A3.1'].evidence).toContain('Coach (00:05): "What would you like to focus on today?"');
    expect(form.ethics).toMatchObject({ q1: 'Observed', q2: 'Observed' });
    expect(form.signoff.attestations).toEqual([false, false, false, false]);
    expect(form.signoff.signature).toBe('');
  });

  test('flags invented quotes and corrects a misplaced timestamp', () => {
    const results = allIds.map(id => statementResult(id));
    results[0] = statementResult('A3.1', { evidence_groups: [{ label: '', items: [
      { timestamp: '00:05', speaker: 'Client', quote: 'plan my new role' },
      { timestamp: '00:12', speaker: 'Client', quote: 'something the client never said' },
    ] }] });
    const { form, review } = build(results);
    const messages = review.statements['A3.1'].flags.map(f => f.message).join(' ');
    expect(messages).toContain('Corrected where a quote appears');
    expect(messages).toContain('Quote not found word for word');
    expect(form.statements['A3.1'].evidence).toContain('Client (00:12): "plan my new role"');
  });

  test('flags a rating that differs from the mentor’s starting rating', () => {
    const results = allIds.map(id => statementResult(id));
    results[2] = statementResult('A3.3', { rating: 'Below Standard', missing_or_instead: 'No question about importance.' });
    const { review } = build(results);
    expect(review.statements['A3.3'].flags.map(f => f.type)).toContain('differs');
  });

  test('flags comment timestamps that are not in the evidence', () => {
    const results = allIds.map(id => statementResult(id, { comment: 'See 12:34.' }));
    const { review } = build(results);
    expect(review.statements['A3.1'].flags.map(f => f.type)).toContain('consistency');
  });

  test('notes missing timestamps and missing admin details', () => {
    const { form, review } = build(allIds.map(id => statementResult(id, { evidence_groups: [{ label: '', items: [{ timestamp: '', speaker: 'Coach', quote: 'Hi.' }] }] })), feedbackResult, 'Coach: Hi.\nClient: Hello.');
    expect(form.statements['A3.1'].evidence.startsWith(NO_TIMESTAMPS)).toBe(true);
    expect(review.general.join(' ')).toContain('no timestamps');
    expect(review.general.join(' ')).toContain('Level of the mentor coaching services provider');
  });

  test('flags fewer than 2 strengths and a statement in both sections', () => {
    const fb = { ...feedbackResult, strengths: [{ ...feedbackResult.strengths[0], statements: ['A5.4'], competency: 5 }] };
    const { review } = build(allIds.map(id => statementResult(id)), fb);
    const types = review.feedback.map(f => f.type);
    expect(types).toContain('minimum');
    expect(types).toContain('overlap');
  });

  test('surfaces ethics concerns without changing Observed', () => {
    const fb = { ...feedbackResult, ethics: { q1_concern: '', q2_concern: 'Said "you should" at 01:30.', comment: '' } };
    const { form, review } = build(allIds.map(id => statementResult(id)), fb);
    expect(form.ethics.q2).toBe('Observed');
    expect(review.ethics[0].message).toContain('you should');
  });
});

describe('mentor inputs', () => {
  test('maps the six Upbuild skills to Competencies 3–8 and ignores old labels', () => {
    const m = mentorInputs({
      mentor_ratings: { 'Establishes and Maintains Agreements': 'Meets Standard', 'Listens Actively': '3. Competent', '10/80/10 Structure': 'Exceeds Standard' },
      feedback_text: { 'Strengths: What did the coach do well in this session?': 'Good questions', 'Development areas: What opportunities were there to improve the coaching?': 'Silence' },
    });
    expect(m.competencyRatings).toEqual({ 3: 'Meets Standard' });
    expect(m.strengths).toBe('Good questions');
    expect(m.development).toBe('Silence');
  });
});

describe('sign-off', () => {
  function completeForm() {
    const { form, review } = assembleDraft({ structure, parsed: parseTranscript(TRANSCRIPT), mentor, admin: { ...admin, sessionDate: 'Oct 1', mentorSessionDate: 'Oct 8', level: 'PCC' }, statementResults: allIds.map(id => statementResult(id)), feedbackResult });
    form.selfReview = [true, true, true];
    form.signoff = { attestations: [true, true, true, true], flagsReviewed: true, printedName: 'M', signature: 'M', dateSigned: 'Nov 1' };
    return { form, review };
  }

  test('a complete, attested form has no problems', () => {
    const { form, review } = completeForm();
    expect(signOffProblems(form, review, structure)).toEqual([]);
  });

  test('cannot sign without attestations, signature, or a rating', () => {
    const { form, review } = completeForm();
    form.signoff.attestations[1] = false;
    form.signoff.signature = '';
    form.statements['A6.2'].rating = '';
    const problems = signOffProblems(form, review, structure).join(' ');
    expect(problems).toContain('attestations');
    expect(problems).toContain('Signature is blank');
    expect(problems).toContain('A6.2: choose a rating');
  });

  test('Not Observed requires comments and the ethics standard', () => {
    const { form, review } = completeForm();
    form.ethics.q1 = 'Not Observed';
    form.ethics.standard = '';
    expect(signOffProblems(form, review, structure).join(' ')).toContain('ICF Code of Ethics standard');
  });
});

describe('transcript edge cases', () => {
  test('reads "COACH: [26:56]" lines and bracketed timestamps in quotes', () => {
    const parsed = parseTranscript('COACH: [26:56] Okay. Can I just ask a question?');
    expect(parsed.turns[0]).toMatchObject({ timestamp: '26:56', speaker: 'Coach', text: 'Okay. Can I just ask a question?' });
    expect(verifyQuote(parsed, { timestamp: '[26:56]', speaker: 'Coach', quote: 'Can I just ask' }).status).toBe('ok');
  });
});
