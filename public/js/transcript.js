const params = new URLSearchParams(location.search);
const assessmentId = params.get('assessment_id');

async function init() {
  const data = await apiFetch(`/api/assessments/${assessmentId}`);
  document.getElementById('caption').textContent = `${data.students.name} — Round ${data.round}`;
  document.getElementById('transcript-content').textContent = data.transcript || '(No transcript available)';

  document.getElementById('download-txt').addEventListener('click', () => {
    const blob = new Blob([data.transcript || ''], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `transcript-${assessmentId}.txt`; a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('download-docx').href = `/api/assessments/${assessmentId}/transcript/docx`;
  document.getElementById('download-docx').download = `transcript-${assessmentId}.docx`;
}

init();
