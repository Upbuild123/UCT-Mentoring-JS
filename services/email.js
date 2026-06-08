const { Resend } = require('resend');

function getClient() {
  return new Resend(process.env.RESEND_API_KEY);
}

const FROM = () => process.env.EMAIL_FROM || 'Upbuild Mentoring <mentoring@upbuild.com>';
const APP_URL = () => process.env.APP_URL || 'http://localhost:3000';

async function sendMentorNotification({ mentorEmail, mentorName, mentorId, studentName, roundNum, videoDriveUrl, assessmentId }) {
  const mentorFirst = mentorName.split(' ')[0];
  const studentFirst = studentName.split(' ')[0];
  const appUrl = APP_URL();
  await getClient().emails.send({
    from: FROM(),
    to: mentorEmail,
    subject: `Mentoring Recording. ${studentName}. Round ${roundNum}`,
    html: `<p>Hi ${mentorFirst},</p>
<p>There is a new mentoring recording to review from ${studentFirst}.</p>
<ul>
  <li><a href="${videoDriveUrl}">Video recording</a></li>
  <li><a href="${appUrl}/transcript.html?assessment_id=${assessmentId}">Transcript</a></li>
  <li><a href="${appUrl}/ai-review.html?assessment_id=${assessmentId}">AI-generated review</a></li>
</ul>
<p>After your mentoring meeting, <a href="${appUrl}/mentor-review.html?assessment_id=${assessmentId}">submit mentor feedback</a>.</p>
<p><a href="${appUrl}/mentor-dashboard.html?mentor_id=${mentorId}">View your mentor dashboard</a></p>`,
  });
}

async function sendStudentConfirmation({ studentEmail, studentName, roundNum, driveFolderUrl }) {
  const first = studentName.split(' ')[0];
  await getClient().emails.send({
    from: FROM(),
    to: studentEmail,
    subject: `Your Round ${roundNum} Recording Has Been Received`,
    html: `<p>Hi ${first},</p>
<p>Your Round ${roundNum} mentoring recording has been successfully uploaded, and your mentor has been notified.</p>
<p>You can access your recording and transcript in your Google Drive <a href="${driveFolderUrl}">folder</a>.</p>`,
  });
}

async function sendCompletionNotification({ mentorEmail, mentorName, studentEmail, studentName, roundNum, pdfDriveUrl }) {
  const studentFirst = studentName.split(' ')[0];
  const client = getClient();
  await client.emails.send({
    from: FROM(),
    to: mentorEmail,
    subject: `${studentName}'s Round ${roundNum} Mentoring Assessment is Ready`,
    html: `<p>View <a href="${pdfDriveUrl}">${studentFirst}'s Round ${roundNum} assessment PDF</a></p>`,
  });
  if (studentEmail) {
    await client.emails.send({
      from: FROM(),
      to: studentEmail,
      subject: `Your UCT Mentoring Round ${roundNum} Assessment is Ready`,
      html: `<p>Hi ${studentFirst},</p>
<p>Your Round ${roundNum} assessment PDF is now complete and available to view.</p>
<p><a href="${pdfDriveUrl}">Round ${roundNum} assessment PDF</a></p>`,
    });
  }
}

module.exports = { sendMentorNotification, sendStudentConfirmation, sendCompletionNotification };
