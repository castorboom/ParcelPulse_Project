/**
 * ParcelPulse - Content Script Amazon
 *
 * Iniettato su tutte le pagine Amazon.
 * - Cattura csrfToken dalla pagina e lo invia al service worker
 * - Rileva pagine tracking e estrae tracking ID
 * - Mostra floating badge per invitare l'utente ad importare in ParcelPulse
 */

(() => {
  const domain = window.location.hostname;
  const url = window.location.href;
  let capturedCsrfToken = null; // Token catturato dal pageScript, accessibile nel badge click

  // ============================================
  // 1. Cattura CSRF Token
  // ============================================

  // Inietta pageScript.js nel contesto MAIN della pagina
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("pageScript.js");
  (document.head || document.documentElement).appendChild(script);
  script.onload = () => script.remove();

  // Ascolta il messaggio dal pageScript con il csrfToken
  // Salva anche in window.__parcelpulse_csrfToken per uso dal badge click handler
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== "PARCELPULSE_CSRF_TOKEN") return;

    const { csrfToken } = event.data;
    if (!csrfToken) return;

    // Salva per uso locale (badge click handler nella stessa closure)
    capturedCsrfToken = csrfToken;

    chrome.runtime.sendMessage({
      action: "csrfTokenCaptured",
      csrfToken,
      domain,
      sourceUrl: url,
    });
  });

  // Fallback: estrazione diretta dal DOM
  setTimeout(() => {
    const inputToken = document.querySelector('input[name="csrfToken"]')?.value;
    const metaToken = document
      .querySelector('meta[name="CSRF-TOKEN"]')
      ?.getAttribute("content");
    const token = inputToken || metaToken;

    if (token) {
      capturedCsrfToken = token; // Salva anche nel fallback
      chrome.runtime.sendMessage({
        action: "csrfTokenCaptured",
        csrfToken: token,
        domain,
        sourceUrl: url,
      });
    }
  }, 2000);

  // ============================================
  // 2. Rileva pagine tracking e estrai tracking IDs
  // ============================================

  const isTrackingPage =
    url.includes("/ship-track") ||
    url.includes("/progress-tracker") ||
    url.includes("trackingId=") ||
    url.includes("/track");

  if (!isTrackingPage) return; // Non e' una pagina tracking, fermati qui

  // Aspetta che il DOM sia caricato completamente
  setTimeout(() => {
    const trackingIds = extractTrackingIds();
    if (trackingIds.length > 0) {
      // Invia tracking IDs al background
      chrome.runtime.sendMessage({
        action: "trackingIdsDetected",
        trackingIds,
        domain,
        sourceUrl: url,
      });

      // Mostra floating badge
      showImportBadge(trackingIds);
    }
  }, 2500);

  // Osserva cambiamenti DOM (Amazon carica contenuti dinamicamente)
  const observer = new MutationObserver(() => {
    const ids = extractTrackingIds();
    if (ids.length > 0) {
      observer.disconnect();
      chrome.runtime.sendMessage({
        action: "trackingIdsDetected",
        trackingIds: ids,
        domain,
        sourceUrl: url,
      });
      // Se il badge non esiste ancora, mostralo
      if (!document.getElementById("parcelpulse-badge")) {
        showImportBadge(ids);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  // Auto-disconnect dopo 15s per non sprecare risorse
  setTimeout(() => observer.disconnect(), 15000);

  // ============================================
  // 3. Estrazione Tracking IDs
  // ============================================

  function extractTrackingIds() {
    const ids = new Set();

    // Metodo 1: Selettore CSS specifico delle pagine tracking Amazon
    document.querySelectorAll(".pt-delivery-card-trackingId").forEach((el) => {
      const text = el.textContent?.trim() || "";
      // Formato: "Tracking ID: TBA123456789000"
      const match = text.match(/:\s*(.+)/);
      if (match) ids.add(match[1].trim());
      else if (text) ids.add(text);
    });

    // Metodo 2: Attributo data-tracking-id
    document.querySelectorAll("[data-tracking-id]").forEach((el) => {
      const id = el.getAttribute("data-tracking-id");
      if (id) ids.add(id);
    });

    // Metodo 3: URL parameter trackingId
    const urlParams = new URLSearchParams(window.location.search);
    const urlTrackingId = urlParams.get("trackingId");
    if (urlTrackingId) ids.add(urlTrackingId);

    // Metodo 4: Cerca pattern TBA nel testo della pagina (pagine ship-track)
    document.querySelectorAll(
      ".a-size-medium, .a-size-base-plus, .ship-track-grid-subtext, [data-test-id*='tracking']"
    ).forEach((el) => {
      const text = el.textContent?.trim() || "";
      const tbaMatch = text.match(/\b(TBA\d{12,})\b/);
      if (tbaMatch) ids.add(tbaMatch[1]);
    });

    return [...ids];
  }

  // ============================================
  // 4. Notification Sound
  // ============================================

  function playNotificationSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [
        { freq: 830, start: 0, dur: 0.12 },
        { freq: 1050, start: 0.12, dur: 0.12 },
        { freq: 1320, start: 0.24, dur: 0.2 },
      ];
      const master = ctx.createGain();
      master.gain.value = 0.15;
      master.connect(ctx.destination);

      notes.forEach(({ freq, start, dur }) => {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        env.gain.setValueAtTime(0, ctx.currentTime + start);
        env.gain.linearRampToValueAtTime(1, ctx.currentTime + start + 0.02);
        env.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + dur);
        osc.connect(env);
        env.connect(master);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur + 0.01);
      });

      setTimeout(() => ctx.close(), 1000);
    } catch (e) {
      // Audio non supportato, ignora silenziosamente
    }
  }

  // ============================================
  // 5. Floating Badge UI
  // ============================================

  function showImportBadge(trackingIds) {
    // Evita duplicati
    if (document.getElementById("parcelpulse-badge")) return;

    const count = trackingIds.length;
    const badge = document.createElement("div");
    badge.id = "parcelpulse-badge";

    badge.innerHTML = `
      <div id="pp-badge-inner">
        <div id="pp-badge-icon">
          <img src="${chrome.runtime.getURL("icons/icon48.png")}" width="18" height="18" alt="" style="border-radius:4px">
        </div>
        <div id="pp-badge-content">
          <div id="pp-badge-title">ParcelPulse</div>
          <div id="pp-badge-text">
            ${count === 1
              ? `Spedizione <strong>${trackingIds[0].slice(0, 8)}...</strong> rilevata`
              : `<strong>${count}</strong> spedizioni rilevate`}
          </div>
        </div>
        <button id="pp-badge-btn">Traccia in tempo reale</button>
        <button id="pp-badge-close" title="Chiudi">&times;</button>
      </div>
    `;

    // Stili inline (evita conflitti CSS con Amazon)
    const style = document.createElement("style");
    style.textContent = `
      #parcelpulse-badge {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 99999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        animation: ppSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes ppSlideIn {
        from { transform: translateY(100px) scale(0.95); opacity: 0; }
        to { transform: translateY(0) scale(1); opacity: 1; }
      }
      @keyframes ppSlideOut {
        from { transform: translateY(0) scale(1); opacity: 1; }
        to { transform: translateY(100px) scale(0.95); opacity: 0; }
      }
      #pp-badge-inner {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 14px;
        background: linear-gradient(135deg, #0F0F2E 0%, #1A1A3E 100%);
        border: 1px solid rgba(139, 92, 246, 0.3);
        border-radius: 14px;
        box-shadow: 0 4px 24px rgba(0,0,0,0.4), 0 0 20px rgba(139, 92, 246, 0.15);
        color: #E2E8F0;
        max-width: 420px;
      }
      #pp-badge-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 10px;
        background: rgba(139, 92, 246, 0.15);
        color: #8B5CF6;
        flex-shrink: 0;
      }
      #pp-badge-content {
        flex: 1;
        min-width: 0;
      }
      #pp-badge-title {
        font-size: 11px;
        font-weight: 700;
        color: #8B5CF6;
        letter-spacing: 0.3px;
      }
      #pp-badge-text {
        font-size: 12px;
        color: #94A3B8;
        margin-top: 1px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #pp-badge-text strong {
        color: #E2E8F0;
      }
      #pp-badge-btn {
        padding: 7px 14px;
        border-radius: 8px;
        border: none;
        background: #8B5CF6;
        color: white;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
        transition: all 0.2s;
        flex-shrink: 0;
      }
      #pp-badge-btn:hover {
        background: #7C3AED;
        box-shadow: 0 0 16px rgba(139, 92, 246, 0.5);
      }
      #pp-badge-close {
        position: absolute;
        top: -6px;
        right: -6px;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 1px solid rgba(139, 92, 246, 0.2);
        background: #1A1A3E;
        color: #64748B;
        font-size: 14px;
        line-height: 1;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }
      #pp-badge-close:hover {
        background: rgba(239, 68, 68, 0.2);
        color: #EF4444;
        border-color: rgba(239, 68, 68, 0.3);
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(badge);
    playNotificationSound();

    // Click "Traccia in tempo reale" -> invia token fresco + apri overlay fullscreen
    badge.querySelector("#pp-badge-btn").addEventListener("click", async () => {
      // 1. Invia token fresco al background
      const freshToken = capturedCsrfToken;
      const domToken =
        document.querySelector('input[name="csrfToken"]')?.value ||
        document.querySelector('meta[name="CSRF-TOKEN"]')?.getAttribute("content");
      const tokenToUse = freshToken || domToken;

      if (tokenToUse) {
        await chrome.runtime.sendMessage({
          action: "csrfTokenCaptured",
          csrfToken: tokenToUse,
          domain,
          sourceUrl: url,
        });
      }

      // 2. Inietta overlay fullscreen
      injectOverlay(trackingIds);
      closeBadge();
    });

    // Click chiudi
    badge.querySelector("#pp-badge-close").addEventListener("click", (e) => {
      e.stopPropagation();
      closeBadge();
    });

    function closeBadge() {
      badge.style.animation = "ppSlideOut 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards";
      setTimeout(() => badge.remove(), 300);
    }

    // Auto-hide dopo 30 secondi
    setTimeout(() => {
      if (document.getElementById("parcelpulse-badge")) {
        closeBadge();
      }
    }, 30000);
  }

  // ============================================
  // 6. Overlay Fullscreen (iframe)
  // ============================================

  function injectOverlay(trackingIds) {
    // Evita duplicati
    if (document.getElementById("parcelpulse-overlay-container")) return;

    // Container fullscreen
    const container = document.createElement("div");
    container.id = "parcelpulse-overlay-container";

    // Stili overlay (isolati da Amazon)
    const overlayStyle = document.createElement("style");
    overlayStyle.id = "parcelpulse-overlay-style";
    overlayStyle.textContent = `
      #parcelpulse-overlay-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 999999;
        opacity: 0;
        transform: scale(0.97);
        transition: opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1),
                    transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      }
      #parcelpulse-overlay-container.pp-active {
        opacity: 1;
        transform: scale(1);
      }
      #parcelpulse-overlay-container.pp-closing {
        opacity: 0;
        transform: scale(0.97);
      }
      #parcelpulse-overlay-iframe {
        width: 100%;
        height: 100%;
        border: none;
      }
    `;
    document.head.appendChild(overlayStyle);

    // Iframe che punta a overlay.html dell'extension
    const iframe = document.createElement("iframe");
    iframe.id = "parcelpulse-overlay-iframe";
    const params = new URLSearchParams({
      ids: trackingIds.join(","),
      domain: domain,
    });
    iframe.src = chrome.runtime.getURL(`overlay.html#${params.toString()}`);
    iframe.allow = ""; // Nessun permesso extra necessario

    container.appendChild(iframe);
    document.body.appendChild(container);

    // Animazione entrata (double rAF per garantire il paint)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        container.classList.add("pp-active");
      });
    });

    // Ascolta messaggio di chiusura dall'overlay
    function handleCloseMessage(event) {
      if (event.data?.type === "PARCELPULSE_CLOSE_OVERLAY") {
        closeOverlay();
      }
    }
    window.addEventListener("message", handleCloseMessage);

    // ESC per chiudere
    function handleEsc(e) {
      if (e.key === "Escape") {
        closeOverlay();
      }
    }
    document.addEventListener("keydown", handleEsc);

    function closeOverlay() {
      container.classList.remove("pp-active");
      container.classList.add("pp-closing");
      setTimeout(() => {
        container.remove();
        overlayStyle.remove();
        // Ri-mostra il mini badge dopo chiusura overlay
        showImportBadge(trackingIds);
      }, 400);
      window.removeEventListener("message", handleCloseMessage);
      document.removeEventListener("keydown", handleEsc);
    }
  }
})();
