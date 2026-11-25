const path = require('path');
const PDFDocument = require('pdfkit');
const { COMPETENCIES, REFLECTION_QUESTIONS, MENTOR_QUESTIONS, POST_REFLECTION_QUESTIONS } = require('../shared/competencies');

const LOGO = path.join(__dirname, '..', 'public', 'images', 'upbuild-logo.png');
const PURPLE = '#5E328C';
const PURPLE_DARK = '#3F1F63';
const LAVENDER = '#F3EEFA';
const LAVENDER_LINE = '#E2D8F0';
const INK = '#26222B';
const SOFT = '#55505C';
const GRAY = '#8A8490';
const HAIRLINE = '#ECE8F0';

const MARGIN = 56;
const BODY = 10.5;


function newDocument(resolve, reject) {
  const chunks = [];
  const doc = new PDFDocument({ size: 'A4', bufferPages: true, margins: { top: MARGIN, bottom: MARGIN + 10, left: MARGIN, right: MARGIN } });
  doc.on('data', chunk => chunks.push(chunk));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);
  return doc;
}

const contentWidth = doc => doc.page.width - 2 * MARGIN;
const bottom = doc => doc.page.height - MARGIN - 10;

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';
}

function header(doc, eyebrow, title, details) {
  const width = contentWidth(doc);
  doc.image(LOGO, MARGIN, MARGIN - 8, { width: 124 });
  doc.font('Helvetica').fontSize(8.5).fillColor(GRAY)
    .text('UCT Mentoring Program', MARGIN, MARGIN + 2, { width, align: 'right', characterSpacing: 0.3 });

  doc.font('Helvetica-Bold').fontSize(9).fillColor(PURPLE)
    .text(eyebrow.toUpperCase(), MARGIN, MARGIN + 52, { characterSpacing: 1.6 });
  doc.font('Helvetica-Bold').fontSize(24).fillColor(PURPLE_DARK).text(title, MARGIN, doc.y + 4, { width });

  // Summary card with one column per detail
  const top = doc.y + 16;
  const h = 54;
  doc.roundedRect(MARGIN, top, width, h, 8).fill(LAVENDER);
  const col = width / details.length;
  details.forEach(([label, value], i) => {
    const x = MARGIN + 18 + i * col;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(GRAY).text(label.toUpperCase(), x, top + 13, { width: col - 24, characterSpacing: 1 });
    doc.font('Helvetica').fontSize(11).fillColor(INK).text(value, x, top + 27, { width: col - 24, lineBreak: false, ellipsis: true });
  });
  doc.x = MARGIN;
  doc.y = top + h + 8;
}

function sectionHeading(doc, text) {
  if (doc.y > bottom(doc) - 90) doc.addPage();
  doc.y += 22;
  const y = doc.y;
  doc.rect(MARGIN, y + 1, 3, 13).fill(PURPLE);
  doc.font('Helvetica-Bold').fontSize(13).fillColor(PURPLE_DARK).text(text, MARGIN + 11, y, { width: contentWidth(doc) - 11 });
  doc.y += 10;
}

// Every rating gets the same soft purple badge
function badge(doc, text, x, centerY) {
  if (!text || text === '—') {
    doc.font('Helvetica').fontSize(9.5).fillColor(GRAY).text('—', x, centerY - 5, { lineBreak: false });
    return;
  }
  doc.font('Helvetica-Bold').fontSize(8.5);
  const w = doc.widthOfString(text) + 16;
  doc.roundedRect(x, centerY - 9, w, 18, 9).fill('#EFE8F8');
  doc.fillColor(PURPLE).text(text, x + 8, centerY - 4, { lineBreak: false });
}

function ratingsTable(doc, coachRatings, mentorRatings) {
  const width = contentWidth(doc);
  const nameW = width * 0.46;
  const colW = width * 0.27;
  const rowH = 27;
  let y = doc.y;

  const ensureRoom = h => { if (y + h > bottom(doc)) { doc.addPage(); y = doc.y; } };

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(GRAY);
  doc.text('COMPETENCY', MARGIN + 12, y, { characterSpacing: 1, lineBreak: false });
  doc.text('COACH', MARGIN + nameW, y, { characterSpacing: 1, lineBreak: false });
  doc.text('MENTOR', MARGIN + nameW + colW, y, { characterSpacing: 1, lineBreak: false });
  y += 16;

  let category = null;
  for (const comp of COMPETENCIES) {
    if (comp.category !== category) {
      category = comp.category;
      ensureRoom(rowH * 2);
      doc.roundedRect(MARGIN, y, width, 22, 5).fill(LAVENDER);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(PURPLE)
        .text(category.toUpperCase(), MARGIN + 12, y + 7, { characterSpacing: 1.2, lineBreak: false });
      y += 22;
    }
    ensureRoom(rowH);
    const mid = y + rowH / 2;
    doc.font('Helvetica').fontSize(10).fillColor(INK).text(comp.name, MARGIN + 12, mid - 5, { width: nameW - 20, lineBreak: false, ellipsis: true });
    badge(doc, String(coachRatings[comp.name] || '—'), MARGIN + nameW, mid);
    badge(doc, String(mentorRatings[comp.name] || '—'), MARGIN + nameW + colW, mid);
    y += rowH;
    doc.moveTo(MARGIN + 12, y).lineTo(MARGIN + width, y).strokeColor(HAIRLINE).lineWidth(0.6).stroke();
  }
  doc.x = MARGIN;
  doc.y = y;
}

// Questions in the order the form asks them (stored answers do not keep their order)
function questionsInOrder(answers, order) {
  const keys = Object.keys(answers || {});
  return [...order.filter(q => keys.includes(q)), ...keys.filter(k => !order.includes(k))];
}

function questionBlocks(doc, answers, order) {
  const width = contentWidth(doc);
  for (const question of questionsInOrder(answers, order)) {
    const answer = String(answers[question] || '').trim() || 'No answer given.';
    // Split "Strengths: What ..." into a short label and the question
    const m = question.match(/^([^:?]{2,30}):\s*(.+)$/);
    const label = m ? m[1] : null;
    const prompt = m ? m[2] : question;

    doc.font('Helvetica').fontSize(BODY);
    const answerH = doc.heightOfString(answer, { width: width - 18, lineGap: 3.5 });
    doc.font('Helvetica-Bold').fontSize(10);
    const promptH = doc.heightOfString(prompt, { width });
    if (doc.y + (label ? 14 : 0) + promptH + Math.min(answerH, 60) + 24 > bottom(doc)) doc.addPage();

    doc.y += 14;
    if (label) {
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(PURPLE).text(label.toUpperCase(), MARGIN, doc.y, { characterSpacing: 1.2 });
      doc.y += 3;
    }
    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(prompt, MARGIN, doc.y, { width });
    doc.y += 6;
    const top = doc.y;
    doc.font('Helvetica').fontSize(BODY).fillColor(answers[question] ? SOFT : GRAY)
      .text(answer, MARGIN + 14, top, { width: width - 18, lineGap: 3.5 });
    // Accent line beside the answer (drawn per page if the answer breaks across pages)
    if (doc.y > top) doc.rect(MARGIN + 2, top + 1, 2, doc.y - top - 4).fill(LAVENDER_LINE);
    doc.y += 4;
  }
}

function footers(doc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Writing below the bottom margin would otherwise start a new blank page
    doc.page.margins.bottom = 0;
    const y = doc.page.height - MARGIN + 14;
    doc.moveTo(MARGIN, y - 8).lineTo(doc.page.width - MARGIN, y - 8).strokeColor(HAIRLINE).lineWidth(0.6).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(GRAY);
    doc.text('Upbuild · UCT Mentoring Program', MARGIN, y, { lineBreak: false });
    doc.text(`Page ${i + 1} of ${range.count}`, MARGIN, y, { width: contentWidth(doc), align: 'right', lineBreak: false });
  }
}

function generatePdf({ assessment, studentName, mentorName, feedbackText, mentorRatings }) {
  return new Promise((resolve, reject) => {
    const doc = newDocument(resolve, reject);
    header(doc, `Round ${assessment.round}`, 'Mentoring Assessment', [
      ['Coach', studentName],
      ['Mentor', mentorName || '—'],
      ['Submitted', formatDate(assessment.submitted_at)],
    ]);

    sectionHeading(doc, 'Competency Ratings');
    ratingsTable(doc, assessment.competency_ratings || {}, mentorRatings || {});

    sectionHeading(doc, 'Coach Reflections');
    questionBlocks(doc, assessment.reflections, REFLECTION_QUESTIONS);

    sectionHeading(doc, 'Mentor Feedback');
    questionBlocks(doc, feedbackText, MENTOR_QUESTIONS);

    footers(doc);
    doc.end();
  });
}

function generatePostReflectionPdf({ studentName, mentorName, round, submittedAt, answers }) {
  return new Promise((resolve, reject) => {
    const doc = newDocument(resolve, reject);
    header(doc, `Round ${round}`, 'Post-Meeting Reflection', [
      ['Coach', studentName],
      ['Mentor', mentorName || '—'],
      ['Submitted', formatDate(submittedAt)],
    ]);
    doc.y += 18;
    doc.font('Helvetica-Oblique').fontSize(BODY).fillColor(SOFT)
      .text('Reflect on your coaching session following the mentoring meeting.', MARGIN, doc.y, { width: contentWidth(doc) });
    questionBlocks(doc, answers, POST_REFLECTION_QUESTIONS);
    footers(doc);
    doc.end();
  });
}

module.exports = { generatePdf, generatePostReflectionPdf };
