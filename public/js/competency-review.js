const params = new URLSearchParams(location.search);
const studentId = params.get('student_id');
const mentorId = params.get('mentor_id');
const token = params.get('token');
const API = `/api/competency-review/${studentId}`;
const q = `?token=${encodeURIComponent(token || '')}`;
const DEMONSTRATED = 'Proficiency Demonstrated';

let data = null;
let form = null;
let saveTimer = null;
let readOnly = false;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== false && v !== undefined && v !== null) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return node;
}

function setSaveStatus(text) {
  const s = document.getElementById('save-status');
  if (s) s.textContent = text;
}

function changed() {
  if (readOnly) return;
  setSaveStatus('Saving…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 1200);
  updateThresholdNotes();
}

async function save() {
  try {
    await apiFetch(API + q, { method: 'PUT', body: { form } });
    setSaveStatus('All changes saved');
  } catch (err) {
    setSaveStatus('Not saved');
    showBanner(document.getElementById('banner-area'), `Could not save: ${err.message}`);
  }
}

function autoGrow(ta) {
  ta.style.height = 'auto';
  ta.style.height = `${Math.max(110, ta.scrollHeight + 4)}px`;
}

function textArea(value, onInput) {
  const ta = el('textarea');
  ta.value = value || '';
  ta.addEventListener('input', () => { onInput(ta.value); autoGrow(ta); changed(); });
  requestAnimationFrame(() => autoGrow(ta));
  return ta;
}

function textInput(value, onInput, attrs = {}) {
  const input = el('input', { type: 'text', ...attrs });
  input.value = value || '';
  input.addEventListener('input', () => { onInput(input.value); changed(); });
  return input;
}

function flagBox(flags, title = 'Please review') {
  if (!flags || !flags.length) return null;
  return el('div', { class: 'icf-flags' },
    el('strong', { text: title }),
    el('ul', {}, flags.map(f => el('li', { text: typeof f === 'string' ? f : f.message }))));
}

function checkRow(checked, label, onChange) {
  const box = el('input', { type: 'checkbox' });
  box.checked = !!checked;
  box.addEventListener('change', () => { onChange(box.checked); changed(); });
  return el('label', { class: 'icf-check' }, box, el('span', { text: label }));
}

function radioGroup(name, options, current, onChange, labels = options) {
  return el('div', { class: 'icf-ratings' }, options.map((opt, i) => {
    const r = el('input', { type: 'radio', name, value: String(opt) });
    r.checked = current === opt;
    r.addEventListener('change', () => { onChange(opt); changed(); });
    return el('label', {}, r, el('span', { text: labels[i] }));
  }));
}

function renderSummary() {
  const r = data.review || {};
  const items = [
    ...(r.general || []),
    ...(r.ethics || []).map(f => f.message),
    ...Object.values(r.competencies || {}).flat().map(f => f.message),
    ...(r.feedback || []).map(f => f.message),
  ];
  if (!items.length) return null;
  return el('div', { class: 'card' },
    el('h2', { style: 'margin-top:0', text: 'Items that need your attention' }),
    el('p', { class: 'field-hint', text: 'Missing records, thresholds not yet met, and anything the AI was unsure about. The behavior results come from your signed Session Observation Forms; the AI drafted only the feedback and notes.' }),
    el('ul', {}, items.map(t => el('li', { text: t }))));
}

function renderReflections(s) {
  return el('div', { class: 'card' },
    el('h2', { style: 'margin-top:0', text: 'Client Reflections' }),
    el('p', { class: 'field-hint', text: 'ICF asks you to give your client these prompts before and after the Competency Review session and keep their written responses in the engagement file. The app does not collect them yet.' }),
    el('p', {}, el('strong', { text: 'Pre-Review Reflection: ' }), s.reflections.pre),
    el('p', {}, el('strong', { text: 'Post Review Reflection: ' }), s.reflections.post));
}

function renderAdmin(s) {
  const a = form.admin;
  const field = (key, label, hint) => el('div', { class: 'form-group' },
    el('label', { text: label }), textInput(a[key], v => { a[key] = v; }, { placeholder: hint || '' }));
  return el('div', { class: 'card' },
    el('h2', { style: 'margin-top:0', text: 'Administrative Information' }),
    field('mentorName', 'Mentor Coach Name:'),
    field('mentorEmail', 'Mentor Coach Email:'),
    field('clientName', 'Mentor Coach Client Name:'),
    field('clientEmail', 'Mentor Coach Client Email:'),
    field('reviewSessionDate', 'Date of Competency Skills Review Feedback Session with the Client:', 'Needed before signing'),
    el('div', { class: 'form-group' }, el('label', { text: 'Level of the mentor coaching services provided:' }), radioGroup('level', s.levels, a.level, v => { a.level = v; })),
    el('div', { class: 'form-group' },
      el('label', { text: 'Total hours with the client:' }),
      el('div', { class: 'icf-ratings' },
        el('label', {}, 'Individual ', textInput(a.individualHours, v => { a.individualHours = v; }, { style: 'width:80px' })),
        el('label', {}, 'Group ', textInput(a.groupHours, v => { a.groupHours = v; }, { style: 'width:80px' })),
        el('label', {}, 'Total ', textInput(a.totalHours, v => { a.totalHours = v; }, { style: 'width:80px' }))),
      el('p', { class: 'field-hint', text: 'ICF requires at least 10 hours in total, with at least 3 individual (1:1) hours, over at least three months.' })),
    field('observedSessions', 'Total observed coaching sessions reviewed individually with the client:'));
}

function renderSelfReview(s) {
  return el('div', { class: 'card' },
    el('h2', { style: 'margin-top:0', text: 'Mentor Coach Self-Review Checklist' }),
    s.selfReview.map((item, i) => checkRow(form.selfReview[i], item, v => { form.selfReview[i] = v; })));
}

function renderSessionLog() {
  const rows = form.sessionLog;
  const tbody = el('tbody');
  const draw = () => {
    tbody.innerHTML = '';
    rows.forEach((r, i) => {
      const modality = el('select', {}, ['', 'In-person', 'Virtual', 'Recorded'].map(m => el('option', { value: m, text: m || 'Choose…' })));
      modality.value = r.modality || '';
      modality.addEventListener('change', () => { r.modality = modality.value; changed(); });
      tbody.appendChild(el('tr', {},
        el('td', {}, textInput(r.session, v => { r.session = v; })),
        el('td', {}, textInput(r.date, v => { r.date = v; }, { placeholder: 'Date' })),
        el('td', {}, modality),
        el('td', {}, textInput(r.duration, v => { r.duration = v; }, { placeholder: 'e.g. 45 minutes' })),
        el('td', {}, readOnly ? '' : el('button', { class: 'btn btn-secondary btn-sm', text: 'Remove', onclick: () => { rows.splice(i, 1); draw(); changed(); } }))));
    });
  };
  draw();
  return el('div', { class: 'card' },
    el('h2', { style: 'margin-top:0', text: 'Session Log' }),
    el('p', { class: 'field-hint', text: 'Each observed coaching session you reviewed individually with the client: the date, modality, and duration of each feedback session. Dates come from your signed Session Observation Forms.' }),
    el('div', { class: 'table-wrapper icf-log' }, el('table', {},
      el('thead', {}, el('tr', {}, ['Session #', 'Date', 'Modality', 'Duration (minutes)', ''].map(h => el('th', { text: h })))),
      tbody)),
    readOnly ? null : el('button', { class: 'btn btn-secondary btn-sm mt-16', text: 'Add a session', onclick: () => {
      if (rows.length >= 5) return showBanner(document.getElementById('banner-area'), 'The ICF form has room for 5 sessions.');
      rows.push({ session: '', date: '', modality: '', duration: '' }); draw(); changed();
    } }));
}

function renderEthics(s) {
  const c1 = s.competencies.find(c => c.number === 1);
  const suggested = data.suggested?.ethics;
  return el('div', { class: 'card' },
    el('h2', { style: 'margin-top:0', text: `Competency 1: ${c1.name}` }),
    el('p', { class: 'icf-competency-def', text: `Definition: ${c1.definition}` }),
    flagBox(data.review?.ethics),
    el('p', { text: s.ethicsVerify }),
    radioGroup('ethics', ['Yes', 'No'], form.ethics.verified, v => { form.ethics.verified = v; }),
    suggested ? el('p', { class: 'field-hint', text: `Based on your signed forms: ${suggested === 'Yes' ? 'every session marked both ethics qualifiers Observed' : 'at least one session marked an ethics qualifier Not Observed'}. This is your determination.` }) : null,
    el('div', { class: 'form-group icf-block' }, el('label', { text: s.ethicsNotesLabel }), textArea(form.ethics.notes, v => { form.ethics.notes = v; })));
}

const thresholdNotes = {};
function updateThresholdNotes() {
  for (const c of (data?.structure?.competencies || []).filter(c => c.statements.length)) {
    const note = thresholdNotes[c.number];
    if (!note) continue;
    const count = c.statements.filter(st => form.statements[st.id]?.result === DEMONSTRATED).length;
    note.textContent = `${count} of ${c.statements.length} behaviors marked Proficiency Demonstrated; ICF requires at least ${c.threshold}. ${count >= c.threshold ? 'Threshold met.' : 'Threshold not yet met.'}`;
  }
}

function renderCompetencies(s) {
  const c2 = s.competencies.find(c => c.number === 2);
  const blocks = [el('div', { class: 'card' },
    el('h2', { style: 'margin-top:0', text: `Competency 2: ${c2.name}` }),
    el('p', { class: 'icf-competency-def', text: `Definition: ${c2.definition}` }),
    el('p', { class: 'field-hint', text: 'There are no behavioral statements in this Competency area. Behaviors below are marked Proficiency Demonstrated when at least one of your signed Session Observation Forms rated them Meets or Exceeds the standard.' }))];

  for (const c of s.competencies.filter(c => c.statements.length)) {
    thresholdNotes[c.number] = el('p', { class: 'field-hint' });
    blocks.push(el('div', { class: 'card' },
      el('h2', { style: 'margin-top:0', text: `Competency ${c.number}: ${c.name}` }),
      el('p', { class: 'icf-competency-def', text: `Definition: ${c.definition}` }),
      flagBox(data.review?.competencies?.[c.number]),
      c.statements.map(st => {
        const v = form.statements[st.id] || (form.statements[st.id] = { result: '', sessions: '' });
        return el('div', { class: 'icf-statement' },
          el('h4', { text: `${st.id} ${st.text}` }),
          radioGroup(`res-${st.id}`, s.results, v.result, val => { v.result = val; }),
          el('div', { class: 'form-group' }, el('label', { text: 'Session(s) where demonstrated' }), textInput(v.sessions, val => { v.sessions = val; }, { placeholder: 'e.g. 1, 3' })),
          flagBox(data.review?.statements?.[st.id], 'Note'));
      }),
      el('div', { class: 'icf-threshold' },
        el('strong', { text: `Has the mentor coaching client demonstrated proficiency with at least ${c.threshold} of the statements?` }),
        radioGroup(`th-${c.number}`, ['Yes', 'No'], form.thresholds[c.number], val => { form.thresholds[c.number] = val; },
          ['Yes. Proficiency has been demonstrated', 'No. Proficiency has not yet been demonstrated']),
        thresholdNotes[c.number])));
  }
  return blocks;
}

function renderFeedback(s, section, title) {
  const slots = form[section];
  return el('div', { class: 'card' },
    el('h2', { style: 'margin-top:0', text: title }),
    section === 'strengths' ? el('p', { class: 'field-hint', text: s.cumulativeInstruction }) : null,
    s.competencies.filter(c => c.statements.length).map(c => {
      const item = slots[c.number] || { statements: [], timestamps: '', comments: '' };
      const ensure = () => { slots[c.number] = item; };
      return el('div', { class: 'icf-feedback-slot' },
        el('h4', { text: `Competency ${c.number}: ${c.name}` }),
        el('div', { class: 'icf-statement-picks' },
          el('div', { class: 'field-hint', text: 'Statement for Feedback (leave all unticked to leave this competency blank):' }),
          c.statements.map(st => checkRow((item.statements || []).includes(st.id), `${st.id} ${st.text}`, on => {
            ensure();
            item.statements = on ? [...new Set([...(item.statements || []), st.id])] : (item.statements || []).filter(x => x !== st.id);
          }))),
        el('div', { class: 'form-group' }, el('label', { text: 'Evidence (sessions and timestamps)' }), textInput(item.timestamps, v => { ensure(); item.timestamps = v; })),
        el('div', { class: 'form-group icf-block' }, el('label', { text: 'Feedback Comments:' }), textArea(item.comments, v => { ensure(); item.comments = v; })));
    }));
}

function renderSignoff(s) {
  const so = form.signoff;
  const problemsArea = el('div');
  const signBtn = el('button', { class: 'btn btn-primary', text: 'Approve and sign' });
  signBtn.addEventListener('click', async () => {
    problemsArea.innerHTML = '';
    if (!confirm('Sign this Competency Review? It will be locked and saved as a PDF to the faculty ICF Observation Forms folder. It is not sent to the student.')) return;
    signBtn.disabled = true;
    signBtn.textContent = 'Signing…';
    clearTimeout(saveTimer);
    try {
      const res = await fetch(`${API}/sign${q}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(sessionStorage.getItem('adminToken') ? { Authorization: `Bearer ${sessionStorage.getItem('adminToken')}` } : {}) },
        body: JSON.stringify({ form }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        problemsArea.appendChild(el('div', { class: 'alert alert-error' },
          el('strong', { text: body.error || 'Could not sign.' }),
          body.problems ? el('ul', {}, body.problems.map(p => el('li', { text: p }))) : null));
        signBtn.disabled = false;
        signBtn.textContent = 'Approve and sign';
        return;
      }
      await load();
    } catch (err) {
      showBanner(document.getElementById('banner-area'), err.message);
      signBtn.disabled = false;
      signBtn.textContent = 'Approve and sign';
    }
  });

  const suggestion = data.suggested && [0, 1].includes(data.suggested.determination)
    ? `Based on the thresholds and ethics results in your signed forms, the record points to: “${s.determinations[data.suggested.determination]}” The determination is yours.`
    : '';
  return el('div', { class: 'card' },
    el('h2', { style: 'margin-top:0', text: 'Signatures and Attestations' }),
    el('p', { class: 'field-hint', text: 'The AI never signs or attests for you. Make the final determination yourself after reviewing this form with your mentor coaching client.' }),
    el('p', { text: 'As the mentor coach, select one of the options below that best reflects the mentor coaching client’s demonstrated proficiency at the ACC level.' }),
    radioGroup('determination', [0, 1], so.determination, v => { so.determination = v; }, s.determinations),
    suggestion ? el('p', { class: 'field-hint', text: suggestion }) : null,
    el('p', {}, el('strong', { text: 'Feedback Review Confirmation (Attestation)' })),
    checkRow(so.reviewedWithClient, s.reviewConfirmation, v => { so.reviewedWithClient = v; }),
    checkRow(so.flagsReviewed, 'I have reviewed every item flagged for my attention and made any needed changes.', v => { so.flagsReviewed = v; }),
    el('div', { class: 'form-group' }, el('label', { text: s.signatureLabels[0] }), textInput(so.printedName, v => { so.printedName = v; })),
    el('div', { class: 'form-group' }, el('label', { text: `${s.signatureLabels[1]} (type your full name)` }), textInput(so.signature, v => { so.signature = v; })),
    el('div', { class: 'form-group' }, el('label', { text: s.signatureLabels[2] }), textInput(so.dateSigned, v => { so.dateSigned = v; }, { placeholder: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) })),
    problemsArea,
    readOnly ? null : signBtn);
}

function renderForm() {
  const s = data.structure;
  const content = document.getElementById('content');
  content.innerHTML = '';
  content.className = readOnly ? 'icf-readonly' : '';
  content.style.display = 'block';
  content.append(
    el('div', { class: 'icf-toolbar' },
      el('a', { class: 'btn btn-secondary btn-sm', href: `${API}/docx${q}`, text: 'Download as Word' }),
      readOnly ? null : el('button', { class: 'btn btn-secondary btn-sm', text: 'Regenerate draft', onclick: generate }),
      readOnly ? null : el('span', { id: 'save-status', text: 'All changes saved' })),
    renderSummary() || '',
    renderReflections(s),
    renderAdmin(s),
    renderSelfReview(s),
    renderSessionLog(),
    renderEthics(s),
    ...renderCompetencies(s),
    renderFeedback(s, 'strengths', 'Cumulative Feedback: Areas of Strengths'),
    renderFeedback(s, 'development', 'Cumulative Feedback: Areas for Development'),
    renderSignoff(s));
  updateThresholdNotes();
}

async function generate() {
  if (data.status === 'draft' && !confirm('Replace this draft with a new one built from your signed forms? Your edits on this page will be lost.')) return;
  try {
    await apiFetch(`${API}/generate${q}`, { method: 'POST' });
    await load();
  } catch (err) {
    showBanner(document.getElementById('banner-area'), err.message);
  }
}

async function load() {
  data = await apiFetch(API + q);
  const status = document.getElementById('status-area');
  status.innerHTML = '';
  document.getElementById('page-title').textContent = `ICF Competency Review: ${data.student_name}`;
  const back = mentorId ? el('p', {}, el('a', { href: `/mentor-dashboard.html?mentor_id=${mentorId}&token=${encodeURIComponent(token)}`, text: '← Back to your dashboard' })) : null;
  if (back) status.appendChild(back);
  const e = data.engagement;

  if (data.status === 'none') {
    document.getElementById('content').style.display = 'none';
    status.appendChild(el('div', { class: 'card' },
      el('p', { text: `${e.signedForms} signed ICF Session Observation Form(s) found${e.pendingForms ? `, plus ${e.pendingForms} not yet signed` : ''}.` }),
      e.canGenerate
        ? el('button', { class: 'btn btn-primary', text: 'Generate Competency Review', onclick: generate })
        : el('p', { class: 'field-hint', text: 'The Competency Review can be generated once at least 3 Session Observation Forms are signed.' })));
    return;
  }
  if (data.status === 'generating') {
    document.getElementById('content').style.display = 'none';
    status.appendChild(el('div', { class: 'alert alert-warning', text: 'Preparing the Competency Review from your signed Session Observation Forms. This usually takes a few minutes; this page will update on its own.' }));
    setTimeout(() => load().catch(() => {}), 15000);
    return;
  }
  if (data.status === 'error') {
    status.appendChild(el('div', { class: 'alert alert-error' }, el('strong', { text: 'The draft could not be created. ' }), data.error_message || ''));
    if (e.canGenerate) status.appendChild(el('button', { class: 'btn btn-primary', text: 'Try again', onclick: generate }));
    if (!data.form) return;
  }
  readOnly = data.status === 'signed';
  if (readOnly) {
    status.appendChild(el('div', { class: 'alert alert-success' },
      el('strong', { text: 'Signed. ' }), 'This form is locked. ',
      data.pdf_drive_url ? el('a', { href: data.pdf_drive_url, target: '_blank', text: 'Open the signed PDF' }) : ''));
  }
  form = data.form;
  renderForm();
}

if (!token) {
  showBanner(document.getElementById('banner-area'), 'Access denied. Please use the link from your dashboard.');
} else {
  load().catch(err => showBanner(document.getElementById('banner-area'), err.message));
}
