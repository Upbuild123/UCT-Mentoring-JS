const token = sessionStorage.getItem('adminToken');
if (token) showAdmin();

document.getElementById('auth-btn').addEventListener('click', async () => {
  const password = document.getElementById('admin-password').value;
  try {
    const data = await apiFetch('/api/admin/auth', { method: 'POST', body: { password } });
    if (data.success) {
      sessionStorage.setItem('adminToken', data.token);
      showAdmin();
    }
  } catch {
    const el = document.getElementById('auth-error');
    el.style.display = 'block';
    el.textContent = 'Incorrect password.';
  }
});

document.getElementById('admin-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('auth-btn').click();
});

function showAdmin() {
  document.getElementById('auth-modal').style.display = 'none';
  document.getElementById('admin-main').style.display = 'block';
  loadAll();
}

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    ['assessments', 'mentors', 'students', 'overview'].forEach(t => {
      document.getElementById(`tab-${t}`).style.display = t === tab.dataset.tab ? 'block' : 'none';
    });
  });
});

const STATUS_BADGE = {
  submitted: 'badge-gray',
  processing: 'badge-orange',
  complete: 'badge-green',
  error: 'badge-red',
};

let allAssessments = [], allMentors = [], allStudents = [];

async function loadAll() {
  [allAssessments, allMentors, allStudents] = await Promise.all([
    apiFetch('/api/assessments/all'),
    apiFetch('/api/mentors'),
    apiFetch('/api/students'),
  ]);
  renderAssessments();
  renderMentors();
  renderStudents();
  renderOverview();
}

document.getElementById('status-filter').addEventListener('change', renderAssessments);
document.getElementById('assessment-search').addEventListener('input', renderAssessments);

function renderAssessments() {
  const filter = document.getElementById('status-filter').value;
  const search = document.getElementById('assessment-search').value.toLowerCase();
  const list = document.getElementById('assessments-list');
  let filtered = filter ? allAssessments.filter(a => a.status === filter) : allAssessments;
  if (search) filtered = filtered.filter(a =>
    (a.student_name || '').toLowerCase().includes(search) ||
    (a.mentor_name || '').toLowerCase().includes(search)
  );
  list.innerHTML = '';
  for (const a of filtered) {
    const card = document.createElement('div');
    card.className = 'card';
    const badgeClass = STATUS_BADGE[a.status] || 'badge-gray';
    const date = a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : '—';
    const t = a.mentor_token ? `&token=${a.mentor_token}` : '';

    let processingWarning = '';
    if (a.status === 'processing' && a.submitted_at) {
      const mins = Math.floor((Date.now() - new Date(a.submitted_at)) / 60000);
      if (mins > 20) processingWarning = `<span class="badge badge-orange">Processing for ${mins}m — may be stuck</span>`;
    }

    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <strong>${a.student_name}</strong>
        <span class="text-gray">(${a.mentor_name})</span>
        <span>Round ${a.round}</span>
        <span class="text-gray">${date}</span>
        <span class="badge ${badgeClass}">${a.status}</span>
        ${processingWarning}
        ${a.error_message ? `<span class="text-gray" title="${a.error_message}">⚠ ${a.error_message.slice(0, 60)}</span>` : ''}
        <div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">
          <a class="btn btn-secondary btn-sm" href="/mentor-review.html?assessment_id=${a.id}${t}">Review</a>
          ${a.transcript || a.status === 'complete' ? `<a class="btn btn-secondary btn-sm" href="/transcript.html?assessment_id=${a.id}${t}" target="_blank">Transcript</a>` : ''}
          ${a.status === 'complete' ? `<a class="btn btn-secondary btn-sm" href="/ai-review.html?assessment_id=${a.id}${t}" target="_blank">AI Review</a>` : ''}
          ${a.pdf_drive_url ? `<a class="btn btn-secondary btn-sm" href="${a.pdf_drive_url}" target="_blank">PDF</a>` : ''}
          ${a.drive_folder_url ? `<a class="btn btn-secondary btn-sm" href="${a.drive_folder_url}" target="_blank">Drive</a>` : ''}
          ${a.status === 'error' ? `<button class="btn btn-secondary btn-sm" onclick="retryAssessment(${a.id})">Retry</button>` : ''}
          ${a.status === 'complete' ? `<button class="btn btn-secondary btn-sm" onclick="regenerateReview(${a.id})">Regen AI</button>` : ''}
          <button class="btn btn-sm" style="background:#d32f2f;color:#fff" onclick="deleteAssessment(${a.id})">Delete</button>
        </div>
      </div>`;
    list.appendChild(card);
  }
}

async function retryAssessment(id) {
  if (!confirm('Retry processing for this assessment?')) return;
  await apiFetch(`/api/assessments/${id}/retry`, { method: 'POST' });
  await loadAll();
}

async function regenerateReview(id) {
  if (!confirm('Regenerate the AI review? This will add a new AI review entry.')) return;
  await apiFetch(`/api/assessments/${id}/regenerate-ai-review`, { method: 'POST' });
  showBanner(document.getElementById('banner-area'), 'AI review regenerated.', 'success');
}

async function deleteAssessment(id) {
  if (!confirm('Delete this assessment? This cannot be undone.')) return;
  await apiFetch(`/api/assessments/${id}`, { method: 'DELETE' });
  await loadAll();
}

function renderMentors() {
  const list = document.getElementById('mentors-list');
  list.innerHTML = '';
  const appUrl = window.location.origin;
  for (const m of allMentors) {
    const myStudents = allStudents.filter(s => s.mentor_id === m.id);
    const details = document.createElement('details');
    details.className = 'card';
    details.innerHTML = `
      <summary>${m.name} — ${m.email}</summary>
      <div style="margin-top:12px">
        <p class="text-gray">Students: ${myStudents.map(s => s.name).join(', ') || 'None'}</p>
        <p class="text-gray mt-16">Dashboard: <a href="${appUrl}/mentor-dashboard.html?mentor_id=${m.id}&token=${m.dashboard_token || ''}" target="_blank">${appUrl}/mentor-dashboard.html?mentor_id=${m.id}&token=${m.dashboard_token || ''}</a></p>
        <div style="display:flex;gap:12px;margin-top:12px;flex-wrap:wrap">
          <div class="form-group" style="flex:1"><label>Name</label><input type="text" class="edit-mentor-name" value="${m.name}"></div>
          <div class="form-group" style="flex:1"><label>Email</label><input type="email" class="edit-mentor-email" value="${m.email}"></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-primary btn-sm" onclick="saveMentor(${m.id}, this)">Save</button>
          <button class="btn btn-sm" style="background:#d32f2f;color:#fff" onclick="deleteMentor(${m.id})">Delete</button>
        </div>
      </div>`;
    list.appendChild(details);
  }
}

async function deleteMentor(id) {
  if (!confirm('Delete this mentor? This cannot be undone.')) return;
  await apiFetch(`/api/mentors/${id}`, { method: 'DELETE' });
  await loadAll();
}

async function saveMentor(id, btn) {
  const card = btn.closest('details');
  const name = card.querySelector('.edit-mentor-name').value;
  const email = card.querySelector('.edit-mentor-email').value;
  await apiFetch(`/api/mentors/${id}`, { method: 'PUT', body: { name, email } });
  await loadAll();
}

document.getElementById('add-mentor-btn').addEventListener('click', async () => {
  const name = document.getElementById('new-mentor-name').value.trim();
  const email = document.getElementById('new-mentor-email').value.trim();
  if (!name || !email) return;
  await apiFetch('/api/mentors', { method: 'POST', body: { name, email } });
  document.getElementById('new-mentor-name').value = '';
  document.getElementById('new-mentor-email').value = '';
  await loadAll();
});

function renderStudents() {
  const mentorSel = document.getElementById('new-student-mentor');
  mentorSel.innerHTML = '';
  for (const m of allMentors) {
    const o = document.createElement('option');
    o.value = m.id; o.textContent = m.name;
    mentorSel.appendChild(o);
  }

  const list = document.getElementById('students-list');
  list.innerHTML = '';
  const sorted = [...allStudents].sort((a, b) => a.name.localeCompare(b.name));
  for (const s of sorted) {
    const mentorName = allMentors.find(m => m.id === s.mentor_id)?.name || '—';
    const details = document.createElement('details');
    details.className = 'card';
    details.innerHTML = `
      <summary>${s.name} — ${mentorName}</summary>
      <div style="margin-top:12px;display:flex;gap:12px;flex-wrap:wrap">
        <div class="form-group" style="flex:1"><label>Name</label><input type="text" class="edit-student-name" value="${s.name}"></div>
        <div class="form-group" style="flex:1"><label>Email</label><input type="email" class="edit-student-email" value="${s.email || ''}"></div>
        <div class="form-group" style="flex:1"><label>Mentor</label>
          <select class="edit-student-mentor">${allMentors.map(m => `<option value="${m.id}" ${m.id === s.mentor_id ? 'selected' : ''}>${m.name}</option>`).join('')}</select>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-primary btn-sm" onclick="saveStudent(${s.id}, this)">Save</button>
        <button class="btn btn-sm" style="background:#d32f2f;color:#fff" onclick="deleteStudent(${s.id})">Delete</button>
      </div>`;
    list.appendChild(details);
  }
}

async function deleteStudent(id) {
  if (!confirm('Delete this student? This cannot be undone.')) return;
  await apiFetch(`/api/students/${id}`, { method: 'DELETE' });
  await loadAll();
}

async function saveStudent(id, btn) {
  const card = btn.closest('details');
  const name = card.querySelector('.edit-student-name').value;
  const email = card.querySelector('.edit-student-email').value;
  const mentor_id = parseInt(card.querySelector('.edit-student-mentor').value);
  await apiFetch(`/api/students/${id}`, { method: 'PUT', body: { name, email, mentor_id } });
  await loadAll();
}

document.getElementById('add-student-btn').addEventListener('click', async () => {
  const name = document.getElementById('new-student-name').value.trim();
  const email = document.getElementById('new-student-email').value.trim();
  const mentor_id = parseInt(document.getElementById('new-student-mentor').value);
  if (!name) return;
  await apiFetch('/api/students', { method: 'POST', body: { name, email, mentor_id } });
  document.getElementById('new-student-name').value = '';
  document.getElementById('new-student-email').value = '';
  await loadAll();
});

document.getElementById('bulk-import-btn').addEventListener('click', async () => {
  const text = document.getElementById('bulk-import-text').value.trim();
  const rows = text.split('\n').map(line => {
    const [name, email, mentor_name] = line.split('\t').map(s => s.trim());
    return { name, email, mentor_name };
  }).filter(r => r.name);
  const result = await apiFetch('/api/students/bulk-import', { method: 'POST', body: { rows } });
  document.getElementById('bulk-result').textContent = `Imported ${result.imported}. Skipped: ${result.skipped.join(', ') || 'none'}`;
  await loadAll();
});

function renderOverview() {
  const tbody = document.getElementById('overview-body');
  tbody.innerHTML = '';
  const sorted = [...allStudents].sort((a, b) => a.name.localeCompare(b.name));
  for (const s of sorted) {
    const mentorName = allMentors.find(m => m.id === s.mentor_id)?.name || '—';
    const rounds = allAssessments.filter(a => a.student_id === s.id).length;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${s.name}</td><td>${mentorName}</td><td>${rounds}</td>`;
    tbody.appendChild(tr);
  }
}

function exportOverviewCsv() {
  const rows = [['Student', 'Mentor', 'Rounds Submitted']];
  const sorted = [...allStudents].sort((a, b) => a.name.localeCompare(b.name));
  for (const s of sorted) {
    const mentorName = allMentors.find(m => m.id === s.mentor_id)?.name || '';
    const rounds = allAssessments.filter(a => a.student_id === s.id).length;
    rows.push([s.name, mentorName, rounds]);
  }
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'upbuild-overview.csv'; a.click();
  URL.revokeObjectURL(url);
}
