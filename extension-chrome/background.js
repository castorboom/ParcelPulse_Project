/**
 * ParcelPulse - Service Worker (Background)
 *
 * Gestisce:
 * - Ricezione csrfToken dai content script Amazon
 * - Cattura cookies via chrome.cookies API
 * - Storage dati connessione in chrome.storage.local
 * - Overlay tracking + OSRM routing
 * - Notifiche browser
 */

// ============================================
// Storage helpers
// ============================================

async function getStoredSessions() {
  const result = await chrome.storage.local.get("sessions");
  return result.sessions || {};
}

async function storeSession(domain, data) {
  const sessions = await getStoredSessions();
  sessions[domain] = {
    ...data,
    domain,
    updatedAt: Date.now(),
  };
  await chrome.storage.local.set({ sessions });
  // Aggiorna badge
  updateBadge(sessions);
  return sessions[domain];
}

async function clearSession(domain) {
  const sessions = await getStoredSessions();
  delete sessions[domain];
  await chrome.storage.local.set({ sessions });
  updateBadge(sessions);
}

async function clearAllSessions() {
  await chrome.storage.local.set({ sessions: {} });
  updateBadge({});
}

// ============================================
// Badge (icona extension)
// ============================================

function updateBadge(sessions) {
  const count = Object.keys(sessions).length;
  if (count > 0) {
    chrome.action.setBadgeText({ text: String(count) });
    chrome.action.setBadgeBackgroundColor({ color: "#8B5CF6" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

// ============================================
// Cookie extraction
// ============================================

async function extractCookies(domain) {
  const url = `https://${domain}`;
  const cookies = await chrome.cookies.getAll({ url });
  // Converti in stringa "nome=valore; nome2=valore2"
  const cookieString = cookies
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  return cookieString;
}

// ============================================
// CSRF Token regex patterns (fallback per silent refresh)
// ============================================

const CSRF_PATTERNS = [
  /csrfToken\s*[:=]\s*["']([^"']+)["']/i,
  /["']csrfToken["']\s*[:=]\s*["']([^"']+)["']/i,
  /name="csrfToken"\s+value="([^"]+)"/i,
  /value="([^"]+)"\s+name="csrfToken"/i,
  /<meta[^>]+name="csrf-token"[^>]+content="([^"]+)"/i,
  /CSRF_TOKEN\s*[:=]\s*["']([^"']+)["']/i,
  /csrf-token\s*[:=]\s*["']([^"']+)["']/i,
];

function extractCsrfFromHtml(html) {
  for (const pattern of CSRF_PATTERNS) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

// ============================================
// Message handler
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Content script Amazon invia csrfToken
  if (message.action === "csrfTokenCaptured") {
    handleCsrfCapture(message).then(sendResponse);
    return true; // async response
  }

  // Content script webapp chiede dati connessione
  if (message.action === "getSession") {
    handleGetSession(message).then(sendResponse);
    return true;
  }

  // Content script webapp chiede tutte le connessioni
  if (message.action === "getAllSessions") {
    getStoredSessions().then(sendResponse);
    return true;
  }

  // Popup chiede stato
  if (message.action === "getStatus") {
    handleGetStatus().then(sendResponse);
    return true;
  }

  // Popup chiede refresh forzato di un dominio
  if (message.action === "forceRefresh") {
    handleForceRefresh(message.domain).then(sendResponse);
    return true;
  }

  // Popup chiede clear dominio
  if (message.action === "clearSession") {
    clearSession(message.domain).then(() => sendResponse({ success: true }));
    return true;
  }

  // Popup chiede clear tutto
  if (message.action === "clearAll") {
    clearAllSessions().then(() => sendResponse({ success: true }));
    return true;
  }

  // Content script Amazon rileva tracking IDs
  if (message.action === "trackingIdsDetected") {
    handleTrackingIds(message).then(sendResponse);
    return true;
  }

  // Content script Amazon chiede di salvare pending import
  if (message.action === "pendingImport") {
    handlePendingImport(message).then(sendResponse);
    return true;
  }

  // Webapp chiede pending imports
  if (message.action === "getPendingImport") {
    getPendingImport().then(sendResponse);
    return true;
  }

  // Webapp conferma import completato
  if (message.action === "clearPendingImport") {
    chrome.storage.local.remove("pendingImport").then(() =>
      sendResponse({ success: true })
    );
    return true;
  }

  // Webapp chiede fetch tracking data direttamente dall'extension
  if (message.action === "fetchTracking") {
    handleFetchTracking(message).then(sendResponse);
    return true;
  }

  // Overlay chiede fetch tracking con parsing completo + OSRM route
  if (message.action === "overlayFetchTracking") {
    handleOverlayFetchTracking(message).then(sendResponse);
    return true;
  }

  // Overlay chiede di mostrare una notifica browser
  if (message.action === "showNotification") {
    handleShowNotification(message);
    sendResponse({ success: true });
    return false;
  }
});

// ============================================
// Handlers
// ============================================

async function handleCsrfCapture({ csrfToken, domain, sourceUrl }) {
  if (!csrfToken || !domain) {
    return { success: false, error: "Missing csrfToken or domain" };
  }

  // Estrai cookies freschi
  const sessionCookies = await extractCookies(domain);
  if (!sessionCookies) {
    return { success: false, error: "No cookies found for " + domain };
  }

  // Salva connessione
  const session = await storeSession(domain, {
    csrfToken,
    sessionCookies,
    sourceUrl: sourceUrl || "",
    capturedAt: Date.now(),
  });

  console.log(`[ParcelPulse] Connected to ${domain}`);
  return { success: true, session };
}

async function handleGetSession({ domain }) {
  const sessions = await getStoredSessions();

  // Helper: refresh sia cookies che csrfToken per una sessione
  async function refreshSession(session) {
    const freshCookies = await extractCookies(session.domain);
    if (freshCookies) {
      session.sessionCookies = freshCookies;
    }
    // Estrai csrfToken fresco da un tab Amazon aperto (se possibile)
    const freshToken = await extractFreshCsrfToken(session.domain);
    if (freshToken) {
      session.csrfToken = freshToken;
      session.capturedAt = Date.now();
    }
    await storeSession(session.domain, session);
    return session;
  }

  // Se dominio specifico richiesto
  if (domain && sessions[domain]) {
    const refreshed = await refreshSession(sessions[domain]);
    return { success: true, session: refreshed };
  }

  // Se nessun dominio specifico, restituisci la sessione piu' recente
  const sorted = Object.values(sessions).sort(
    (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
  );

  if (sorted.length > 0) {
    const refreshed = await refreshSession(sorted[0]);
    return { success: true, session: refreshed };
  }

  return { success: false, error: "No sessions stored" };
}

async function handleGetStatus() {
  const sessions = await getStoredSessions();
  const domains = Object.keys(sessions);
  return {
    connected: domains.length > 0,
    domains,
    sessions,
    version: chrome.runtime.getManifest().version,
  };
}

async function handleForceRefresh(domain) {
  if (!domain) return { success: false, error: "No domain specified" };

  const sessions = await getStoredSessions();
  const session = sessions[domain];
  if (!session) return { success: false, error: "No session for " + domain };

  // Refresh cookies
  const freshCookies = await extractCookies(domain);
  if (!freshCookies) {
    return { success: false, error: "No cookies found" };
  }

  session.sessionCookies = freshCookies;
  session.updatedAt = Date.now();
  await storeSession(domain, session);

  // Se abbiamo sourceUrl, prova a refreshare il csrfToken
  if (session.sourceUrl) {
    try {
      const response = await fetch(session.sourceUrl, {
        headers: { Cookie: freshCookies },
        credentials: "include",
      });
      const html = await response.text();
      const newToken = extractCsrfFromHtml(html);
      if (newToken) {
        session.csrfToken = newToken;
        session.capturedAt = Date.now();
        await storeSession(domain, session);
        console.log(`[ParcelPulse] Token refreshed for ${domain}`);
      }
    } catch (e) {
      console.warn(`[ParcelPulse] Token refresh failed for ${domain}:`, e.message);
    }
  }

  return { success: true, session };
}

// ============================================
// Tracking IDs handlers
// ============================================

async function handleTrackingIds({ trackingIds, domain, sourceUrl }) {
  if (!trackingIds || trackingIds.length === 0) {
    return { success: false, error: "No tracking IDs" };
  }
  // Salva i tracking IDs rilevati
  const result = await chrome.storage.local.get("detectedTrackingIds");
  const existing = result.detectedTrackingIds || {};
  trackingIds.forEach((id) => {
    existing[id] = { domain, sourceUrl, detectedAt: Date.now() };
  });
  await chrome.storage.local.set({ detectedTrackingIds: existing });

  // Aggiorna badge con numero tracking
  const count = Object.keys(existing).length;
  chrome.action.setBadgeText({ text: String(count) });
  chrome.action.setBadgeBackgroundColor({ color: "#06B6D4" });

  console.log(`[ParcelPulse] ${trackingIds.length} tracking IDs detected on ${domain}`);
  return { success: true, count };
}

async function handlePendingImport({ trackingIds, domain }) {
  await chrome.storage.local.set({
    pendingImport: { trackingIds, domain, createdAt: Date.now() },
  });
  return { success: true };
}

async function getPendingImport() {
  const result = await chrome.storage.local.get("pendingImport");
  return result.pendingImport || null;
}

// ============================================
// Direct tracking fetch (come l'extension originale)
// La chiave: SEMPRE estrarre csrfToken fresco da un tab Amazon aperto
// prima di chiamare l'API. Questo e' esattamente come fa l'extension originale.
// ============================================

async function handleFetchTracking({ trackingId, domain }) {
  if (!trackingId) {
    return { success: false, error: "Missing trackingId" };
  }

  // Determina dominio target
  const sessions = await getStoredSessions();
  const targetDomain = domain || Object.keys(sessions)[0] || "www.amazon.it";

  // STEP 1: Ottieni cookie FRESCHI dal browser (come l'extension originale, linea 176)
  const cookies = await chrome.cookies.getAll({ url: `https://${targetDomain}` });
  const cookieString = cookies
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  if (!cookieString) {
    return { success: false, error: "No Amazon cookies. Visita Amazon e accedi al tuo account." };
  }

  // STEP 2: Estrai csrfToken FRESCO da un tab Amazon aperto
  // Questo e' il segreto dell'extension originale: il token viene estratto
  // dalla pagina al MOMENTO della chiamata API (linee 95-101, 111-115)
  let csrfToken = await extractFreshCsrfToken(targetDomain);

  // Fallback: usa il token salvato se non riusciamo a estrarlo fresco
  if (!csrfToken) {
    const session = sessions[targetDomain];
    csrfToken = session?.csrfToken;
  }

  if (!csrfToken) {
    return { success: false, error: "No csrfToken. Apri una pagina Amazon e riprova." };
  }

  // Aggiorna il token salvato
  if (sessions[targetDomain]) {
    sessions[targetDomain].csrfToken = csrfToken;
    sessions[targetDomain].sessionCookies = cookieString;
    await storeSession(targetDomain, sessions[targetDomain]);
  }

  // STEP 3: Chiama Amazon API (esattamente come l'extension originale, linee 493-519)
  const url = `https://${targetDomain}/progress-tracker/package/actions/map-tracking-deans-proxy`;
  const formBody = new URLSearchParams({
    trackingId: trackingId,
    csrfToken: csrfToken,
  }).toString();

  try {
    const response = await fetch(url, {
      method: "POST",
      body: formBody,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Cookie: cookieString,
      },
    });

    const data = await response.json();
    console.log("[ParcelPulse] fetchTracking:", trackingId,
      "response:", data.responseCode || (data.success ? "OK" : "FAIL"),
      "status:", data.packageLocationDetails?.trackingObjectState || data.value?.status || "N/A");

    return data;
  } catch (error) {
    console.error("[ParcelPulse] fetchTracking error:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Estrai csrfToken FRESCO da un tab Amazon aperto.
 * Usa chrome.scripting.executeScript in MAIN world (come l'extension originale, linee 95-98).
 * Prova tutti i tab Amazon aperti finche' ne trova uno con un token valido.
 */
async function extractFreshCsrfToken(domain) {
  try {
    // Prima cerca tab del dominio specifico
    let tabs = await chrome.tabs.query({ url: `https://${domain}/*` });

    // Se non trova, cerca qualsiasi tab Amazon
    if (tabs.length === 0) {
      tabs = await chrome.tabs.query({ url: "https://www.amazon.*/*" });
    }
    if (tabs.length === 0) {
      tabs = await chrome.tabs.query({ url: "https://www.amazon.co.*/*" });
    }

    if (tabs.length === 0) {
      console.log("[ParcelPulse] No Amazon tabs open for token extraction");
      return null;
    }

    // Prova ogni tab (l'extension originale fa esattamente questo con executeScript + MAIN world)
    for (const tab of tabs) {
      if (!tab.id) continue;
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: "MAIN",
          func: () => {
            return (
              window.csrfToken ||
              document.querySelector('meta[name="CSRF-TOKEN"]')?.getAttribute("content") ||
              document.querySelector('input[name="csrfToken"]')?.value ||
              null
            );
          },
        });

        if (results && results[0] && results[0].result) {
          console.log("[ParcelPulse] Fresh token extracted from tab:", tab.url?.substring(0, 60));
          return results[0].result;
        }
      } catch (e) {
        // Tab restricted (chrome:// pages etc.), try next
      }
    }

    console.log("[ParcelPulse] No token found in", tabs.length, "Amazon tabs");
    return null;
  } catch (e) {
    console.error("[ParcelPulse] extractFreshCsrfToken error:", e.message);
    return null;
  }
}

// ============================================
// OSRM Routing + Haversine
// ============================================

async function getRoadDistance(lat1, lon1, lat2, lon2) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.code === "Ok" && data.routes?.[0]) {
      const route = data.routes[0];
      return {
        distance: Math.round((route.distance / 1000) * 10) / 10,
        duration: Math.round(route.duration / 60),
        polyline: route.geometry,
      };
    }
    return null;
  } catch (e) {
    console.warn("[ParcelPulse] OSRM error:", e.message);
    return null;
  }
}

function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

// ============================================
// Overlay: fetch tracking + parsing + OSRM
// ============================================

const STATUS_MAP = {
  DELIVERED: "DELIVERED",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  PICKED_UP: "OUT_FOR_DELIVERY",
  PENDING_PICKUP: "OUT_FOR_DELIVERY",
  IN_TRANSIT: "IN_TRANSIT",
  SHIPPED: "IN_TRANSIT",
  NOT_READY: "NOT_READY",
  CREATED: "NOT_READY",
  CANCELLED: "CANCELLED",
};

async function handleOverlayFetchTracking({ trackingId, domain }) {
  // 1. Fetch raw da Amazon (riusa handleFetchTracking)
  const raw = await handleFetchTracking({ trackingId, domain });

  if (raw.success === false || raw.responseCode === "INVALID_TOKEN") {
    return {
      error: raw.error || raw.responseCode || "Amazon ha rifiutato la richiesta. Apri una pagina Amazon e riprova.",
      status: "UNKNOWN",
    };
  }

  const pkg = raw.packageLocationDetails;
  if (!pkg) {
    return {
      error: "GPS tracking non ancora disponibile per questa spedizione.",
      status: raw.value?.status || "UNKNOWN",
    };
  }

  // 2. Parsing risposta Amazon
  const rawStatus = (pkg.trackingObjectState || "").toUpperCase();
  const status = STATUS_MAP[rawStatus] || rawStatus || "UNKNOWN";

  const result = {
    trackingId,
    status,
    domain: domain || "www.amazon.it",
  };

  // Fermate rimanenti
  if (pkg.stopsRemaining !== undefined) {
    const stops = parseInt(String(pkg.stopsRemaining), 10);
    if (!isNaN(stops)) result.stopsRemaining = stops;
  }

  // Posizione corriere
  if (pkg.transporterDetails?.geoLocation) {
    const geo = pkg.transporterDetails.geoLocation;
    result.courierLat = geo.latitude;
    result.courierLon = geo.longitude;
    if (geo.locationTime) result.lastUpdate = geo.locationTime;
  }

  // Session state
  if (pkg.transporterDetails?.transporterSessionState) {
    result.sessionState = pkg.transporterDetails.transporterSessionState;
  }

  // Posizione destinazione
  if (pkg.destinationAddress?.geoLocation) {
    const dest = pkg.destinationAddress.geoLocation;
    result.destLat = dest.latitude;
    result.destLon = dest.longitude;
  }

  // 3. Calcolo distanze + route
  if (result.courierLat && result.courierLon && result.destLat && result.destLon) {
    // Haversine (sempre disponibile)
    result.distanceKm = calculateHaversineDistance(
      result.courierLat, result.courierLon,
      result.destLat, result.destLon
    );

    // OSRM per distanza stradale + polyline percorso
    const road = await getRoadDistance(
      result.courierLat, result.courierLon,
      result.destLat, result.destLon
    );
    if (road) {
      result.roadDistanceKm = road.distance;
      result.routeDuration = road.duration;
      result.routePolyline = road.polyline;
    }
  }

  console.log("[ParcelPulse] Overlay tracking:", trackingId, "status:", status,
    "distance:", result.distanceKm || "N/A", "stops:", result.stopsRemaining ?? "N/A");

  return result;
}

// ============================================
// Browser Notifications
// ============================================

function handleShowNotification({ title, message, tag }) {
  const notifId = `parcelpulse_${tag || "generic"}_${Date.now()}`;
  chrome.notifications.create(notifId, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: title || "ParcelPulse",
    message: message || "",
    priority: 2,
  }, (notifCreatedId) => {
    if (chrome.runtime.lastError) {
      console.warn("[ParcelPulse] Notification error:", chrome.runtime.lastError.message);
    } else {
      console.log("[ParcelPulse] Notification sent:", notifCreatedId);
    }
  });
}

// ============================================
// Tab update listener - auto-cattura su pagine Amazon
// ============================================

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) return;

  // Controlla se e' un dominio Amazon
  const amazonMatch = tab.url.match(
    /https:\/\/www\.(amazon\.\w+(?:\.\w+)?)\//
  );
  if (!amazonMatch) return;

  const domain = `www.${amazonMatch[1]}`;

  // Inietta pageScript.js per catturare csrfToken dalla pagina
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        // Estrai csrfToken dal contesto della pagina
        const token =
          window.csrfToken ||
          document.querySelector('meta[name="CSRF-TOKEN"]')?.getAttribute("content") ||
          document.querySelector('input[name="csrfToken"]')?.value;

        if (token) {
          window.postMessage(
            {
              type: "PARCELPULSE_CSRF_TOKEN",
              csrfToken: token,
            },
            "*"
          );
        }
      },
    });
  } catch (e) {
    // Silently ignore if we can't inject (e.g., restricted pages)
  }
});

// ============================================
// Init
// ============================================

chrome.runtime.onInstalled.addListener(async () => {
  console.log("[ParcelPulse] Extension installed");
  const sessions = await getStoredSessions();
  updateBadge(sessions);
});

chrome.runtime.onStartup.addListener(async () => {
  console.log("[ParcelPulse] Browser started");
  const sessions = await getStoredSessions();
  updateBadge(sessions);
});
