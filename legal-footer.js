(function () {
  const LEGAL_LINKS = [
    { href: "delivery.html", label: "Условия доставки" },
    { href: "privacy.html", label: "Персональные данные" },
    { href: "cookies.html", label: "Файлы cookie" },
    { href: "user-agreement.html", label: "Пользовательское соглашение" },
    { href: "public-offer.html", label: "Договор публичной оферты" },
    { href: "personal-data-policy.html", label: "Политика оператора в отношении персональных данных" },
    { href: "personal-data-consent.html", label: "Согласие на обработку персональных данных" },
    { href: "marketing-consent.html", label: "Согласие на информационную и рекламную рассылку" }
  ];

  function renderLegalFooter() {
    const mount = document.getElementById("legal-site-footer");
    if (!mount) return;
    const items = LEGAL_LINKS.map(
      (link) => `<li><a href="${link.href}">${link.label}</a></li>`
    ).join("");
    mount.innerHTML = `
      <div class="container footer__inner">
        <div class="footer__col">
          <ul class="footer__legal">${items}</ul>
          <p class="footer__copy">© 2026 Карпов кормит</p>
        </div>
      </div>`;
  }

  document.addEventListener("DOMContentLoaded", renderLegalFooter);
})();
