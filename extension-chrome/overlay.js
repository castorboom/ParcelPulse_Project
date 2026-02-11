/**
 * ParcelPulse v1.5 - Overlay Tracker
 *
 * Logica principale dell'overlay fullscreen:
 * - Inizializza mappa Leaflet con dark tiles
 * - Fetch dati tracking via background.js
 * - Rendering markers, route, info panel
 * - Auto-refresh ogni 30 secondi
 */

// ============================================
// Config
// ============================================
const REFRESH_INTERVAL_MS = 30000;
const DEFAULT_CENTER = [41.9028, 12.4964]; // Italia
const DEFAULT_ZOOM = 6;

// ============================================
// State
// ============================================
let map = null;
let courierMarker = null;
let destMarker = null;
let routeLayer = null;
let refreshTimer = null;
let countdownTimer = null;
let trackingIds = [];
let currentDomain = "";
let activeTrackingIndex = 0;
let secondsUntilRefresh = 30;
let previousTrackingData = null; // Per rilevare cambiamenti tra refresh

// Notification settings defaults
const NOTIF_DEFAULTS = {
  notifStatusChange: true,
  notifDelivered: true,
  notifNearby: true,
  notifFewStops: true,
  nearbyKm: 1,
  fewStopsCount: 3,
};

// ============================================
// Init
// ============================================
document.addEventListener("DOMContentLoaded", () => {
  parseHashParams();
  initMap();
  setupEventListeners();
  setupNotifPanel();
  fetchAndRender();
  startAutoRefresh();
});

function parseHashParams() {
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  trackingIds = (params.get("ids") || "").split(",").filter(Boolean);
  currentDomain = params.get("domain") || "www.amazon.it";
}

// ============================================
// Mappa Leaflet
// ============================================
function initMap() {
  map = L.map("map", {
    zoomControl: true,
    attributionControl: false,
  }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

  // OSM tiles con filtro CSS per estetica dark cyberpunk
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    className: "dark-tiles",
  }).addTo(map);

  // Attribution custom piccola
  L.control
    .attribution({ prefix: false, position: "bottomright" })
    .addAttribution("&copy; OpenStreetMap")
    .addTo(map);
}

// ============================================
// Data Fetching
// ============================================
async function fetchAndRender() {
  const trackingId = trackingIds[activeTrackingIndex];
  if (!trackingId) {
    showError("Nessun ID di tracciamento trovato.");
    return;
  }

  showLoading();

  try {
    const response = await chrome.runtime.sendMessage({
      action: "overlayFetchTracking",
      trackingId,
      domain: currentDomain,
    });

    if (!response) {
      showError("Nessuna risposta dall'estensione.");
      return;
    }

    if (response.error && !response.courierLat) {
      showError(response.error);
      return;
    }

    renderTrackingData(response);
    checkAndNotify(response);
    hideLoading();
  } catch (err) {
    showError("Errore di comunicazione: " + err.message);
  }
}

// ============================================
// Rendering
// ============================================
function renderTrackingData(data) {
  updateStatusBar(data);
  updateStats(data);
  updateMap(data);
  updateTrackingIdsList();
}

function updateStatusBar(data) {
  const statusDot = document.querySelector("#infoStatus .status-dot");
  const statusText = document.querySelector("#infoStatus .status-text");

  const statusMap = {
    OUT_FOR_DELIVERY: { text: "In consegna", cls: "delivering" },
    IN_TRANSIT: { text: "In transito", cls: "transit" },
    DELIVERED: { text: "Consegnato", cls: "delivered" },
    NOT_READY: { text: "In preparazione", cls: "waiting" },
    CANCELLED: { text: "Annullato", cls: "unknown" },
  };

  const info = statusMap[data.status] || {
    text: data.status || "Sconosciuto",
    cls: "unknown",
  };
  statusDot.className = `status-dot status-${info.cls}`;
  statusText.textContent = info.text;
}

function updateStats(data) {
  // Distanza
  const distEl = document.querySelector("#statDistance .stat-value");
  if (data.roadDistanceKm != null) {
    distEl.textContent = formatDistance(data.roadDistanceKm);
  } else if (data.distanceKm != null) {
    distEl.textContent = formatDistance(data.distanceKm);
  } else {
    distEl.textContent = "--";
  }

  // Fermate
  const stopsEl = document.querySelector("#statStops .stat-value");
  stopsEl.textContent =
    data.stopsRemaining != null ? String(data.stopsRemaining) : "--";

  // Ultimo aggiornamento
  const updateEl = document.querySelector("#statUpdate .stat-value");
  if (data.lastUpdate) {
    const date = new Date(
      typeof data.lastUpdate === "number"
        ? data.lastUpdate * 1000
        : data.lastUpdate
    );
    updateEl.textContent = date.toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } else {
    updateEl.textContent = new Date().toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}

function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

// ============================================
// Mappa: markers e route
// ============================================
function updateMap(data) {
  // Rimuovi markers e route precedenti
  if (courierMarker) {
    courierMarker.remove();
    courierMarker = null;
  }
  if (destMarker) {
    destMarker.remove();
    destMarker = null;
  }
  if (routeLayer) {
    routeLayer.remove();
    routeLayer = null;
  }

  const hasGPS = data.courierLat && data.courierLon;
  const hasDest = data.destLat && data.destLon;

  // Marker destinazione
  if (hasDest) {
    destMarker = L.marker([data.destLat, data.destLon], {
      icon: createDestIcon(),
      zIndexOffset: 100,
    })
      .addTo(map)
      .bindPopup(
        '<div style="text-align:center;font-weight:600;color:#0A0A1A">Destinazione</div>'
      );
  }

  // Marker corriere
  if (hasGPS) {
    courierMarker = L.marker([data.courierLat, data.courierLon], {
      icon: createCourierIcon(),
      zIndexOffset: 200,
    })
      .addTo(map)
      .bindPopup(
        '<div style="text-align:center;font-weight:600;color:#0A0A1A">Corriere</div>'
      );
  }

  // Route polyline
  if (data.routePolyline && hasGPS && hasDest) {
    routeLayer = L.geoJSON(data.routePolyline, {
      style: {
        color: "#06B6D4",
        weight: 5,
        opacity: 0.85,
        className: "route-glow",
      },
    }).addTo(map);
  }

  // Fit bounds per mostrare entrambi i punti
  if (hasGPS && hasDest) {
    const bounds = L.latLngBounds(
      [data.courierLat, data.courierLon],
      [data.destLat, data.destLon]
    );
    map.fitBounds(bounds, {
      padding: [60, 60],
      paddingBottomRight: [60, 160],
      maxZoom: 16,
      animate: true,
    });
  } else if (hasGPS) {
    map.setView([data.courierLat, data.courierLon], 15, { animate: true });
  } else if (hasDest) {
    map.setView([data.destLat, data.destLon], 15, { animate: true });
  }
}

// ============================================
// Custom Icons cyberpunk
// ============================================
function createCourierIcon() {
  return L.divIcon({
    className: "",
    html: `
      <div class="courier-marker-container">
        <div class="courier-pulse"></div>
        <div class="courier-emoji">&#x1F69A;</div>
      </div>
    `,
    iconSize: [60, 60],
    iconAnchor: [30, 30],
  });
}

function createDestIcon() {
  return L.divIcon({
    className: "",
    html: '<div class="dest-emoji">&#x1F3E0;</div>',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

// ============================================
// Auto-Refresh
// ============================================
function startAutoRefresh() {
  secondsUntilRefresh = 30;

  countdownTimer = setInterval(() => {
    secondsUntilRefresh--;
    const el = document.getElementById("refreshCountdown");
    if (!el) return;
    if (secondsUntilRefresh <= 0) {
      el.textContent = "Aggiornamento...";
    } else {
      el.textContent = `Aggiornamento tra ${secondsUntilRefresh}s`;
    }
  }, 1000);

  refreshTimer = setInterval(() => {
    secondsUntilRefresh = 30;
    fetchAndRender();
  }, REFRESH_INTERVAL_MS);
}

function stopAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  if (countdownTimer) clearInterval(countdownTimer);
  refreshTimer = null;
  countdownTimer = null;
}

// ============================================
// Event Listeners
// ============================================
function setupEventListeners() {
  document.getElementById("btnClose").addEventListener("click", closeOverlay);
  document.getElementById("backdrop").addEventListener("click", closeOverlay);

  document.getElementById("btnRefresh").addEventListener("click", () => {
    secondsUntilRefresh = 30;
    fetchAndRender();
  });

  document.getElementById("btnRetry").addEventListener("click", () => {
    fetchAndRender();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeOverlay();
  });
}

function closeOverlay() {
  stopAutoRefresh();
  if (window.parent !== window) {
    // Aperto come iframe dentro Amazon - notifica il parent per rimuoverlo
    window.parent.postMessage({ type: "PARCELPULSE_CLOSE_OVERLAY" }, "*");
  } else {
    // Aperto come tab standalone - chiudi il tab
    window.close();
  }
}

// ============================================
// Loading / Error states
// ============================================
function showLoading() {
  document.getElementById("loadingOverlay").classList.remove("hidden");
  document.getElementById("errorOverlay").classList.remove("visible");
}

function hideLoading() {
  document.getElementById("loadingOverlay").classList.add("hidden");
}

function showError(msg) {
  document.getElementById("loadingOverlay").classList.add("hidden");
  document.getElementById("errorOverlay").classList.add("visible");
  document.getElementById("errorText").textContent = msg;
}

// ============================================
// Multi-tracking IDs
// ============================================
function updateTrackingIdsList() {
  const container = document.getElementById("infoTrackingIds");
  if (trackingIds.length <= 1) {
    container.classList.remove("visible");
    return;
  }

  container.classList.add("visible");
  container.innerHTML = trackingIds
    .map(
      (id, i) =>
        `<span class="tracking-id-chip ${i === activeTrackingIndex ? "active" : ""}" data-index="${i}">${id.length > 12 ? id.substring(0, 10) + "..." : id}</span>`
    )
    .join("");

  // Click per cambiare tracking ID attivo
  container.querySelectorAll(".tracking-id-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      activeTrackingIndex = parseInt(chip.dataset.index, 10);
      secondsUntilRefresh = 30;
      fetchAndRender();
    });
  });
}

// ============================================
// Notification Settings
// ============================================

async function loadNotifSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get("notifSettings", (result) => {
      const settings = { ...NOTIF_DEFAULTS, ...(result.notifSettings || {}) };
      // Sync checkboxes with stored settings
      ["notifStatusChange", "notifDelivered", "notifNearby", "notifFewStops"].forEach((key) => {
        const el = document.getElementById(key);
        if (el) el.checked = settings[key];
      });
      // Sync number inputs
      const nearbyEl = document.getElementById("nearbyKm");
      if (nearbyEl) nearbyEl.value = settings.nearbyKm;
      const stopsEl = document.getElementById("fewStopsCount");
      if (stopsEl) stopsEl.value = settings.fewStopsCount;
      resolve(settings);
    });
  });
}

function saveNotifSettings() {
  const settings = {};
  ["notifStatusChange", "notifDelivered", "notifNearby", "notifFewStops"].forEach((key) => {
    const el = document.getElementById(key);
    settings[key] = el ? el.checked : NOTIF_DEFAULTS[key];
  });
  // Number inputs
  const nearbyEl = document.getElementById("nearbyKm");
  settings.nearbyKm = nearbyEl ? parseFloat(nearbyEl.value) || NOTIF_DEFAULTS.nearbyKm : NOTIF_DEFAULTS.nearbyKm;
  const stopsEl = document.getElementById("fewStopsCount");
  settings.fewStopsCount = stopsEl ? parseInt(stopsEl.value, 10) || NOTIF_DEFAULTS.fewStopsCount : NOTIF_DEFAULTS.fewStopsCount;
  chrome.storage.local.set({ notifSettings: settings });
}

function setupNotifPanel() {
  const btn = document.getElementById("btnNotifSettings");
  const panel = document.getElementById("notifPanel");
  const closeBtn = document.getElementById("btnNotifClose");

  btn.addEventListener("click", () => {
    panel.classList.toggle("visible");
  });

  closeBtn.addEventListener("click", () => {
    panel.classList.remove("visible");
  });

  // Save on toggle change
  ["notifStatusChange", "notifDelivered", "notifNearby", "notifFewStops"].forEach((key) => {
    const el = document.getElementById(key);
    if (el) el.addEventListener("change", saveNotifSettings);
  });

  // Save on number input change
  ["nearbyKm", "fewStopsCount"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", saveNotifSettings);
  });

  loadNotifSettings();
}

// ============================================
// Notification Change Detection
// ============================================

async function checkAndNotify(newData) {
  if (!previousTrackingData) {
    previousTrackingData = newData;
    return;
  }

  const settings = await loadNotifSettings();
  const prev = previousTrackingData;

  // 1. Status change
  if (settings.notifStatusChange && newData.status && prev.status !== newData.status) {
    const statusText = getStatusText(newData.status);
    sendNotification(
      "Cambio stato spedizione",
      `La tua spedizione ${newData.trackingId || ""} e' ora: ${statusText}`,
      "status_change"
    );
  }

  // 2. Delivered
  if (settings.notifDelivered && newData.status === "DELIVERED" && prev.status !== "DELIVERED") {
    sendNotification(
      "Pacco consegnato!",
      `La spedizione ${newData.trackingId || ""} e' stata consegnata.`,
      "delivered"
    );
  }

  // 3. Courier nearby (within user-configured km)
  if (settings.notifNearby) {
    const threshold = settings.nearbyKm || 1;
    const dist = newData.roadDistanceKm || newData.distanceKm;
    const prevDist = prev.roadDistanceKm || prev.distanceKm;
    if (dist && dist <= threshold && (!prevDist || prevDist > threshold)) {
      sendNotification(
        "Corriere nelle vicinanze!",
        `Il corriere si trova a ${formatDistance(dist)} dalla destinazione.`,
        "nearby"
      );
    }
  }

  // 4. Few stops remaining (user-configured threshold)
  if (settings.notifFewStops) {
    const threshold = settings.fewStopsCount || 3;
    const stops = newData.stopsRemaining;
    const prevStops = prev.stopsRemaining;
    if (stops != null && stops <= threshold &&
        (prevStops == null || prevStops > threshold)) {
      sendNotification(
        "Poche fermate rimaste!",
        `Il corriere ha ancora ${stops} fermata${stops !== 1 ? "e" : ""} prima della tua consegna.`,
        "few_stops"
      );
    }
  }

  previousTrackingData = newData;
}

function getStatusText(status) {
  const map = {
    OUT_FOR_DELIVERY: "In consegna",
    IN_TRANSIT: "In transito",
    DELIVERED: "Consegnato",
    NOT_READY: "In preparazione",
    CANCELLED: "Annullato",
  };
  return map[status] || status || "Sconosciuto";
}

function sendNotification(title, message, tag) {
  chrome.runtime.sendMessage({
    action: "showNotification",
    title,
    message,
    tag,
  });
}

// Cleanup
window.addEventListener("unload", () => {
  stopAutoRefresh();
});
