const params = new URLSearchParams(location.search);
const assessmentId = params.get('assessment_id');
const token = params.get('token');
const API = `/api/icf/${assessmentId}`;
const q = `?token=${encodeURIComponent(token || '')}`;

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

function textArea(value, onInput, attrs = {}) {
  const ta = el('textarea', attrs);
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

function radioGroup(name, options, current, onChange) {
  return el('div', { class: 'icf-ratings' }, options.map(opt => {
    const r = el('input', { type: 'radio', name, value: opt });
    r.checked = current === opt;
    r.addEventListener('change', () => { onChange(opt); changed(); });
    return el('label', {}, r, el('span', { text: opt }));
  }));
}

function statementFlags(id) {
  return data.review?.statements?.[id]?.flags || [];
}

function renderSummary() {
  const r = data.review || {};
  const flagged = Object.entries(r.statements || {}).filter(([, v]) => v.flags?.length);
  const general = [...(r.general || []), ...(r.ethics || []).map(f => f.message), ...(r.feedback || []).map(f => f.message)];
  if (!flagged.length && !general.length) return null;
  return el('div', { class: 'card' },
    el('h2', { style: 'margin-top:0', text: 'Items the AI flagged for you' }),
    el('p', { class: 'field-hint', text: 'These are places where the AI was unsure, could not confirm something from the transcript, or where you need to add information. Each one is also shown next to its field below.' }),
    general.length ? el('ul', {}, general.map(g => el('li', { text: typeof g === 'string' ? g : g.message }))) : null,
    flagged.length ? el('p', {},
      el('strong', { text: 'Behaviors with flags: ' }),
      ...flagged.flatMap(([id, v], i) => [
        el('a', { class: 'icf-summary-link', href: `#st-${id.replace('.', '-')}`, text: `${id} (${v.flags.length})` }),
        i < flagged.length - 1 ? ', ' : '',
      ])) : null);
}

function renderAdmin(s) {
  const a = form.admin;
  const fields = [
    ['mentorName', s.adminLabels[0]], ['mentorEmail', s.adminLabels[1]], ['clientName', s.adminLabels[2]],
    ['clientEmail', s.adminLabels[3]], ['sessionDate', s.adminLabels[4]], ['mentorSessionDate', s.adminLabels[5]],
  ];
  return el('div', { class: 'card' },
    el('h2', { style: 'margin-top:0', text: 'Administrative Information' }),
    fields.map(([key, label]) => el('div', { class: 'form-group' },
      el('label', { text: label }),
      textInput(a[key], v => { a[key] = v; }, { placeholder: a[key] ? '' : 'Needed before signing' }))),
    el('div', { class: 'form-group' },
      el('label', { text: s.levelLabel }),
      radioGroup('level', s.levels, a.level, v => { a.level = v; }),
      !a.level ? el('p', { class: 'field-hint', text: 'Not stored in the app. Please choose.' }) : null));
}

function renderSelfReview(s) {
  return el('div', { class: 'card' },
    el('h2', { style: 'margin-top:0', text: 'Mentor Coach Self-Review Checklist' }),
    s.selfReview.map((item, i) => checkRow(form.selfReview[i], item, v => { form.selfReview[i] = v; })));
}

function renderEthics(s) {
  const e = form.ethics;
  const c1 = s.competencies.find(c => c.number === 1);
  return el('div', { class: 'card' },
    el('h2', { style: 'margin-top:0', text: `Competency 1: ${c1.name}` }),
    el('p', { class: 'icf-competency-def', text: `Definition: ${c1.definition}` }),
    flagBox(data.review?.ethics, 'The AI noticed a possible concern'),
    el('div', { class: 'form-group' }, el('label', { text: `Q1. ${s.ethics.q1}` }), radioGroup('q1', s.ethics.options, e.q1, v => { e.q1 = v; })),
    el('div', { class: 'form-group' }, el('label', { text: `Q2. ${s.ethics.q2}` }), radioGroup('q2', s.ethics.options, e.q2, v => { e.q2 = v; })),
    el('p', { class: 'field-hint', text: 'Both default to Observed. ' + s.ethics.commentInstruction }),
    el('div', { class: 'form-group icf-block' }, el('label', { text: 'Comments:' }), textArea(e.comments, v => { e.comments = v; })),
    el('div', { class: 'form-group' },
      el('label', { text: 'ICF Code of Ethics standard (required if either qualifier is Not Observed)' }),
      textInput(e.standard, v => { e.standard = v; })));
}

function renderCompetencies(s) {
  const c2 = s.competencies.find(c => c.number === 2);
  const blocks = [el('div', { class: 'card' },
    el('h2', { style: 'margin-top:0', text: `Competency 2: ${c2.name}` }),
    el('p', { class: 'icf-competency-def', text: `Definition: ${c2.definition}` }),
    el('p', { class: 'field-hint', text: 'There are no behavioral statements in this Competency area.' }))];

  for (const c of s.competencies.filter(c => c.statements.length)) {
    blocks.push(el('div', { class: 'card' },
      el('h2', { style: 'margin-top:0', text: `Competency ${c.number}: ${c.name}` }),
      el('p', { class: 'icf-competency-def', text: `Definition: ${c.definition}` }),
      c.statements.map(st => {
        const v = form.statements[st.id] || (form.statements[st.id] = { rating: '', evidence: '' });
        const r = data.review?.statements?.[st.id] || {};
        return el('div', { class: 'icf-statement', id: `st-${st.id.replace('.', '-')}` },
          el('h4', { text: `${st.id} ${st.text}` }),
          r.startingRating ? el('div', { class: 'icf-starting', text: `Your Competency ${c.number} rating on the Upbuild form: ${r.startingRating}${r.aiRating ? ` · AI draft: ${r.aiRating}` : ''}` }) : null,
          radioGroup(`rating-${st.id}`, s.ratingOptions, v.rating, val => { v.rating = val; }),
          flagBox(statementFlags(st.id)),
          el('div', { class: 'form-group icf-block' }, el('label', { text: 'Evidence of Behavior:' }), textArea(v.evidence, val => { v.evidence = val; })));
      })));
  }
  return blocks;
}

function renderFeedback(s, section, title) {
  const slots = form[section];
  return el('div', { class: 'card' },
    el('h2', { style: 'margin-top:0', text: title }),
    section === 'strengths' ? el('p', { class: 'field-hint', text: s.feedbackInstruction }) : null,
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
        el('div', { class: 'form-group' }, el('label', { text: 'Timestamps' }), textInput(item.timestamps, v => { ensure(); item.timestamps = v; })),
        el('div', { class: 'form-group icf-block' }, el('label', { text: 'Feedback Comments:' }), textArea(item.comments, v => { ensure(); item.comments = v; })));
    }));
}

function renderSignoff(s) {
  const so = form.signoff;
  const problemsArea = el('div');
  const signBtn = el('button', { class: 'btn btn-primary', text: 'Approve and sign' });
  signBtn.addEventListener('click', async () => {
    problemsArea.innerHTML = '';
    if (!confirm('Sign this ICF form? It will be locked, saved as a PDF to the student’s Drive folder, and emailed to the student.')) return;
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

  return el('div', { class: 'card' },
    el('h2', { style: 'margin-top:0', text: 'Mentor Coach Signature' }),
    el('p', { class: 'field-hint', text: 'The AI never signs or attests for you. Confirm each statement yourself after reviewing the form with your mentor coaching client.' }),
    el('p', { text: 'By signing, I attest to the following:' }),
    s.attestations.map((a, i) => checkRow(so.attestations[i], a, v => { so.attestations[i] = v; })),
    checkRow(so.flagsReviewed, 'I have reviewed every item the AI flagged and made any needed changes.', v => { so.flagsReviewed = v; }),
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

  const toolbar = el('div', { class: 'icf-toolbar' },
    el('a', { class: 'btn btn-secondary btn-sm', href: `${API}/docx${q}`, text: 'Download as Word' }),
    readOnly ? null : el('button', { class: 'btn btn-secondary btn-sm', text: 'Regenerate AI draft', onclick: regenerate }),
    readOnly ? null : el('span', { id: 'save-status', text: 'All changes saved' }));

  content.append(
    toolbar,
    renderSummary() || '',
    renderAdmin(s),
    renderSelfReview(s),
    renderEthics(s),
    ...renderCompetencies(s),
    renderFeedback(s, 'strengths', 'Observation Feedback: Areas of Strengths'),
    renderFeedback(s, 'development', 'Observation Feedback: Areas for Development'),
    renderSignoff(s));
}

async function regenerate() {
  if (!confirm('Replace this draft with a new AI draft? Your edits on this page will be lost.')) return;
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
  document.getElementById('page-title').textContent = `ICF Session Observation Form: ${data.student_name}, Round ${data.round}`;

  if (data.status === 'generating' || data.status === 'none') {
    document.getElementById('content').style.display = 'none';
    status.appendChild(el('div', { class: 'alert alert-warning' },
      data.status === 'none'
        ? 'The AI draft has not been started. It is created after you submit the Upbuild mentor form.'
        : 'The AI is drafting the ICF form from your Upbuild form and the transcript. This usually takes a few minutes; this page will update on its own.'));
    if (data.status === 'none') status.appendChild(el('button', { class: 'btn btn-primary', text: 'Generate the ICF draft now', onclick: regenerate }));
    setTimeout(() => load().catch(() => {}), 15000);
    return;
  }
  if (data.status === 'error') {
    status.appendChild(el('div', { class: 'alert alert-error' }, el('strong', { text: 'The AI draft could not be created. ' }), data.error_message || ''));
    status.appendChild(el('button', { class: 'btn btn-primary', text: 'Try again', onclick: regenerate }));
    if (!data.form) return;
  }
  readOnly = data.status === 'signed';
  if (readOnly) {
    status.appendChild(el('div', { class: 'alert alert-success' },
      el('strong', { text: 'Signed. ' }),
      'This form is locked. ',
      data.pdf_drive_url ? el('a', { href: data.pdf_drive_url, target: '_blank', text: 'Open the signed PDF' }) : ''));
  }
  form = data.form;
  renderForm();
}

if (!token) {
  showBanner(document.getElementById('banner-area'), 'Access denied. Please use the link from your email.');
} else {
  load().catch(err => showBanner(document.getElementById('banner-area'), err.message));
}
