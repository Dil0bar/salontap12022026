(function () {
  function q(sel) { return document.querySelector(sel) }
  function qa(sel) { return document.querySelectorAll(sel) }
  function parseId() { const p = new URLSearchParams(location.search); return p.get('id'); }
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  let currentSalon = null;
  let currentMaster = null;
  let selectedDate = null;
  let selectedSlotId = null;

  let selectedServiceId = null;


  // ==========================
  // LOAD SALON
  // ==========================
  async function loadSalon() {
    const id = parseId();
    if (!id) return;

    try {
      const res = await fetch('/api/salons/' + id);
      const json = await res.json();
      if (json.error) {
        q('#salon-title').textContent = 'Салон не найден';
        return;
      }

      const salon = json.salon || json;
      const masters = json.masters || [];
      currentSalon = { ...salon, masters };

      renderSalon();
      loadPublicServices();
    } catch (err) {
      console.error('loadSalon err', err);
      q('#salon-title').textContent = 'Ошибка загрузки';
    }
  }

  function renderSchedule(rows){

    const wrap = document.getElementById("time-slots-flow");


    if(!rows.length){
      wrap.innerHTML = "<p>Нет свободных слотов</p>";
      return;
    }

      wrap.innerHTML = rows.map(s=>`
        <div class="slot-card"
            data-id="${s.id}"
            data-price="${s.price}">

        <div>${s.date} • ${s.time}</div>
        <div>${s.service_name}</div>
        <div>${Number(s.price).toLocaleString()} сум</div>
      </div>
    `).join("");

    document.querySelectorAll(".slot-card").forEach(card=>{
     card.onclick = ()=>{
      document.querySelectorAll("#time-slots-flow .slot-card")
        .forEach(x=>x.classList.remove("selected"));

      card.classList.add("selected");
      selectedSlotId = Number(card.dataset.id);

      updateTotalPrice();
    }


    });
  }



  async function loadServiceSchedule(serviceId){

    const wrap = document.getElementById("time-slots-flow");
    wrap.innerHTML = "Загрузка...";

    const res = await fetch(
      `/api/masters/${currentMaster.id}/slots?service_id=${serviceId}`
    );



    const rows = await res.json();

    if(!rows.length){
      wrap.innerHTML = "<p>Нет свободных слотов</p>";
      return;
    }

    wrap.innerHTML = rows.map(s=>`
      <div class="slot-card"
          data-id="${s.id}"
          data-price="${s.price}">

      <div class="slot-top">
        <span class="slot-date">${s.date}</span>
        <span class="slot-time">${s.time}</span>
      </div>

      <div class="slot-service">${s.service_name}</div>

      <div class="slot-price">
        ${Number(s.price).toLocaleString()} сум
      </div>
    </div>
  `).join("");


    document.querySelectorAll(".slot-card").forEach(card=>{
     card.onclick = ()=>{
      document.querySelectorAll("#time-slots-flow .slot-card")
        .forEach(x=>x.classList.remove("selected"));

      card.classList.add("selected");
      selectedSlotId = Number(card.dataset.id);

      updateTotalPrice();
    }


    });
  }



  async function loadMasterScheduleAll(){

    const wrap = document.getElementById("time-slots-flow");
    wrap.innerHTML = "Загрузка...";

    const res = await fetch(
      `/api/masters/${currentMaster.id}/slots`
    );

    const rows = await res.json();

    if(!rows.length){
      wrap.innerHTML = "<p>Нет свободных слотов</p>";
      return;
    }

   wrap.innerHTML = rows.map(s=>`
      <div class="slot-card"
          data-id="${s.id}"
          data-price="${s.price}">

      <div class="slot-top">
        <span class="slot-date">${s.date}</span>
        <span class="slot-time">${s.time}</span>
      </div>

      <div class="slot-service">${s.service_name}</div>

      <div class="slot-price">
        ${Number(s.price).toLocaleString()} сум
      </div>
    </div>
  `).join("");


    document.querySelectorAll(".slot-card").forEach(card=>{
      card.onclick = ()=>{
      card.classList.toggle("selected");
      selectedSlotId = card.dataset.id;
      updateTotalPrice();
    }


    });
  }



  // ==========================
  // RENDER SALON
  // ==========================
  function renderSalon() {
    if (!currentSalon) return;

    q('#salon-title').textContent = currentSalon.name;
    q('#salon-desc').textContent =
      currentSalon.full_desc || currentSalon.short_desc || '';

    document.getElementById('salon-address').textContent =
    currentSalon.address ? "📍 " + currentSalon.address : "";

    
    // photos
    const gallery = q('#gallery');
    gallery.innerHTML = (currentSalon.photos && currentSalon.photos.length)
      ? currentSalon.photos.map(src => `<img src="${src}">`).join('')
      : '<img src="assets/sample.jpg">';

    // masters list
   const mastersWrap = q('#masters');
   mastersWrap.innerHTML = currentSalon.masters.map(m => `
    <div class="master-card" data-id="${m.id}">
      <div class="master-avatar">
        <img src="${m.photo || 'assets/avatar.png'}">
      </div>
      <div class="master-name">${escapeHtml(m.name)}</div>
    </div>
  `).join('');

  qa('.master-card').forEach(card => {
    card.onclick = async () => {

      const id = Number(card.dataset.id);
      currentMaster = currentSalon.masters.find(m => m.id === id);

      qa('.master-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');

      document.getElementById("selected-master-title").innerText =
        "Мастер: " + currentMaster.name;

      document.getElementById("booking-flow-modal")
        .classList.remove("hidden");

      document.getElementById("calendar").innerHTML = "";
      document.getElementById("time-slots").innerHTML =
        "<small>Сначала выберите услугу</small>";

      await loadMasterServices(currentMaster.id);
    };
  });

    





    // fill select
    const sel = q('#master-select');
    sel.innerHTML = currentSalon.masters.map(m =>
      `<option value="${m.id}">${escapeHtml(m.name)}</option>`
    ).join('');

    currentMaster = currentSalon.masters[0] || null;
  }

  let selectedServices = [];


  function updateTotalPrice(){
    const totalEl = document.getElementById("total-price");
    if(!totalEl) return;

    let total = 0;

    document.querySelectorAll(".slot-card.selected").forEach(card=>{
      total += Number(card.dataset.price || 0);
    });

    totalEl.innerHTML = "Итого: " + total.toLocaleString() + " сум";
  }


  async function loadMasterServices(masterId){
     if(!currentMaster) return;

    const wrap = document.getElementById("master-services");
    wrap.innerHTML = "Загрузка услуг...";

    const res = await fetch(`/api/masters/${masterId}/services`);
    const services = await res.json();

    if(!services.length){
      wrap.innerHTML = "<p>У мастера нет услуг</p>";
      return;
    }
    selectedServiceId = null;

    wrap.innerHTML = `
      <div class="service-filter">
        

        <button class="service-pill active" data-id="all">Все</button>
        ${services.map(s=>`
          <button class="service-pill" data-id="${s.id}">
            ${s.name}
          </button>
        `).join("")}
      </div>
    `;



 
      document.querySelectorAll(".service-pill").forEach(btn=>{
        btn.onclick = async ()=>{

          document.querySelectorAll(".service-pill")
            .forEach(x=>x.classList.remove("active"));

          btn.classList.add("active");

          const id = btn.dataset.id;

          if(id === "all"){
            selectedServiceId = null;
            await loadMasterScheduleAll();
          }else{
            selectedServiceId = Number(id);
            await loadServiceSchedule(selectedServiceId);
          }

          updateTotalPrice();
        }
      });

      if (selectedServiceId) {
        await loadServiceSchedule(selectedServiceId);
      } else {
        await loadMasterScheduleAll();
      }

  }


  // ==========================
  // CALENDAR
  // ==========================
  function buildCalendar() {
    const cal = q('#calendar');
    cal.innerHTML = '';

    const now = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const iso = new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate()
      ).toLocaleDateString("sv-SE");


      const dayEl = document.createElement('div');
      dayEl.className = 'day-card';
      dayEl.innerHTML = `
        <div class="day-num">${d.getDate()}</div>
        <div class="day-week">${d.toLocaleDateString('ru-RU', { weekday: 'short' })}</div>
      `;
      dayEl.dataset.date = iso;


      dayEl.addEventListener('click', async () => {
        qa('.day-card').forEach(x => x.classList.remove('selected'));
        dayEl.classList.add('selected');

        selectedDate = iso;
        await loadAvailableSlotsForCurrentMaster(iso);
      });

      cal.appendChild(dayEl);
    }
  }


  // ==========================
  // SalonMap
  // ==========================
  function initSalonMap() {
    if (!currentSalon || !currentSalon.lat || !currentSalon.lng) return;

      ymaps.ready(() => {
          const map = new ymaps.Map("salon-map", {
              center: [currentSalon.lat, currentSalon.lng],
              zoom: 15
          });

          const mark = new ymaps.Placemark([currentSalon.lat, currentSalon.lng], {
              balloonContent: currentSalon.address
          });

          map.geoObjects.add(mark);
      });
  }

  // в конце loadSalon()
  initSalonMap();


  

  // ==========================
  // LOAD SLOTS (beautiful cards)
  // ==========================
  async function loadAvailableSlotsForCurrentMaster(dateIso) {
    selectedDate = dateIso;

    const wrap = q('#time-slots');
    wrap.innerHTML = '<p>Загрузка...</p>';

    if (!currentMaster || !selectedServiceId) {
      wrap.innerHTML = '<p>Выберите услугу и мастера</p>';
      return;
    }

    try {
      const res = await fetch(
        `/api/masters/${currentMaster.id}/available` +
        `?date=${dateIso}&service_id=${selectedServiceId}`
      );

      const rows = await res.json();

      if (!rows.length) {
        wrap.innerHTML = '<p>Нет свободных слотов</p>';
        return;
      }

      wrap.innerHTML = rows.map(r => `
        <div class="slot-card" data-id="${r.id}">
          ${r.time} • ${Number(r.price).toLocaleString()} сум
        </div>
      `).join('');

      qa('.slot-card').forEach(card => {
        card.addEventListener('click', () => {
          qa('.slot-card').forEach(x => x.classList.remove('selected'));
          card.classList.add('selected');
          selectedSlotId = card.dataset.id;
        });
      });

    } catch (e) {
      console.error(e);
      wrap.innerHTML = '<p>Ошибка загрузки слотов</p>';
    }
  }


  async function loadServicePriceFromSchedule(serviceId, el) {
    try {
      const res = await fetch(
        `/api/services/${serviceId}/slots`
      );
      const slots = await res.json();

      if (!Array.isArray(slots) || !slots.length) {
        el.textContent = '';
        return;
      }

      // берём минимальную цену из schedule
      const minPrice = Math.min(...slots.map(s => s.price));

      el.textContent = `Цена: ${minPrice.toLocaleString()} сум`;
    } catch (e) {
      console.error(e);
      el.textContent = '';
    }
  }

  function getNextDates(days = 7) {
    const dates = [];
    const now = new Date();

    for (let i = 0; i < days; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      dates.push(
        new Date(d.getFullYear(), d.getMonth(), d.getDate())
          .toLocaleDateString("sv-SE")
      );

    }

    return dates;
  }

  async function checkServiceAvailability(serviceId) {
    if (!currentSalon || !currentSalon.masters?.length) {
      return {
        exists: false,
        masters: []
      };
    }

  async function masterHasSlotsOnDate(masterId, serviceId, dateIso) {
    try {
      const res = await fetch(
        `/api/masters/${masterId}/available?date=${dateIso}&service_id=${serviceId}`
      );
      const slots = await res.json();
      return Array.isArray(slots) && slots.length > 0;
    } catch {
      return false;
    }
  }



    const dates = getNextDates(7);
    const validMasters = new Map(); // master_id → master

    for (const master of currentSalon.masters) {
      for (const date of dates) {
        try {
          const res = await fetch(
            `/api/masters/${master.id}/available?date=${date}&service_id=${serviceId}`
          );

          const slots = await res.json();

          if (Array.isArray(slots) && slots.length > 0) {
            validMasters.set(master.id, master);
            break; // этот мастер уже подходит
          }
        } catch (e) {
          console.error('checkServiceAvailability error', e);
        }
      }
    }

    return {
      exists: validMasters.size > 0,
      masters: Array.from(validMasters.values())
    };
  }

async function loadServicesForDate(dateIso){

  const wrap = document.getElementById("bydate-services"); // ВАЖНО: не master-services
  wrap.innerHTML = "Загрузка...";

  const res = await fetch(
    `/api/salons/${currentSalon.id}/services-by-date?date=${dateIso}`
  );

  const services = await res.json();

  if(!services.length){
    wrap.innerHTML = "<p>Нет доступных услуг на эту дату</p>";
    return;
  }

  wrap.innerHTML = services.map(s=>`
    <button class="service-pill" data-id="${s.id}">
      ${s.name}
    </button>
  `).join("");

  document.querySelectorAll("#bydate-services .service-pill").forEach(btn=>{
    btn.onclick = async ()=>{
      selectedServiceId = btn.dataset.id;
      await loadSlotsByDate(dateIso);
    }
  });
}



function bindCalendarForFlow(){

  document.querySelectorAll("#calendar .day-card").forEach(dayEl=>{

    dayEl.onclick = async ()=>{

      document.querySelectorAll("#calendar .day-card")
        .forEach(x=>x.classList.remove("selected"));

      dayEl.classList.add("selected");

      const iso = dayEl.dataset.date;   // добавим ниже
      selectedDate = iso;

      await loadServicesForDate(iso);

    };

  });

}

function buildCalendarFlow() {
  const cal = document.getElementById('calendar-flow');
  if (!cal) return;

  cal.innerHTML = '';
  const now = new Date();

  for (let i = 0; i < 14; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const iso = new Date(d.getFullYear(), d.getMonth(), d.getDate())
      .toLocaleDateString("sv-SE");

    const dayEl = document.createElement('div');
    dayEl.className = 'day-card';
    dayEl.dataset.date = iso;
    dayEl.innerHTML = `
      <div class="day-num">${d.getDate()}</div>
      <div class="day-week">${d.toLocaleDateString('ru-RU', { weekday: 'short' })}</div>
    `;

    dayEl.onclick = async () => {
      cal.querySelectorAll('.day-card').forEach(x => x.classList.remove('selected'));
      dayEl.classList.add('selected');

      selectedDate = iso;

      // 🔥 тут твоя логика: по дате показать услуги
      await loadServicesForDate(iso);
    };

    cal.appendChild(dayEl);
  }
}


async function loadNearestSlots(){

  const wrap = document.getElementById("bydate-slots");
  wrap.innerHTML = "Загрузка...";

  const res = await fetch(`/api/schedule/nearest`);
  const rows = await res.json();

  if(!rows.length){
    wrap.innerHTML = "<p>Нет свободных слотов</p>";
    return;
  }

  wrap.innerHTML = rows.map(s=>`
    <div class="slot-card"
        data-id="${s.id}"
        data-price="${s.price}">

      <div class="slot-top">
        <span>${s.date} • ${s.time}</span>
        <span>${Number(s.price).toLocaleString()} сум</span>
      </div>

      <div class="slot-service">${s.service_name}</div>
      <div class="slot-master">Мастер: ${s.master_name}</div>

    </div>
  `).join("");

  // ⭐ ВАЖНО — клик
  document.querySelectorAll("#bydate-slots .slot-card").forEach(card=>{
    card.onclick = ()=>{
      card.classList.toggle("selected");
      updateByDateTotal();
    };
  });

}



function getByDateSelectedTotal(){
  let total = 0;
  document.querySelectorAll("#bydate-slots .slot-card.selected").forEach(card=>{
    total += Number(card.dataset.price || 0);
  });
  return total;
}

function getByDateSelectedServices(){
  const names = [];
  document.querySelectorAll("#bydate-slots .slot-card.selected").forEach(card=>{
    const name = card.querySelector(".slot-service")?.innerText;
    if(name) names.push(name);
  });
  return names;
}


  // ==========================
  // LOAD SERVICES
  // ==========================
  async function loadPublicServices() {
    const salonId = currentSalon?.id;
    if (!salonId) return;

    const wrap = q('#services-list-user');
    wrap.innerHTML = '<p>Загрузка...</p>';

    try {
      const res = await fetch(`/api/salons/${salonId}/services`);
      const services = await res.json();

      if (!services.length) {
        wrap.innerHTML = '<p>Услуг нет</p>';
        return;
      }

      wrap.innerHTML = services.map(s => `
        <div class="service-item">
          <h3>${escapeHtml(s.name)}</h3>
          <p class="service-price" id="service-price-${s.id}">
            Загрузка цены...
          </p>
          <p>Длительность: ${s.duration_minutes || '-'} мин</p>


          <button class="btn primary show-service-masters"
            data-id="${s.id}">
            Выбрать услугу
          </button>

          <div class="service-masters-wrap" id="service-masters-${s.id}"></div>
        </div>
      `).join('');

      services.forEach(s => {
        const priceEl = document.getElementById(`service-price-${s.id}`);
        if (priceEl) {
          loadServicePriceFromSchedule(s.id, priceEl);
        }
      });

      


      qa('.show-service-masters').forEach(btn => {
        btn.addEventListener('click', async () => {
          const serviceId = Number(btn.dataset.id);
          selectedServiceId = serviceId;

          const target = q('#service-masters-' + serviceId);

          // toggle
          if (target.innerHTML.trim()) {
            target.innerHTML = '';
            return;
          }

          target.innerHTML = '<p>Проверяем доступность...</p>';

          const result = await checkServiceAvailability(serviceId);

          if (!result.exists) {
            target.innerHTML = '<p>Для этой услуги пока нет мастеров</p>';
            return;
          }

          target.innerHTML = result.masters.map(m => `
           <div class="service-masters-wrap">
            <div class="master-row">
              <span class="master-name">${escapeHtml(m.name)}</span>
              <button class="btn small" data-mid="${m.id}">
                Выбрать
              </button>
            </div>
          </div>

          `).join('');

          target.querySelectorAll('button').forEach(b => {
            b.addEventListener('click', () => {
              const mid = Number(b.dataset.mid);
              currentMaster = currentSalon.masters.find(x => x.id === mid);

              q('#booking-modal').classList.remove('hidden');

              // 🔥 ВАЖНО: строим календарь ПОСЛЕ открытия модалки
              setTimeout(() => {
                buildCalendar();
                q('#time-slots').innerHTML = '<small>Выберите день</small>';
              }, 0);
            });
          });

        });
      });


    } catch (e) {
      console.error(e);
      wrap.innerHTML = '<p>Ошибка загрузки услуг</p>';
    }
  }

  function getSelectedTotal(){
    let total = 0;
    document.querySelectorAll(".slot-card.selected").forEach(card=>{
      total += Number(card.dataset.price || 0);
    });
    return total;
  }

  function getSelectedServicesNames(){
    const names = [];
    document.querySelectorAll(".slot-card.selected").forEach(card=>{
      const name = card.querySelector(".slot-service")?.innerText;
      if(name) names.push(name);
    });
    return names;
  }


  // ==========================
  // BOOKING LOGIC
  // ==========================
  q('#master-select').addEventListener('change', () => {
    const mid = Number(q('#master-select').value);
    currentMaster = currentSalon.masters.find(m => m.id === mid);

   q('#time-slots-flow').innerHTML = '<small>Выберите день</small>';
  });

  q('#confirm-book').addEventListener('click', async () => {

    const name = q('#client-name').value.trim();
    const phone = q('#client-phone').value.trim();

    if (!selectedSlotId) return alert('Выберите время');
    if (!name || !phone) return alert('Введите имя и телефон');

    // 🔴 берём выбранный слот напрямую
    const card = document.querySelector('.slot-card.selected');

    const services = card
      ? [card.querySelector('.slot-service')?.innerText || '']
      : [];

    const total = card
      ? Number(card.dataset.price || 0)
      : 0;

    try {
      const resp = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schedule_id: selectedSlotId,
          client_name: name,
          client_phone: phone,
          services: services,
          total_price: total
        })
      });

      const json = await resp.json();

      if (!resp.ok) {
        alert('Ошибка: ' + (json.error || resp.status));
        return;
      }

      alert('Запись подтверждена!');
      await loadAvailableSlotsForCurrentMaster(selectedDate);

    } catch (e) {
      console.error(e);
      alert('Ошибка сети');
    }
  });


  
q('#confirm-book-flow').addEventListener('click', async () => {

  const name  = q('#client-name-flow').value.trim();
  const phone = q('#client-phone-flow').value.trim();

  if (!selectedSlotId) return alert('Выберите время');

  const resp = await fetch('/api/book', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({
      schedule_id: selectedSlotId,
      client_name: name,
      client_phone: phone,
      services: getSelectedServicesNames(),
      total_price: getSelectedTotal()
    })

  });




  const json = await resp.json();

  if(!resp.ok) return alert(json.error);

  alert('Запись создана');
});





  // ==========================
  // OPEN / CLOSE MODAL
  // ==========================
  qa('.master-card').forEach(card => {
    card.addEventListener('click', async () => {

      const id = Number(card.dataset.id);
      currentMaster = currentSalon.masters.find(m => m.id === id);

      qa('.master-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');

      document.getElementById("selected-master-title").innerText =
        "Мастер: " + currentMaster.name;

      document.getElementById("booking-flow-modal")
        .classList.remove("hidden");

      document.getElementById("calendar-flow").innerHTML = "";
      document.getElementById("time-slots-flow").innerHTML =
        "<small>Сначала выберите услугу</small>";

      await loadMasterServices(currentMaster.id);
    });
  });


  

  function updateByDateTotal(){

    const cards = document.querySelectorAll("#bydate-slots .slot-card.selected");
    const sumBox = document.getElementById("bydate-summary");
    const totalEl = document.getElementById("bydate-total");

    if(!cards.length){
      sumBox.classList.add("hidden");
      return;
    }

    let total = 0;
    cards.forEach(c=>{
      total += Number(c.dataset.price || 0);
    });

    totalEl.innerHTML = "Итого: " + total.toLocaleString() + " сум";
    sumBox.classList.remove("hidden");
  }



  async function loadSlotsByDate(date){

    if(!currentSalon || !currentSalon.id){
      console.log("salon not loaded yet");
      return;
    }

    const wrap = document.getElementById("bydate-slots");
    wrap.innerHTML = "Загрузка...";

    const res = await fetch(
      `/api/schedule/by-date?date=${date}&salon_id=${currentSalon.id}`
    );

    const rows = await res.json();

    if(!rows.length){

      const nearest = await fetch(`/api/salons/${currentSalon.id}/slots`)
        .then(r=>r.json());

      if(nearest.length){
        renderSchedule(nearest);
        return;
      }

      wrap.innerHTML = "<p>Нет свободных слотов</p>";
      return;
    }


    wrap.innerHTML = rows.map(s=>`
      <div class="slot-card"
          data-id="${s.id}"
          data-price="${s.price}">

        <div class="slot-top">
          <span>${s.time}</span>
          <span>${Number(s.price).toLocaleString()} сум</span>
        </div>

        <div class="slot-service">
          ${s.service_name}
        </div>

        <div class="slot-master">
          Мастер: ${s.master_name}
        </div>

        <div class="slot-duration">
          ${s.duration_minutes || '-'} мин
        </div>

      </div>
    `).join("");

   document.querySelectorAll("#bydate-slots .slot-card").forEach(card=>{
      card.onclick = ()=>{
        card.classList.toggle("selected");
        updateByDateTotal();
      }
    });


  }

  function buildCalendarByDate(){

    const cal = document.getElementById("calendar-by-date");
    cal.innerHTML = "";

    const now = new Date();

    for(let i=0;i<14;i++){

      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate()+i);
      const iso = new Date(d.getFullYear(), d.getMonth(), d.getDate())
        .toLocaleDateString("sv-SE");

      const el = document.createElement("div");
      el.className = "day-card";
      el.dataset.date = iso;

      el.innerHTML = `
        <div>${d.getDate()}</div>
        <small>${d.toLocaleDateString('ru-RU',{weekday:'short'})}</small>
      `;

     el.onclick = async ()=>{

      document.querySelectorAll("#calendar-by-date .day-card")
        .forEach(x=>x.classList.remove("selected"));

      el.classList.add("selected");

      selectedDate = iso;

      await loadSlotsByDate(iso);   // ВАЖНО
    };


      cal.appendChild(el);
    }

    // 🔥 сразу после построения показываем ближайшие
    if(currentSalon){
      loadSlotsByDate(selectedDate);
    }


    // сразу выбираем сегодняшний день
    const first = cal.querySelector(".day-card");
      if(first){
        first.classList.add("selected");
        selectedDate = first.dataset.date;
        loadSlotsByDate(selectedDate);
      }


  }


 
  // ==========================
  // INIT
  // ==========================
  document.addEventListener('DOMContentLoaded', () => {
    loadSalon();
    buildCalendar();
    setTimeout(()=>{
      bindCalendarForFlow();
    },0);


    q('#choose-by-date')?.addEventListener('click', async () => {

      document.getElementById("booking-by-date-modal").classList.remove("hidden");

      buildCalendarByDate();

      await loadNearestSlots();   // ближайшие сразу показываются
    });





   document.addEventListener("click", e => {
      if (e.target.id === "booking-flow-close") {
        document.getElementById("booking-flow-modal").classList.add("hidden");
      }

      if (e.target.id === "booking-close") {
        document.getElementById("booking-modal").classList.add("hidden");
      }

       if (e.target.id === "booking-by-date-close") {
        document.getElementById("booking-by-date-modal").classList.add("hidden");
      }


      
    });


      });


      document.getElementById("bydate-book-btn")?.addEventListener("click", async ()=>{

        const cards = document.querySelectorAll("#bydate-slots .slot-card.selected");

        if(!cards.length){
          alert("Выберите услуги");
          return;
        }

        const name  = document.getElementById("bydate-client-name").value.trim();
        const phone = document.getElementById("bydate-client-phone").value.trim();

        if(!phone){
          alert("Введите телефон");
          return;
        }

        try{

          for(const card of cards){

            const slotId = card.dataset.id;   // ⭐ ВАЖНО

            await fetch("/api/book",{
              method:"POST",
              headers:{ "Content-Type":"application/json" },
              body: JSON.stringify({
                schedule_id: slotId,
                client_name: name,
                client_phone: phone,
                services: getByDateSelectedServices(),
                total_price: getByDateSelectedTotal()
              })
            });

          }

          alert("Запись создана");
          await loadSlotsByDate(selectedDate);

        }catch(e){
          alert("Ошибка записи");
          console.error(e);
        }

      });



})();
