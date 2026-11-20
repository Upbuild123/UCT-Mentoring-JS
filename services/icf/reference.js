// Loads the ICF form and reference guides from a private Drive folder.
// They are © ICF, so they are kept out of this (public) repository.
const JSZip = require('jszip');
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const drive = require('../drive');

const CACHE_MS = 6 * 60 * 60 * 1000;
let cache = null;

// Matched by file name, so a new revision can be dropped into the folder without code changes
const DOCUMENTS = {
  form: { label: 'ICF Mentor Coaching Session Observation Form – ACC (.docx)', match: f => /observation.?form/i.test(f.name) && /\.docx$/i.test(f.name) },
  bars: { label: 'ACC BARS Resource Guide (.pdf)', match: f => /bars/i.test(f.name) && /\.pdf$/i.test(f.name) },
  feedbackGuide: { label: 'Evaluation Feedback Guide (.pdf)', match: f => /feedback/i.test(f.name) && /\.pdf$/i.test(f.name) },
  minimumSkills: { label: 'ACC Minimum Skills Requirements (.pdf)', match: f => /minimum.?skills/i.test(f.name) && /\.pdf$/i.test(f.name) },
};

function decodeXml(s) {
  return s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// Visible text of each paragraph in document order
function docxParagraphs(documentXml) {
  const paragraphs = [];
  for (const m of documentXml.matchAll(/<w:p(?: [^>]*[^\/])?>[\s\S]*?<\/w:p>/g)) {
    const text = [...m[0].matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g)]
      .map(t => (t[1] === undefined ? ' ' : decodeXml(t[1])))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) paragraphs.push(text);
  }
  return paragraphs;
}

async function loadReferences() {
  if (cache && Date.now() - cache.loadedAt < CACHE_MS) return cache;

  const folderId = process.env.ICF_REFERENCE_FOLDER_ID;
  if (!folderId) throw new Error('ICF_REFERENCE_FOLDER_ID is not set, so the ICF form and reference guides cannot be found.');

  const files = await drive.listFiles(folderId);
  const missing = [];
  const found = {};
  for (const [key, doc] of Object.entries(DOCUMENTS)) {
    const file = files.find(doc.match);
    if (file) found[key] = file;
    else missing.push(doc.label);
  }
  if (missing.length) {
    throw new Error(`Missing from the ICF reference folder: ${missing.join('; ')}`);
  }

  const [formBuffer, barsBuffer, feedbackBuffer, minimumBuffer] = await Promise.all(
    ['form', 'bars', 'feedbackGuide', 'minimumSkills'].map(k => drive.downloadFile(found[k].id))
  );
  const formXml = await (await JSZip.loadAsync(formBuffer)).file('word/document.xml').async('string');
  const [bars, feedbackGuide, minimumSkills] = await Promise.all(
    [barsBuffer, feedbackBuffer, minimumBuffer].map(async b => (await pdfParse(b)).text)
  );

  cache = {
    loadedAt: Date.now(),
    formBuffer,
    formParagraphs: docxParagraphs(formXml),
    bars,
    feedbackGuide,
    minimumSkills,
    fileNames: Object.fromEntries(Object.entries(found).map(([k, f]) => [k, f.name])),
  };
  return cache;
}

// Splits a guide into its general part and one section per competency. The guide's table of
// contents repeats the headings, so the last heading for each competency starts its section.
function sectionsByCompetency(text) {
  const starts = {};
  for (const m of text.matchAll(/^Competency (\d): .*$/gm)) starts[m[1]] = m.index;
  const order = Object.entries(starts).sort((a, b) => a[1] - b[1]);
  const sections = {};
  order.forEach(([n, at], i) => { sections[n] = text.slice(at, i + 1 < order.length ? order[i + 1][1] : text.length).trim(); });
  return { general: order.length ? text.slice(0, order[0][1]).trim() : text, sections };
}

let reviewCache = null;

// The Competency Review Form, from the same private folder
async function loadCompetencyReviewForm() {
  if (reviewCache && Date.now() - reviewCache.loadedAt < CACHE_MS) return reviewCache;
  const folderId = process.env.ICF_REFERENCE_FOLDER_ID;
  if (!folderId) throw new Error('ICF_REFERENCE_FOLDER_ID is not set, so the ICF Competency Review Form cannot be found.');
  const file = (await drive.listFiles(folderId)).find(f => /comp\w*tency.?review/i.test(f.name) && /\.docx$/i.test(f.name));
  if (!file) throw new Error('Missing from the ICF reference folder: ICF Mentor Coaching Competency Review Form – ACC (.docx)');
  const formBuffer = await drive.downloadFile(file.id);
  const formXml = await (await JSZip.loadAsync(formBuffer)).file('word/document.xml').async('string');
  reviewCache = { loadedAt: Date.now(), formBuffer, formParagraphs: docxParagraphs(formXml), fileName: file.name };
  return reviewCache;
}

module.exports = { loadReferences, loadCompetencyReviewForm, sectionsByCompetency, docxParagraphs, decodeXml };
