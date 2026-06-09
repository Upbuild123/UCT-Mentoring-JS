const RATING_OPTIONS = ['-- select --', '1. Not Demonstrated', '2. Emerging', '3. Competent', '4. Exceptional'];
const COMPETENCIES = [
  { name: 'Know Yourself', category: 'Meta-Skills', description: 'Uses self-knowledge and self-work to help the client discover who they are.' },
  { name: 'Experiment and Learn', category: 'Meta-Skills', description: 'Holds an experimental mindset, interacts with the client in new ways, and takes risks for the sake of the client.' },
  { name: 'Serve Not Fix', category: 'Meta-Skills', description: 'Focuses on coaching the whole person and their whole life, not the problem or issue; explores what it means to serve this client; avoids being an expert and advice-giver.' },
  { name: 'Call on the Creative', category: 'Meta-Skills', description: 'Accesses and coaches from the creative level of consciousness to help the client access and live from their creative consciousness.' },
  { name: 'Co-Creating and Maintaining the Relationship', category: 'Skills', description: '"Keeping your seat" as the coach – establishes agreements; cultivates trust, safety and mutual respect; partners around overall client outcomes and measures of success.' },
  { name: 'Structuring the Coaching Session', category: 'Skills', description: 'Follows 10/80/10 structure; partnering with the client to manage time; 10% (topic, agenda, desired outcomes), 80% (exploration and deepening of learning), 10% (action, next steps, accountability); discovers and holds presenting, deeper and transformational agendas.' },
  { name: 'Listening', category: 'Skills', description: 'Offers full presence, listens without judgment, and hears what the client might be saying separate from their words.' },
  { name: 'Asking Curious and Powerful Questions', category: 'Skills', description: 'Practices open-ended questions that invite exploration of possibility and the unknown.' },
  { name: 'Balancing Action and Learning', category: 'Skills', description: 'Invites the client to engage in personal reflection to deepen their learning and take meaningful action to move toward their goals; allows the client to do the work.' },
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
      const desc = document.createElement('p');
      desc.className = 'text-gray';
      desc.style.marginTop = '4px';
      desc.style.fontStyle = 'italic';
      desc.textContent = comp.description;
      div.appendChild(label);
      div.appendChild(select);
      div.appendChild(desc);
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
  submitted: 'Uploading…',
  processing: 'Uploading… This may take a few minutes.',
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
        showBanner(document.getElementById('banner-area'), 'Something went wrong with your submission. Please contact your coordinator.');
      }
    } catch {}
  }, 3000);
}

init();
