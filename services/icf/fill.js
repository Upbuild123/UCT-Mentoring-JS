// Fills the official ICF Word form in place: tick boxes, text fields and the admin and signature
// lines. ICF's wording, order and layout are untouched; only the answers are added.
const JSZip = require('jszip');
const { allStatements, RATING_OPTIONS, ETHICS_OPTIONS, LEVELS } = require('./structure');

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function paragraphText(xml) {
  return [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map(m => m[1]).join('');
}

// Index of the element's matching close tag, allowing nesting
function balancedEnd(xml, start, open, close) {
  let depth = 0;
  const re = new RegExp(`${open}|${close}`, 'g');
  re.lastIndex = start;
  let m;
  while ((m = re.exec(xml))) {
    depth += m[0] === close ? -1 : 1;
    if (depth === 0) return m.index + close.length;
  }
  throw new Error('Malformed form XML');
}

// Tick the n-th box in a paragraph; boxes may be checkbox controls or plain ☐ characters
function tickBox(paraXml, n) {
  let count = -1;
  let pos = -1;
  const re = /☐/g;
  let m;
  while ((m = re.exec(paraXml))) {
    if (++count === n) { pos = m.index; break; }
  }
  if (pos < 0) throw new Error('Tick box not found in the ICF form');
  let out = paraXml.slice(0, pos) + '☒' + paraXml.slice(pos + 1);
  const sdtStart = out.lastIndexOf('<w:sdt>', pos);
  if (sdtStart >= 0 && out.lastIndexOf('</w:sdt>', pos) < sdtStart) {
    const checked = out.lastIndexOf('<w14:checked w14:val="0"/>', pos);
    if (checked > sdtStart) out = out.slice(0, checked) + '<w14:checked w14:val="1"/>' + out.slice(checked + '<w14:checked w14:val="0"/>'.length);
  }
  return out;
}

function cleanRunProps(rPr) {
  return (rPr || '').replace(/<w:rStyle w:val="PlaceholderText"\/>/g, '').replace(/<w:color [^>]*\/>/g, '');
}

function runsFor(text, rPr) {
  const lines = String(text || '').split('\n');
  return lines.map((line, i) =>
    `${i ? `<w:r>${rPr}<w:br/></w:r>` : ''}<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`
  ).join('');
}

// Replace a text content control's placeholder with the given text (blank clears the placeholder)
function fillTextControl(sdtXml, text) {
  const contentStart = sdtXml.indexOf('<w:sdtContent>') + '<w:sdtContent>'.length;
  const contentEnd = sdtXml.lastIndexOf('</w:sdtContent>');
  const content = sdtXml.slice(contentStart, contentEnd);
  const props = sdtXml.slice(0, contentStart).replace('<w:showingPlcHdr/>', '');
  const firstRunProps = (content.match(/<w:r(?: [^>]*)?>\s*(<w:rPr>[\s\S]*?<\/w:rPr>)/) || [])[1];
  const rPr = cleanRunProps(firstRunProps);

  let filled;
  if (/<w:p[ >]/.test(content)) {
    const pPr = (content.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [''])[0];
    const paragraphs = String(text || '').split(/\n{2,}/);
    filled = paragraphs.map(p => `<w:p>${pPr}${runsFor(p, rPr)}</w:p>`).join('');
  } else {
    filled = runsFor(text, rPr);
  }
  return props + filled + sdtXml.slice(contentEnd);
}

// Append a value after a label such as "Mentor Coach Name:"
function appendToParagraph(paraXml, value) {
  if (!value) return paraXml;
  const lastRunProps = cleanRunProps(([...paraXml.matchAll(/<w:rPr>[\s\S]*?<\/w:rPr>/g)].pop() || [''])[0]);
  const end = paraXml.lastIndexOf('</w:p>');
  return paraXml.slice(0, end) + `<w:r>${lastRunProps}<w:t xml:space="preserve"> ${escapeXml(value)}</w:t></w:r>` + paraXml.slice(end);
}

function feedbackStatementLine(item, statements) {
  return (item.statements || [])
    .map(id => statements.find(s => s.id === id))
    .filter(Boolean)
    .map(s => `${s.id} ${s.text}`)
    .join('\n');
}

function feedbackComments(item) {
  const parts = [];
  if (item.timestamps) parts.push(`Timestamps: ${item.timestamps}`);
  if (item.comments) parts.push(item.comments);
  return parts.join('\n\n');
}

async function fillIcfForm(formBuffer, structure, form) {
  const zip = await JSZip.loadAsync(formBuffer);
  let xml = await zip.file('word/document.xml').async('string');
  const statements = allStatements(structure);

  // 1. Tick boxes, line by line: credential level, 3 self-review items, Q1, Q2, then A3.1–A8.3
  const boxParagraphs = [];
  for (const m of xml.matchAll(/<w:p(?: [^>]*[^\/])?>[\s\S]*?<\/w:p>/g)) {
    if (paragraphText(m[0]).includes('☐')) boxParagraphs.push({ start: m.index, xml: m[0] });
  }
  if (boxParagraphs.length !== 6 + statements.length) {
    throw new Error(`The ICF form layout has changed (expected ${6 + statements.length} tick-box lines, found ${boxParagraphs.length}).`);
  }
  const ticks = new Map();
  const tick = (i, n) => { if (n >= 0) ticks.set(i, [...(ticks.get(i) || []), n]); };
  tick(0, LEVELS.indexOf(form.admin.level));
  form.selfReview.forEach((on, i) => on && tick(1 + i, 0));
  tick(4, ETHICS_OPTIONS.indexOf(form.ethics.q1));
  tick(5, ETHICS_OPTIONS.indexOf(form.ethics.q2));
  statements.forEach((s, i) => tick(6 + i, RATING_OPTIONS.indexOf(form.statements[s.id]?.rating)));

  for (let i = boxParagraphs.length - 1; i >= 0; i--) {
    const p = boxParagraphs[i];
    let para = p.xml;
    for (const n of ticks.get(i) || []) para = tickBox(para, n);
    xml = xml.slice(0, p.start) + para + xml.slice(p.start + p.xml.length);
  }

  // 2. Text fields, in order: ethics comments, 20 evidence fields, then 6 strengths and 6 development slots
  const controls = [];
  for (const m of xml.matchAll(/<w:sdt>/g)) {
    const end = balancedEnd(xml, m.index, '<w:sdt>', '</w:sdt>');
    const sdt = xml.slice(m.index, end);
    const pr = sdt.slice(0, sdt.indexOf('</w:sdtPr>'));
    if (pr.includes('w14:checkbox') || sdt.indexOf('<w:sdt>', 1) > 0) continue;
    controls.push({ start: m.index, end });
  }
  const ethicsComments = [
    form.ethics.comments,
    form.ethics.standard ? `ICF Code of Ethics standard: ${form.ethics.standard}` : '',
  ].filter(Boolean).join('\n\n');
  const values = [
    ethicsComments,
    ...statements.map(s => form.statements[s.id]?.evidence || ''),
  ];
  for (const section of ['strengths', 'development']) {
    for (const c of [3, 4, 5, 6, 7, 8]) {
      const item = form[section][c] || {};
      values.push(feedbackStatementLine(item, statements), feedbackComments(item));
    }
  }
  if (controls.length !== values.length) {
    throw new Error(`The ICF form layout has changed (expected ${values.length} text fields, found ${controls.length}).`);
  }
  for (let i = controls.length - 1; i >= 0; i--) {
    const { start, end } = controls[i];
    xml = xml.slice(0, start) + fillTextControl(xml.slice(start, end), values[i]) + xml.slice(end);
  }

  // 3. Admin and signature lines
  const a = form.admin;
  const s = form.signoff;
  const lineValues = [
    ['Mentor Coach Name:', a.mentorName],
    ['Mentor Coach Email:', a.mentorEmail],
    ['Mentor Coach Client Name:', a.clientName],
    ['Mentor Coach Client Email:', a.clientEmail],
    ['Date of Client’s Coaching Session or other Session Identification:', a.sessionDate],
    ['Date of Mentor Coaching Session:', a.mentorSessionDate],
    ['Mentor Coach’s Printed Name:', s.printedName],
    ['Mentor Coach’s Signature:', s.signature],
    ['Date Signed:', s.dateSigned],
  ];
  for (const [label, value] of lineValues) {
    const m = [...xml.matchAll(/<w:p(?: [^>]*[^\/])?>[\s\S]*?<\/w:p>/g)]
      .find(p => paragraphText(p[0]).replace(/&#8217;|&apos;/g, '’').replace(/\s+/g, ' ').trim().startsWith(label));
    if (!m) throw new Error(`The ICF form layout has changed ("${label}" not found).`);
    xml = xml.slice(0, m.index) + appendToParagraph(m[0], value) + xml.slice(m.index + m[0].length);
  }

  zip.file('word/document.xml', xml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { fillIcfForm, tickBox, fillTextControl, appendToParagraph, paragraphText, balancedEnd, escapeXml, cleanRunProps, feedbackStatementLine, feedbackComments };
