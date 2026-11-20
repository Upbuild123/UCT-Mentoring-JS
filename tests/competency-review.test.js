const { parseReviewStructure, rollUp, reviewProblems, unverifiedQuotes, DEMONSTRATED, NOT_YET } = require('../services/icf/competency-review');

jest.mock('../services/supabase', () => ({}));

const COUNTS = [[3, 4, 3], [4, 3, 2], [5, 4, 3], [6, 3, 2], [7, 3, 2], [8, 3, 2]];
const PARAGRAPHS = [
  'Pre-Review Reflection: Take time to reflect and identify the main focus or goal.',
  'Post Review Reflection: Summarize your progress.',
  'Complete this self-review checklist before completing the Mentor Coaching Client Competency Review form:',
  '☐ Item one.', '☐ Item two.', '☐ Item three.',
  'Competency 1: Demonstrates Ethical Practice', 'Definition: Ethics.',
  'I verify that the client has demonstrated understanding and consistent application of coaching ethics during the engagement. ☐ Yes ☐ No',
  'Notes (e.g., confidentiality, boundaries, conflicts of interest):',
  'Competency 2: Embodies a Coaching Mindset', 'Definition: Mindset.',
  ...COUNTS.flatMap(([c, n, t]) => [
    `Competency ${c}: Competency ${c} Name`, `Definition: Def ${c}.`,
    ...Array.from({ length: n }, (_, i) => `A${c}.${i + 1} Statement ${c}.${i + 1}.`),
    `Has the mentor coaching client demonstrated proficiency with at least ${t} of the statements?`,
  ]),
  'Cumulative Feedback', 'Provide feedback for 2-3 competencies.',
  '☐ The mentor coaching client has demonstrated proficiency in coaching skills at the ACC level in each competency area.',
  '☐ The mentor coaching client has not yet demonstrated proficiency in coaching skills at the ACC level in each competency area.',
  '☐ The mentor coaching client has reviewed this form, and we discussed the feedback provided in real time.',
];
const structure = parseReviewStructure(PARAGRAPHS);
const ids = structure.competencies.flatMap(c => c.statements.map(s => s.id));

function sessionForm(ratings, ethics = { q1: 'Observed', q2: 'Observed' }) {
  return { ethics, statements: Object.fromEntries(ids.map(id => [id, { rating: ratings[id] || 'Below Standard' }])) };
}

test('reads the thresholds for each competency from the form', () => {
  expect(structure.competencies.filter(c => c.statements.length).map(c => [c.number, c.threshold])).toEqual([[3, 3], [4, 2], [5, 3], [6, 2], [7, 2], [8, 2]]);
  expect(structure.determinations).toHaveLength(2);
});

test('a behavior is demonstrated if any signed form rates it Meets or Exceeds', () => {
  const sessions = [
    { number: 1, form: sessionForm({ 'A3.1': 'Meets Standard' }) },
    { number: 2, form: sessionForm({ 'A3.1': 'Below Standard', 'A3.2': 'Exceeds Standard' }) },
    { number: 3, form: sessionForm({ 'A3.3': 'Does Not Meet Standard', 'A3.1': 'Meets Standard' }) },
  ];
  const r = rollUp(structure, sessions);
  expect(r.statements['A3.1']).toEqual({ result: DEMONSTRATED, sessions: [1, 3] });
  expect(r.statements['A3.2']).toEqual({ result: DEMONSTRATED, sessions: [2] });
  expect(r.statements['A3.3'].result).toBe(NOT_YET);
  expect(r.statements['A3.4'].result).toBe(NOT_YET);
});

test('applies each competency’s threshold separately', () => {
  const ratings = { 'A3.1': 'Meets Standard', 'A3.2': 'Meets Standard', 'A4.1': 'Meets Standard', 'A4.2': 'Exceeds Standard' };
  const r = rollUp(structure, [{ number: 1, form: sessionForm(ratings) }]);
  expect(r.thresholds[3]).toMatchObject({ met: false, count: 2, required: 3 });
  expect(r.thresholds[4]).toMatchObject({ met: true, count: 2, required: 2 });
});

test('N/A and Below never count as demonstrated', () => {
  const r = rollUp(structure, [{ number: 1, form: sessionForm({ 'A5.4': 'N/A', 'A5.1': 'Below Standard' }) }]);
  expect(r.statements['A5.4'].result).toBe(NOT_YET);
  expect(r.statements['A5.1'].result).toBe(NOT_YET);
});

test('ethics is only suggested Yes when every session observed both qualifiers', () => {
  const sessions = [{ number: 1, form: sessionForm({}) }, { number: 2, form: sessionForm({}, { q1: 'Observed', q2: 'Not Observed' }) }];
  expect(rollUp(structure, sessions).ethicsAllObserved).toBe(false);
});

test('flags quotes that are not in any transcript, but not suggested wording', () => {
  const sessions = [{ transcriptText: '[01:00] Coach: What would you like to focus on today?' }];
  const text = 'The coach asked "what would you like to focus on today" (Session 1, 01:00). Consider "What matters most to you about this?" (suggested wording). Also "the coach said something never said here".';
  expect(unverifiedQuotes(text, sessions)).toEqual(['the coach said something never said here']);
});

describe('sign-off checks', () => {
  function completeForm() {
    return {
      admin: { mentorName: 'M', mentorEmail: 'm@x', clientName: 'C', clientEmail: 'c@x', reviewSessionDate: 'Dec 1', level: 'ACC', individualHours: '3', groupHours: '7', totalHours: '10', observedSessions: '3' },
      selfReview: [true, true, true],
      sessionLog: [{ session: 'Session 1', date: 'Oct 1', modality: 'Virtual', duration: '45' }],
      ethics: { verified: 'Yes', notes: '' },
      statements: Object.fromEntries(ids.map(id => [id, { result: DEMONSTRATED, sessions: '1' }])),
      thresholds: { 3: 'Yes', 4: 'Yes', 5: 'Yes', 6: 'Yes', 7: 'Yes', 8: 'Yes' },
      strengths: { 3: { statements: ['A3.1'], comments: 'x' }, 4: { statements: ['A4.1'], comments: 'x' } },
      development: { 5: { statements: ['A5.4'], comments: 'x' }, 7: { statements: ['A7.3'], comments: 'x' } },
      signoff: { determination: 0, reviewedWithClient: true, flagsReviewed: true, printedName: 'M', signature: 'M', dateSigned: 'Dec 1' },
    };
  }

  test('a complete form can be signed', () => {
    expect(reviewProblems(completeForm(), { general: ['x'] }, structure)).toEqual([]);
  });

  test('the mentor must choose the determination and confirm the review with the client', () => {
    const f = completeForm();
    f.signoff.determination = '';
    f.signoff.reviewedWithClient = false;
    const p = reviewProblems(f, {}, structure).join(' ');
    expect(p).toContain('determination');
    expect(p).toContain('reviewed this form');
  });

  test('“has demonstrated” cannot be signed while a threshold is No', () => {
    const f = completeForm();
    f.thresholds[5] = 'No';
    expect(reviewProblems(f, {}, structure).join(' ')).toContain('reconcile');
  });

  test('incomplete session log rows are reported', () => {
    const f = completeForm();
    f.sessionLog[0].modality = '';
    expect(reviewProblems(f, {}, structure).join(' ')).toContain('Session log row 1');
  });
});
