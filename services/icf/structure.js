// Reads the ICF form's own wording (competencies, behavioral statements, rating options,
// checklists, attestations) from the paragraphs of the form, so nothing is retyped from memory.

const RATING_OPTIONS = ['Exceeds Standard', 'Meets Standard', 'Below Standard', 'Does Not Meet Standard', 'N/A'];
const ETHICS_OPTIONS = ['Observed', 'Not Observed'];
const LEVELS = ['ACC', 'PCC', 'MCC'];

function between(paragraphs, startPred, endPred) {
  const start = paragraphs.findIndex(startPred);
  if (start < 0) return [];
  const rest = paragraphs.slice(start + 1);
  const end = rest.findIndex(endPred);
  return end < 0 ? rest : rest.slice(0, end);
}

function parseFormStructure(paragraphs) {
  const p = paragraphs;
  const fail = what => { throw new Error(`Could not find ${what} in the ICF form. Check that the reference folder holds the ACC Session Observation Form.`); };

  const title = p[0] || '';
  const revision = (p.find(t => /^rev\./i.test(t)) || '').trim();

  const adminLabels = between(p, t => /^Complete the following administrative information/i.test(t), t => /^Level of the mentor coaching/i.test(t))
    .filter(t => /:$/.test(t) && !/^Note:/i.test(t));
  const levelLabel = p.find(t => /^Level of the mentor coaching/i.test(t)) || fail('the credential level question');

  const selfReview = between(p, t => /^Complete this self-review checklist/i.test(t), t => /^ACC Observed Coaching Behavior/i.test(t))
    .map(t => t.replace(/^☐\s*/, ''));
  if (selfReview.length !== 3) fail('the 3 self-review checklist items');

  const q1 = p.find(t => /^Q1\./.test(t)) || fail('ethics qualifier Q1');
  const q2 = p.find(t => /^Q2\./.test(t)) || fail('ethics qualifier Q2');
  const ethicsCommentInstruction = p.find(t => /^If either of these qualifiers is marked as not observed/i.test(t)) || '';

  const competencies = [];
  let current = null;
  for (let i = 0; i < p.length; i++) {
    const t = p[i];
    if (/^Observation Feedback/i.test(t)) break;
    const comp = t.match(/^Competency (\d): (.+)$/);
    if (comp && (!current || current.number !== Number(comp[1]))) {
      current = { number: Number(comp[1]), name: comp[2].trim(), definition: '', statements: [] };
      competencies.push(current);
      continue;
    }
    if (current && /^Definition:/.test(t) && !current.definition) current.definition = t.replace(/^Definition:\s*/, '');
    const st = t.match(/^(A\d\.\d) (.+)$/);
    if (st && current) current.statements.push({ id: st[1], text: st[2].trim() });
  }
  const rated = competencies.filter(c => c.statements.length);
  const statementCount = rated.reduce((n, c) => n + c.statements.length, 0);
  if (rated.length !== 6 || statementCount !== 20) fail('the 20 behavioral statements (A3.1 to A8.3)');

  const ratingDefinitions = between(p, t => /^For each behavioral statement listed under Competencies 3 through 8/i.test(t), t => /^Directions:/i.test(t));
  const evidenceDirections = between(p, t => /^Directions:/i.test(t), t => /^Competency 3:/.test(t));
  const feedbackInstruction = p.find(t => /^Please provide detailed feedback based on the observed coaching session/i.test(t)) || '';

  const attestations = between(p, t => /^By signing, I attest to the following/i.test(t), t => /^Mentor Coach’s Printed Name/i.test(t));
  if (attestations.length !== 4) fail('the 4 signature attestations');
  const signatureLabels = between(p, t => /^In signing this form/i.test(t), t => /^DIRECTIONS TO COMPLETE/i.test(t));

  return {
    title,
    revision,
    adminLabels,
    levelLabel,
    levels: LEVELS,
    selfReview,
    ethics: {
      q1: q1.replace(/^Q1\.\s*/, ''),
      q2: q2.replace(/^Q2\.\s*/, ''),
      options: ETHICS_OPTIONS,
      commentInstruction: ethicsCommentInstruction,
    },
    competencies,
    ratingOptions: RATING_OPTIONS,
    ratingDefinitions,
    evidenceDirections,
    feedbackInstruction,
    attestations,
    signatureLabels,
  };
}

function allStatements(structure) {
  return structure.competencies.flatMap(c => c.statements.map(s => ({ ...s, competency: c.number, competencyName: c.name })));
}

module.exports = { parseFormStructure, allStatements, RATING_OPTIONS, ETHICS_OPTIONS, LEVELS };
