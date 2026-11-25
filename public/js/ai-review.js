const params = new URLSearchParams(location.search);

// Wrap each ## section of the analysis in its own card
function groupSections(container) {
  let card = null;
  for (const node of [...container.childNodes]) {
    if (node.nodeName === 'H2') {
      card = document.createElement('section');
      card.className = 'analysis-section';
      container.insertBefore(card, node);
    }
    if (card) card.appendChild(node);
  }
}
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
    const target = document.getElementById('review-content');
    target.innerHTML = marked.parse(content);
    groupSections(target);

    const baseName = `Mentoring Round ${data.round}. ${data.students.name}. AI Review`;

    document.getElementById('download-txt').addEventListener('click', () => {
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${baseName}.txt`; a.click();
      URL.revokeObjectURL(url);
    });

    const docxLink = document.getElementById('download-docx');
    docxLink.href = `/api/assessments/${assessmentId}/ai-review/docx?token=${token}`;
    docxLink.download = `${baseName}.docx`;
  }

  init();
}
