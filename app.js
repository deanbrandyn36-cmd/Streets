const STORAGE_KEY = "streetKnowledgeCommandV2";

let appState = {
  user: null,
  personalIntel: [],
  sharedIntel: [],
  messages: [],
  officers: [],
  perimeterHistory: [],
  perimeterPoints: []
};

let map = null;
let personalMarkers = [];
let sharedMarkers = [];
let perimeterMarkers = [];
let mediaRecorder = null;
let audioChunks = [];

const cityBounds = [
  [-80.33, 25.97],
  [-80.10, 26.20]
];

const zonePolygons = [
  {
    id: "Zone 1",
    coords: [[
      [-80.33, 26.085],
      [-80.215, 26.085],
      [-80.215, 26.20],
      [-80.33, 26.20],
      [-80.33, 26.085]
    ]]
  },
  {
    id: "Zone 2",
    coords: [[
      [-80.215, 26.085],
      [-80.10, 26.085],
      [-80.10, 26.20],
      [-80.215, 26.20],
      [-80.215, 26.085]
    ]]
  },
  {
    id: "Zone 3",
    coords: [[
      [-80.33, 25.97],
      [-80.215, 25.97],
      [-80.215, 26.085],
      [-80.33, 26.085],
      [-80.33, 25.97]
    ]]
  },
  {
    id: "Zone 4",
    coords: [[
      [-80.215, 25.97],
      [-80.10, 25.97],
      [-80.10, 26.085],
      [-80.215, 26.085],
      [-80.215, 25.97]
    ]]
  }
];

document.addEventListener("DOMContentLoaded", initApp);

function initApp() {
  try {
    loadState();
    bindEvents();
    purgeExpiredIntel();
    renderAllLists();
    showStartupNotice();
  } catch (err) {
    console.error("Startup error:", err);
    alert("App startup error. Open Safari console or tell me what screen you see.");
  }
}

function showStartupNotice() {
  const loginBtn = document.getElementById("loginBtn");
  if (loginBtn) {
    loginBtn.textContent = "Enter App";
  }
}

function bindEvents() {
  safeBind("loginBtn", "click", loginUser);
  safeBind("logoutBtn", "click", logoutUser);
  safeBind("saveDataBtn", "click", saveState);
  safeBind("addPersonalBtn", "click", addPersonalIntel);
  safeBind("shareSelectedPersonalBtn", "click", shareLatestPersonalIntel);
  safeBind("addSharedBtn", "click", addSharedIntel);
  safeBind("sendMessageBtn", "click", sendMessage);
  safeBind("recordVoiceBtn", "click", toggleVoiceRecording);
  safeBind("updateSelfStatusBtn", "click", updateSelfStatus);
  safeBind("generatePerimeterBtn", "click", generatePerimeter);
  safeBind("refreshMapBtn", "click", refreshMapData);

  const mapFilter = document.getElementById("mapFilter");
  if (mapFilter) mapFilter.addEventListener("change", refreshMapData);

  const zoneFilter = document.getElementById("zoneFilter");
  if (zoneFilter) zoneFilter.addEventListener("change", refreshMapData);

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

function safeBind(id, eventName, handler) {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener(eventName, handler);
  } else {
    console.warn(`Missing element: ${id}`);
  }
}

function loginUser() {
  try {
    const name = valueOf("officerName");
    const badge = valueOf("officerBadge");
    const role = valueOf("officerRole");
    const zone = valueOf("officerZone");
    const token = valueOf("mapboxToken");

    if (!name || !badge || !token) {
      alert("Enter officer name, badge/ID, and Mapbox token.");
      return;
    }

    appState.user = {
      name,
      badge,
      role,
      zone,
      status: "Active",
      token
    };

    upsertOfficer(appState.user);

    const loginScreen = document.getElementById("loginScreen");
    const appScreen = document.getElementById("appScreen");
    const loggedInInfo = document.getElementById("loggedInInfo");

    if (loginScreen) loginScreen.classList.remove("active");
    if (appScreen) appScreen.classList.add("active");
    if (loggedInInfo) {
      loggedInInfo.textContent = `${name} | ${role} | ${zone} | Status: Active`;
    }

    saveState();
    renderOfficerStatusList();
    initializeMap(token);
  } catch (err) {
    console.error("Login error:", err);
    alert("Login failed. Check that all files were pasted completely.");
  }
}

function logoutUser() {
  if (appState.user) {
    const officer = appState.officers.find(o => o.badge === appState.user.badge);
    if (officer) officer.status = "Offline";
  }
  saveState();
  location.reload();
}

function upsertOfficer(user) {
  const existing = appState.officers.find(o => o.badge === user.badge);
  if (existing) {
    existing.name = user.name;
    existing.role = user.role;
    existing.zone = user.zone;
    existing.status = user.status || "Active";
    existing.lastSeen = new Date().toISOString();
  } else {
    appState.officers.push({
      name: user.name,
      badge: user.badge,
      role: user.role,
      zone: user.zone,
      status: user.status || "Active",
      lastSeen: new Date().toISOString()
    });
  }
}

function switchTab(tabId) {
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(tab => tab.classList.remove("active"));

  const targetBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  const targetTab = document.getElementById(tabId);

  if (targetBtn) targetBtn.classList.add("active");
  if (targetTab) targetTab.classList.add("active");

  if (map) {
    setTimeout(() => map.resize(), 150);
  }
}

function initializeMap(token) {
  try {
    if (typeof mapboxgl === "undefined") {
      alert("Mapbox failed to load. Check your internet connection and refresh.");
      return;
    }

    mapboxgl.accessToken = token;

    if (map) {
      map.remove();
      map = null;
    }

    map = new mapboxgl.Map({
      container: "map",
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-80.215, 26.085],
      zoom: 11.7,
      pitch: 45,
      bearing: -10,
      maxBounds: cityBounds
    });

    map.addControl(new mapboxgl.NavigationControl());

    map.on("load", () => {
      drawZones();
      refreshMapData();
    });
  } catch (err) {
    console.error("Map init error:", err);
    alert("Map failed to initialize. Double-check your Mapbox public token.");
  }
}

function drawZones() {
  if (!map) return;

  const featureCollection = {
    type: "FeatureCollection",
    features: zonePolygons.map(zone => ({
      type: "Feature",
      properties: { name: zone.id },
      geometry: {
        type: "Polygon",
        coordinates: zone.coords
      }
    }))
  };

  if (!map.getSource("zones")) {
    map.addSource("zones", {
      type: "geojson",
      data: featureCollection
    });

    map.addLayer({
      id: "zone-fills",
      type: "fill",
      source: "zones",
      paint: {
        "fill-color": "#2d4f7d",
        "fill-opacity": 0.18
      }
    });

    map.addLayer({
      id: "zone-lines",
      type: "line",
      source: "zones",
      paint: {
        "line-color": "#7fb3ff",
        "line-width": 2
      }
    });
  }
}

function addPersonalIntel() {
  if (!appState.user) return;

  const item = {
    id: generateId(),
    category: valueOf("personalCategory"),
    zone: valueOf("personalZone"),
    address: valueOf("personalAddress"),
    subjectInfo: valueOf("personalSubjectInfo"),
    date: valueOf("personalDate"),
    time: valueOf("personalTime"),
    expiry: valueOf("personalExpiry"),
    notes: valueOf("personalNotes"),
    officer: appState.user.name,
    createdAt: new Date().toISOString()
  };

  if (!item.address && !item.subjectInfo && !item.notes) {
    alert("Enter intel details before saving.");
    return;
  }

  appState.personalIntel.unshift(item);
  saveState();
  clearPersonalForm();
  renderPersonalList();
  refreshMapData();
}

function shareLatestPersonalIntel() {
  if (!appState.personalIntel.length || !appState.user) {
    alert("No personal intel available to share.");
    return;
  }

  const latest = appState.personalIntel[0];
  const sharedItem = {
    id: generateId(),
    zone: latest.zone,
    type: latest.category,
    title: latest.category,
    location: latest.address || "Not provided",
    details: `${latest.subjectInfo || ""} ${latest.notes || ""}`.trim(),
    officer: appState.user.name,
    createdAt: new Date().toISOString()
  };

  appState.sharedIntel.unshift(sharedItem);
  saveState();
  renderSharedList();
  renderZoneFeed();
  refreshMapData();
}

function addSharedIntel() {
  if (!appState.user) return;

  const item = {
    id: generateId(),
    zone: valueOf("sharedZone"),
    type: valueOf("sharedType"),
    title: valueOf("sharedTitle"),
    location: valueOf("sharedLocation"),
    details: valueOf("sharedDetails"),
    officer: appState.user.name,
    createdAt: new Date().toISOString()
  };

  if (!item.title && !item.details) {
    alert("Enter a title or details.");
    return;
  }

  appState.sharedIntel.unshift(item);
  saveState();
  clearSharedForm();
  renderSharedList();
  renderZoneFeed();
  refreshMapData();
}

function sendMessage() {
  if (!appState.user) return;

  const message = {
    id: generateId(),
    type: valueOf("messageType"),
    to: valueOf("messageTo"),
    body: valueOf("messageBody"),
    from: appState.user.name,
    createdAt: new Date().toISOString(),
    voice: null
  };

  if (!message.to || !message.body) {
    alert("Enter recipient/group and message.");
    return;
  }

  appState.messages.unshift(message);
  saveState();
  clearMessageForm();
  renderMessageList();
}

async function toggleVoiceRecording() {
  const recordBtn = document.getElementById("recordVoiceBtn");
  const playback = document.getElementById("voicePlayback");

  if (!recordBtn || !playback) return;

  if (!mediaRecorder) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) audioChunks.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        const audioUrl = URL.createObjectURL(audioBlob);
        playback.src = audioUrl;
        playback.classList.remove("hidden");

        if (appState.user) {
          appState.messages.unshift({
            id: generateId(),
            type: "Voice",
            to: "Saved Voice Note",
            body: "Voice note recorded",
            from: appState.user.name,
            createdAt: new Date().toISOString(),
            voice: audioUrl
          });
          saveState();
          renderMessageList();
        }

        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        mediaRecorder = null;
        recordBtn.textContent = "Record Voice Note";
      };

      mediaRecorder.start();
      recordBtn.textContent = "Stop Recording";
    } catch (error) {
      alert("Microphone access denied or unavailable.");
    }
  } else {
    mediaRecorder.stop();
  }
}

function updateSelfStatus() {
  if (!appState.user) return;

  const newStatus = valueOf("selfStatus");
  appState.user.status = newStatus;

  const officer = appState.officers.find(o => o.badge === appState.user.badge);
  if (officer) {
    officer.status = newStatus;
    officer.lastSeen = new Date().toISOString();
  }

  const loggedInInfo = document.getElementById("loggedInInfo");
  if (loggedInInfo) {
    loggedInInfo.textContent =
      `${appState.user.name} | ${appState.user.role} | ${appState.user.zone} | Status: ${newStatus}`;
  }

  saveState();
  renderOfficerStatusList();
}

function generatePerimeter() {
  if (!map) {
    alert("Map is not ready yet.");
    return;
  }

  const location = valueOf("perimeterLocation");
  const delay = Number(valueOf("perimeterDelay") || 0);
  const direction = valueOf("perimeterDirection");
  const method = valueOf("perimeterMethod");
  const notes = valueOf("perimeterNotes");

  const center = map.getCenter();
  const radius = calculateRadius(delay, method);
  const points = buildFourPointPerimeter(center.lng, center.lat, radius, direction);

  appState.perimeterPoints = points.map((pt, index) => ({
    id: generateId(),
    label: `Point ${index + 1}`,
    lng: pt.lng,
    lat: pt.lat,
    status: "unassigned"
  }));

  appState.perimeterHistory.unshift({
    id: generateId(),
    location: location || "Map center",
    delay,
    direction,
    method,
    notes,
    createdAt: new Date().toISOString(),
    pointCount: 4
  });

  saveState();
  renderPerimeterList();
  renderPerimeterHistory();
  refreshMapData();
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
  const offsetMap = {
    N: 0,
    NE: 45,
    E: 90,
    SE: 135,
    S: 180,
    SW: 225,
    W: 270,
    NW: 315,
    Unknown: 0
  };

  const offset = offsetMap[direction] || 0;

  return baseAngles.map(angle => {
    const deg = (angle + offset) * (Math.PI / 180);
    return {
      lng: centerLng + radius * Math.cos(deg),
      lat: centerLat + radius * Math.sin(deg)
    };
  });
}

function refreshMapData() {
  if (!map) return;

  clearMapMarkers();

  const filter = valueOf("mapFilter", "all");
  const zoneFilter = valueOf("zoneFilter", "All Zones");

  if (filter === "all" || filter === "personal") {
    appState.personalIntel.forEach(item => {
      if (zoneFilter !== "All Zones" && item.zone !== zoneFilter) return;
      const coords = pseudoCoordsFromZone(item.zone, item.address, 0.01);
      addMarker(coords.lng, coords.lat, "personal", personalMarkers, item.category);
    });
  }

  if (filter === "all" || filter === "shared") {
    appState.sharedIntel.forEach(item => {
      if (zoneFilter !== "All Zones" && item.zone !== zoneFilter) return;
      const coords = pseudoCoordsFromZone(item.zone, item.location, 0.02);
      addMarker(coords.lng, coords.lat, "shared", sharedMarkers, item.title || item.type);
    });
  }

  appState.perimeterPoints.forEach(point => {
    const el = document.createElement("div");
    el.className = "marker-dot " + perimeterStatusClass(point.status);

    if (allPerimeterCovered()) {
      el.classList.add("flash-alert");
    }

    const marker = new mapboxgl.Marker(el)
      .setLngLat([point.lng, point.lat])
      .setPopup(new mapboxgl.Popup({ offset: 20 }).setText(`${point.label} - ${point.status}`))
      .addTo(map);

    perimeterMarkers.push({ marker, el });
  });

  renderZoneFeed();
}

function addMarker(lng, lat, type, store, label) {
  const el = document.createElement("div");
  el.className = `marker-dot ${type === "personal" ? "personal-marker" : "shared-marker"}`;

  const marker = new mapboxgl.Marker(el)
    .setLngLat([lng, lat])
    .setPopup(new mapboxgl.Popup({ offset: 20 }).setText(label || "Marker"))
    .addTo(map);

  store.push(marker);
}

function clearMapMarkers() {
  personalMarkers.forEach(marker => marker.remove());
  sharedMarkers.forEach(marker => marker.remove());
  perimeterMarkers.forEach(item => item.marker.remove());

  personalMarkers = [];
  sharedMarkers = [];
  perimeterMarkers = [];
}

function perimeterStatusClass(status) {
  if (status === "covered") return "perimeter-marker-green";
  if (status === "enroute") return "perimeter-marker-yellow";
  return "perimeter-marker-red";
}

function allPerimeterCovered() {
  return appState.perimeterPoints.length === 4 &&
    appState.perimeterPoints.every(point => point.status === "covered");
}

function pseudoCoordsFromZone(zone, seedText = "", spread = 0.01) {
  const centers = {
    "Zone 1": { lng: -80.275, lat: 26.145 },
    "Zone 2": { lng: -80.155, lat: 26.145 },
    "Zone 3": { lng: -80.275, lat: 26.03 },
    "Zone 4": { lng: -80.155, lat: 26.03 }
  };

  const base = centers[zone] || { lng: -80.215, lat: 26.085 };
  const hash = textHash(seedText || zone);
  const lngOffset = ((hash % 10) - 5) * spread * 0.18;
  const latOffset = (((hash >> 3) % 10) - 5) * spread * 0.18;

  return {
    lng: base.lng + lngOffset,
    lat: base.lat + latOffset
  };
}

function textHash(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function renderAllLists() {
  renderPersonalList();
  renderSharedList();
  renderMessageList();
  renderOfficerStatusList();
  renderPerimeterList();
  renderPerimeterHistory();
  renderZoneFeed();

  if (appState.user) {
    const loginScreen = document.getElementById("loginScreen");
    const appScreen = document.getElementById("appScreen");
    const loggedInInfo = document.getElementById("loggedInInfo");

    if (loginScreen) loginScreen.classList.remove("active");
    if (appScreen) appScreen.classList.add("active");
    if (loggedInInfo) {
      loggedInInfo.textContent =
        `${appState.user.name} | ${appState.user.role} | ${appState.user.zone} | Status: ${appState.user.status}`;
    }

    if (appState.user.token && !map) {
      initializeMap(appState.user.token);
    }
  }
}

function renderPersonalList() {
  const container = document.getElementById("personalList");
  if (!container) return;
  container.innerHTML = "";

  if (!appState.personalIntel.length) {
    container.innerHTML = `<div class="item-card">No personal intel saved.</div>`;
    return;
  }

  appState.personalIntel.forEach(item => {
    const card = document.createElement("div");
    card.className = "item-card";
    card.innerHTML = `
      <h4>${escapeHtml(item.category)}</h4>
      <div class="item-meta">${escapeHtml(item.zone)} | ${escapeHtml(item.address || "No address")} | Expires: ${escapeHtml(item.expiry || "None")}</div>
      <div><strong>Info:</strong> ${escapeHtml(item.subjectInfo || "N/A")}</div>
      <div><strong>Notes:</strong> ${escapeHtml(item.notes || "N/A")}</div>
      <div class="item-meta">${formatDate(item.createdAt)} | ${escapeHtml(item.officer)}</div>
    `;
    container.appendChild(card);
  });
}

function renderSharedList() {
  const container = document.getElementById("sharedList");
  if (!container) return;
  container.innerHTML = "";

  if (!appState.sharedIntel.length) {
    container.innerHTML = `<div class="item-card">No shared intel posted.</div>`;
    return;
  }

  appState.sharedIntel.forEach(item => {
    const card = document.createElement("div");
    card.className = "item-card";
    card.innerHTML = `
      <h4>${escapeHtml(item.title || item.type)}</h4>
      <div class="item-meta">${escapeHtml(item.zone)} | ${escapeHtml(item.location || "No location")}</div>
      <div><strong>Type:</strong> ${escapeHtml(item.type)}</div>
      <div><strong>Details:</strong> ${escapeHtml(item.details || "N/A")}</div>
      <div class="item-meta">${formatDate(item.createdAt)} | ${escapeHtml(item.officer)}</div>
    `;
    container.appendChild(card);
  });
}

function renderMessageList() {
  const container = document.getElementById("messageList");
  if (!container) return;
  container.innerHTML = "";

  if (!appState.messages.length) {
    container.innerHTML = `<div class="item-card">No messages yet.</div>`;
    return;
  }

  appState.messages.forEach(item => {
    const card = document.createElement("div");
    card.className = "item-card";

    let voiceHtml = "";
    if (item.voice) {
      voiceHtml = `<audio controls src="${item.voice}" style="width:100%; margin-top:8px;"></audio>`;
    }

    card.innerHTML = `
      <h4>${escapeHtml(item.type)} Message</h4>
      <div class="item-meta">From: ${escapeHtml(item.from)} | To: ${escapeHtml(item.to)}</div>
      <div>${escapeHtml(item.body)}</div>
      ${voiceHtml}
      <div class="item-meta">${formatDate(item.createdAt)}</div>
    `;
    container.appendChild(card);
  });
}

function renderOfficerStatusList() {
  const container = document.getElementById("officerStatusList");
  if (!container) return;
  container.innerHTML = "";

  if (!appState.officers.length) {
    container.innerHTML = `<div class="item-card">No officer activity available.</div>`;
    return;
  }

  appState.officers.forEach(officer => {
    const normalized = (officer.status || "Offline").toLowerCase();
    const statusClass =
      normalized === "active" ? "status-active" :
      normalized === "busy" ? "status-busy" :
      "status-unavailable";

    const card = document.createElement("div");
    card.className = "item-card";
    card.innerHTML = `
      <h4>${escapeHtml(officer.name)}</h4>
      <div class="item-meta">${escapeHtml(officer.role)} | ${escapeHtml(officer.zone)} | Badge: ${escapeHtml(officer.badge)}</div>
      <span class="status-pill ${statusClass}">${escapeHtml(officer.status || "Offline")}</span>
      <div class="item-meta">Last Seen: ${formatDate(officer.lastSeen)}</div>
    `;
    container.appendChild(card);
  });
}

function renderPerimeterList() {
  const container = document.getElementById("perimeterPointList");
  if (!container) return;
  container.innerHTML = "";

  if (!appState.perimeterPoints.length) {
    container.innerHTML = `<div class="item-card">No active perimeter generated.</div>`;
    return;
  }

  appState.perimeterPoints.forEach(point => {
    const card = document.createElement("div");
    card.className = "item-card";

    card.innerHTML = `
      <h4>${escapeHtml(point.label)}</h4>
      <div class="item-meta">Lng: ${point.lng.toFixed(5)} | Lat: ${point.lat.toFixed(5)}</div>
      <div><strong>Status:</strong> ${escapeHtml(point.status)}</div>
      <div class="point-status-controls">
        <button onclick="setPointStatus('${point.id}', 'unassigned')">Red</button>
        <button onclick="setPointStatus('${point.id}', 'enroute')">Yellow</button>
        <button onclick="setPointStatus('${point.id}', 'covered')">Green</button>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderPerimeterHistory() {
  const container = document.getElementById("perimeterHistoryList");
  if (!container) return;
  container.innerHTML = "";

  if (!appState.perimeterHistory.length) {
    container.innerHTML = `<div class="item-card">No perimeter history yet.</div>`;
    return;
  }

  appState.perimeterHistory.forEach(item => {
    const card = document.createElement("div");
    card.className = "item-card";
    card.innerHTML = `
      <h4>${escapeHtml(item.location)}</h4>
      <div class="item-meta">${formatDate(item.createdAt)}</div>
      <div><strong>Delay:</strong> ${escapeHtml(String(item.delay))} min</div>
      <div><strong>Direction:</strong> ${escapeHtml(item.direction)}</div>
      <div><strong>Method:</strong> ${escapeHtml(item.method)}</div>
      <div><strong>Points:</strong> ${escapeHtml(String(item.pointCount))}</div>
      <div><strong>Notes:</strong> ${escapeHtml(item.notes || "N/A")}</div>
    `;
    container.appendChild(card);
  });
}

function renderZoneFeed() {
  const container = document.getElementById("zoneFeed");
  if (!container) return;

  const zoneFilter = valueOf("zoneFilter", "All Zones");
  container.innerHTML = "";

  let items = [...appState.sharedIntel];
  if (zoneFilter !== "All Zones") {
    items = items.filter(item => item.zone === zoneFilter);
  }

  if (!items.length) {
    container.innerHTML = `<div class="item-card">No shared intel in this view.</div>`;
    return;
  }

  items.slice(0, 10).forEach(item => {
    const card = document.createElement("div");
    card.className = "item-card";
    card.innerHTML = `
      <h4>${escapeHtml(item.title || item.type)}</h4>
      <div class="item-meta">${escapeHtml(item.zone)} | ${escapeHtml(item.officer)}</div>
      <div>${escapeHtml(item.details || "No details")}</div>
    `;
    container.appendChild(card);
  });
}

function setPointStatus(pointId, status) {
  const point = appState.perimeterPoints.find(p => p.id === pointId);
  if (!point) return;

  point.status = status;
  saveState();
  renderPerimeterList();
  refreshMapData();
}

window.setPointStatus = setPointStatus;

function clearPersonalForm() {
  setValue("personalAddress", "");
  setValue("personalSubjectInfo", "");
  setValue("personalDate", "");
  setValue("personalTime", "");
  setValue("personalExpiry", "");
  setValue("personalNotes", "");
}

function clearSharedForm() {
  setValue("sharedTitle", "");
  setValue("sharedLocation", "");
  setValue("sharedDetails", "");
}

function clearMessageForm() {
  setValue("messageTo", "");
  setValue("messageBody", "");
}

function purgeExpiredIntel() {
  const today = new Date().toISOString().split("T")[0];
  appState.personalIntel = appState.personalIntel.filter(item => !item.expiry || item.expiry >= today);
  saveState();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    appState = {
      ...appState,
      ...parsed
    };
  } catch (error) {
    console.error("Failed to load state", error);
  }
}

function valueOf(id, fallback = "") {
  const el = document.getElementById(id);
  return el ? (el.value || "").trim() : fallback;
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function formatDate(value) {
  if (!value) return "N/A";
  try {
    return new Date(value).toLocaleString();
  } catch (err) {
    return value;
  }
}

function escapeHtml(str) {
  return String(str)
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;")
    .split('"').join("&quot;")
    .split("'").join("&#039;");
}
