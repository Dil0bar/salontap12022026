const API = '/api';
const tokenKey = 'salon_token';

function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

function getTokenPayload() {
  const token = localStorage.getItem(tokenKey);
  if (!token) return null;
  return parseJwt(token);
}

function show(id) {
  ['loginBox','noAccessBox','adminBox']
    .forEach(x => document.getElementById(x).classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

// ===== INIT =====
(function init() {
  const payload = getTokenPayload();

  if (!payload) {
    show('loginBox');
    return;
  }

  if (payload.role !== 'super_admin') {
    show('noAccessBox');
    return;
  }

  show('adminBox');
})();

// ===== LOGIN =====
async function login() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  const res = await fetch(API + '/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  const data = await res.json();
  if (!res.ok) {
    document.getElementById('loginError').textContent = 'Ошибка входа';
    return;
  }

  localStorage.setItem(tokenKey, data.token);
  location.reload();
}

// ===== DEMO API =====
async function loadUsers() {
  const token = localStorage.getItem('salon_token');
  const res = await fetch('/api/admin/users', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const users = await res.json();

  const tbody = document.querySelector('#usersTable tbody');
  tbody.innerHTML = '';

  users.forEach(u => {
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${u.id}</td>
      <td>${u.email}</td>
      <td>
        <select onchange="changeRole(${u.id}, this.value)">
          <option ${u.role==='client'?'selected':''}>client</option>
          <option ${u.role==='salon_admin'?'selected':''}>salon_admin</option>
          <option ${u.role==='super_admin'?'selected':''}>super_admin</option>
        </select>
      </td>
      <td>${u.is_active ? '✅ active' : '⛔ blocked'}</td>
      <td>${u.created_at || ''}</td>
      <td>
        <button onclick="toggleUser(${u.id}, ${u.is_active ? 0 : 1})">
          ${u.is_active ? 'Block' : 'Unblock'}
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

async function toggleUser(id, active) {
  const token = localStorage.getItem('salon_token');
  await fetch(`/api/admin/users/${id}/block`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    },
    body: JSON.stringify({ is_active: active })
  });
  loadUsers();
  loadLogs();
}

async function changeRole(id, role) {
  const token = localStorage.getItem('salon_token');
  await fetch(`/api/admin/users/${id}/role`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    },
    body: JSON.stringify({ role })
  });
  loadLogs();
}

async function loadLogs() {
  const token = localStorage.getItem('salon_token');
  const res = await fetch('/api/admin/logs', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const logs = await res.json();
  document.getElementById('logs').textContent =
    JSON.stringify(logs, null, 2);
}

// при входе
loadUsers();
loadLogs();
