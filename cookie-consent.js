(function () {
  function initCookieConsent() {
    const banner = document.getElementById("cookie-banner");
    const btn = document.getElementById("cookie-accept");
    if (!banner || !btn) return;

    let accepted = false;
    try {
      accepted = localStorage.getItem("restobar_cookie_consent") === "v1";
    } catch (_) {
      accepted = false;
    }

    if (accepted) {
      banner.hidden = true;
      banner.setAttribute("aria-hidden", "true");
      return;
    }

    banner.hidden = false;
    banner.setAttribute("aria-hidden", "false");

    btn.addEventListener("click", () => {
      try {
        localStorage.setItem("restobar_cookie_consent", "v1");
      } catch (_) {}
      banner.hidden = true;
      banner.setAttribute("aria-hidden", "true");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCookieConsent);
  } else {
    initCookieConsent();
  }
})();
