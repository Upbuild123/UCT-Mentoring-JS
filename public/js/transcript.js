const params = new URLSearchParams(location.search);
const assessmentId = params.get('assessment_id');
const token = params.get('token');

if (!token) {
  document.addEventListener('DOMContentLoaded', () => {
    showBanner(document.getElementById('banner-area'), 'Access denied. Please use the link from your email.');
  });
} else {
  async function init() {
    const data = await apiFetch(`/api/assessments/${assessmentId}?token=${token}`);
    document.getElementById('caption').textContent = `${data.students.name} — Round ${data.round}`;
    document.getElementById('transcript-content').textContent = data.transcript || '(No transcript available)';

    const baseName = `Mentoring Round ${data.round}. ${data.students.name}. Transcript`;

    document.getElementById('download-txt').addEventListener('click', () => {
      const blob = new Blob([data.transcript || ''], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${baseName}.txt`; a.click();
      URL.revokeObjectURL(url);
    });

    const docxLink = document.getElementById('download-docx');
    docxLink.href = `/api/assessments/${assessmentId}/transcript/docx?token=${token}`;
    docxLink.download = `${baseName}.docx`;
  }

  init();
}
