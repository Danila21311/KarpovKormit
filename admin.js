const tokenInput = document.getElementById("admin-token-input");
const statusEl = document.getElementById("admin-status");
const sectionsListEl = document.getElementById("sections-list");
const itemsListEl = document.getElementById("items-list");
const sectionSelectEl = document.getElementById("new-item-section");
const deliveryHtmlEl = document.getElementById("delivery-html");
const searchInputEl = document.getElementById("items-search");
const sectionFilterEl = document.getElementById("items-section-filter");
const pageSizeEl = document.getElementById("items-page-size");
const prevPageBtnEl = document.getElementById("items-prev-page");
const nextPageBtnEl = document.getElementById("items-next-page");
const pageInfoEl = document.getElementById("items-page-info");
const totalInfoEl = document.getElementById("items-total-info");

const STORAGE_KEY = "restobar_admin_token";
let adminToken = localStorage.getItem(STORAGE_KEY) || "";
let sections = [];
let items = [];
let currentPage = 1;
let dragSectionId = null;
let dragItemId = null;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b2452f" : "var(--muted)";
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "x-admin-token": adminToken
  };
}

async function api(path, options = {}) {
  if (!adminToken) throw new Error("Сначала укажите ADMIN_TOKEN.");
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...authHeaders()
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) {
    throw new Error(data?.message || "Ошибка запроса.");
  }
  return data;
}

function parseTags(value) {
  return String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function sortSections() {
  sections.sort((a, b) => (a.sortOrder - b.sortOrder) || (a.id - b.id));
}

function sortItems() {
  items.sort((a, b) => (a.sortOrder - b.sortOrder) || (a.id - b.id));
}

function getFilteredItems() {
  const query = String(searchInputEl.value || "").trim().toLowerCase();
  const sectionFilter = String(sectionFilterEl.value || "").trim();
  return items.filter((item) => {
    if (sectionFilter && String(item.sectionId) !== sectionFilter) return false;
    if (!query) return true;
    const haystack = [
      item.name,
      item.description,
      item.tastyDescription,
      Array.isArray(item.tags) ? item.tags.join(" ") : "",
      item.category
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  });
}

function paginateItems(list) {
  const pageSize = Math.max(1, Number(pageSizeEl.value || 20));
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * pageSize;
  return {
    pageSize,
    totalPages,
    pageItems: list.slice(start, start + pageSize)
  };
}

function renderSectionOptions() {
  const sectionOptionsHtml = sections
    .map((s) => `<option value="${s.id}">${s.name}</option>`)
    .join("");
  sectionSelectEl.innerHTML = sectionOptionsHtml;
  sectionFilterEl.innerHTML = `<option value="">Все секции</option>${sectionOptionsHtml}`;
}

function renderSections() {
  sectionsListEl.innerHTML = "";
  sections.forEach((section) => {
    const row = document.createElement("div");
    row.draggable = true;
    row.dataset.sectionRow = String(section.id);
    row.style.cssText = "display:grid;grid-template-columns:minmax(180px,1fr) 90px auto auto;gap:8px;align-items:center;padding:6px 8px;border:1px dashed #eadfce;border-radius:10px;background:#fff;";
    row.innerHTML = `
      <input type="text" value="${section.name}" data-s-name="${section.id}">
      <input type="number" value="${section.sortOrder}" data-s-order="${section.id}">
      <label><input type="checkbox" data-s-visible="${section.id}" ${section.isVisible ? "checked" : ""}> показывать</label>
      <div style="display:flex;gap:6px;">
        <button class="btn btn--secondary" type="button" data-s-save="${section.id}">Сохранить</button>
        <button class="btn btn--secondary" type="button" data-s-del="${section.id}">Удалить</button>
      </div>
    `;
    sectionsListEl.appendChild(row);
  });
}

function itemCard(item) {
  const sectionOptions = sections
    .map((section) => `<option value="${section.id}" ${item.sectionId === section.id ? "selected" : ""}>${section.name}</option>`)
    .join("");
  const tags = Array.isArray(item.tags) ? item.tags.join(", ") : "";
  return `
    <div draggable="true" data-item-row="${item.id}" style="border:1px solid var(--line);border-radius:10px;padding:10px;background:#fff;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;">
        <strong>#${item.id} · ${item.category || "Без секции"}</strong>
        <span style="color:var(--muted);font-size:12px;">drag & drop</span>
      </div>
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px;">
        <input type="text" value="${item.name}" data-i-name="${item.id}">
        <input type="number" value="${item.price}" min="0" data-i-price="${item.id}">
        <select data-i-section="${item.id}">${sectionOptions}</select>
        <input type="text" value="${item.weight || "—"}" data-i-weight="${item.id}">
        <input type="url" value="${item.image || ""}" data-i-image="${item.id}">
        <input type="text" value="${tags}" data-i-tags="${item.id}" placeholder="теги через запятую">
      </div>
      <textarea rows="2" data-i-desc="${item.id}" style="margin-top:8px;width:100%;">${item.description || ""}</textarea>
      <textarea rows="2" data-i-tasty="${item.id}" style="margin-top:8px;width:100%;">${item.tastyDescription || ""}</textarea>
      <div style="display:flex;gap:10px;align-items:center;margin-top:8px;">
        <label><input type="checkbox" data-i-hidden="${item.id}" ${item.isHidden ? "checked" : ""}> скрыть</label>
        <label><input type="checkbox" data-i-stop="${item.id}" ${item.isStopList ? "checked" : ""}> стоп-лист</label>
        <input type="number" value="${item.sortOrder}" data-i-order="${item.id}" style="width:90px;">
        <button class="btn btn--secondary" type="button" data-i-save="${item.id}">Сохранить</button>
        <button class="btn btn--secondary" type="button" data-i-del="${item.id}">Удалить</button>
      </div>
    </div>
  `;
}

function renderItems() {
  const filtered = getFilteredItems();
  const { totalPages, pageItems } = paginateItems(filtered);
  itemsListEl.innerHTML = pageItems.map(itemCard).join("");
  pageInfoEl.textContent = `${currentPage} / ${totalPages}`;
  totalInfoEl.textContent = `${filtered.length} блюд`;
  prevPageBtnEl.disabled = currentPage <= 1;
  nextPageBtnEl.disabled = currentPage >= totalPages;
}

function moveInArray(list, fromIndex, toIndex) {
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return list;
  const copy = [...list];
  const [moved] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, moved);
  return copy;
}

async function saveSectionsOrder() {
  const updates = sections.map((section, index) => {
    section.sortOrder = index;
    return api(`/api/admin/sections/${section.id}`, {
      method: "PATCH",
      body: JSON.stringify({ sortOrder: section.sortOrder })
    });
  });
  await Promise.all(updates);
}

async function saveItemsOrder() {
  const updates = items.map((item, index) => {
    item.sortOrder = index;
    return api(`/api/admin/items/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ sortOrder: item.sortOrder })
    });
  });
  await Promise.all(updates);
}

async function reloadAll() {
  const menu = await api("/api/admin/menu");
  sections = Array.isArray(menu.sections) ? menu.sections : [];
  items = Array.isArray(menu.items) ? menu.items : [];
  sortSections();
  sortItems();
  renderSectionOptions();
  renderSections();
  renderItems();
  const delivery = await api("/api/admin/delivery-content");
  deliveryHtmlEl.value = delivery.contentHtml || "";
}

document.getElementById("admin-token-save").addEventListener("click", async () => {
  adminToken = tokenInput.value.trim();
  localStorage.setItem(STORAGE_KEY, adminToken);
  try {
    currentPage = 1;
    await reloadAll();
    setStatus("Токен принят, данные загружены.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.getElementById("admin-token-clear").addEventListener("click", () => {
  adminToken = "";
  tokenInput.value = "";
  localStorage.removeItem(STORAGE_KEY);
  setStatus("Токен очищен.");
});

document.getElementById("admin-reload").addEventListener("click", async () => {
  try {
    await reloadAll();
    setStatus("Данные обновлены.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.getElementById("add-section").addEventListener("click", async () => {
  const name = document.getElementById("new-section-name").value.trim();
  if (!name) return;
  try {
    await api("/api/admin/sections", { method: "POST", body: JSON.stringify({ name }) });
    document.getElementById("new-section-name").value = "";
    await reloadAll();
    setStatus("Секция добавлена.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.getElementById("add-item").addEventListener("click", async () => {
  const payload = {
    name: document.getElementById("new-item-name").value.trim(),
    sectionId: Number(sectionSelectEl.value),
    price: Number(document.getElementById("new-item-price").value || 0),
    weight: document.getElementById("new-item-weight").value.trim() || "—",
    image: document.getElementById("new-item-image").value.trim(),
    tags: parseTags(document.getElementById("new-item-tags").value),
    description: document.getElementById("new-item-description").value.trim(),
    tastyDescription: document.getElementById("new-item-tasty").value.trim(),
    isHidden: document.getElementById("new-item-hidden").checked,
    isStopList: document.getElementById("new-item-stop").checked
  };
  if (!payload.name || !payload.sectionId) {
    setStatus("Укажите название и секцию для блюда.", true);
    return;
  }
  try {
    await api("/api/admin/items", { method: "POST", body: JSON.stringify(payload) });
    ["new-item-name", "new-item-price", "new-item-weight", "new-item-image", "new-item-tags", "new-item-description", "new-item-tasty"]
      .forEach((id) => { document.getElementById(id).value = ""; });
    document.getElementById("new-item-hidden").checked = false;
    document.getElementById("new-item-stop").checked = false;
    await reloadAll();
    setStatus("Блюдо добавлено.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

sectionsListEl.addEventListener("click", async (event) => {
  const saveId = event.target.getAttribute("data-s-save");
  const deleteId = event.target.getAttribute("data-s-del");
  try {
    if (saveId) {
      await api(`/api/admin/sections/${saveId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: document.querySelector(`[data-s-name="${saveId}"]`).value.trim(),
          sortOrder: Number(document.querySelector(`[data-s-order="${saveId}"]`).value || 0),
          isVisible: document.querySelector(`[data-s-visible="${saveId}"]`).checked
        })
      });
      await reloadAll();
      setStatus("Секция обновлена.");
    }
    if (deleteId) {
      if (!window.confirm("Удалить секцию?")) return;
      await api(`/api/admin/sections/${deleteId}`, { method: "DELETE" });
      await reloadAll();
      setStatus("Секция удалена.");
    }
  } catch (error) {
    setStatus(error.message, true);
  }
});

sectionsListEl.addEventListener("dragstart", (event) => {
  const row = event.target.closest("[data-section-row]");
  if (!row) return;
  dragSectionId = Number(row.dataset.sectionRow);
  row.style.opacity = "0.6";
});

sectionsListEl.addEventListener("dragend", (event) => {
  const row = event.target.closest("[data-section-row]");
  if (row) row.style.opacity = "1";
});

sectionsListEl.addEventListener("dragover", (event) => {
  event.preventDefault();
});

sectionsListEl.addEventListener("drop", async (event) => {
  event.preventDefault();
  const targetRow = event.target.closest("[data-section-row]");
  if (!targetRow || !dragSectionId) return;
  const targetId = Number(targetRow.dataset.sectionRow);
  if (!targetId || targetId === dragSectionId) return;
  const from = sections.findIndex((section) => section.id === dragSectionId);
  const to = sections.findIndex((section) => section.id === targetId);
  sections = moveInArray(sections, from, to);
  renderSections();
  try {
    await saveSectionsOrder();
    setStatus("Порядок секций обновлен.");
  } catch (error) {
    setStatus(error.message, true);
    await reloadAll();
  } finally {
    dragSectionId = null;
  }
});

itemsListEl.addEventListener("click", async (event) => {
  const saveId = event.target.getAttribute("data-i-save");
  const deleteId = event.target.getAttribute("data-i-del");
  try {
    if (saveId) {
      await api(`/api/admin/items/${saveId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: document.querySelector(`[data-i-name="${saveId}"]`).value.trim(),
          price: Number(document.querySelector(`[data-i-price="${saveId}"]`).value || 0),
          sectionId: Number(document.querySelector(`[data-i-section="${saveId}"]`).value),
          weight: document.querySelector(`[data-i-weight="${saveId}"]`).value.trim(),
          image: document.querySelector(`[data-i-image="${saveId}"]`).value.trim(),
          tags: parseTags(document.querySelector(`[data-i-tags="${saveId}"]`).value),
          description: document.querySelector(`[data-i-desc="${saveId}"]`).value.trim(),
          tastyDescription: document.querySelector(`[data-i-tasty="${saveId}"]`).value.trim(),
          isHidden: document.querySelector(`[data-i-hidden="${saveId}"]`).checked,
          isStopList: document.querySelector(`[data-i-stop="${saveId}"]`).checked,
          sortOrder: Number(document.querySelector(`[data-i-order="${saveId}"]`).value || 0)
        })
      });
      await reloadAll();
      setStatus("Блюдо обновлено.");
    }
    if (deleteId) {
      if (!window.confirm("Удалить блюдо?")) return;
      await api(`/api/admin/items/${deleteId}`, { method: "DELETE" });
      await reloadAll();
      setStatus("Блюдо удалено.");
    }
  } catch (error) {
    setStatus(error.message, true);
  }
});

itemsListEl.addEventListener("dragstart", (event) => {
  const row = event.target.closest("[data-item-row]");
  if (!row) return;
  dragItemId = Number(row.dataset.itemRow);
  row.style.opacity = "0.6";
});

itemsListEl.addEventListener("dragend", (event) => {
  const row = event.target.closest("[data-item-row]");
  if (row) row.style.opacity = "1";
});

itemsListEl.addEventListener("dragover", (event) => {
  event.preventDefault();
});

itemsListEl.addEventListener("drop", async (event) => {
  event.preventDefault();
  const targetRow = event.target.closest("[data-item-row]");
  if (!targetRow || !dragItemId) return;
  const targetId = Number(targetRow.dataset.itemRow);
  if (!targetId || targetId === dragItemId) return;
  const from = items.findIndex((item) => item.id === dragItemId);
  const to = items.findIndex((item) => item.id === targetId);
  items = moveInArray(items, from, to);
  items.forEach((item, index) => {
    item.sortOrder = index;
  });
  renderItems();
  try {
    await saveItemsOrder();
    setStatus("Порядок блюд обновлен.");
  } catch (error) {
    setStatus(error.message, true);
    await reloadAll();
  } finally {
    dragItemId = null;
  }
});

searchInputEl.addEventListener("input", () => {
  currentPage = 1;
  renderItems();
});

sectionFilterEl.addEventListener("change", () => {
  currentPage = 1;
  renderItems();
});

pageSizeEl.addEventListener("change", () => {
  currentPage = 1;
  renderItems();
});

prevPageBtnEl.addEventListener("click", () => {
  currentPage = Math.max(1, currentPage - 1);
  renderItems();
});

nextPageBtnEl.addEventListener("click", () => {
  currentPage += 1;
  renderItems();
});

document.getElementById("save-delivery").addEventListener("click", async () => {
  try {
    await api("/api/admin/delivery-content", {
      method: "PUT",
      body: JSON.stringify({ contentHtml: deliveryHtmlEl.value })
    });
    setStatus("Страница доставки обновлена.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

if (adminToken) {
  tokenInput.value = adminToken;
  reloadAll()
    .then(() => setStatus("Токен из браузера применён, данные загружены."))
    .catch((error) => setStatus(error.message, true));
}
