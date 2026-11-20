const params = new URLSearchParams(location.search);

function icfStatus(a) {
  const icf = Array.isArray(a.icf_forms) ? a.icf_forms[0] : a.icf_forms;
  return icf?.status || null;
}
const mentorId = params.get('mentor_id');
const token = params.get('token');

if (!token) {
  document.addEventListener('DOMContentLoaded', () => {
    showBanner(document.getElementById('banner-area'), 'Access denied. Please use the link from your email.');
  });
} else {
  async function init() {
    const [mentor, assessments, students] = await Promise.all([
      apiFetch(`/api/mentors/${mentorId}?token=${token}`),
      apiFetch(`/api/assessments/by-mentor/${mentorId}?token=${token}`),
      apiFetch('/api/students'),
    ]);

    const firstName = mentor.name.split(' ')[0];
    document.getElementById('page-title').textContent = `Welcome, ${firstName}`;

    const myStudents = students.filter(s => s.mentor_id === parseInt(mentorId));
    myStudents.sort((a, b) => a.name.localeCompare(b.name));

    const container = document.getElementById('students-list');

    if (myStudents.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">&#128101;</div><p>No students assigned yet.</p></div>`;
      return;
    }

    for (const student of myStudents) {
      const studentAssessments = assessments.filter(a => a.student_id === student.id);
      studentAssessments.sort((a, b) => a.round - b.round);

      const pendingCount = studentAssessments.filter(a => {
        const hasFeedback = Array.isArray(a.mentor_feedback) ? a.mentor_feedback.length > 0 : !!a.mentor_feedback;
        return !hasFeedback;
      }).length;

      const details = document.createElement('details');
      details.className = 'card';
      const summary = document.createElement('summary');
      summary.style.display = 'flex';
      summary.style.alignItems = 'center';
      summary.style.justifyContent = 'space-between';
      summary.style.gap = '12px';
      summary.innerHTML = `
        <span>${student.name} <span class="text-gray" style="font-weight:500">— ${studentAssessments.length} round${studentAssessments.length !== 1 ? 's' : ''}</span></span>
        ${pendingCount > 0 ? `<span class="badge badge-orange">${pendingCount} awaiting feedback</span>` : (studentAssessments.length > 0 ? '<span class="badge badge-green">All caught up</span>' : '')}
      `;
      details.appendChild(summary);

      if (studentAssessments.length === 0) {
        const p = document.createElement('p');
        p.className = 'text-gray';
        p.style.marginTop = '8px';
        p.textContent = 'No submissions yet.';
        details.appendChild(p);
      } else {
        const wrapper = document.createElement('div');
        wrapper.className = 'table-wrapper';
        const table = document.createElement('table');
        table.innerHTML = '<thead><tr><th>Round</th><th>Date</th><th>Feedback Status</th><th>Links</th></tr></thead>';

        const tbody = document.createElement('tbody');
        for (const a of studentAssessments) {
          const hasFeedback = Array.isArray(a.mentor_feedback) ? a.mentor_feedback.length > 0 : !!a.mentor_feedback;
          const date = a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : '—';
          const badgeClass = hasFeedback ? 'badge-green' : 'badge-orange';
          const badgeText = hasFeedback ? 'Feedback submitted' : 'Awaiting your feedback';
          const assessmentToken = a.mentor_token || token;
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>Round ${a.round}</td>
            <td>${date}</td>
            <td><span class="badge ${badgeClass}">${badgeText}</span></td>
            <td style="display:flex;gap:6px;flex-wrap:wrap">
              <a class="btn btn-secondary btn-sm" href="/mentor-review.html?assessment_id=${a.id}&token=${assessmentToken}">Review</a>
              ${hasFeedback ? `<a class="btn btn-secondary btn-sm" href="/icf-review.html?assessment_id=${a.id}&token=${assessmentToken}">ICF Form${icfStatus(a) === 'signed' ? ' (signed)' : ''}</a>` : ''}
              ${a.pdf_drive_url ? `<a class="btn btn-secondary btn-sm" href="${a.pdf_drive_url}" target="_blank">View PDF</a>` : ''}
              ${a.drive_folder_url ? `<a class="btn btn-secondary btn-sm" href="${a.drive_folder_url}" target="_blank">Drive</a>` : ''}
            </td>`;
          tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        wrapper.appendChild(table);
        details.appendChild(wrapper);

        // The ICF Competency Review rolls up the engagement once 3 Session Observation Forms are signed
        const signedCount = studentAssessments.filter(a => icfStatus(a) === 'signed').length;
        const review = document.createElement('div');
        review.className = 'mt-16';
        if (signedCount >= 3) {
          const link = document.createElement('a');
          link.className = 'btn btn-primary btn-sm';
          link.href = `/competency-review.html?student_id=${student.id}&mentor_id=${mentorId}&token=${token}`;
          link.textContent = 'Competency Review';
          review.appendChild(link);
        } else {
          review.className = 'mt-16 field-hint';
          review.textContent = `ICF Competency Review: available once 3 ICF Session Observation Forms are signed (${signedCount} so far).`;
        }
        details.appendChild(review);
      }

      container.appendChild(details);
    }
  }

  init().catch(err => showBanner(document.getElementById('banner-area'), err.message));
}
