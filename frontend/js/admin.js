(function () {
  const API_PREFIX = '/api';
  const tokenKey = 'salon_token';

  let mapAdmin = null;
  let markerAdmin = null;
  let lastCoords = null; // <-- ГЛАВНОЕ: тут хранятся координаты

  /* =====================================================================
        JWT HELPERS
  ===================================================================== */
  function parseJwt(token) {
    try {
      const payload = token.split('.')[1];
      const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(decodeURIComponent(escape(json)));
    } catch {
      return null;
    }
  }

  function getCurrentToken() {
    const token = localStorage.getItem(tokenKey);
    if (!token) return null;
    const payload = parseJwt(token);
    return payload ? { token, payload } : null;
  }

  async function apiFetch(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const stored = getCurrentToken();
    if (stored) headers['Authorization'] = 'Bearer ' + stored.token;

    const res = await fetch(API_PREFIX + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) throw { status: res.status, data };
    return data;
  }

  /* =====================================================================
        DOM
  ===================================================================== */
  const loginEmail = document.getElementById('login-email');
  const loginPass = document.getElementById('login-password');
  const loginBtn = document.getElementById('login-btn');

  const regEmail = document.getElementById('reg-email');
  const regPass = document.getElementById('reg-password');
  const regBtn = document.getElementById('reg-btn');

  const goLogin = document.getElementById('go-login');
  const goRegister = document.getElementById('go-register');

  const authSection = document.getElementById('auth-section');

  const logoutBtn = document.getElementById('logout-btn');
  const createSection = document.querySelector('.create-card');
  const adminPanel = document.getElementById('admin-panel');
  const adminSalons = document.getElementById('admin-salons');

  const nameEl = document.getElementById('salon-name');
  const descEl = document.getElementById('salon-desc');
  const addressEl = document.getElementById('salon-address');

  const photoInput = document.getElementById('salon-photo');
  const createBtn = document.getElementById('create-salon');

  const listWrap = document.getElementById('admin-salons');

  /* =====================================================================
        CATEGORIES
  ===================================================================== */
  const categoryEls = document.querySelectorAll('.svc-categories span');
  let selectedCategories = [];

  categoryEls.forEach(el => {
    el.addEventListener('click', () => {
      el.classList.toggle('active');
      const val = el.dataset.cat;

      if (el.classList.contains('active')) selectedCategories.push(val);
      else selectedCategories = selectedCategories.filter(c => c !== val);
    });
  });

  /* =====================================================================
        UI HELPERS
  ===================================================================== */
  function showStatus(msg) {
    const st = document.getElementById('auth-status');
    st.textContent = msg;
    setTimeout(() => st.textContent = '', 2200);
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>\"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
    }[m]));
  }

  /* =====================================================================
        AUTH SWITCH
  ===================================================================== */
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  goRegister?.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
  });

  goLogin?.addEventListener('click', (e) => {
    e.preventDefault();
    registerForm.style.display = 'none';
    loginForm.style.display = 'block';
  });

  /* =====================================================================
        AUTH UI
  ===================================================================== */
  function updateAuthUI() {
    const auth = getCurrentToken();

    if (!auth) {
      authSection.style.display = 'block';
      createSection.style.display = 'none';
      adminPanel.style.display = 'none';
      adminSalons.style.display = 'none';
      logoutBtn.style.display = 'none';
      return;
    }

    authSection.style.display = 'none';
    createSection.style.display = 'block';
    adminPanel.style.display = 'block';
    adminSalons.style.display = 'block';
    logoutBtn.style.display = 'inline-block';
  }

  logoutBtn?.addEventListener('click', () => {
    localStorage.removeItem(tokenKey);
    showStatus("Вы вышли");
    updateAuthUI();
  });

  /* =====================================================================
        PHOTO
  ===================================================================== */
  let pendingPhoto = null;

  photoInput?.addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => pendingPhoto = r.result;
    r.readAsDataURL(f);
  });

  /* =====================================================================
        LOGIN / REGISTER
  ===================================================================== */
  loginBtn?.addEventListener('click', async () => {
    try {
      const data = await apiFetch('POST', '/login', {
        email: loginEmail.value,
        password: loginPass.value
      });

      if (data.token) {
        localStorage.setItem(tokenKey, data.token);
        updateAuthUI();
        renderList_withServices();
      }
    } catch {
      showStatus('Ошибка входа');
    }
  });

  regBtn?.addEventListener('click', async () => {
    try {
      const data = await apiFetch('POST', '/signup', {
        email: regEmail.value,
        password: regPass.value
      });

      if (data.token) {
        localStorage.setItem(tokenKey, data.token);
        updateAuthUI();
        renderList_withServices();
      }
    } catch {
      showStatus('Ошибка регистрации');
    }
  });

  /* =====================================================================
        CREATE SALON
  ===================================================================== */

  createBtn?.addEventListener('click', async () => {
    const auth = getCurrentToken();
    if (!auth) return alert('Войдите');

    const name = nameEl.value.trim();
    if (!name) return alert('Введите имя салона');

    const payload = {
      name,
      address: addressEl.value.trim(),
      lat: lastCoords ? lastCoords[0] : null,
      lng: lastCoords ? lastCoords[1] : null,
      short_desc: descEl.value,
      full_desc: descEl.value,
      categories: selectedCategories
    };

    if (pendingPhoto) payload.photos = [pendingPhoto];

    try {
      await apiFetch('POST', '/salons', payload);

      nameEl.value = '';
      descEl.value = '';
      addressEl.value = '';
      pendingPhoto = null;

      selectedCategories = [];
      categoryEls.forEach(el => el.classList.remove('active'));

      showStatus('Салон создан');
      renderList_withServices();
    } catch {
      alert('Ошибка создания салона');
    }
  });

  /* =====================================================================
        LIST SALONS
  ===================================================================== */
  async function renderList() {
    const auth = getCurrentToken();
    if (!auth) return;

    const userId = auth.payload.id;
    const salons = await apiFetch('GET', '/salons');
    const my = salons.filter(s => s.owner_id === userId);

    if (!my.length) {
      listWrap.innerHTML = '<p>У вас пока нет салона</p>';
      return;
    }

    listWrap.innerHTML = my.map(s => `
      <div class="salon-block" data-id="${s.id}">
        <h3>${escapeHtml(s.name)}</h3>
        <p>${escapeHtml(s.short_desc || '')}</p>
        <p><strong>Адрес:</strong> ${escapeHtml(s.address || '—')}</p>

        <div style="margin-top:10px; display:flex; gap:10px">

          <a href="salon_admin.html?id=${s.id}" class="btn primary">
            Управлять салоном
          </a>

          <button class="btn edit-salon" data-id="${s.id}">
            Редактировать
          </button>

        </div>
      </div>
    `).join('');

    attachEditHandlers();
  }


  function attachEditHandlers() {

    document.querySelectorAll(".edit-salon").forEach(btn => {

      btn.onclick = async () => {

        editingId = btn.dataset.id;

        const salons = await apiFetch('GET','/salons');
        const salon = salons.find(s => s.id == editingId);

        document.getElementById('edit-section').style.display = 'block';

        document.getElementById('edit-name').value = salon.name || '';
        document.getElementById('edit-desc').value = salon.short_desc || '';
        document.getElementById('edit-address').value = salon.address || '';

        document.getElementById('edit-section')
          .scrollIntoView({behavior:'smooth'});
      };

    });

  }





  let editingId = null;

    listWrap.addEventListener('click', async (e) => {

      if (!e.target.classList.contains('edit-salon')) return;

      editingId = e.target.dataset.id;

      const salons = await apiFetch('GET','/salons');
      const salon = salons.find(s => s.id == editingId);

      document.getElementById('edit-section').style.display = 'block';

      document.getElementById('edit-name').value = salon.name || '';
      document.getElementById('edit-desc').value = salon.short_desc || '';
      document.getElementById('edit-address').value = salon.address || '';
    });


  document.getElementById("bookings-modal").style.display = "none";

  document.getElementById('save-edit').addEventListener('click', async () => {

    await apiFetch('PUT', `/salons/${editingId}`, {
      name: document.getElementById('edit-name').value,
      short_desc: document.getElementById('edit-desc').value,
      address: document.getElementById('edit-address').value
    });

    document.getElementById('edit-section').style.display = 'none';

    renderList();
  });



  /* =====================================================================
        YANDEX MAP INIT
  ===================================================================== */

  function initYandex() {
    if (!document.getElementById("map-admin")) return;

    ymaps.ready(() => {
      const center = [41.311081, 69.240562];

      mapAdmin = new ymaps.Map("map-admin", {
        center,
        zoom: 12
      });

      markerAdmin = new ymaps.Placemark(center, {}, { draggable: true });
      mapAdmin.geoObjects.add(markerAdmin);

      lastCoords = center;

      markerAdmin.events.add("dragend", async () => {
        const coords = markerAdmin.geometry.getCoordinates();
        lastCoords = coords;
        addressEl.value = await reverseGeocode(coords);
      });

      mapAdmin.events.add("click", async (e) => {
        const coords = e.get('coords');
        lastCoords = coords;
        markerAdmin.geometry.setCoordinates(coords);
        addressEl.value = await reverseGeocode(coords);
      });

      setupSuggest();
    });
  }

  function setupSuggest() {
    const sv = new ymaps.SuggestView("salon-address");

    sv.events.add("select", (e) => {
      const value = e.get('item').value;

      ymaps.geocode(value).then((res) => {
        const obj = res.geoObjects.get(0);
        const coords = obj.geometry.getCoordinates();
        lastCoords = coords;

        markerAdmin.geometry.setCoordinates(coords);
        mapAdmin.setCenter(coords, 16);
      });
    });
  }

  async function reverseGeocode(coords) {
    const res = await ymaps.geocode(coords);
    const obj = res.geoObjects.get(0);
    return obj ? obj.getAddressLine() : "";
  }

  /* =====================================================================
        START
  ===================================================================== */
  document.addEventListener('DOMContentLoaded', () => {
    updateAuthUI();
    renderList_withServices();
    initYandex();
  });

  async function renderList_withServices() {
    await renderList();
  }

})();
