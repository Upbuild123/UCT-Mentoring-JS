const fs = require('fs');
const { Document, Paragraph, Packer } = require('docx');
const supabase = require('./supabase');
const drive = require('./drive');
const openai = require('./openai');
const email = require('./email');

async function updateAssessment(id, fields) {
  const { error } = await supabase.from('assessments').update(fields).eq('id', id);
  if (error) throw error;
}

async function processAssessment(assessmentId, videoPath) {
  await updateAssessment(assessmentId, { status: 'processing' });
  try {
    const { data: assessment } = await supabase
      .from('assessments')
      .select('*, students(name, email, mentor_id, mentors(name, email, id))')
      .eq('id', assessmentId)
      .single();

    const student = assessment.students;
    const mentor = student.mentors;
    const baseName = `Mentoring Round ${assessment.round}. ${student.name}`;

    // Step 1: Create Drive folder
    const { folderId, folderUrl } = await drive.createStudentRoundFolder(
      student.name, assessment.round, student.email || ''
    );
    await updateAssessment(assessmentId, { drive_folder_id: folderId, drive_folder_url: folderUrl });

    // Step 2: Upload video
    let videoDriveUrl = null;
    if (videoPath && fs.existsSync(videoPath)) {
      videoDriveUrl = await drive.uploadFile(videoPath, folderId, `${baseName}. Recording.mp4`);
      await updateAssessment(assessmentId, { video_drive_url: videoDriveUrl });
    }

    // Step 3: Extract audio
    const audioPath = videoPath ? videoPath.replace(/\.[^.]+$/, '.mp3') : null;
    if (videoPath && fs.existsSync(videoPath)) {
      await openai.extractAudio(videoPath, audioPath);
    }

    // Step 4: Transcribe
    let transcript = '';
    if (audioPath && fs.existsSync(audioPath)) {
      transcript = await openai.transcribe(audioPath);
    }

    // Cleanup local files
    for (const p of [audioPath, videoPath]) {
      if (p) try { fs.unlinkSync(p); } catch {}
    }

    // Step 5: Upload transcript docx
    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({ text: `${baseName}. Transcript`, heading: 'Heading1' }),
          ...transcript.split('\n').map(line => new Paragraph({ text: line })),
        ],
      }],
    });
    const docBuffer = await Packer.toBuffer(doc);
    await drive.uploadBuffer(
      docBuffer, folderId, `${baseName}. Transcript.docx`,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );

    // Save transcript to DB
    await updateAssessment(assessmentId, { transcript });

    // Step 6: Generate AI review
    const aiContent = await openai.generateAiReview(assessment, transcript);
    await supabase.from('ai_reviews').insert({ assessment_id: assessmentId, content: aiContent });

    // Step 7: Send mentor notification
    await email.sendMentorNotification({
      mentorEmail: mentor.email,
      mentorName: mentor.name,
      mentorId: mentor.id,
      studentName: student.name,
      roundNum: assessment.round,
      videoDriveUrl: videoDriveUrl || '',
      assessmentId,
    });

    // Step 8: Send student confirmation
    if (student.email) {
      await email.sendStudentConfirmation({
        studentEmail: student.email,
        studentName: student.name,
        roundNum: assessment.round,
        driveFolderUrl: folderUrl,
      });
    }

    // Step 9: Mark complete
    await updateAssessment(assessmentId, { status: 'complete', error_message: null });
  } catch (err) {
    await supabase
      .from('assessments')
      .update({ status: 'error', error_message: err.message })
      .eq('id', assessmentId);
    throw err;
  }
}

async function generateAndSendPdf(assessmentId) {
  const { data: assessment } = await supabase
    .from('assessments')
    .select('*, students(name, email, mentor_id, mentors(name, email)), mentor_feedback(feedback_text, mentor_ratings)')
    .eq('id', assessmentId)
    .single();

  const student = assessment.students;
  const mentor = student.mentors;
  const feedback = assessment.mentor_feedback?.[0];
  const baseName = `Mentoring Round ${assessment.round}. ${student.name}`;

  const { generatePdf } = require('./pdf');
  const pdfBuffer = await generatePdf({
    assessment,
    studentName: student.name,
    mentorName: mentor.name,
    feedbackText: feedback?.feedback_text || {},
    mentorRatings: feedback?.mentor_ratings || {},
  });

  const pdfDriveUrl = await drive.uploadBuffer(
    pdfBuffer,
    assessment.drive_folder_id,
    `${baseName}. Assessment.pdf`,
    'application/pdf'
  );

  await updateAssessment(assessmentId, { pdf_drive_url: pdfDriveUrl });

  await email.sendCompletionNotification({
    mentorEmail: mentor.email,
    mentorName: mentor.name,
    studentEmail: student.email || '',
    studentName: student.name,
    roundNum: assessment.round,
    pdfDriveUrl,
  });

  return pdfDriveUrl;
}

module.exports = { processAssessment, generateAndSendPdf };
