document.addEventListener("DOMContentLoaded", async () => {

   let salons = [];

  const wrap = document.getElementById("salon-list");
  const input = document.getElementById("search-input");
  const results = document.getElementById("search-results");



  document.getElementById('burgerBtn').onclick = () => {
  document.querySelector('.header-inner').classList.toggle('open');
};











  

  // init map
  const map = L.map('map').setView([41.311, 69.279], 12);
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')
    .addTo(map);

  function placeMarkers(items){
    map.eachLayer(layer=>{
      if(layer instanceof L.Marker) map.removeLayer(layer);
    });

    items.forEach(s=>{
      if(!s.lat || !s.lng) return;
      L.marker([s.lat, s.lng])
        .addTo(map)
        .bindPopup(`<a href="salon.html?id=${s.id}">${s.name}</a>`);
    });
  }

  document.getElementById("nearNowBtn").addEventListener("click", () => {

    if (!salons || !salons.length) {
      alert("Салоны еще загружаются");
      return;
    }

    if (!navigator.geolocation) {
      alert("Геолокация не поддерживается");
      return;
    }

    navigator.geolocation.getCurrentPosition((pos) => {

      const userLat = pos.coords.latitude;
      const userLng = pos.coords.longitude;

      map.setView([userLat, userLng], 14);

      // считаем расстояние
      salons.forEach(s => {
        if (!s.lat || !s.lng) {
          s.distance = 9999;
          return;
        }
        s.distance = getDistance(userLat, userLng, s.lat, s.lng);
      });

      // ближайшие
      const sorted = [...salons]
        .sort((a,b)=>a.distance - b.distance)
        .slice(0,20);

      // ВАЖНО — как поиск
      render(sorted);

      // маркеры
      placeMarkers(sorted);

    }, () => {
      alert("Разрешите доступ к геолокации");
    });

  });



  function getDistance(lat1, lon1, lat2, lon2) {

    const R = 6371;
    const dLat = (lat2-lat1) * Math.PI/180;
    const dLon = (lon2-lon1) * Math.PI/180;

    const a =
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1*Math.PI/180) *
      Math.cos(lat2*Math.PI/180) *
      Math.sin(dLon/2) *
      Math.sin(dLon/2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }



  function render(items) {
    wrap.innerHTML = items.map(s => `
      <article class="salon-card">
          <img src="${s.photos?.[0] || 'assets/sample.jpg'}" alt="${s.name}">
          <h3>${s.name}</h3>
          <p>${s.short_desc || s.full_desc || ''}</p>
          ${s.distance ? `<div class="distance">${s.distance.toFixed(1)} км</div>` : ""}
          <div class="card-actions">
              <a class="btn" href="salon.html?id=${s.id}">Открыть</a>
          </div>
      </article>
    `).join("");

    placeMarkers(items);
  }


  async function load() {
    const res = await fetch("/api/salons");
    salons = await res.json();
    render(salons);
  }

  function smartSearch(q) {
    const words = q.toLowerCase().split(/\s+/);

    return salons.map(s => {
      const text = `
        ${s.name}
        ${s.short_desc}
        ${s.full_desc}
        ${JSON.stringify(s.services || '')}
        ${JSON.stringify(s.categories || '')}
      `.toLowerCase();

      let score = 0;
      words.forEach(w => text.includes(w) && score++);

      return { ...s, score };
    })
    .filter(s => s.score > 0)
    .sort((a,b)=>b.score-a.score);
  }

  input.addEventListener("input", () => {
    const q = input.value.trim();

    if(!q){
      results.innerHTML = "";
      results.style.display = "none";
      render(salons);
      return;
    }

    const found = smartSearch(q);
    render(found);

    results.innerHTML = found.length
      ? found.map(s=> `<div class="search-item" data-id="${s.id}">${s.name}</div>`).join("")
      : "<div class='search-empty'>Ничего не найдено</div>";
      placeMarkers([]);

    results.style.display = "block";
  });

  // категории
  document.querySelectorAll(".category-filter button")
    .forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const cat = btn.dataset.cat.toLowerCase();

        if(!cat) return render(salons);

        const filtered = salons.filter(s =>
          JSON.stringify(s.categories || '').toLowerCase().includes(cat)
        );

        render(filtered);
      });
    });

  results.addEventListener("click", e => {
    if(e.target.classList.contains("search-item")){
      const id = e.target.dataset.id;
      window.location.href = `salon.html?id=${id}`;
    }
  });

  load();
});
