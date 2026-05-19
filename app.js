const MAPBOX_TOKEN = "pk.eyJ1IjoiYmVkZWFuMjEiLCJhIjoiY21qYTZ1MmxtMDJpdzNkcHRld3Zjb2pkNCJ9.TzLQoe4r-rvbJ-cjTH8DiA";
const STORAGE_KEY = "streetsMobileV8";

const ZONE_NAMES = [
  "Zone 1", "Zone 2", "Zone 3", "Zone 4", "Zone 5",
  "Zone 6", "Zone 7", "Zone 8", "Zone 9", "Zone 10"
];

let state = {
  user: null,
  intel: [],
  messages: [],
  officers: [],
  perimeters: [],
  notifications: [],
  selectedIntelType: "Vehicle",
  activeZones: [...ZONE_NAMES]
};

let map = null;
let markers = [];
let mediaRecorder = null;
let audioChunks = [];

const cityBounds = [
  [-80.492, 25.958],
  [-80.181, 26.041]
];

const miramarCenter = [-80.315, 25.990];

const zones = [
  { id: "Zone 1", center: [-80.2175, 25.990], coords: [[[-80.221,25.958],[-80.214,25.958],[-80.214,26.041],[-80.221,26.041],[-80.221,25.958]]] },
  { id: "Zone 2", center: [-80.2635, 26.020], coords: [[[-80.306,25.990],[-80.221,25.990],[-80.221,26.041],[-80.306,26.041],[-80.306,25.990]]] },
  { id: "Zone 3", center: [-80.2635, 25.970], coords: [[[-80.306,25.958],[-80.221,25.958],[-80.221,25.990],[-80.306,25.990],[-80.306,25.958]]] },
  { id: "Zone 4", center: [-80.2775, 25.990], coords: [[[-80.306,25.958],[-80.249,25.958],[-80.249,26.041],[-80.306,26.041],[-80.306,25.958]]] },
  { id: "Zone 5", center: [-80.2400, 25.990], coords: [[[-80.249,25.958],[-80.231,25.958],[-80.231,26.041],[-80.249,26.041],[-80.249,25.958]]] },
  { id: "Zone 6", center: [-80.2195, 25.990], coords: [[[-80.231,25.958],[-80.208,25.958],[-80.208,26.041],[-80.231,26.041],[-80.231,25.958]]] },
  { id: "Zone 7", center: [-80.1995, 25.990], coords: [[[-80.208,25.958],[-80.191,25.958],[-80.191,26.041],[-80.208,26.041],[-80.208,25.958]]] },
  { id: "Zone 8", center: [-80.2480, 25.990], coords: [[[-80.305,25.958],[-80.191,25.958],[-80.191,26.041],[-80.305,26.041],[-80.305,25.958]]] },
  { id: "Zone 9", center: [-80.3730, 26.015], coords: [[[-80.441,26.000],[-80.305,26.000],[-80.305,26.041],[-80.441,26.041],[-80.441,26.000]]] },
  { id: "Zone 10", center: [-80.4660, 26.015], coords: [[[-80.492,26.000],[-80.441,26.000],[-80.441,26.041],[-80.492,26.041],[-80.492,26.000]]] }
];

const intersections = {
  "Zone 1": ["Pembroke Rd & SW 60 Ave", "Pembroke Rd & SW 62 Ave", "County Line & SW 60 Ave", "County Line & SW 62 Ave"],
  "Zone 2": ["Pembroke Rd & SW 64 Ave", "Miramar Pkwy & SW 64 Ave", "Pembroke Rd & Turnpike", "Miramar Pkwy & Turnpike"],
  "Zone 3": ["Miramar Pkwy & SW 64 Ave", "County Line & SW 64 Ave", "Miramar Pkwy & Turnpike", "County Line & Turnpike"],
  "Zone 4": ["Pembroke Rd & University Dr", "Miramar Pkwy & University Dr", "Pembroke Rd & Turnpike", "County Line & University Dr"],
  "Zone 5": ["Pembroke Rd & Douglas Rd", "Miramar Pkwy & Douglas Rd", "University Dr & Miramar Pkwy", "County Line & Douglas Rd"],
  "Zone 6": ["Pembroke Rd & Palm Ave", "Miramar Pkwy & Palm Ave", "Douglas Rd & Miramar Pkwy", "County Line & Palm Ave"],
  "Zone 7": ["Pembroke Rd & Flamingo Rd", "Miramar Pkwy & Flamingo Rd", "Palm Ave & Miramar Pkwy", "County Line & Flamingo Rd"],
  "Zone 8": ["Flamingo Rd & Miramar Pkwy", "I-75 & Miramar Pkwy", "Flamingo Rd & Pembroke Rd", "I-75 & Pembroke Rd"],
  "Zone 9": ["I-75 & Miramar Pkwy", "SW 172 Ave & Miramar Pkwy", "I-75 & Pembroke Rd", "SW 172 Ave & Pembroke Rd"],
  "Zone 10": ["SW 172 Ave & Pembroke Rd", "US-27 & Pembroke Rd", "SW 172 Ave & SW 55 St", "US-27 & SW 55 St"]
};

document.addEventListener("DOMContentLoaded", init);

function init() {
  loadState();
  populateSelects();
  bindEvents();
  renderAll();

  if (state.user) {
    showApp();
    setTimeout(initMap, 200);
  }
}

function populateSelects() {
  ["officerZone", "intelZone", "perimeterZone"].forEach(id => {
    const el = byId(id);
    if (el) el.innerHTML = ZONE_NAMES.map(z => `<option value="${z}">${z}</option>`).join("");
  });
  renderZoneToggles();
}

function bindEvents() {
  safeClick("loginBtn", login);
  safeClick("logoutBtn", logout);
  safeClick("savePersonalIntelBtn", () => addIntel(false));
  safeClick("shareZoneIntelBtn", () => addIntel(true));
  safeClick("sendMessageBtn", sendMessage);
  safeClick("recordVoiceBtn", toggleVoiceRecording);
  safeClick("generatePerimeterBtn", generatePerimeter);

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
}

function login() {
  const name = val("officerName");
  const badge = val("officerBadge");
  const zone = val("officerZone");
  const role = val("officerRole");

  if (!name || !badge) {
    alert("Enter officer name and badge/ID.");
    return;
  }

  state.user = { name, badge, zone, role, status: "Active" };
  upsertOfficer(state.user);
  addNotification(`Officer active: ${name} assigned to ${zone}`);
  saveState();

  showApp();
  setTimeout(initMap, 200);
  renderAll();
}

function showApp() {
  byId("loginScreen").classList.add("hidden");
  byId("appScreen").classList.remove("hidden");
  byId("officerDisplay").textContent = `${state.user.name} | ${state.user.zone}`;
  byId("intelZone").value = state.user.zone;
  byId("perimeterZone").value = state.user.zone;
}

function logout() {
  state.user = null;
  saveState();
  location.reload();
}

function showView(id) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  byId(id).classList.add("active");

  document.querySelectorAll(".nav-tab, .nav-add, .floating-perimeter").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === id);
  });

  if (map) setTimeout(() => map.resize(), 150);
}

function initMap() {
  if (!window.mapboxgl) {
    byId("notificationBar").textContent = "Mapbox failed to load. Check connection.";
    return;
  }

  mapboxgl.accessToken = MAPBOX_TOKEN;

  if (map) {
    map.remove();
    map = null;
  }

  map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/dark-v11",
    center: miramarCenter,
    zoom: 11.4,
    pitch: 40,
    bearing: -8,
    maxBounds: cityBounds
  });

  map.addControl(new mapboxgl.NavigationControl());

  map.on("load", () => {
    drawZones();
    map.fitBounds(cityBounds, { padding: 25 });
    refreshMap();
  });
}

function drawZones() {
  const data = {
    type: "FeatureCollection",
    features: zones.map(z => ({
      type: "Feature",
      properties: { name: z.id },
      geometry: { type: "Polygon", coordinates: z.coords }
    }))
  };

  map.addSource("zones", { type: "geojson", data });

  map.addLayer({
    id: "zone-fill",
    type: "fill",
    source: "zones",
    paint: { "fill-color": "#0b64c0", "fill-opacity": 0.18 }
  });

  map.addLayer({
    id: "zone-line",
    type: "line",
    source: "zones",
    paint: { "line-color": "#42a5ff", "line-width": 2 }
  });
}

function renderZoneToggles() {
  const box = byId("zoneToggles");
  if (!box) return;

  box.innerHTML = ZONE_NAMES.map(z => `
    <button class="zone-toggle ${state.activeZones.includes(z) ? "active" : ""}" onclick="toggleZone('${z}')">
      ${z.replace("Zone ", "Z")}
    </button>
  `).join("");
}

function toggleZone(zone) {
  state.activeZones = state.activeZones.includes(zone)
    ? state.activeZones.filter(z => z !== zone)
    : [...state.activeZones, zone];

  saveState();
  renderZoneToggles();
  refreshMap();
  renderAll();
}

function addIntel(shared) {
  const item = {
    id: makeId(),
    shared,
    type: state.selectedIntelType,
    zone: val("intelZone"),
    location: val("intelLocation"),
    subject: val("intelSubject"),
    notes: val("intelNotes"),
    expiry: val("intelExpiry"),
    officer: state.user.name,
    createdAt: new Date().toISOString()
  };

  if (!item.location && !item.subject && !item.notes) {
    alert("Enter location, subject, or notes.");
    return;
  }

  state.intel.unshift(item);
  addNotification(`${shared ? "Shared" : "Personal"} ${item.type} intel added in ${item.zone}`);

  byId("intelLocation").value = "";
  byId("intelSubject").value = "";
  byId("intelNotes").value = "";
  byId("intelExpiry").value = "";

  saveState();
  renderAll();
  refreshMap();
  showView("dashboardView");
}

function deleteIntel(id) {
  state.intel = state.intel.filter(i => i.id !== id);
  saveState();
  renderAll();
  refreshMap();
}

function generatePerimeter() {
  const zone = val("perimeterZone");
  const zoneInfo = zones.find(z => z.id === zone);
  const base = zoneInfo ? zoneInfo.center : miramarCenter;

  const delay = Number(val("perimeterDelay"));
  const method = val("perimeterMethod");
  const direction = val("perimeterDirection");
  const radius = delay * ({ Foot: 0.0018, Bicycle: 0.0035, Vehicle: 0.008 }[method] || 0.0018);

  const pts = [0, 90, 180, 270].map((a, i) => {
    const deg = a * Math.PI / 180;
    return {
      id: makeId(),
      label: `Point ${i + 1}`,
      intersection: intersections[zone][i],
      lng: base[0] + radius * Math.cos(deg),
      lat: base[1] + radius * Math.sin(deg),
      status: "unassigned"
    };
  });

  state.perimeters.unshift({
    id: makeId(),
    location: val("perimeterLocation") || zone,
    zone,
    delay,
    method,
    direction,
    createdAt: new Date().toISOString(),
    createdBy: state.user.name,
    points: pts
  });

  addNotification(`4-point perimeter generated: ${zone}`);
  saveState();
  renderAll();
  refreshMap();
  showView("perimeterView");
}

function setPointStatus(pid, pointId, status) {
  const p = state.perimeters.find(x => x.id === pid);
  if (!p) return;

  const pt = p.points.find(x => x.id === pointId);
  if (!pt) return;

  pt.status = status;
  removeNotificationByPrefix(`PERIMETER LOCKED: ${p.location}`);

  if (isLocked(p)) addNotification(`PERIMETER LOCKED: ${p.location}`);

  saveState();
  renderAll();
  refreshMap();
}

function breakDownPerimeter(id) {
  const p = state.perimeters.find(x => x.id === id);
  state.perimeters = state.perimeters.filter(x => x.id !== id);
  if (p) addNotification(`Perimeter broken down: ${p.location}`);
  saveState();
  renderAll();
  refreshMap();
}

function refreshMap() {
  if (!map) return;

  markers.forEach(m => m.remove());
  markers = [];

  state.intel.filter(i => i.shared && state.activeZones.includes(i.zone)).forEach(i => {
    const z = zones.find(x => x.id === i.zone);
    if (!z) return;
    addMarker(z.center[0], z.center[1], "shared-marker", `${i.type}: ${i.zone}`);
  });

  state.perimeters.forEach(p => {
    p.points.forEach(pt => {
      let cls = "perimeter-red";
      if (pt.status === "enroute") cls = "perimeter-yellow";
      if (pt.status === "covered") cls = "perimeter-green";
      if (isLocked(p)) cls += " flash-alert";
      addMarker(pt.lng, pt.lat, cls, `${pt.label}: ${pt.intersection}`);
    });
  });
}

function addMarker(lng, lat, cls, text) {
  const el = document.createElement("div");
  el.className = `marker-dot ${cls}`;
  const m = new mapboxgl.Marker(el)
    .setLngLat([lng, lat])
    .setPopup(new mapboxgl.Popup({ offset: 18 }).setText(text))
    .addTo(map);
  markers.push(m);
}

function sendMessage() {
  const to = val("messageTo");
  const body = val("messageBody");
  if (!to || !body) return alert("Enter recipient and message.");

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
  alert("Voice note placeholder active.");
}

function upsertOfficer(user) {
  const found = state.officers.find(o => o.badge === user.badge);
  if (found) Object.assign(found, user, { lastSeen: new Date().toISOString() });
  else state.officers.unshift({ ...user, lastSeen: new Date().toISOString() });
}

function messageOfficer(name) {
  byId("messageTo").value = name;
  showView("messagesView");
}

function renderAll() {
  purgeExpiredIntel();
  setText("statIntel", state.intel.filter(i => i.shared).length);
  setText("statPerimeters", state.perimeters.length);
  setText("statOfficers", state.officers.length);

  byId("notificationBar").textContent = state.notifications[0]?.message || "No active notifications.";

  byId("homeFeed").innerHTML = state.notifications.length
    ? state.notifications.slice(0, 5).map(n => card("Alert", n.message, formatDate(n.createdAt))).join("")
    : `<div class="feed-card">No recent updates.</div>`;

  byId("intelFeed").innerHTML = state.intel.filter(i => i.shared).map(i => `
    <div class="feed-card">
      <h4>${esc(i.type)} | ${esc(i.zone)}</h4>
      <div class="feed-meta">${esc(i.officer)} | ${formatDate(i.createdAt)}</div>
      <div><b>Location:</b> ${esc(i.location || "N/A")}</div>
      <div><b>Info:</b> ${esc(i.subject || "N/A")}</div>
      <div><b>Notes:</b> ${esc(i.notes || "N/A")}</div>
      <div class="feed-actions"><button class="delete-btn" onclick="deleteIntel('${i.id}')">Delete Intel</button></div>
    </div>
  `).join("") || `<div class="feed-card">No shared intel.</div>`;

  byId("messageFeed").innerHTML = state.messages.map(m => card(`To: ${m.to}`, m.body, `From: ${m.from}`)).join("") || `<div class="feed-card">No messages.</div>`;

  byId("officerFeed").innerHTML = state.officers.map(o => `
    <div class="feed-card" onclick="messageOfficer('${o.name}')">
      <h4><span class="status-dot green"></span>${esc(o.name)}</h4>
      <div class="feed-meta">${esc(o.role)} | ${esc(o.zone)} | Badge: ${esc(o.badge)}</div>
      <div>Tap to message</div>
    </div>
  `).join("") || `<div class="feed-card">No active officers.</div>`;

  byId("activePerimeters").innerHTML = state.perimeters.map(p => `
    <div class="feed-card">
      ${isLocked(p) ? `<div class="locked-banner">PERIMETER LOCKED</div>` : ""}
      <h4>${esc(p.location)}</h4>
      <div class="feed-meta">${esc(p.zone)} | ${esc(p.method)} | ${p.delay} min</div>
      ${p.points.map(pt => `
        <div class="feed-card">
          <h4>${esc(pt.label)} — ${esc(pt.intersection)}</h4>
          <div class="feed-meta">Status: ${esc(pt.status)}</div>
          <div class="feed-actions">
            <button onclick="setPointStatus('${p.id}','${pt.id}','unassigned')">Red</button>
            <button onclick="setPointStatus('${p.id}','${pt.id}','enroute')">Yellow</button>
            <button onclick="setPointStatus('${p.id}','${pt.id}','covered')">Green</button>
          </div>
        </div>
      `).join("")}
      <div class="feed-actions"><button class="break-btn" onclick="breakDownPerimeter('${p.id}')">Break Down Perimeter</button></div>
    </div>
  `).join("") || `<div class="feed-card">No active perimeters.</div>`;
}

function card(title, body, meta) {
  return `<div class="feed-card"><h4>${esc(title)}</h4><div class="feed-meta">${esc(meta)}</div><div>${esc(body)}</div></div>`;
}

function isLocked(p) {
  return p.points.every(x => x.status === "covered");
}

function addNotification(message) {
  state.notifications.unshift({ id: makeId(), message, createdAt: new Date().toISOString() });
  state.notifications = state.notifications.slice(0, 20);
}

function removeNotificationByPrefix(prefix) {
  state.notifications = state.notifications.filter(n => !n.message.startsWith(prefix));
}

function purgeExpiredIntel() {
  const today = new Date().toISOString().split("T")[0];
  state.intel = state.intel.filter(i => !i.expiry || i.expiry >= today);
}

function safeClick(id, fn) {
  const el = byId(id);
  if (el) el.addEventListener("click", fn);
}

function val(id) {
  const el = byId(id);
  return el ? String(el.value || "").trim() : "";
}

function byId(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = byId(id);
  if (el) el.textContent = value;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = { ...state, ...JSON.parse(raw) };
    if (!Array.isArray(state.activeZones)) state.activeZones = [...ZONE_NAMES];
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function formatDate(v) {
  return new Date(v).toLocaleString();
}

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));
}

window.login = login;
window.toggleZone = toggleZone;
window.deleteIntel = deleteIntel;
window.setPointStatus = setPointStatus;
window.breakDownPerimeter = breakDownPerimeter;
window.messageOfficer = messageOfficer;
