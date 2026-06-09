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

    const content = data.ai_reviews?.[0]?.content || '(No AI review available)';
    document.getElementById('review-content').innerHTML = marked.parse(content);

    document.getElementById('download-txt').addEventListener('click', () => {
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `ai-review-${assessmentId}.txt`; a.click();
      URL.revokeObjectURL(url);
    });

    const docxLink = document.getElementById('download-docx');
    docxLink.href = `/api/assessments/${assessmentId}/ai-review/docx?token=${token}`;
    docxLink.download = `ai-review-${assessmentId}.docx`;
  }

  init();
}
