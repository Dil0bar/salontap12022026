// data.js - simple localStorage-backed "backend"
(function(){
  const KEY = "salon_app_db_v1";

  function defaultData(){
    return {
      salons: [
        {
          id: 1,
          name: "Салон Красоты Лайт",
          desc: "Уютный салон с профессиональными мастерами.",
          photos: [],
          masters: [
            {
              id: 1,
              name: "Анна",
              photo: "",
              availability: [],
              slots: ["10:00","11:00","12:00","14:00","15:00","16:00"]
            },
            {
              id: 2,
              name: "Иван",
              photo: "",
              availability: [],
              slots: ["09:00","10:30","12:00","13:30","15:00"]
            }
          ],
          bookings: []
        }
      ]
    }
  }

  function seedAvailability(salon){
    const now = new Date();

    for(let m of salon.masters){
      m.availability = [];

      for(let i=0;i<14;i++){
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate()+i);

        const dateStr =
          d.getFullYear() + "-" +
          String(d.getMonth()+1).padStart(2,"0") + "-" +
          String(d.getDate()).padStart(2,"0");

        if(m.name === "Анна"){
          if(i%2===0) m.availability.push(dateStr);
        } else {
          if(i%3!==0) m.availability.push(dateStr);
        }
      }
    }
  }


  function load(){ const raw = localStorage.getItem(KEY); if(raw) return JSON.parse(raw); const d = defaultData(); seedAvailability(d.salons[0]); save(d); return d; }
  function save(db){ localStorage.setItem(KEY, JSON.stringify(db)); }
  function getSalons(){ return load().salons; }
  function getSalon(id){ return getSalons().find(s=>s.id===Number(id)); }
  function addSalon(salon){ const db = load(); salon.id = db.salons.length? Math.max(...db.salons.map(x=>x.id))+1:1; db.salons.push(salon); save(db); return salon; }
  function updateSalon(updated){ const db = load(); db.salons = db.salons.map(s=> s.id===updated.id? updated:s); save(db); }
  function addBooking(salonId, booking){ const db = load(); const s = db.salons.find(x=>x.id===Number(salonId)); if(!s) return false; booking.id = s.bookings.length?Math.max(...s.bookings.map(b=>b.id))+1:1; s.bookings.push(booking); save(db); return booking; }
  window.SalonStore = { getSalons, getSalon, addSalon, updateSalon, addBooking, save, load };
})();