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
      doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY).text(label, 50, doc.y, { continued: true, width: 100 });
      doc.font('Helvetica').fillColor(DARK_TEXT).text(value);
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

    doc.rect(50, doc.y, pageWidth, rowH).fill(LIGHT_PURPLE);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(PURPLE);
    const headerY = doc.y - rowH + 4;
    doc.text('Competency', 54, headerY, { width: colComp });
    doc.text('Coach', 54 + colComp, headerY, { width: colSide });
    doc.text('Mentor', 54 + colComp + colSide, headerY, { width: colSide });
    doc.y += 2;

    let fill = false;
    let currentCategory = null;
    for (const comp of COMPETENCIES) {
      if (comp.category !== currentCategory) {
        currentCategory = comp.category;
        doc.rect(50, doc.y, pageWidth, rowH).fill('#F8F5FF');
        doc.font('Helvetica-Bold').fontSize(9).fillColor(PURPLE)
          .text(`  ${currentCategory}`, 54, doc.y - rowH + 4, { width: pageWidth });
        doc.y += 2;
        fill = false;
      }
      const bg = fill ? '#FAF8FF' : '#FFFFFF';
      doc.rect(50, doc.y, pageWidth, rowH).fill(bg);
      const rowY = doc.y - rowH + 4;
      doc.font('Helvetica').fontSize(9).fillColor(DARK_TEXT)
        .text(`  ${comp.name}`, 54, rowY, { width: colComp });
      doc.text(String(coachRatings[comp.name] || '—'), 54 + colComp, rowY, { width: colSide });
      doc.text(String(mentorRatings[comp.name] || '—'), 54 + colComp + colSide, rowY, { width: colSide });
      doc.y += 2;
      fill = !fill;
    }

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

module.exports = { generatePdf };
