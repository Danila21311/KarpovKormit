let categories = [];
let menuCatalogItems = [];

/** Профиль на Яндекс Еде и поиск карточки на Яндекс Картах. */
const RESTOBAR_YANDEX_EDA_URL =
  "https://eda.yandex.ru/r/kushat_podano?placeSlug=kushat_podano__vrjpx";
const RESTOBAR_YANDEX_MAPS_SEARCH_URL =
  "https://yandex.ru/maps/?text=%D0%9A%D0%B0%D1%80%D0%BF%D0%BE%D0%B2%20%D0%BA%D0%BE%D1%80%D0%BC%D0%B8%D1%82%20%D0%9E%D1%80%D0%B5%D0%BD%D0%B1%D1%83%D1%80%D0%B3";

const appState = {
  activeCategory: "",
  search: "",
  cart: {},
  justAdded: {}
};

const filtersEl = document.getElementById("filters");
const menuSectionsEl = document.getElementById("menu-sections");
const searchEl = document.getElementById("search-input");
const cartEl = document.getElementById("cart");
const cartItemsEl = document.getElementById("cart-items");
const cartTotalEl = document.getElementById("cart-total");
const headerCartCountEl = document.getElementById("header-cart-count");
const mobileCartCountEl = document.getElementById("mobile-cart-count");
const mobileCartBtnEl = document.querySelector(".mobile-cart-btn");
const checkoutFormEl = document.getElementById("checkout-form");
const phoneInputEl = document.getElementById("phone-input");
const quickbarTotalEl = document.getElementById("cart-quickbar-total");
const cartTriggerEl = document.querySelector(".header .cart-trigger");
const detailsModalEl = document.getElementById("dish-modal");
const detailsBodyEl = document.getElementById("dish-modal-body");
let detailsQty = 1;
const justAddedTimers = {};
let sectionObserver = null;
let cardRevealObserver = null;

function normalizeMenuPayload(payload) {
  const sections = Array.isArray(payload?.sections) ? payload.sections : [];
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const sectionNames = sections
    .map((section) => String(section?.name || "").trim())
    .filter(Boolean);
  const fallbackNames = [...new Set(items.map((item) => String(item?.category || "").trim()).filter(Boolean))];
  categories = [...new Set([...(sectionNames.length ? sectionNames : fallbackNames), "Отзывы"])];
  menuCatalogItems = items.map((item) => ({
    id: Number(item.id),
    category: String(item.category || "").trim(),
    name: String(item.name || "").trim(),
    weight: String(item.weight || "—"),
    description: String(item.description || "").trim(),
    tastyDescription: String(item.tastyDescription || "").trim(),
    price: Math.max(0, Number(item.price) || 0),
    image: String(item.image || "").trim(),
    tags: Array.isArray(item.tags) ? item.tags : [],
    isStopList: Boolean(item.isStopList)
  }));
}

async function loadMenuData() {
  const fallbackFromStatic = () => {
    const staticItems =
      typeof menuItems !== "undefined" && Array.isArray(menuItems) ? menuItems : [];
    if (!staticItems.length) {
      throw new Error("Не удалось загрузить меню ни из API, ни из локального файла.");
    }
    const sectionNames = [...new Set(staticItems.map((item) => String(item.category || "").trim()).filter(Boolean))];
    const sections = sectionNames.map((name, index) => ({ id: index + 1, name, sortOrder: index }));
    normalizeMenuPayload({ sections, items: staticItems });
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch("/api/menu", {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error("menu api response is not ok");
    const data = await response.json();
    if (!data?.ok || !Array.isArray(data.items) || data.items.length === 0) {
      throw new Error("menu api payload is empty");
    }
    normalizeMenuPayload(data);
  } catch (_) {
    fallbackFromStatic();
  } finally {
    clearTimeout(timeout);
  }
}

function slugify(value) {
  return value.toLowerCase().replace(/[^а-яa-z0-9]+/gi, "-").replace(/(^-|-$)/g, "");
}

function formatPrice(value) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function joinHumanList(parts) {
  if (parts.length <= 1) return parts[0] || "";
  if (parts.length === 2) return `${parts[0]} и ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} и ${parts[parts.length - 1]}`;
}

function getDishLead(category, name) {
  const lowerName = name.toLowerCase();
  if (category === "Супы") return "Ароматный суп с насыщенным вкусом";
  if (category === "Мангал") return "Блюдо с мангала с выразительным ароматом дымка";
  if (category === "Пицца и хачапури") return "Свежая выпечка с тягучей сырной текстурой";
  if (category === "Десерты") return "Нежный десерт с приятным сбалансированным вкусом";
  if (category === "Гарниры") return "Гарнир, который идеально дополняет основное блюдо";
  if (category === "Меню фуршетных закусок") return "Элегантная фуршетная позиция для комфортной подачи";
  if (lowerName.includes("стейк")) return "Сочный стейк с глубоким мясным вкусом";
  if (lowerName.includes("салат")) return "Легкое и свежее сочетание ингредиентов";
  return "Сбалансированное блюдо с ресторанной подачей";
}

function makeTastyDescription(dish) {
  const source = (dish.description || "").trim();
  if (!source) return "Авторское блюдо с ярким вкусом и аккуратной ресторанной подачей.";

  const ingredients = source
    .split(",")
    .map((part) => part.trim().replace(/\.$/, ""))
    .filter(Boolean);

  if (ingredients.length === 0) return source;

  const lead = getDishLead(dish.category, dish.name);
  const list = joinHumanList(ingredients.slice(0, 6));
  const ending = ingredients.length > 6
    ? "Подается с акцентом на натуральный вкус и аккуратную текстуру."
    : "Все компоненты подобраны так, чтобы вкус оставался ярким и сбалансированным.";

  return `${lead}: ${list}. ${ending}`;
}

function getFilteredItems(category) {
  return menuCatalogItems.filter((item) => {
    const byCategory = item.category === category;
    const bySearch = item.name.toLowerCase().includes(appState.search.toLowerCase());
    return byCategory && bySearch;
  });
}

function renderFilters() {
  filtersEl.innerHTML = "";
  categories.forEach((category) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `filter-btn ${appState.activeCategory === category ? "is-active" : ""}`;
    btn.textContent = category;
    btn.addEventListener("click", () => {
      appState.activeCategory = category;
      renderFilters();
      if (category === "Отзывы") {
        document.getElementById("reviews").scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        const section = document.getElementById(`section-${slugify(category)}`);
        if (section) {
          section.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    });
    filtersEl.appendChild(btn);
  });
}

function createCard(item) {
  const card = document.createElement("article");
  card.className = "card";
  const hasWeight = item.weight && item.weight !== "—";
  const safeDescription = item.description || "Описание скоро появится.";
  const cardTitle = String(item.name || "").replace(/(\d+)\s+г\b/gi, "$1\u00A0г");
  const inCartQty = appState.cart[item.id]?.qty || 0;
  const isJustAdded = Boolean(appState.justAdded[item.id]);
  const tagClassMap = {
    "Хит": "tag--hit",
    "Новинка": "tag--new",
    "Острое": "tag--spicy",
    "Веган": "tag--vegan"
  };
  card.innerHTML = `
    <img class="card__image" src="${item.image}" alt="${item.name}" loading="lazy">
    <div class="card__body">
      <strong>${cardTitle}</strong>
      ${hasWeight ? `<span class="card__meta">${item.weight}</span>` : ""}
      <p class="card__desc">${safeDescription}</p>
      <div class="tags">
        ${item.tags.map((tag) => `<span class="tag ${tagClassMap[tag] || ""}">${tag}</span>`).join("")}
      </div>
      <div class="card__foot">
        <span class="price">${formatPrice(item.price)}</span>
        <div class="card__actions">
          <button class="btn btn--secondary" data-details="${item.id}" type="button">Подробнее</button>
          ${
            item.isStopList
              ? `<button class="btn btn--cart" type="button" disabled title="Блюдо временно недоступно">
                  <span>Стоп-лист</span>
                </button>`
              : isJustAdded
              ? `<button class="btn btn--cart btn--cart-added" type="button" disabled>
                  <span class="btn__icon">✓</span>
                  <span>Добавлено</span>
                </button>`
              : inCartQty > 0
              ? `<div class="card__qty-slot">
                  <div class="qty-controls card__qty-controls">
                    <button type="button" data-card-minus="${item.id}" aria-label="Уменьшить количество">−</button>
                    <span>${inCartQty}</span>
                    <button type="button" data-card-plus="${item.id}" aria-label="Увеличить количество">+</button>
                  </div>
                </div>`
              : `<button class="btn btn--cart" data-add="${item.id}" type="button">
                  <span class="btn__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" role="presentation">
                      <path d="M17 8V7a5 5 0 10-10 0v1H5.7a1 1 0 00-1 .9L4 18.2A1.8 1.8 0 005.8 20h12.4a1.8 1.8 0 001.8-1.8l-.7-9.3a1 1 0 00-1-.9H17zm-8 0V7a3 3 0 116 0v1H9z"></path>
                    </svg>
                  </span>
                  <span>В корзину</span>
                </button>`
          }
        </div>
      </div>
    </div>
  `;
  return card;
}

function markDishAdded(id) {
  const numericId = Number(id);
  appState.justAdded[numericId] = true;
  renderMenuSections();
  if (justAddedTimers[numericId]) clearTimeout(justAddedTimers[numericId]);
  justAddedTimers[numericId] = setTimeout(() => {
    delete appState.justAdded[numericId];
    renderMenuSections();
  }, 1100);
}

function openDishDetails(id) {
  const dish = menuCatalogItems.find((item) => item.id === Number(id));
  if (!dish || !detailsModalEl || !detailsBodyEl) return;
  detailsQty = 1;
  const metaParts = [dish.category];
  if (dish.weight && dish.weight !== "—") metaParts.push(dish.weight);
  const canOrder = !dish.isStopList;
  detailsBodyEl.innerHTML = `
    <img class="dish-modal__image" src="${dish.image}" alt="${dish.name}" loading="lazy">
    <div class="dish-modal__meta">${metaParts.join(" · ")}</div>
    <h3 class="dish-modal__title">${dish.name}</h3>
    <p class="dish-modal__description">${dish.tastyDescription || makeTastyDescription(dish)}</p>
    <p class="dish-modal__price">${formatPrice(dish.price)}</p>
    <div class="dish-modal__actions">
      <div class="dish-modal__qty-slot">
        <div class="qty-controls dish-modal__qty">
          <button type="button" data-details-qty-minus aria-label="Уменьшить количество" ${canOrder ? "" : "disabled"}>−</button>
          <span id="dish-details-qty">1</span>
          <button type="button" data-details-qty-plus aria-label="Увеличить количество" ${canOrder ? "" : "disabled"}>+</button>
        </div>
      </div>
      ${
        canOrder
          ? `<button class="btn btn--primary" type="button" data-details-add="${dish.id}">
        Добавить в корзину
      </button>`
          : `<button class="btn btn--secondary" type="button" disabled>В стоп-листе</button>`
      }
    </div>
  `;
  detailsModalEl.classList.add("is-open");
}

function closeDishDetails() {
  if (!detailsModalEl) return;
  detailsModalEl.classList.remove("is-open");
}

function renderMenuSections() {
  menuSectionsEl.innerHTML = "";
  categories.filter((category) => category !== "Отзывы").forEach((category) => {
    const section = document.createElement("section");
    section.className = "menu-section";
    section.id = `section-${slugify(category)}`;
    const items = getFilteredItems(category);
    section.innerHTML = `<h2 class="menu-section__title">${category}</h2>`;
    const grid = document.createElement("div");
    grid.className = "cards-grid";
    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "Ничего не найдено. Попробуйте изменить запрос.";
      grid.appendChild(empty);
    } else {
      items.forEach((item) => grid.appendChild(createCard(item)));
    }
    section.appendChild(grid);
    menuSectionsEl.appendChild(section);
  });
  setupSectionObserver();
  setupCardRevealObserver();
}

function setupCardRevealObserver() {
  if (cardRevealObserver) {
    cardRevealObserver.disconnect();
    cardRevealObserver = null;
  }

  const cards = document.querySelectorAll(".cards-grid .card");
  const reduced =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduced) {
    cards.forEach((el) => el.classList.add("is-revealed"));
    return;
  }

  cardRevealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-revealed");
        cardRevealObserver.unobserve(entry.target);
      });
    },
    { root: null, rootMargin: "0px 0px -6% 0px", threshold: 0.06 }
  );

  cards.forEach((card) => cardRevealObserver.observe(card));
}

function getFirstMenuCategory() {
  return categories.find((category) => category !== "Отзывы");
}

function setActiveCategory(category) {
  if (!category || category === appState.activeCategory) return;
  appState.activeCategory = category;
  renderFilters();
}

function setupSectionObserver() {
  if (sectionObserver) sectionObserver.disconnect();

  sectionObserver = new IntersectionObserver(
    (entries) => {
      // When user returns to top, keep first menu category active.
      if (window.scrollY < 140) {
        setActiveCategory(getFirstMenuCategory());
        return;
      }

      const visibleEntry = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (!visibleEntry) return;
      const sectionId = visibleEntry.target.id.replace("section-", "");
      const category = categories.find((cat) => slugify(cat) === sectionId);
      setActiveCategory(category);
    },
    { rootMargin: "-25% 0px -55% 0px", threshold: [0.1, 0.3, 0.6] }
  );

  document.querySelectorAll(".menu-section").forEach((section) => sectionObserver.observe(section));
}

function renderStars(count) {
  const n = Math.min(5, Math.max(0, Number(count) || 0));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

function setupReviewsSection() {
  const cardsMount = document.getElementById("reviews-cards-mount");
  const widgetMount = document.getElementById("reviews-widget-mount");
  const widgetBlock = document.getElementById("reviews-widget-block");

  const list =
    typeof guestReviews !== "undefined" && Array.isArray(guestReviews) ? guestReviews : [];

  if (cardsMount) {
    cardsMount.innerHTML = "";
    list.forEach((rev) => {
      const article = document.createElement("article");
      article.className = "review-card";
      const sourceKey = rev.source === "eda" ? "eda" : "maps";
      article.classList.add(`review-card--${sourceKey}`);

      const head = document.createElement("div");
      head.className = "review-card__head";

      const avatar = document.createElement("div");
      avatar.className = "review-card__avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.textContent = rev.initials || String(rev.name || "").slice(0, 2).toUpperCase();

      const meta = document.createElement("div");
      meta.className = "review-card__meta";

      const nameEl = document.createElement("strong");
      nameEl.className = "review-card__name";
      nameEl.textContent = rev.name || "Гость";

      const srcEl = document.createElement("span");
      srcEl.className = `review-card__source review-card__source--${sourceKey}`;
      srcEl.textContent = sourceKey === "eda" ? "Яндекс Еда" : "Яндекс Карты";

      meta.appendChild(nameEl);
      meta.appendChild(srcEl);

      head.appendChild(avatar);
      head.appendChild(meta);

      const ratingRow = document.createElement("div");
      ratingRow.className = "review-card__rating-row";
      const stars = document.createElement("span");
      stars.className = "review-card__stars";
      stars.setAttribute("aria-label", `Оценка ${rev.rating} из 5`);
      stars.textContent = renderStars(rev.rating);
      const dateEl = document.createElement("time");
      dateEl.className = "review-card__date";
      dateEl.textContent = rev.date || "";
      ratingRow.appendChild(stars);
      ratingRow.appendChild(dateEl);

      const textEl = document.createElement("p");
      textEl.className = "review-card__text";
      textEl.textContent = rev.text || "";

      const needsToggle = Boolean(rev.long) || String(rev.text || "").length > 260;

      article.appendChild(head);
      article.appendChild(ratingRow);
      article.appendChild(textEl);

      if (needsToggle) {
        article.classList.add("review-card--collapsible");
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "review-card__toggle";
        toggle.textContent = "Читать полностью";
        toggle.addEventListener("click", () => {
          const open = article.classList.toggle("is-expanded");
          toggle.textContent = open ? "Свернуть" : "Читать полностью";
        });
        article.appendChild(toggle);
      }

      cardsMount.appendChild(article);
    });
  }

  if (!widgetMount || !widgetBlock) return;

  widgetMount.innerHTML = "";
  const rawSrc =
    typeof window.RESTOBAR_YANDEX_REVIEWS_WIDGET_SRC === "string"
      ? window.RESTOBAR_YANDEX_REVIEWS_WIDGET_SRC.trim()
      : "";
  const allowedHosts = ["yandex.ru", "yandex.com", "maps.yandex.ru"];
  let widgetSrc = "";
  try {
    const u = new URL(rawSrc, window.location.href);
    if (allowedHosts.includes(u.hostname)) widgetSrc = u.toString();
  } catch (_) {
    widgetSrc = "";
  }

  if (widgetSrc) {
    const iframe = document.createElement("iframe");
    iframe.className = "reviews__iframe";
    iframe.title = "Отзывы организации на Яндекс Картах";
    iframe.loading = "lazy";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.src = widgetSrc;
    widgetMount.appendChild(iframe);

    const caption = document.createElement("p");
    caption.className = "reviews__caption";
    const aMaps = document.createElement("a");
    aMaps.href = RESTOBAR_YANDEX_MAPS_SEARCH_URL;
    aMaps.target = "_blank";
    aMaps.rel = "noopener noreferrer";
    aMaps.textContent = "Яндекс Карты";
    const aEda = document.createElement("a");
    aEda.href = RESTOBAR_YANDEX_EDA_URL;
    aEda.target = "_blank";
    aEda.rel = "noopener noreferrer";
    aEda.textContent = "Яндекс Еда";
    caption.append("Данные в виджете предоставляет Яндекс. Также: ");
    caption.appendChild(aMaps);
    caption.append(" · ");
    caption.appendChild(aEda);
    caption.append(".");
    widgetMount.appendChild(caption);
    widgetBlock.hidden = false;
  } else {
    widgetBlock.hidden = true;
  }
}

function getCartItems() {
  return Object.values(appState.cart);
}

function getCartCount() {
  return getCartItems().reduce((sum, item) => sum + item.qty, 0);
}

function getCartTotal() {
  return getCartItems().reduce((sum, item) => sum + item.qty * item.price, 0);
}

function renderCart() {
  const items = getCartItems();
  cartItemsEl.innerHTML = "";
  if (items.length === 0) {
    cartItemsEl.innerHTML = `
      <div class="cart-empty">
        <p class="cart-empty__title">Корзина пока пустая</p>
        <p class="cart-empty__text">Добавьте блюда из меню, чтобы оформить заказ.</p>
      </div>
    `;
  } else {
    items.forEach((item) => {
      const node = document.createElement("div");
      node.className = "cart-item";
      const tags = Array.isArray(item.tags) ? item.tags.slice(0, 2) : [];
      const cartMeta = item.weight && item.weight !== "—" ? `<span class="cart-item__meta">${item.weight}</span>` : "";
      node.innerHTML = `
        <img class="cart-item__image" src="${item.image}" alt="${item.name}" loading="lazy">
        <div class="cart-item__body">
          <strong class="cart-item__title">${item.name}</strong>
          ${cartMeta}
          <div class="cart-item__tags">${tags.map((tag) => `<span class="cart-item__tag">${tag}</span>`).join("")}</div>
          <div class="cart-item__footer">
            <div class="cart-item__price">
              <span>${formatPrice(item.price)}</span>
              <small>${formatPrice(item.price * item.qty)}</small>
            </div>
            <div class="qty-controls">
              <button type="button" data-qty-minus="${item.id}" aria-label="Уменьшить количество">−</button>
              <span>${item.qty}</span>
              <button type="button" data-qty-plus="${item.id}" aria-label="Увеличить количество">+</button>
            </div>
          </div>
        </div>
      `;
      cartItemsEl.appendChild(node);
    });
  }

  const total = getCartTotal();
  const count = getCartCount();
  cartTotalEl.textContent = formatPrice(total);
  quickbarTotalEl.textContent = formatPrice(total);
  headerCartCountEl.textContent = count;
  mobileCartCountEl.textContent = count;
  renderMenuSections();
}

function addToCart(id, qty = 1) {
  const menuItem = menuCatalogItems.find((item) => item.id === Number(id));
  if (!menuItem || menuItem.isStopList) return;
  if (!appState.cart[id]) {
    appState.cart[id] = { ...menuItem, qty: 0 };
  }
  appState.cart[id].qty += Math.max(1, Number(qty) || 1);
  renderCart();
}

function animateAddToCart(sourceButton) {
  if (!sourceButton || !cartTriggerEl) return;
  const startRect = sourceButton.getBoundingClientRect();
  const targetRect = cartTriggerEl.getBoundingClientRect();
  const dot = document.createElement("span");
  dot.className = "cart-fly-item";
  document.body.appendChild(dot);

  const startX = startRect.left + startRect.width / 2 - 13;
  const startY = startRect.top + startRect.height / 2 - 13;
  const endX = targetRect.left + targetRect.width / 2 - 13;
  const endY = targetRect.top + targetRect.height / 2 - 13;

  dot.style.left = `${startX}px`;
  dot.style.top = `${startY}px`;

  dot.animate(
    [
      { transform: "translate(0, 0) scale(1)", opacity: 0.95 },
      { transform: `translate(${(endX - startX) * 0.6}px, ${(endY - startY) * 0.4}px) scale(0.8)`, opacity: 1 },
      { transform: `translate(${endX - startX}px, ${endY - startY}px) scale(0.35)`, opacity: 0.35 }
    ],
    { duration: 480, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" }
  ).onfinish = () => dot.remove();
}

function changeQty(id, delta) {
  const entry = appState.cart[id];
  if (!entry) return;
  entry.qty += delta;
  if (entry.qty <= 0) {
    delete appState.cart[id];
  }
  renderCart();
}

function openCart() {
  cartEl.classList.add("is-open");
}

function closeCart() {
  cartEl.classList.remove("is-open");
}

function formatPhoneInput(value) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  const normalized = digits.startsWith("8") ? `7${digits.slice(1)}` : digits;
  let result = "+7";
  if (normalized.length > 1) result += ` (${normalized.slice(1, 4)}`;
  if (normalized.length >= 4) result += ")";
  if (normalized.length > 4) result += ` ${normalized.slice(4, 7)}`;
  if (normalized.length > 7) result += `-${normalized.slice(7, 9)}`;
  if (normalized.length > 9) result += `-${normalized.slice(9, 11)}`;
  return result;
}

function hydrateCheckoutContacts() {
  if (!checkoutFormEl) return;
  try {
    if (localStorage.getItem("restobar_remember_contacts") !== "1") return;
    const raw = localStorage.getItem("restobar_saved_contacts");
    if (!raw) return;
    const data = JSON.parse(raw);
    const nameInput = checkoutFormEl.querySelector('[name="name"]');
    const phoneField = checkoutFormEl.querySelector('[name="phone"]');
    const addressInput = checkoutFormEl.querySelector('[name="address"]');
    const rememberCb = document.getElementById("remember-contacts");
    if (nameInput && typeof data.name === "string") nameInput.value = data.name;
    if (phoneField && typeof data.phone === "string") phoneField.value = formatPhoneInput(data.phone);
    if (addressInput && typeof data.address === "string") addressInput.value = data.address;
    if (rememberCb) rememberCb.checked = true;
  } catch (_) {}
}

function initEvents() {
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-add], [data-details], [data-qty-plus], [data-qty-minus], [data-card-plus], [data-card-minus], [data-details-qty-plus], [data-details-qty-minus], [data-details-add]");
    if (!target) return;
    const addId = target.getAttribute("data-add");
    const detailsId = target.getAttribute("data-details");
    const plusId = target.getAttribute("data-qty-plus");
    const minusId = target.getAttribute("data-qty-minus");
    const cardPlusId = target.getAttribute("data-card-plus");
    const cardMinusId = target.getAttribute("data-card-minus");
    const detailsQtyPlus = target.hasAttribute("data-details-qty-plus");
    const detailsQtyMinus = target.hasAttribute("data-details-qty-minus");
    const detailsAdd = target.getAttribute("data-details-add");

    if (addId) {
      addToCart(addId);
      markDishAdded(addId);
      animateAddToCart(target);
    }
    if (detailsId) openDishDetails(detailsId);
    if (plusId) changeQty(plusId, 1);
    if (minusId) changeQty(minusId, -1);
    if (cardPlusId) addToCart(cardPlusId);
    if (cardMinusId) changeQty(cardMinusId, -1);
    if (detailsQtyPlus) {
      detailsQty += 1;
      const qtyEl = document.getElementById("dish-details-qty");
      if (qtyEl) qtyEl.textContent = detailsQty;
    }
    if (detailsQtyMinus) {
      detailsQty = Math.max(1, detailsQty - 1);
      const qtyEl = document.getElementById("dish-details-qty");
      if (qtyEl) qtyEl.textContent = detailsQty;
    }
    if (detailsAdd) {
      addToCart(detailsAdd, detailsQty);
      animateAddToCart(cartTriggerEl);
      closeDishDetails();
      openCart();
    }
  });

  document.querySelectorAll(".cart-trigger").forEach((btn) => {
    btn.addEventListener("click", openCart);
  });
  document.getElementById("close-cart").addEventListener("click", closeCart);
  document.getElementById("cart-overlay").addEventListener("click", closeCart);
  if (detailsModalEl) {
    document.getElementById("dish-modal-close").addEventListener("click", closeDishDetails);
    document.getElementById("dish-modal-overlay").addEventListener("click", closeDishDetails);
  }
  document.getElementById("burger-btn").addEventListener("click", () => {
    filtersEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  searchEl.addEventListener("input", (event) => {
    appState.search = event.target.value.trim();
    renderMenuSections();
  });

  phoneInputEl.addEventListener("input", (event) => {
    event.target.value = formatPhoneInput(event.target.value);
  });

  checkoutFormEl.addEventListener("submit", (event) => {
    event.preventDefault();
    const items = getCartItems();
    if (items.length === 0) {
      alert("Корзина пуста. Добавьте блюда перед оформлением.");
      return;
    }

    const formData = new FormData(checkoutFormEl);
    const phoneDigits = (formData.get("phone") || "").toString().replace(/\D/g, "");
    if (phoneDigits.length < 11) {
      alert("Укажите корректный номер телефона.");
      return;
    }

    const submitBtn = checkoutFormEl.querySelector("button[type='submit']");
    if (submitBtn) submitBtn.disabled = true;

    const payload = {
      customer: {
        name: String(formData.get("name") || "").trim(),
        phone: String(formData.get("phone") || "").trim(),
        address: String(formData.get("address") || "").trim()
      },
      deliveryTime: String(formData.get("deliveryTime") || "").trim(),
      comment: String(formData.get("comment") || "").trim(),
      promoCode: String(formData.get("promoCode") || "")
        .trim()
        .slice(0, 64),
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        qty: item.qty,
        price: item.price
      }))
    };

    fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const firstError = Array.isArray(data.errors) && data.errors.length ? data.errors[0] : data.message;
          const hint = data.detail ? `${firstError || ""} (${data.detail})`.trim() : firstError;
          throw new Error(hint || "Не удалось отправить заказ.");
        }
        const remember =
          formData.get("rememberContacts") === "1" || formData.get("rememberContacts") === "on";
        if (remember) {
          try {
            localStorage.setItem("restobar_remember_contacts", "1");
            localStorage.setItem(
              "restobar_saved_contacts",
              JSON.stringify({
                name: String(formData.get("name") || "").trim(),
                phone: String(formData.get("phone") || "").trim(),
                address: String(formData.get("address") || "").trim()
              })
            );
          } catch (_) {}
        } else {
          try {
            localStorage.removeItem("restobar_remember_contacts");
            localStorage.removeItem("restobar_saved_contacts");
          } catch (_) {}
        }

        alert(data.message || "Заказ оформлен!");
        checkoutFormEl.reset();
        hydrateCheckoutContacts();
        const promoHintEl = document.getElementById("promo-hint");
        if (promoHintEl) promoHintEl.hidden = true;
        appState.cart = {};
        renderCart();
        closeCart();
      })
      .catch((error) => {
        alert(error.message || "Ошибка при отправке заказа. Попробуйте еще раз.");
      })
      .finally(() => {
        if (submitBtn) submitBtn.disabled = false;
      });
  });

  const scrollTopBtnEl = document.getElementById("scroll-top-btn");

  window.addEventListener(
    "scroll",
    () => {
      const y = window.scrollY;
      const narrow = window.innerWidth < 768;

      mobileCartBtnEl.classList.toggle("is-visible", narrow && y > 300);

      if (scrollTopBtnEl) {
        scrollTopBtnEl.classList.toggle("is-visible", y > 360);
      }

      if (y < 140) {
        setActiveCategory(getFirstMenuCategory());
      }
    },
    { passive: true }
  );

  if (scrollTopBtnEl) {
    scrollTopBtnEl.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  const promoBtn = document.getElementById("promo-apply");
  const promoHint = document.getElementById("promo-hint");
  if (promoBtn && promoHint) {
    promoBtn.addEventListener("click", () => {
      promoHint.hidden = false;
    });
  }
}

async function init() {
  try {
    await loadMenuData();
  } catch (error) {
    console.error(error);
    alert("Не удалось загрузить меню. Обновите страницу чуть позже.");
    return;
  }
  appState.activeCategory = getFirstMenuCategory() || categories[0] || "";
  renderFilters();
  renderMenuSections();
  setupReviewsSection();
  renderCart();
  hydrateCheckoutContacts();
  initEvents();
}

init();
