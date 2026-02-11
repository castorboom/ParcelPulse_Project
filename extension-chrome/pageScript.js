/**
 * ParcelPulse - Page Script
 *
 * Iniettato nel contesto MAIN della pagina Amazon.
 * Accede a window.csrfToken e lo comunica al content script via postMessage.
 */
(() => {
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
})();
