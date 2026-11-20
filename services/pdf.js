const PDFDocument = require('pdfkit');
const { COMPETENCIES } = require('../shared/competencies');

const PURPLE = '#5E328C';
const LIGHT_PURPLE = '#EDE7F6';
const DARK_TEXT = '#1E1E1E';
const GRAY = '#787878';
const RULE_COLOR = '#DCD2F0';

function generatePdf({ assessment, studentName, mentorName, feedbackText, mentorRatings }) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - 100;

    doc.on('pageAdded', () => {
      const savedY = doc.y;
      doc.fontSize(8).fillColor(GRAY)
        .text('Upbuild Mentoring Program', 50, doc.page.height - 30, { align: 'center', width: pageWidth });
      doc.y = savedY;
    });

    // Header
    doc.fontSize(14).fillColor(PURPLE).font('Helvetica-Bold')
      .text(`Mentoring Assessment — Round ${assessment.round}`, 50, 50);

    doc.moveTo(50, 75).lineTo(50 + pageWidth, 75).strokeColor(PURPLE).lineWidth(1).stroke();

    // Meta block
    doc.y = 85;
    const metaLines = [
      ['COACH', studentName],
      ['MENTOR', mentorName || '—'],
      ['DATE SUBMITTED', assessment.submitted_at
        ? new Date(assessment.submitted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : 'N/A'],
    ];
    for (const [label, value] of metaLines) {
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY).text(label, 50, y, { width: 100 });
      doc.font('Helvetica').fillColor(DARK_TEXT).text(value, 150, y, { width: pageWidth - 100 });
    }

    function sectionHeading(text) {
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(12).fillColor(PURPLE).text(text, 50);
      doc.moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).strokeColor(RULE_COLOR).lineWidth(0.5).stroke();
      doc.moveDown(0.3);
      doc.fillColor(DARK_TEXT);
    }

    // Competency Ratings Table
    sectionHeading('Competency Ratings');
    const coachRatings = assessment.competency_ratings || {};
    const colComp = pageWidth * 0.52;
    const colSide = pageWidth * 0.24;
    const rowH = 16;
    const textInset = 4;

    // Each row is drawn at a fixed y, then y moves down a full row height
    let y = doc.y;
    function row(cells, { bg, font, color }) {
      doc.rect(50, y, pageWidth, rowH).fill(bg);
      doc.font(font).fontSize(9).fillColor(color);
      for (const [text, x, width] of cells) doc.text(text, x, y + textInset, { width, lineBreak: false });
      y += rowH;
    }

    row([
      ['Competency', 54, colComp],
      ['Coach', 54 + colComp, colSide],
      ['Mentor', 54 + colComp + colSide, colSide],
    ], { bg: LIGHT_PURPLE, font: 'Helvetica-Bold', color: PURPLE });

    let fill = false;
    let currentCategory = null;
    for (const comp of COMPETENCIES) {
      if (comp.category !== currentCategory) {
        currentCategory = comp.category;
        row([[`  ${currentCategory}`, 54, pageWidth]], { bg: '#F8F5FF', font: 'Helvetica-Bold', color: PURPLE });
        fill = false;
      }
      row([
        [`  ${comp.name}`, 54, colComp],
        [String(coachRatings[comp.name] || '—'), 54 + colComp, colSide],
        [String(mentorRatings[comp.name] || '—'), 54 + colComp + colSide, colSide],
      ], { bg: fill ? '#FAF8FF' : '#FFFFFF', font: 'Helvetica', color: DARK_TEXT });
      fill = !fill;
    }
    doc.x = 50;
    doc.y = y;

    // Coach Reflections
    sectionHeading('Coach Reflections');
    const reflections = assessment.reflections || {};
    for (const [question, answer] of Object.entries(reflections)) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK_TEXT).text(question, 50);
      doc.font('Helvetica').fontSize(10).fillColor('#3C3C3C')
        .text(answer || '(no answer)', 54, doc.y, { width: pageWidth - 4 });
      doc.moveDown(0.5);
    }

    // Mentor Feedback
    sectionHeading('Mentor Feedback');
    for (const [question, answer] of Object.entries(feedbackText || {})) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK_TEXT).text(question, 50);
      doc.font('Helvetica').fontSize(10).fillColor('#3C3C3C')
        .text(answer || '(no answer)', 54, doc.y, { width: pageWidth - 4 });
      doc.moveDown(0.5);
    }

    doc.end();
  });
}

function generatePostReflectionPdf({ studentName, mentorName, round, submittedAt, answers }) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - 100;

    doc.fontSize(14).fillColor(PURPLE).font('Helvetica-Bold')
      .text(`Post-Meeting Reflection — Round ${round}`, 50, 50);
    doc.moveTo(50, 75).lineTo(50 + pageWidth, 75).strokeColor(PURPLE).lineWidth(1).stroke();

    doc.y = 85;
    const metaLines = [
      ['COACH', studentName],
      ['MENTOR', mentorName || '—'],
      ['DATE SUBMITTED', submittedAt
        ? new Date(submittedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : 'N/A'],
    ];
    for (const [label, value] of metaLines) {
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY).text(label, 50, y, { width: 100 });
      doc.font('Helvetica').fillColor(DARK_TEXT).text(value, 150, y, { width: pageWidth - 100 });
    }

    doc.moveDown(1);
    doc.font('Helvetica-Oblique').fontSize(10).fillColor(GRAY)
      .text('Reflect on your coaching session following the mentoring meeting.', 50, doc.y, { width: pageWidth });
    doc.moveDown(0.8);

    for (const [question, answer] of Object.entries(answers)) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK_TEXT).text(question, 50, doc.y, { width: pageWidth });
      doc.font('Helvetica').fontSize(10).fillColor('#3C3C3C')
        .text(answer || '(no answer)', 54, doc.y, { width: pageWidth - 4 });
      doc.moveDown(0.8);
    }

    doc.end();
  });
}

module.exports = { generatePdf, generatePostReflectionPdf };
