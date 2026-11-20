const params = new URLSearchParams(location.search);
const assessmentId = params.get('assessment_id');
const token = params.get('token');
const DRAFT_KEY = `post_reflection_draft_${assessmentId}`;

function saveDraft() {
  const draft = {};
  for (const ta of document.querySelectorAll('.reflection-textarea')) draft[ta.dataset.question] = ta.value;
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch {}
}

function loadDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY)) || {}; } catch { return {}; }
}

if (!token) {
  document.addEventListener('DOMContentLoaded', () => {
    showBanner(document.getElementById('banner-area'), 'Access denied. Please use the link from your email.');
  });
} else {
  async function init() {
    const data = await apiFetch(`/api/assessments/${assessmentId}/post-reflection?token=${token}`);
    document.getElementById('page-title').textContent = `Post-Meeting Reflection — Round ${data.round}`;
    document.getElementById('content').style.display = 'block';

    const draft = loadDraft();
    const container = document.getElementById('reflection-questions');
    for (const q of data.questions) {
      const div = document.createElement('div');
      div.className = 'form-group';
      const label = document.createElement('label');
      label.textContent = q;
      const req = document.createElement('span');
      req.textContent = ' *';
      req.className = 'required-mark';
      label.appendChild(req);
      const textarea = document.createElement('textarea');
      textarea.dataset.question = q;
      textarea.className = 'reflection-textarea';
      textarea.style.minHeight = '135px';
      textarea.value = draft[q] ?? data.answers[q] ?? '';
      textarea.addEventListener('input', saveDraft);
      div.appendChild(label);
      div.appendChild(textarea);
      container.appendChild(div);
    }

    if (Object.keys(data.answers).length) {
      showBanner(document.getElementById('banner-area'), 'You already submitted this reflection. You can edit it and submit again.', 'warning');
    }
  }

  document.getElementById('submit-btn').addEventListener('click', async () => {
    const bannerArea = document.getElementById('banner-area');
    const answers = {};
    for (const ta of document.querySelectorAll('.reflection-textarea')) {
      if (!ta.value.trim()) return showBanner(bannerArea, `Please answer: ${ta.dataset.question}`);
      answers[ta.dataset.question] = ta.value.trim();
    }

    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    try {
      await apiFetch(`/api/assessments/${assessmentId}/post-reflection?token=${token}`, {
        method: 'POST',
        body: { answers },
      });
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      const success = document.getElementById('submit-success');
      success.style.display = 'block';
      success.textContent = 'Thank you! Your reflection has been saved to your Google Drive folder and shared with your mentor.';
    } catch (err) {
      btn.disabled = false;
      showBanner(bannerArea, err.message);
    }
  });

  init().catch(err => showBanner(document.getElementById('banner-area'), err.message));
}
