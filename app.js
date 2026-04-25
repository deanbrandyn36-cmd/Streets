const STORAGE_KEY = "streetsPatrolModeV3";

let state = {
  user: null,
  intel: [],
  messages: [],
  perimeterPoints: [],
  notifications: [],
  selectedIntelType: "Vehicle",
  activeZones: [
    "Zone 1", "Zone 2", "Zone 3", "Zone 4", "Zone 5",
    "Zone 6", "Zone 7", "Zone 8", "Zone 9", "Zone 10"
  ]
};

let map = null;
let markers = [];
let mediaRecorder = null;
let audioChunks = [];

const cityBounds = [
  [-80.492, 25.978],
  [-80.181, 26.061]
];

const zones = [
  { id: "Zone 1", center: [-80.2175, 26.020], coords: [[[-80.221,25.978],[-80.214,25.978],[-80.214,26.061],[-80.221,26.061],[-80.221,25.978]]] },
  { id: "Zone 2", center: [-80.2635, 26.040], coords: [[[-80.306,26.018],[-80.221,26.018],[-80.221,26.061],[-80.306,26.061],[-80.306,26.018]]] },
  { id: "Zone 3", center: [-80.2635, 25.997], coords: [[[-80.306,25.978],[-80.221,25.978],[-80.221,26.018],[-80.306,26.018],[-80.306,25.978]]] },
  { id: "Zone 4", center: [-80.2775, 26.020], coords: [[[-80.306,25.978],[-80.249,25.978],[-80.249,26.061],[-80.306,26.061],[-80.306,25.978]]] },
  { id: "Zone 5", center: [-80.2400, 26.020], coords: [[[-80.249,25.978],[-80.231,25.978],[-80.231,26.061],[-80.249,26.061],[-80.249,25.978]]] },
  { id: "Zone 6", center: [-80.2195, 26.020], coords: [[[-80.231,25.978],[-80.208,25.978],[-80.208,26.061],[-80.231,26.061],[-80.231,25.978]]] },
  { id: "Zone 7", center: [-80.1995, 26.020], coords: [[[-80.208,25.978],[-80.191,25.978],[-80.191,26.061],[-80.208,26.061],[-80.208,25.978]]] },
  { id: "Zone 8", center: [-80.2480, 26.020], coords: [[[-80.305,25.978],[-80.191,25.978],[-80.191,26.061],[-80.305,26.061],[-80.305,25.978]]] },
  { id: "Zone 9", center: [-80.3730, 26.042], coords: [[[-80.441,26.023],[-80.305,26.023],[-80.305,26.061],[-80.441,26.061],[-80.441,26.023]]] },
  { id: "Zone 10", center: [-80.4660, 26.041], coords: [[[-80.492,26.021],[-80.441,26.021],[-80.441,26.061],[-80.492,26.061],[-80.492,26.021]]] }
];

document.addEventListener("DOMContentLoaded", init);

function init() {
  loadState();
  bindEvents();
  renderZoneToggles();
  renderAll();

  if (state.user) {
    showApp();
    initMap(state.user.token);
  }
}

function bindEvents() {
  byId("loginBtn").addEventListener("click", login);
  byId("logoutBtn").addEventListener("click", logout);

  document.querySelectorAll("[data-view]").forEach(btn => {
    btn.addEventListener("click", () => showView(btn.dataset.view));
  });

  document.querySelectorAll(".intel-type").forEach(btn => {
    btn.addEventListener("click", () => {
      state.selectedIntelType = btn.dataset.type;
      document.querySelectorAll(".intel-type").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  byId("savePersonalIntelBtn").addEventListener("click", () => addIntel(false));
  byId("shareZoneIntelBtn").addEventListener("click", () => addIntel(true));
  byId("sendMessageBtn").addEventListener("click", sendMessage);
  byId("recordVoiceBtn").addEventListener("click", toggleVoiceRecording);
  byId("generatePerimeterBtn").addEventListener("click", generatePerimeter);
}

function login() {
  const name = val("officerName");
  const badge = val("officerBadge");
  const zone = val("officerZone");
  const role = val("officerRole");
  const token = val("mapboxToken");

  if (!name || !badge || !token) {
    alert("Enter officer name, badge/ID, and Mapbox token.");
    return;
  }

  state.user = { name, badge, zone, role, token, status: "Active" };
  addNotification(`Officer active: ${name} assigned to ${zone}`);
  saveState();

  showApp();
  initMap(token);
  renderAll();
}

function logout() {
  state.user = null;
  saveState();
  location.reload();
}

function showApp() {
  byId("loginScreen").classList.add("hidden");
  byId("appScreen").classList.remove("hidden");

  if (state.user) {
    byId("officerDisplay").textContent = `${state.user.name} | ${state.user.zone}`;
    byId("intelZone").value = state.user.zone;
  }
}

function showView(viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  byId(viewId).classList.add("active");
  if (map) setTimeout(() => map.resize(), 100);
}

function initMap(token) {
  if (typeof mapboxgl === "undefined") {
    alert("Mapbox failed to load.");
    return;
  }

  mapboxgl.accessToken = token;

  if (map) map.remove();

  map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/dark-v11",
    center: [-80.305, 26.020],
    zoom: 10.7,
    pitch: 38,
    bearing: -8,
    maxBounds: cityBounds
  });

  map.addControl(new mapboxgl.NavigationControl());

  map.on("load", () => {
    drawZones();
    refreshMap();
  });
}

function drawZones() {
  const featureCollection = {
    type: "FeatureCollection",
    features: zones.map(z => ({
      type: "Feature",
      properties: { name: z.id },
      geometry: { type: "Polygon", coordinates: z.coords }
    }))
  };

  if (!map.getSource("zones")) {
    map.addSource("zones", { type: "geojson", data: featureCollection });

    map.addLayer({
      id: "zone-fill",
      type: "fill",
      source: "zones",
      paint: {
        "fill-color": "#0b64c0",
        "fill-opacity": 0.15
      }
    });

    map.addLayer({
      id: "zone-line",
      type: "line",
      source: "zones",
      paint: {
        "line-color": "#42a5ff",
        "line-width": 2
      }
    });
  }
}

function renderZoneToggles() {
  const container = byId("zoneToggles");
  container.innerHTML = "";

  zones.forEach(z => {
    const btn = document.createElement("button");
    btn.className = "zone-toggle";
    if (state.activeZones.includes(z.id)) btn.classList.add("active");
    btn.textContent = z.id.replace("Zone ", "Z");

    btn.addEventListener("click", () => {
      if (state.activeZones.includes(z.id)) {
        state.activeZones = state.activeZones.filter(zone => zone !== z.id);
      } else {
        state.activeZones.push(z.id);
      }

      saveState();
      renderZoneToggles();
      refreshMap();
      renderAll();
    });

    container.appendChild(btn);
  });
}

function addIntel(shared) {
  if (!state.user) return;

  const zone = val("intelZone");
  const location = val("intelLocation");
  const subject = val("intelSubject");
  const notes = val("intelNotes");
  const expiry = val("intelExpiry");

  if (!location && !subject && !notes) {
    alert("Enter location, subject, or notes.");
    return;
  }

  const item = {
    id: makeId(),
    shared,
    type: state.selectedIntelType,
    zone,
    location,
    subject,
    notes,
    expiry,
    officer: state.user.name,
    createdAt: new Date().toISOString()
  };

  state.intel.unshift(item);

  addNotification(`${shared ? "Shared" : "Personal"} ${item.type} intel added in ${zone}`);
  clearIntelForm();
  saveState();
  renderAll();
  refreshMap();
  showView("homeView");
}

function deleteIntel(id) {
  const item = state.intel.find(i => i.id === id);
  state.intel = state.intel.filter(i => i.id !== id);

  if (item) addNotification(`Intel deleted from ${item.zone}`);

  saveState();
  renderAll();
  refreshMap();
}

window.deleteIntel = deleteIntel;

function sendMessage() {
  if (!state.user) return;

  const to = val("messageTo");
  const body = val("messageBody");

  if (!to || !body) {
    alert("Enter recipient and message.");
    return;
  }

  state.messages.unshift({
    id: makeId(),
    to,
    body,
    from: state.user.name,
    createdAt: new Date().toISOString()
  });

  addNotification(`Message sent to ${to}`);
  byId("messageTo").value = "";
  byId("messageBody").value = "";

  saveState();
  renderAll();
}

async function toggleVoiceRecording() {
  const btn = byId("recordVoiceBtn");
  const playback = byId("voicePlayback");

  if (!mediaRecorder) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunks, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);

        playback.src = url;
        playback.classList.remove("hidden");

        state.messages.unshift({
          id: makeId(),
          to: "Voice Note",
          body: "Voice note recorded",
          from: state.user.name,
          createdAt: new Date().toISOString()
        });

        addNotification("Voice note recorded");
        saveState();
        renderAll();

        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        mediaRecorder = null;
        btn.textContent = "Voice Note";
      };

      mediaRecorder.start();
      btn.textContent = "Stop Recording";
    } catch {
      alert("Microphone permission denied.");
    }
  } else {
    mediaRecorder.stop();
  }
}

function generatePerimeter() {
  if (!map) {
    alert("Map not ready.");
    return;
  }

  const delay = Number(val("perimeterDelay"));
  const direction = val("perimeterDirection");
  const method = val("perimeterMethod");
  const location = val("perimeterLocation") || "Map center";

  const center = map.getCenter();
  const radius = calculateRadius(delay, method);
  const points = buildFourPointPerimeter(center.lng, center.lat, radius, direction);

  state.perimeterPoints = points.map((p, index) => ({
    id: makeId(),
    label: `Point ${index + 1}`,
    lng: p.lng,
    lat: p.lat,
    status: "unassigned",
    unit: ""
  }));

  addNotification(`4-point perimeter generated: ${location}`);
  saveState();
  renderAll();
  refreshMap();
  showView("perimeterView");
}

function calculateRadius(delay, method) {
  const speeds = {
    Foot: 0.0018,
    Bicycle: 0.0035,
    Vehicle: 0.008
  };

  return delay * (speeds[method] || 0.0018);
}

function buildFourPointPerimeter(centerLng, centerLat, radius, direction) {
  const baseAngles = [0, 90, 180, 270];
  const offsets = {
    N: 0, NE: 45, E: 90, SE: 135,
    S: 180, SW: 225, W: 270, NW: 315,
    Unknown: 0
  };

  const offset = offsets[direction] || 0;

  return baseAngles.map(angle => {
    const deg = (angle + offset) * Math.PI / 180;
    return {
      lng: centerLng + radius * Math.cos(deg),
      lat: centerLat + radius * Math.sin(deg)
    };
  });
}

function setPointStatus(id, status) {
  const point = state.perimeterPoints.find(p => p.id === id);
  if (!point) return;

  point.status = status;

  if (allPointsCovered()) {
    addNotification("PERIMETER LOCKED: All 4 points covered");
  }

  saveState();
  renderAll();
  refreshMap();
}

window.setPointStatus = setPointStatus;

function refreshMap() {
  if (!map) return;

  markers.forEach(m => m.remove());
  markers = [];

  state.intel
    .filter(item => item.shared)
    .filter(item => state.activeZones.includes(item.zone))
    .forEach(item => {
      const coord = coordsForIntel(item);
      addMapMarker(coord.lng, coord.lat, "shared-marker", `${item.type}: ${item.zone}`);
    });

  state.perimeterPoints.forEach(point => {
    const statusClass =
      point.status === "covered" ? "perimeter-green" :
      point.status === "enroute" ? "perimeter-yellow" :
      "perimeter-red";

    addMapMarker(
      point.lng,
      point.lat,
      allPointsCovered() ? `${statusClass} flash-alert` : statusClass,
      `${point.label}: ${point.status}`
    );
  });
}

function addMapMarker(lng, lat, className, popupText) {
  const el = document.createElement("div");
  el.className = `marker-dot ${className}`;

  const marker = new mapboxgl.Marker(el)
    .setLngLat([lng, lat])
    .setPopup(new mapboxgl.Popup({ offset: 18 }).setText(popupText))
    .addTo(map);

  markers.push(marker);
}

function coordsForIntel(item) {
  const zone = zones.find(z => z.id === item.zone);
  const base = zone ? zone.center : [-80.305, 26.020];
  const hash = hashText(item.location + item.subject + item.notes);

  return {
    lng: base[0] + ((hash % 10) - 5) * 0.0015,
    lat: base[1] + (((hash >> 3) % 10) - 5) * 0.0015
  };
}

function renderAll() {
  purgeExpiredIntel();
  renderNotificationBar();
  renderHomeFeed();
  renderIntelFeed();
  renderMessages();
  renderPerimeterPoints();
}

function renderNotificationBar() {
  const bar = byId("notificationBar");
  if (!state.notifications.length) {
    bar.textContent = "No active notifications.";
    return;
  }

  bar.textContent = state.notifications[0].message;
}

function renderHomeFeed() {
  const container = byId("homeFeed");
  const updates = [
    ...state.notifications.slice(0, 5).map(n => ({
      title: "Notification",
      body: n.message,
      meta: formatDate(n.createdAt)
    })),
    ...state.intel.filter(i => i.shared).slice(0, 5).map(i => ({
      title: `${i.type} Intel`,
      body: `${i.zone} | ${i.subject || i.location || i.notes}`,
      meta: `${i.officer} | ${formatDate(i.createdAt)}`
    }))
  ].slice(0, 8);

  if (!updates.length) {
    container.innerHTML = `<div class="feed-card">No recent updates.</div>`;
    return;
  }

  container.innerHTML = updates.map(u => `
    <div class="feed-card">
      <h4>${escapeHtml(u.title)}</h4>
      <div class="feed-meta">${escapeHtml(u.meta)}</div>
      <div>${escapeHtml(u.body)}</div>
    </div>
  `).join("");
}

function renderIntelFeed() {
  const container = byId("intelFeed");
  const items = state.intel
    .filter(item => item.shared)
    .filter(item => state.activeZones.includes(item.zone));

  if (!items.length) {
    container.innerHTML = `<div class="feed-card">No shared intel for selected zones.</div>`;
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="feed-card">
      <h4>${escapeHtml(item.type)} | ${escapeHtml(item.zone)}</h4>
      <div class="feed-meta">${escapeHtml(item.officer)} | ${formatDate(item.createdAt)}</div>
      <div><strong>Location:</strong> ${escapeHtml(item.location || "N/A")}</div>
      <div><strong>Info:</strong> ${escapeHtml(item.subject || "N/A")}</div>
      <div><strong>Notes:</strong> ${escapeHtml(item.notes || "N/A")}</div>
      <div class="feed-actions">
        <button class="delete-btn" onclick="deleteIntel('${item.id}')">Delete Intel</button>
      </div>
    </div>
  `).join("");
}

function renderMessages() {
  const container = byId("messageFeed");

  if (!state.messages.length) {
    container.innerHTML = `<div class="feed-card">No messages.</div>`;
    return;
  }

  container.innerHTML = state.messages.map(m => `
    <div class="feed-card">
      <h4>To: ${escapeHtml(m.to)}</h4>
      <div class="feed-meta">From: ${escapeHtml(m.from)} | ${formatDate(m.createdAt)}</div>
      <div>${escapeHtml(m.body)}</div>
    </div>
  `).join("");
}

function renderPerimeterPoints() {
  const container = byId("perimeterPoints");

  if (!state.perimeterPoints.length) {
    container.innerHTML = `<div class="feed-card">No active perimeter.</div>`;
    return;
  }

  const locked = allPointsCovered();

  container.innerHTML = `
    ${locked ? `<div class="locked-banner">PERIMETER LOCKED</div>` : ""}
    ${state.perimeterPoints.map(p => `
      <div class="feed-card">
        <h4>${escapeHtml(p.label)}</h4>
        <div class="feed-meta">Status: ${escapeHtml(p.status)}</div>
        <div class="feed-actions">
          <button onclick="setPointStatus('${p.id}', 'unassigned')">Red</button>
          <button onclick="setPointStatus('${p.id}', 'enroute')">Yellow</button>
          <button onclick="setPointStatus('${p.id}', 'covered')">Green</button>
        </div>
      </div>
    `).join("")}
  `;
}

function allPointsCovered() {
  return state.perimeterPoints.length === 4 &&
    state.perimeterPoints.every(p => p.status === "covered");
}

function addNotification(message) {
  state.notifications.unshift({
    id: makeId(),
    message,
    createdAt: new Date().toISOString()
  });

  state.notifications = state.notifications.slice(0, 20);
}

function clearIntelForm() {
  byId("intelLocation").value = "";
  byId("intelSubject").value = "";
  byId("intelNotes").value = "";
  byId("intelExpiry").value = "";
}

function purgeExpiredIntel() {
  const today = new Date().toISOString().split("T")[0];
  state.intel = state.intel.filter(item => !item.expiry || item.expiry >= today);
}

function val(id) {
  const el = byId(id);
  return el ? String(el.value || "").trim() : "";
}

function byId(id) {
  return document.getElementById(id);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    state = { ...state, ...JSON.parse(raw) };
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value || "N/A";
  }
}

function hashText(text) {
  let hash = 0;
  text = String(text || "");

  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash);
}

function escapeHtml(str) {
  return String(str || "")
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;")
    .split('"').join("&quot;")
    .split("'").join("&#039;");
}
