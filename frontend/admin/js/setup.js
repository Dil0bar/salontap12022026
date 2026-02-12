const API = "/api";
const params = new URLSearchParams(location.search);
const salonId = params.get("salon_id");

const slotMaster = document.getElementById("slotMaster");
const slotService = document.getElementById("slotService");
const viewMaster = document.getElementById("viewMaster");
const slotDate = document.getElementById("slotDate");
const slotTimes = document.getElementById("slotTimes");
const slotsList = document.getElementById("masterSlotsList");




if (!salonId) {
  alert("Не выбран салон");
  location.href = "/admin";
}

async function apiFetch(method, url, body) {
  const token = localStorage.getItem("salon_token");
  const headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + token
  };

  const res = await fetch(API + url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });

  return res.json();
}


async function loadSalon() {
  const data = await apiFetch("GET", `/salons/${salonId}`);

  document.getElementById("salonTitle").textContent =
    "Настройка: " + data.salon.name;

  renderMasters(data.masters || []);
  renderServices();
}


function renderMasters(masters) {
  const ul = document.getElementById("mastersList");

  if (!masters.length) {
    ul.innerHTML = "<li>❌ Мастеров пока нет</li>";
    return;
  }

  ul.innerHTML = `
    <p style="font-weight:600; margin-bottom:8px;">
      ✅ У вас ${masters.length} мастера
    </p>
    ${masters.map(m => `
      <li>
        ${m.name}
        <button onclick="deleteMaster(${m.id})">✖</button>
      </li>
    `).join("")}
  `;
}


async function addMaster() {
  const name = document.getElementById("masterName").value.trim();
  if (!name) return alert("Введите имя");

  await apiFetch("POST", `/salons/${salonId}/masters`, { name });
  document.getElementById("masterName").value = "";
  loadSalon();

}

async function deleteMaster(id) {
  if (!confirm("Удалить мастера?")) return;
  await apiFetch("DELETE", `/masters/${id}`);
  loadSalon();


}


async function renderServices() {
  const services = await apiFetch("GET", `/salons/${salonId}/services`);
  const ul = document.getElementById("servicesList");

  if (!services.length) {
    ul.innerHTML = "<li>Услуг пока нет</li>";
    return;
  }

  ul.innerHTML = services.map(s => `
    <li>
      ${s.name} — ${s.price || 0} сум (${s.duration_minutes || 0} мин)
      <button onclick="deleteService(${s.id})">✖</button>
    </li>
  `).join("");
}


async function addService() {
  const name = serviceName.value.trim();
  if (!name) return alert("Введите название");

  if (!selectedCategories.length)
    return alert("Выберите хотя бы одну категорию");

  await apiFetch("POST", "/services", {
    salon_id: salonId,
    name,
    price: servicePrice.value || null,
    duration_minutes: serviceDuration.value || null,
    categories: selectedCategories
  });

  serviceName.value = "";
  servicePrice.value = "";
  serviceDuration.value = "";
  selectedCategories = [];

  loadSalon();
}


async function deleteService(id) {
  if (!confirm("Удалить услугу?")) return;
  await apiFetch("DELETE", `/services/${id}`);
  loadSalon();
}


let selectedCategories = [];

async function loadServiceCategories() {
  const cats = await apiFetch("GET", "/categories");
  const box = document.getElementById("serviceCategories");

  selectedCategories = [];

  box.innerHTML = cats.map(c => `
    <label style="display:inline-block; margin-right:12px;">
      <input type="checkbox" value="${c.key}">
      ${c.title}
    </label>
  `).join("");

  box.querySelectorAll("input").forEach(cb => {
    cb.onchange = () => {
      const val = cb.value;
      if (cb.checked) {
        if (!selectedCategories.includes(val))
          selectedCategories.push(val);
      } else {
        selectedCategories =
          selectedCategories.filter(x => x !== val);
      }
    };
  });
}


async function loadSlotForm() {
  const data = await apiFetch("GET", `/salons/${salonId}`);
  const services = await apiFetch("GET", `/salons/${salonId}/services`);

  slotMaster.innerHTML = data.masters.map(m =>
    `<option value="${m.id}">${m.name}</option>`
  ).join("");

  slotService.innerHTML = services.map(s =>
    `<option value="${s.id}">${s.name}</option>`
  ).join("");

  viewMaster.innerHTML = data.masters.map(m =>
  `<option value="${m.id}">${m.name}</option>`
).join("");

}

async function loadSlots() {
  const master_id = viewMaster.value;
  const rows = await apiFetch(
    "GET",
    `/masters/${master_id}/schedule/full`
  );

  if (!rows.length) {
    slotsList.innerHTML = "<li>Слотов пока нет</li>";
    return;
  }

  slotsList.innerHTML = rows.map(s => `
    <li>
      ${s.date} ${s.time}
      — ${s.service_name}
      ${s.is_taken ? "❌ занято" : "✅ свободно"}
      <button onclick="deleteSlot(${s.id})">✖</button>
    </li>
  `).join("");
}



async function addSchedule() {
  const master_id = Number(slotMaster.value);
  const service_id = Number(slotService.value);

  // timezone-safe дата
  const rawDate = slotDate.value;
  const date = rawDate.split("T")[0];   // фикс

  const times = slotTimes.value
    .split(",")
    .map(t => t.trim())
    .filter(Boolean);

  if (!date || !times.length) {
    return alert("Заполните дату и время");
  }

  const slots = times.map(t => ({
    date: date,     // строго строка
    time: t
  }));

  const res = await apiFetch(
    "POST",
    `/masters/${master_id}/schedule`,
    { service_id, slots }
  );

  alert("Слоты добавлены");
  loadSlots();
}





async function deleteSlot(id) {
  if (!confirm("Удалить слот?")) return;
  await apiFetch("DELETE", `/schedule/${id}`);
  loadSlots();
}




loadSalon();
loadServiceCategories();
loadSlotForm();

viewMaster.addEventListener("change", loadSlots);
setTimeout(loadSlots, 300);


