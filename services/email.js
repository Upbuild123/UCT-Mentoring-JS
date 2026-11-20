const { Resend } = require('resend');

function getClient() {
  return new Resend(process.env.RESEND_API_KEY);
}

const FROM = () => process.env.EMAIL_FROM || 'Upbuild Mentoring <mentoring@upbuild.com>';
const APP_URL = () => process.env.APP_URL || 'http://localhost:3000';

async function sendMentorNotification({ mentorEmail, mentorName, mentorId, studentName, roundNum, videoDriveUrl, assessmentId, mentorToken, dashboardToken }) {
  const mentorFirst = mentorName.split(' ')[0];
  const studentFirst = studentName.split(' ')[0];
  const appUrl = APP_URL();
  const t = mentorToken ? `&token=${mentorToken}` : '';
  const dt = dashboardToken ? `&token=${dashboardToken}` : '';
  await getClient().emails.send({
    from: FROM(),
    to: mentorEmail,
    subject: `Mentoring Recording. ${studentName}. Round ${roundNum}`,
    html: `<p>Hi ${mentorFirst},</p>
<p>There is a new mentoring recording to review from ${studentFirst}.</p>
<ul>
  <li><a href="${videoDriveUrl}">Coaching session recording</a></li>
  <li><a href="${appUrl}/transcript.html?assessment_id=${assessmentId}${t}">Transcript</a></li>
  <li><a href="${appUrl}/ai-review.html?assessment_id=${assessmentId}${t}">AI Generated Analysis</a> (not shared with students)</li>
</ul>
<br>
<p>After your mentoring meeting, <a href="${appUrl}/mentor-review.html?assessment_id=${assessmentId}${t}">submit mentoring assessment</a>.</p>
<p><a href="${appUrl}/mentor-dashboard.html?mentor_id=${mentorId}${dt}">View your mentor dashboard</a></p>`,
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

async function sendCompletionNotification({ mentorEmail, mentorName, studentEmail, studentName, roundNum, pdfDriveUrl, assessmentId, studentToken }) {
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
<p><a href="${pdfDriveUrl}">Round ${roundNum} assessment PDF</a></p>
<p><strong>Next step:</strong> reflect on your coaching session following the mentoring meeting.</p>
<p><a href="${APP_URL()}/post-reflection.html?assessment_id=${assessmentId}&token=${studentToken}">Complete your Post-Meeting Reflection</a></p>`,
    });
  }
}

async function sendPostReflectionNotification({ mentorEmail, mentorName, studentName, roundNum, pdfDriveUrl }) {
  const mentorFirst = mentorName.split(' ')[0];
  const studentFirst = studentName.split(' ')[0];
  await getClient().emails.send({
    from: FROM(),
    to: mentorEmail,
    subject: `${studentName}'s Round ${roundNum} Post-Meeting Reflection`,
    html: `<p>Hi ${mentorFirst},</p>
<p>${studentFirst} has completed their Round ${roundNum} Post-Meeting Reflection.</p>
<p><a href="${pdfDriveUrl}">View ${studentFirst}'s Post-Meeting Reflection</a></p>`,
  });
}

async function sendIcfDraftReady({ mentorEmail, mentorName, studentName, roundNum, assessmentId, mentorToken }) {
  const mentorFirst = mentorName.split(' ')[0];
  const studentFirst = studentName.split(' ')[0];
  await getClient().emails.send({
    from: FROM(),
    to: mentorEmail,
    subject: `ICF Observation Form Draft Ready. ${studentName}. Round ${roundNum}`,
    html: `<p>Hi ${mentorFirst},</p>
<p>The AI has drafted ${studentFirst}'s Round ${roundNum} ICF Mentor Coaching Session Observation Form (ACC) from your Upbuild form and the session transcript.</p>
<p><a href="${APP_URL()}/icf-review.html?assessment_id=${assessmentId}&token=${mentorToken}">Review, edit and sign the ICF form</a></p>
<p>Items the AI was unsure about are flagged for you. Nothing is shared with ${studentFirst} until you sign.</p>`,
  });
}

async function sendIcfSigned({ mentorEmail, mentorName, studentEmail, studentName, roundNum, pdfDriveUrl }) {
  const studentFirst = studentName.split(' ')[0];
  const client = getClient();
  await client.emails.send({
    from: FROM(),
    to: mentorEmail,
    subject: `Signed ICF Observation Form. ${studentName}. Round ${roundNum}`,
    html: `<p>The signed Round ${roundNum} ICF Session Observation Form for ${studentFirst} has been saved and sent to ${studentFirst}.</p>
<p><a href="${pdfDriveUrl}">View the signed ICF form (PDF)</a></p>`,
  });
  if (studentEmail) {
    await client.emails.send({
      from: FROM(),
      to: studentEmail,
      subject: `Your Round ${roundNum} ICF Session Observation Form`,
      html: `<p>Hi ${studentFirst},</p>
<p>Your mentor coach has signed your Round ${roundNum} ICF Mentor Coaching Session Observation Form. It is saved in your Google Drive folder.</p>
<p><a href="${pdfDriveUrl}">View your ICF Session Observation Form (PDF)</a></p>`,
    });
  }
}

async function sendMentorReminder({ mentorEmail, mentorName, studentName, roundNum, assessmentId, mentorToken, dashboardToken, mentorId, reminderNum }) {
  const mentorFirst = mentorName.split(' ')[0];
  const studentFirst = studentName.split(' ')[0];
  const appUrl = APP_URL();
  const t = mentorToken ? `&token=${mentorToken}` : '';
  const dt = dashboardToken ? `&token=${dashboardToken}` : '';
  await getClient().emails.send({
    from: FROM(),
    to: mentorEmail,
    subject: `Reminder: ${studentName}'s Round ${roundNum} feedback is waiting`,
    html: `<p>Hi ${mentorFirst},</p>
<p>This is a reminder that ${studentFirst} is waiting for your feedback on their Round ${roundNum} coaching session.</p>
<ul>
  <li><a href="${appUrl}/transcript.html?assessment_id=${assessmentId}${t}">Transcript</a></li>
  <li><a href="${appUrl}/ai-review.html?assessment_id=${assessmentId}${t}">AI Generated Analysis</a> (not shared with students)</li>
</ul>
<p><a href="${appUrl}/mentor-review.html?assessment_id=${assessmentId}${t}">Submit your feedback</a></p>
<p><a href="${appUrl}/mentor-dashboard.html?mentor_id=${mentorId}${dt}">View your mentor dashboard</a></p>`,
  });
}

async function sendAdminErrorAlert({ assessmentId, studentName, roundNum, errorMessage }) {
  await getClient().emails.send({
    from: FROM(),
    to: 'michael@upbuild.com',
    subject: `Processing Error: ${studentName} Round ${roundNum}`,
    html: `<p>An assessment failed to process.</p>
<p><strong>Student:</strong> ${studentName}<br>
<strong>Round:</strong> ${roundNum}<br>
<strong>Assessment ID:</strong> ${assessmentId}<br>
<strong>Error:</strong> ${errorMessage}</p>
<p>Log in to the admin panel to retry.</p>`,
  });
}

module.exports = { sendMentorNotification, sendStudentConfirmation, sendCompletionNotification, sendPostReflectionNotification, sendIcfDraftReady, sendIcfSigned, sendMentorReminder, sendAdminErrorAlert };
