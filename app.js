let map;
let markers = [];

function startApp() {
  const token = document.getElementById("token").value;
  mapboxgl.accessToken = token;

  document.getElementById("login").style.display = "none";
  document.getElementById("app").style.display = "block";

  map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [-80.2, 26.15], // South Florida default
    zoom: 12
  });
}

function generatePerimeter() {
  const time = document.getElementById("time").value;
  const method = document.getElementById("method").value;

  const speed = method === "vehicle" ? 1 : 0.2;
  const radius = time * speed;

  clearMarkers();

  const center = map.getCenter();

  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * 2 * Math.PI;

    const lat = center.lat + (radius * 0.01 * Math.sin(angle));
    const lng = center.lng + (radius * 0.01 * Math.cos(angle));

    const el = document.createElement('div');
    el.style.background = "red";
    el.style.width = "15px";
    el.style.height = "15px";
    el.style.borderRadius = "50%";

    const marker = new mapboxgl.Marker(el)
      .setLngLat([lng, lat])
      .addTo(map);

    markers.push({ marker, status: "red", el });
  }
}

function clearMarkers() {
  markers.forEach(m => m.marker.remove());
  markers = [];
}
