const params = new URLSearchParams(location.search);
const assessmentId = params.get('assessment_id');

async function init() {
  const data = await apiFetch(`/api/assessments/${assessmentId}`);
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

  document.getElementById('download-docx').href = `/api/assessments/${assessmentId}/ai-review/docx`;
  document.getElementById('download-docx').download = `ai-review-${assessmentId}.docx`;
}

init();
