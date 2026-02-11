/**
 * ParcelPulse - Content Script Webapp
 *
 * Iniettato sulla webapp ParcelPulse (produzione).
 * Fa da ponte tra la webapp e il service worker dell'extension.
 *
 * Comunicazione:
 * - Webapp dispatcha CustomEvent "parcelpulse-request-session"
 * - Questo script chiede al background i dati
 * - Risponde con CustomEvent "parcelpulse-session-data"
 */

(() => {
  // Segnala che l'extension e' installata
  window.dispatchEvent(
    new CustomEvent("parcelpulse-extension-ready", {
      detail: { version: chrome.runtime.getManifest().version },
    })
  );

  // Inietta un flag nel DOM per detection sincrona
  document.documentElement.setAttribute("data-parcelpulse-extension", "true");

  // Ascolta richieste dalla webapp
  window.addEventListener("parcelpulse-request-session", async (event) => {
    const { domain } = event.detail || {};

    try {
      const response = await chrome.runtime.sendMessage({
        action: "getSession",
        domain: domain || undefined,
      });

      window.dispatchEvent(
        new CustomEvent("parcelpulse-session-data", {
          detail: response,
        })
      );
    } catch (error) {
      window.dispatchEvent(
        new CustomEvent("parcelpulse-session-data", {
          detail: { success: false, error: error.message },
        })
      );
    }
  });

  // Ascolta richiesta di tutte le sessioni
  window.addEventListener("parcelpulse-request-all-sessions", async () => {
    try {
      const sessions = await chrome.runtime.sendMessage({
        action: "getAllSessions",
      });

      window.dispatchEvent(
        new CustomEvent("parcelpulse-all-sessions-data", {
          detail: { success: true, sessions },
        })
      );
    } catch (error) {
      window.dispatchEvent(
        new CustomEvent("parcelpulse-all-sessions-data", {
          detail: { success: false, error: error.message },
        })
      );
    }
  });

  // Ascolta richiesta di push manuale (dalla webapp)
  window.addEventListener("parcelpulse-request-refresh", async (event) => {
    const { domain } = event.detail || {};

    try {
      const response = await chrome.runtime.sendMessage({
        action: "forceRefresh",
        domain,
      });

      window.dispatchEvent(
        new CustomEvent("parcelpulse-session-data", {
          detail: response,
        })
      );
    } catch (error) {
      window.dispatchEvent(
        new CustomEvent("parcelpulse-session-data", {
          detail: { success: false, error: error.message },
        })
      );
    }
  });

  // Ascolta richiesta di fetch tracking diretto dall'extension
  // L'extension fa la chiamata API con cookie freschi (come l'extension originale)
  window.addEventListener("parcelpulse-request-tracking", async (event) => {
    const { trackingId, domain, requestId } = event.detail || {};

    try {
      const response = await chrome.runtime.sendMessage({
        action: "fetchTracking",
        trackingId,
        domain,
      });

      window.dispatchEvent(
        new CustomEvent("parcelpulse-tracking-data", {
          detail: { ...response, requestId },
        })
      );
    } catch (error) {
      window.dispatchEvent(
        new CustomEvent("parcelpulse-tracking-data", {
          detail: { success: false, error: error.message, requestId },
        })
      );
    }
  });

  // Push proattivo: invia sessione automaticamente al caricamento della webapp
  // Aspetta che React si monti e registri gli event listener
  setTimeout(async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        action: "getSession",
      });
      if (response && response.success && response.session) {
        window.dispatchEvent(
          new CustomEvent("parcelpulse-session-data", {
            detail: response,
          })
        );
        console.log("[ParcelPulse] Dati connessione inviati:", response.session.domain);
      }
    } catch (e) {
      // Silently ignore - webapp non ancora pronta
    }
  }, 800);

  console.log("[ParcelPulse] Webapp bridge attivo");
})();
