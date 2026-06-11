const COMPETENCIES = [
  { name: 'Know Yourself', category: 'Meta-Skills' },
  { name: 'Experiment and Learn', category: 'Meta-Skills' },
  { name: 'Serve Not Fix', category: 'Meta-Skills' },
  { name: 'Call on the Creative', category: 'Meta-Skills' },
  { name: 'Co-Creating and Maintaining the Relationship', category: 'Skills' },
  { name: 'Structuring the Coaching Session', category: 'Skills' },
  { name: 'Listening', category: 'Skills' },
  { name: 'Asking Curious and Powerful Questions', category: 'Skills' },
  { name: 'Balancing Action and Learning', category: 'Skills' },
];

const RATING_OPTIONS = ['-- select --', '1. Not Demonstrated', '2. Emerging', '3. Competent', '4. Exceptional'];

const MENTOR_QUESTIONS = [
  'What did the coach do well in this coaching session?',
  'What opportunities were there to strengthen this coaching session?',
  'What are the developmental opportunities for the coach?',
  'What are 1-2 development practices for the coach?',
];

const params = new URLSearchParams(location.search);
const assessmentId = params.get('assessment_id');
const token = params.get('token');
const DRAFT_KEY = `mentor_draft_${assessmentId}`;

function saveMentorDraft() {
  const draft = { ratings: {}, feedback: {} };
  for (const sel of document.querySelectorAll('.mentor-rating-select')) {
    draft.ratings[sel.dataset.competency] = sel.value;
  }
  for (const ta of document.querySelectorAll('.mentor-feedback-textarea')) {
    draft.feedback[ta.dataset.question] = ta.value;
  }
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

function restoreMentorDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (!draft) return;
    for (const sel of document.querySelectorAll('.mentor-rating-select')) {
      if (draft.ratings[sel.dataset.competency]) sel.value = draft.ratings[sel.dataset.competency];
    }
    for (const ta of document.querySelectorAll('.mentor-feedback-textarea')) {
      if (draft.feedback[ta.dataset.question] !== undefined) ta.value = draft.feedback[ta.dataset.question];
    }
  } catch {}
}

if (!token) {
  document.addEventListener('DOMContentLoaded', () => {
    showBanner(document.getElementById('banner-area'), 'Access denied. Please use the link from your email.');
  });
} else {
  async function init() {
    const data = await apiFetch(`/api/assessments/${assessmentId}?token=${token}`);
    const student = data.students;
    const date = data.submitted_at ? new Date(data.submitted_at).toLocaleDateString() : '';
    document.getElementById('page-title').textContent = `Coach: ${student.name} — Round ${data.round} (${date})`;
    document.getElementById('content').style.display = 'block';

    const coachRatings = data.competency_ratings || {};
    const existingMentorRatings = data.mentor_feedback?.[0]?.mentor_ratings || {};
    const tbody = document.getElementById('ratings-body');
    let currentCategory = null;

    for (const comp of COMPETENCIES) {
      if (comp.category !== currentCategory) {
        currentCategory = comp.category;
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="3" style="background:var(--light-purple);font-weight:700;color:var(--purple-dark)">${currentCategory}</td>`;
        tbody.appendChild(tr);
      }
      const tr = document.createElement('tr');
      const select = document.createElement('select');
      select.dataset.competency = comp.name;
      select.className = 'mentor-rating-select';
      for (const opt of RATING_OPTIONS) {
        const o = document.createElement('option');
        o.value = opt === '-- select --' ? '' : opt;
        o.textContent = opt;
        if (existingMentorRatings[comp.name] && opt === existingMentorRatings[comp.name]) o.selected = true;
        select.appendChild(o);
      }
      tr.innerHTML = `<td>${comp.name}</td><td>${coachRatings[comp.name] || '—'}</td><td></td>`;
      tr.lastElementChild.appendChild(select);
      tbody.appendChild(tr);
    }

    const reflContainer = document.getElementById('coach-reflections');
    Object.entries(data.reflections || {}).forEach(([q, a], i) => {
      const div = document.createElement('div');
      div.className = 'card';
      const fontSize = i < 2 ? '1.5em' : i >= 3 ? '0.5em' : '1em';
      div.innerHTML = `<label style="margin-bottom:6px">${q}</label><p style="color:var(--text-soft);font-size:${fontSize}">${a || '(no answer)'}</p>`;
      reflContainer.appendChild(div);
    });

    const existingFeedback = data.mentor_feedback?.[0]?.feedback_text || {};
    const feedbackContainer = document.getElementById('mentor-feedback-fields');
    for (const q of MENTOR_QUESTIONS) {
      const div = document.createElement('div');
      div.className = 'form-group';
      const label = document.createElement('label');
      label.textContent = q;
      const textarea = document.createElement('textarea');
      textarea.dataset.question = q;
      textarea.className = 'mentor-feedback-textarea';
      textarea.value = existingFeedback[q] || '';
      textarea.addEventListener('input', saveMentorDraft);
      div.appendChild(label);
      div.appendChild(textarea);
      feedbackContainer.appendChild(div);
    }

    // Attach rating change listeners
    document.getElementById('ratings-body').addEventListener('change', saveMentorDraft);

    // Restore any saved draft (overrides DB values only if draft exists)
    restoreMentorDraft();
  }

  document.getElementById('submit-btn').addEventListener('click', async () => {
    const bannerArea = document.getElementById('banner-area');
    const mentorRatings = {};
    for (const sel of document.querySelectorAll('.mentor-rating-select')) {
      if (!sel.value) return showBanner(bannerArea, `Please rate: ${sel.dataset.competency}`);
      mentorRatings[sel.dataset.competency] = sel.value;
    }

    const feedbackText = {};
    for (const ta of document.querySelectorAll('.mentor-feedback-textarea')) {
      if (!ta.value.trim()) return showBanner(bannerArea, `Please answer: ${ta.dataset.question}`);
      feedbackText[ta.dataset.question] = ta.value.trim();
    }

    document.getElementById('submit-btn').disabled = true;
    try {
      await apiFetch(`/api/assessments/${assessmentId}/mentor-feedback?token=${token}`, {
        method: 'POST',
        body: { feedback_text: feedbackText, mentor_ratings: mentorRatings },
      });
      localStorage.removeItem(DRAFT_KEY);
      const success = document.getElementById('submit-success');
      success.style.display = 'block';
      success.textContent = 'Feedback submitted. The assessment PDF is being generated and will be emailed to both you and the coach.';
    } catch (err) {
      document.getElementById('submit-btn').disabled = false;
      showBanner(bannerArea, err.message);
    }
  });

  document.getElementById('save-draft-btn').addEventListener('click', () => {
    saveMentorDraft();
    const msg = document.getElementById('draft-saved');
    msg.style.display = 'inline';
    setTimeout(() => { msg.style.display = 'none'; }, 2000);
  });

  init().catch(err => showBanner(document.getElementById('banner-area'), err.message));
}
