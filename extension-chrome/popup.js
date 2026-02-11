/**
 * ParcelPulse - Popup Script
 *
 * Mostra stato dei domini Amazon collegati e azioni disponibili.
 */

// URL della webapp
const WEBAPP_URLS = [
  "https://parcelpulse.it",
];

// Flag per dominio Amazon
const DOMAIN_FLAGS = {
  "www.amazon.it": "\u{1F1EE}\u{1F1F9}",
  "www.amazon.com": "\u{1F1FA}\u{1F1F8}",
  "www.amazon.co.uk": "\u{1F1EC}\u{1F1E7}",
  "www.amazon.de": "\u{1F1E9}\u{1F1EA}",
  "www.amazon.fr": "\u{1F1EB}\u{1F1F7}",
  "www.amazon.es": "\u{1F1EA}\u{1F1F8}",
  "www.amazon.co.jp": "\u{1F1EF}\u{1F1F5}",
  "www.amazon.in": "\u{1F1EE}\u{1F1F3}",
  "www.amazon.com.au": "\u{1F1E6}\u{1F1FA}",
  "www.amazon.ca": "\u{1F1E8}\u{1F1E6}",
  "www.amazon.com.br": "\u{1F1E7}\u{1F1F7}",
  "www.amazon.com.sg": "\u{1F1F8}\u{1F1EC}",
  "www.amazon.nl": "\u{1F1F3}\u{1F1F1}",
  "www.amazon.pl": "\u{1F1F5}\u{1F1F1}",
  "www.amazon.se": "\u{1F1F8}\u{1F1EA}",
  "www.amazon.ae": "\u{1F1E6}\u{1F1EA}",
  "www.amazon.sa": "\u{1F1F8}\u{1F1E6}",
  "www.amazon.com.mx": "\u{1F1F2}\u{1F1FD}",
  "www.amazon.com.tr": "\u{1F1F9}\u{1F1F7}",
  "www.amazon.com.be": "\u{1F1E7}\u{1F1EA}",
  "www.amazon.eg": "\u{1F1EA}\u{1F1EC}",
  "www.amazon.co": "\u{1F1E8}\u{1F1F4}",
};

function timeAgo(timestamp) {
  if (!timestamp) return "mai";
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "ora";
  if (minutes < 60) return minutes + "m fa";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + "h fa";
  return Math.floor(hours / 24) + "g fa";
}

async function loadStatus() {
  const status = await chrome.runtime.sendMessage({ action: "getStatus" });

  // Version
  document.getElementById("version").textContent = "v" + status.version;

  // Status indicator
  const dot = document.getElementById("statusDot");
  const text = document.getElementById("statusText");

  if (status.connected) {
    dot.className = "dot connected";
    const count = status.domains.length;
    text.textContent = count + (count > 1 ? " domini collegati" : " dominio collegato");
  } else {
    dot.className = "dot disconnected";
    text.textContent = "Nessun dominio collegato";
  }

  // Domains list
  renderDomains(status.sessions);
}

function renderDomains(sessions) {
  const container = document.getElementById("sessionsList");

  if (!sessions || Object.keys(sessions).length === 0) {
    container.innerHTML =
      '<div class="empty-state">' +
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="empty-icon">' +
      '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>' +
      "<p>Nessun dominio collegato. Visita Amazon per la connessione automatica.</p>" +
      "</div>";
    return;
  }

  var sorted = Object.values(sessions).sort(
    function(a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); }
  );

  container.innerHTML = sorted
    .map(function(s) {
      return '<div class="session-item" data-domain="' + s.domain + '">' +
        '<div class="session-info">' +
        '<div class="session-domain">' +
        '<span class="flag">' + (DOMAIN_FLAGS[s.domain] || "\u{1F310}") + '</span>' +
        s.domain.replace("www.", "") +
        '</div>' +
        '<div class="session-meta">' +
        '<span class="token-badge">Connesso</span>' +
        ' &middot; ' + timeAgo(s.updatedAt) +
        '</div></div>' +
        '<div class="session-actions">' +
        '<button class="btn-icon refresh-btn" title="Aggiorna" data-domain="' + s.domain + '">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>' +
        '<path d="M3 3v5h5"/>' +
        '<path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>' +
        '<path d="M16 16h5v5"/></svg></button>' +
        '<button class="btn-icon danger delete-btn" title="Rimuovi" data-domain="' + s.domain + '">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>' +
        '</div></div>';
    })
    .join("");

  // Event listeners
  container.querySelectorAll(".refresh-btn").forEach(function(btn) {
    btn.addEventListener("click", async function(e) {
      e.stopPropagation();
      var domain = btn.dataset.domain;
      btn.style.opacity = "0.5";
      await chrome.runtime.sendMessage({ action: "forceRefresh", domain: domain });
      await loadStatus();
    });
  });

  container.querySelectorAll(".delete-btn").forEach(function(btn) {
    btn.addEventListener("click", async function(e) {
      e.stopPropagation();
      var domain = btn.dataset.domain;
      await chrome.runtime.sendMessage({ action: "clearSession", domain: domain });
      await loadStatus();
    });
  });
}

// Open webapp
document.getElementById("openWebapp").addEventListener("click", async function() {
  var tabs = await chrome.tabs.query({});
  var existingTab = tabs.find(function(t) {
    return t.url && t.url.startsWith("https://parcelpulse.it");
  });

  if (existingTab) {
    chrome.tabs.update(existingTab.id, { active: true });
    chrome.windows.update(existingTab.windowId, { focused: true });
  } else {
    chrome.tabs.create({ url: WEBAPP_URLS[0] });
  }
  window.close();
});

// Clear all
document.getElementById("clearAll").addEventListener("click", async function() {
  await chrome.runtime.sendMessage({ action: "clearAll" });
  await loadStatus();
});

// ============================================
// Tracking IDs rilevati
// ============================================

async function loadTrackingIds() {
  var result = await chrome.storage.local.get("detectedTrackingIds");
  var ids = result.detectedTrackingIds || {};
  var section = document.getElementById("trackingSection");
  var container = document.getElementById("trackingList");

  if (Object.keys(ids).length === 0) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";

  var sorted = Object.entries(ids).sort(
    function(a, b) { return (b[1].detectedAt || 0) - (a[1].detectedAt || 0); }
  );

  container.innerHTML = sorted
    .map(function(entry) {
      var id = entry[0];
      var data = entry[1];
      return '<div class="session-item tracking-item">' +
        '<div class="session-info">' +
        '<div class="session-domain" style="font-family: monospace; font-size: 11px;">' +
        '<span class="flag">' + (DOMAIN_FLAGS[data.domain] || "\u{1F4E6}") + '</span>' +
        id +
        '</div>' +
        '<div class="session-meta">' +
        timeAgo(data.detectedAt) +
        '</div></div>' +
        '<div class="session-actions">' +
        '<button class="btn-icon track-btn" title="Traccia spedizione" data-id="' + id + '" data-domain="' + (data.domain || "www.amazon.it") + '">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#06B6D4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></button>' +
        '</div></div>';
    })
    .join("");

  // Track click - apre overlay di tracciamento in un nuovo tab
  container.querySelectorAll(".track-btn").forEach(function(btn) {
    btn.addEventListener("click", async function() {
      var trackingId = btn.dataset.id;
      var btnDomain = btn.dataset.domain;
      var params = new URLSearchParams({ ids: trackingId, domain: btnDomain });
      var overlayUrl = chrome.runtime.getURL("overlay.html#" + params.toString());
      chrome.tabs.create({ url: overlayUrl });
      window.close();
    });
  });
}

// Share extension
document.getElementById("shareExtension").addEventListener("click", function() {
  var shareUrl = "https://chromewebstore.google.com/detail/parcelpulse/idgmlajpkopmbdglnjbhkljjgoncjfga";
  var shareText = "Traccia i tuoi pacchi Amazon in tempo reale con mappa GPS! Prova ParcelPulse:";
  if (navigator.share) {
    navigator.share({ title: "ParcelPulse", text: shareText, url: shareUrl });
  } else {
    navigator.clipboard.writeText(shareText + " " + shareUrl).then(function() {
      var btn = document.getElementById("shareExtension");
      var originalText = btn.innerHTML;
      btn.querySelector("span").textContent = "Link copiato!";
      setTimeout(function() {
        btn.querySelector("span").textContent = "Condividi con i tuoi amici";
      }, 2000);
    });
  }
});

// Init
loadStatus();
loadTrackingIds();
