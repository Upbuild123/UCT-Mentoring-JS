const params = new URLSearchParams(location.search);
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
    for (const student of myStudents) {
      const studentAssessments = assessments.filter(a => a.student_id === student.id);
      studentAssessments.sort((a, b) => a.round - b.round);

      const details = document.createElement('details');
      details.className = 'card';
      const summary = document.createElement('summary');
      summary.textContent = `${student.name} — ${studentAssessments.length} round${studentAssessments.length !== 1 ? 's' : ''} submitted`;
      details.appendChild(summary);

      if (studentAssessments.length === 0) {
        const p = document.createElement('p');
        p.className = 'text-gray';
        p.style.marginTop = '8px';
        p.textContent = 'No submissions yet.';
        details.appendChild(p);
      } else {
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
            <td>
              <a class="btn btn-secondary btn-sm" href="/mentor-review.html?assessment_id=${a.id}&token=${assessmentToken}">Review</a>
              ${a.drive_folder_url ? `<a class="btn btn-secondary btn-sm" href="${a.drive_folder_url}" target="_blank" style="margin-left:6px">Drive</a>` : ''}
            </td>`;
          tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        details.appendChild(table);
      }

      container.appendChild(details);
    }
  }

  init().catch(err => showBanner(document.getElementById('banner-area'), err.message));
}
