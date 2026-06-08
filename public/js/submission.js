const RATING_OPTIONS = ['-- select --', '1. Not Demonstrated', '2. Emerging', '3. Competent', '4. Exceptional'];
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
const REFLECTION_QUESTIONS = [
  { q: 'What did you do well in this coaching session?', required: true },
  { q: 'What opportunities were there to improve the coaching?', required: true },
  { q: 'What are you learning about your style as a coach? How would your clients describe you?', required: true },
  { q: 'What is your next developmental opportunity?', required: true },
  { q: 'Questions you have about this session or coaching in general', required: false },
  { q: 'If your session is longer than 30 minutes, which portion of the recording should your mentor listen to?', required: false },
];

async function init() {
  const students = await apiFetch('/api/students');
  const sel = document.getElementById('student-select');
  for (const s of students) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    sel.appendChild(opt);
  }

  for (const cat of ['Meta-Skills', 'Skills']) {
    const container = document.getElementById(cat === 'Meta-Skills' ? 'meta-skills-ratings' : 'skills-ratings');
    for (const comp of COMPETENCIES.filter(c => c.category === cat)) {
      const div = document.createElement('div');
      div.className = 'form-group';
      const label = document.createElement('label');
      label.textContent = comp.name;
      label.setAttribute('for', `rating-${comp.name}`);
      const select = document.createElement('select');
      select.id = `rating-${comp.name}`;
      select.dataset.competency = comp.name;
      select.className = 'competency-select';
      for (const opt of RATING_OPTIONS) {
        const o = document.createElement('option');
        o.value = opt === '-- select --' ? '' : opt;
        o.textContent = opt;
        select.appendChild(o);
      }
      div.appendChild(label);
      div.appendChild(select);
      container.appendChild(div);
    }
  }

  const reflContainer = document.getElementById('reflection-questions');
  for (const { q, required } of REFLECTION_QUESTIONS) {
    const div = document.createElement('div');
    div.className = 'form-group';
    const label = document.createElement('label');
    label.textContent = q + (required ? '' : ' (optional)');
    label.style.color = required ? '' : 'var(--gray)';
    const textarea = document.createElement('textarea');
    textarea.dataset.question = q;
    textarea.className = 'reflection-textarea';
    if (required) textarea.required = true;
    div.appendChild(label);
    div.appendChild(textarea);
    reflContainer.appendChild(div);
  }
}

let duplicateExists = false;
async function checkDuplicate() {
  const studentId = document.getElementById('student-select').value;
  const round = document.querySelector('input[name=round]:checked')?.value;
  if (!studentId || !round) return;
  try {
    const { exists } = await apiFetch(`/api/assessments/check-duplicate?student_id=${studentId}&round=${round}`);
    duplicateExists = exists;
    document.getElementById('duplicate-warning').style.display = exists ? 'block' : 'none';
    if (!exists) document.getElementById('duplicate-confirm').checked = false;
  } catch {}
}

document.getElementById('student-select').addEventListener('change', checkDuplicate);
document.querySelectorAll('input[name=round]').forEach(r => r.addEventListener('change', checkDuplicate));

document.getElementById('video-file').addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    document.getElementById('file-size').textContent = `File size: ${mb} MB`;
  }
});

document.getElementById('submit-btn').addEventListener('click', async () => {
  const bannerArea = document.getElementById('banner-area');
  const studentId = document.getElementById('student-select').value;
  const round = document.querySelector('input[name=round]:checked')?.value;
  const videoFile = document.getElementById('video-file').files[0];

  if (!studentId) return showBanner(bannerArea, 'Please select your name.');
  if (!round) return showBanner(bannerArea, 'Please select a round.');
  if (!videoFile) return showBanner(bannerArea, 'Please upload a recording.');

  if (duplicateExists && !document.getElementById('duplicate-confirm').checked) {
    return showBanner(bannerArea, 'Please confirm you want to submit a duplicate.');
  }

  const ratings = {};
  for (const sel of document.querySelectorAll('.competency-select')) {
    if (!sel.value) return showBanner(bannerArea, `Please rate: ${sel.dataset.competency}`);
    ratings[sel.dataset.competency] = sel.value;
  }

  const reflections = {};
  for (const ta of document.querySelectorAll('.reflection-textarea')) {
    if (ta.required && !ta.value.trim()) return showBanner(bannerArea, `Please answer: ${ta.dataset.question}`);
    reflections[ta.dataset.question] = ta.value.trim();
  }

  const formData = new FormData();
  formData.append('student_id', studentId);
  formData.append('round', round);
  formData.append('competency_ratings', JSON.stringify(ratings));
  formData.append('reflections', JSON.stringify(reflections));
  formData.append('video', videoFile);

  document.getElementById('submit-btn').disabled = true;
  document.getElementById('progress-area').style.display = 'block';

  try {
    const res = await fetch('/api/assessments/submit', { method: 'POST', body: formData });
    if (!res.ok) throw new Error((await res.json()).error || 'Submission failed');
    const { assessment_id } = await res.json();
    pollStatus(assessment_id);
  } catch (err) {
    document.getElementById('submit-btn').disabled = false;
    document.getElementById('progress-area').style.display = 'none';
    showBanner(bannerArea, err.message);
  }
});

const statusMessages = {
  submitted: 'Uploading to Drive…',
  processing: 'Transcribing and generating AI review… This may take a few minutes.',
  complete: 'Done!',
};

async function pollStatus(assessmentId) {
  const msg = document.getElementById('progress-msg');
  const interval = setInterval(async () => {
    try {
      const { status, error_message } = await apiFetch(`/api/assessments/${assessmentId}/status`);
      msg.textContent = statusMessages[status] || 'Processing…';
      if (status === 'complete') {
        clearInterval(interval);
        document.getElementById('progress-area').style.display = 'none';
        const successArea = document.getElementById('success-area');
        successArea.style.display = 'block';
        successArea.textContent = 'Your recording has been submitted successfully. Your mentor has been notified.';
      } else if (status === 'error') {
        clearInterval(interval);
        document.getElementById('progress-area').style.display = 'none';
        document.getElementById('submit-btn').disabled = false;
        showBanner(document.getElementById('banner-area'), `Processing failed: ${error_message || 'Unknown error'}`);
      }
    } catch {}
  }, 3000);
}

init();
