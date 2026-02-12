let map, mapMarker;
let lastCoords = null;  // сюда запишем координаты

function initAdminMap() {
    map = new ymaps.Map("map-admin", {
        center: [41.311153, 69.279729], // Ташкент центр
        zoom: 12
    });

    // Клик по карте → ставим метку и ищем адрес
    map.events.add('click', async function (e) {
        const coords = e.get('coords');
        setMarker(coords);
        lastCoords = coords;

        const address = await reverseGeocode(coords);
        document.getElementById('salon-address').value = address;
    });

    // Автоподсказки в поле адреса
    const addressInput = document.getElementById('salon-address');
    const suggestView = new ymaps.SuggestView('salon-address');

    addressInput.addEventListener('change', async () => {
        const val = addressInput.value.trim();
        if (!val) return;

        const coords = await geocode(val);
        if (coords) {
            setMarker(coords);
            map.setCenter(coords, 14);
            lastCoords = coords;
        }
    });
}

// ставим маркер
function setMarker(coords) {
    if (mapMarker) {
        mapMarker.geometry.setCoordinates(coords);
    } else {
        mapMarker = new ymaps.Placemark(coords, {}, {
            preset: 'islands#redIcon'
        });
        map.geoObjects.add(mapMarker);
    }
}

// прямое геокодирование → координаты
async function geocode(query) {
    const res = await ymaps.geocode(query);
    const obj = res.geoObjects.get(0);
    return obj ? obj.geometry.getCoordinates() : null;
}

// обратное геокодирование → адрес
async function reverseGeocode(coords) {
    const res = await ymaps.geocode(coords);
    const obj = res.geoObjects.get(0);
    return obj ? obj.getAddressLine() : '';
}

// запускаем карту
ymaps.ready(initAdminMap);
