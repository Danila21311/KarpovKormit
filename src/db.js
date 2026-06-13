const fs = require("fs/promises");
const path = require("path");
const { Pool } = require("pg");
const { loadMenuItems } = require("./menu-loader");
const { getMenuModifiersForItem } = require("../menu-modifiers-presets");

/**
 * Supabase pooler (PgBouncer) + node-pg: prefer disabling prepared statements
 * and pgbouncer=true on the URL to avoid "Connection terminated unexpectedly".
 * @see https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler
 */
function normalizeSupabaseConnectionString(url) {
  if (!url) return url;
  const isPooler =
    url.includes("pooler.supabase.com") ||
    url.includes("pooler.supabase.co");
  if (!isPooler || url.includes("pgbouncer=true")) return url;
  return url.includes("?") ? `${url}&pgbouncer=true` : `${url}?pgbouncer=true`;
}

function warnIfTransactionPooler(raw) {
  if (!raw || typeof raw !== "string") return;
  // Transaction mode (6543) + multi-statement BEGIN/COMMIT часто ломаются на PgBouncer.
  if (/:6543\b/.test(raw)) {
    console.warn(
      "[db] DATABASE_URL uses port 6543 (transaction pooler). Prefer Session pooler on port 5432 from Supabase Connect."
    );
  }
}

function poolOptions() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return {};
  warnIfTransactionPooler(raw);
  const connectionString = normalizeSupabaseConnectionString(raw);
  const isSupabase =
    raw.includes("supabase.co") || raw.includes("supabase.com");
  /** Публичные прокси Postgres (Railway и др.) требуют TLS; без ssl node-pg часто падает на подключении. */
  const needsHostedSsl =
    isSupabase ||
    /\.railway\.app\b/i.test(raw) ||
    /\.rlwy\.net\b/i.test(raw);
  return {
    connectionString,
    ssl: needsHostedSsl ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 20000,
    keepAlive: true,
    ...(isSupabase ? { prepareThreshold: 0 } : {})
  };
}


const pool = new Pool(poolOptions());

/** Prevent process crash when Supabase/pooler drops an idle connection (Node would exit otherwise). */
pool.on("error", (err) => {
  console.error("[pg pool]", err.message);
});

/**
 * Checked-out clients emit their own "error" when Supabase closes the socket.
 * Without a listener, Node crashes with unhandled "error" on Client.
 */
function attachClientErrorHandler(client) {
  if (client.__restobarPgErrorHook) return;
  client.__restobarPgErrorHook = true;
  client.on("error", (err) => {
    console.error("[pg client]", err.message);
  });
}

/**
 * Ensure every acquired client has an error listener.
 * pool.query() uses callback-style connect(); createOrderWithItems uses promises.
 */
const rawConnect = pool.connect.bind(pool);
pool.connect = function patchedConnect(...args) {
  if (args.length >= 1 && typeof args[0] === "function") {
    const cb = args[0];
    return rawConnect((err, client, release) => {
      if (client) attachClientErrorHandler(client);
      cb(err, client, release);
    });
  }
  const result = rawConnect(...args);
  if (result && typeof result.then === "function") {
    return result.then((client) => {
      attachClientErrorHandler(client);
      return client;
    });
  }
  return result;
};

let initialized = false;

const DEFAULT_DELIVERY_CONTENT_HTML = `
  <h1 class="legal-title">Условия доставки и контакты</h1>
  <p class="legal-lead">Краткая справка по доставке и контактам.</p>

  <section class="legal-section">
    <h2>Зона и стоимость</h2>
    <ul>
      <li><strong>Зона доставки:</strong> город Оренбург + 15 км.</li>
      <li><strong>Стоимость доставки:</strong> 350 ₽. При заказе от 2500 ₽ — доставка бесплатная.</li>
      <li><strong>Время в пути:</strong> ориентировочно 45–70 минут (зависит от загрузки кухни и дорог).</li>
    </ul>
  </section>

  <section class="legal-section">
    <h2>График работы доставки</h2>
    <p>Вт–Пт с 11:00 до 22:00, Сб–Вс с 12:00 до 22:00. Понедельник — выходной день.</p>
  </section>

  <section class="legal-section">
    <h2>Фуршетные закуски</h2>
    <p><strong>Меню фуршетных закусок</strong> — заказ необходимо сделать <strong>за 2 дня</strong>.</p>
  </section>

  <section class="legal-section">
    <h2>Контакты</h2>
    <ul>
      <li><strong>Адрес:</strong> г. Оренбург, ул. Донецкая, 2/3</li>
      <li><strong>Телефон:</strong> <a href="tel:89619296688">89619296688</a></li>
      <li><strong>Электронная почта:</strong> <a href="mailto:Yurakarpov69@mail.ru">Yurakarpov69@mail.ru</a></li>
    </ul>
  </section>
`;

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.map((tag) => String(tag || "").trim()).filter(Boolean);
}

function normalizePrice(value) {
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) return 0;
  return Math.round(price);
}

async function initDb() {
  if (initialized) return;
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }
  const schemaPath = path.join(__dirname, "..", "db", "schema.sql");
  const schemaSql = await fs.readFile(schemaPath, "utf8");
  await pool.query(schemaSql);
  await pool.query(
    `ALTER TABLE menu_items
     ADD COLUMN IF NOT EXISTS modifiers JSONB NOT NULL DEFAULT '[]'::jsonb`
  );
  await pool.query(`ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS iiko_product_id TEXT`);
  await ensureCatalogSeed();
  await ensureDeliverySeed();
  await ensureModifiersSeed();
  initialized = true;
}

function normalizeModifierGroups(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((group) => ({
      id: String(group?.id || "").trim(),
      title: String(group?.title || "").trim(),
      min: Math.max(0, Number(group?.min) || 0),
      max: Math.max(0, Number(group?.max) || 0),
      options: Array.isArray(group?.options)
        ? group.options
            .map((option) => ({
              id: String(option?.id || "").trim(),
              name: String(option?.name || "").trim(),
              price: Math.max(0, Math.round(Number(option?.price) || 0))
            }))
            .filter((option) => option.id && option.name)
        : []
    }))
    .filter((group) => group.id && group.title && group.options.length);
}

function resolveItemModifiers(dbModifiers, itemName) {
  const stored = normalizeModifierGroups(dbModifiers);
  if (stored.length) return stored;
  return normalizeModifierGroups(getMenuModifiersForItem(itemName));
}

async function ensureModifiersSeed() {
  const rows = await pool.query(`SELECT id, name, modifiers FROM menu_items`);
  for (const row of rows.rows) {
    const raw = row.modifiers;
    const isEmpty =
      raw == null ||
      (Array.isArray(raw) && raw.length === 0) ||
      (typeof raw === "string" && (raw === "[]" || !raw.trim()));
    if (!isEmpty) continue;
    const preset = getMenuModifiersForItem(row.name);
    if (!preset.length) continue;
    await pool.query(`UPDATE menu_items SET modifiers = $2::jsonb, updated_at = NOW() WHERE id = $1`, [
      row.id,
      JSON.stringify(preset)
    ]);
  }
}

async function ensureCatalogSeed() {
  const sectionsCountResult = await pool.query("SELECT COUNT(*)::int AS count FROM menu_sections");
  const sectionsCount = Number(sectionsCountResult.rows[0]?.count || 0);
  const itemsCountResult = await pool.query("SELECT COUNT(*)::int AS count FROM menu_items");
  const itemsCount = Number(itemsCountResult.rows[0]?.count || 0);

  if (sectionsCount > 0 && itemsCount > 0) return;

  const sourceItems = await loadMenuItems(path.join(__dirname, "..", "menu-data.js"));
  const categoryNames = [...new Set(sourceItems.map((item) => String(item.category || "").trim()).filter(Boolean))];
  const categoryMap = new Map();

  if (sectionsCount === 0) {
    for (let index = 0; index < categoryNames.length; index += 1) {
      const categoryName = categoryNames[index];
      const row = await pool.query(
        `INSERT INTO menu_sections (name, sort_order, is_visible)
         VALUES ($1, $2, TRUE)
         ON CONFLICT (name)
         DO UPDATE SET sort_order = EXCLUDED.sort_order
         RETURNING id`,
        [categoryName, index]
      );
      categoryMap.set(categoryName, Number(row.rows[0].id));
    }
  } else {
    const sections = await pool.query("SELECT id, name FROM menu_sections");
    sections.rows.forEach((row) => categoryMap.set(row.name, Number(row.id)));
  }

  if (itemsCount === 0) {
    for (let index = 0; index < sourceItems.length; index += 1) {
      const item = sourceItems[index];
      const sectionId = categoryMap.get(String(item.category || "").trim()) || null;
      await pool.query(
        `INSERT INTO menu_items (
          id, section_id, name, weight, description, tasty_description, price, image, tags, sort_order
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
        ON CONFLICT (id) DO NOTHING`,
        [
          Number(item.id),
          sectionId,
          String(item.name || "").trim(),
          String(item.weight || "—"),
          String(item.description || "").trim(),
          String(item.tastyDescription || "").trim() || null,
          normalizePrice(item.price),
          String(item.image || "").trim(),
          JSON.stringify(normalizeTags(item.tags)),
          index
        ]
      );
    }
  }
}

async function ensureDeliverySeed() {
  const exists = await pool.query("SELECT COUNT(*)::int AS count FROM delivery_content");
  const count = Number(exists.rows[0]?.count || 0);
  if (count > 0) return;
  await pool.query(
    `INSERT INTO delivery_content (id, content_html)
     VALUES (1, $1)
     ON CONFLICT (id) DO NOTHING`,
    [DEFAULT_DELIVERY_CONTENT_HTML.trim()]
  );
}

async function getPublicMenuData() {
  await initDb();
  const sectionsResult = await pool.query(
    `SELECT id, name, sort_order
     FROM menu_sections
     WHERE is_visible = TRUE
     ORDER BY sort_order ASC, id ASC`
  );

  const itemsResult = await pool.query(
    `SELECT
        mi.id,
        mi.name,
        COALESCE(mi.weight, '—') AS weight,
        mi.description,
        COALESCE(mi.tasty_description, '') AS "tastyDescription",
        mi.price,
        COALESCE(mi.image, '') AS image,
        COALESCE(mi.tags, '[]'::jsonb) AS tags,
        COALESCE(mi.modifiers, '[]'::jsonb) AS modifiers,
        mi.is_stop_list AS "isStopList",
        ms.name AS category,
        mi.sort_order
      FROM menu_items mi
      JOIN menu_sections ms ON ms.id = mi.section_id
      WHERE ms.is_visible = TRUE AND mi.is_hidden = FALSE
      ORDER BY ms.sort_order ASC, mi.sort_order ASC, mi.id ASC`
  );

  return {
    sections: sectionsResult.rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      sortOrder: Number(row.sort_order)
    })),
    items: itemsResult.rows.map((row) => ({
      id: Number(row.id),
      category: row.category,
      name: row.name,
      weight: row.weight || "—",
      description: row.description || "",
      tastyDescription: row.tastyDescription || "",
      price: Number(row.price),
      image: row.image || "",
      tags: Array.isArray(row.tags) ? row.tags : [],
      modifierGroups: resolveItemModifiers(row.modifiers, row.name),
      isStopList: Boolean(row.isStopList)
    }))
  };
}

async function getAdminMenuData() {
  await initDb();
  const sectionsResult = await pool.query(
    `SELECT id, name, sort_order, is_visible
     FROM menu_sections
     ORDER BY sort_order ASC, id ASC`
  );
  const itemsResult = await pool.query(
    `SELECT
      mi.id,
      mi.section_id,
      ms.name AS category,
      mi.name,
      COALESCE(mi.weight, '—') AS weight,
      mi.description,
      COALESCE(mi.tasty_description, '') AS "tastyDescription",
      mi.price,
      COALESCE(mi.image, '') AS image,
      COALESCE(mi.tags, '[]'::jsonb) AS tags,
      COALESCE(mi.iiko_product_id, '') AS "iikoProductId",
      mi.is_hidden AS "isHidden",
      mi.is_stop_list AS "isStopList",
      mi.sort_order AS "sortOrder"
    FROM menu_items mi
    LEFT JOIN menu_sections ms ON ms.id = mi.section_id
    ORDER BY mi.sort_order ASC, mi.id ASC`
  );
  return {
    sections: sectionsResult.rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      sortOrder: Number(row.sort_order),
      isVisible: Boolean(row.is_visible)
    })),
    items: itemsResult.rows.map((row) => ({
      id: Number(row.id),
      sectionId: row.section_id == null ? null : Number(row.section_id),
      category: row.category || "",
      name: row.name || "",
      weight: row.weight || "—",
      description: row.description || "",
      tastyDescription: row.tastyDescription || "",
      price: Number(row.price || 0),
      image: row.image || "",
      tags: Array.isArray(row.tags) ? row.tags : [],
      iikoProductId: row.iikoProductId || "",
      isHidden: Boolean(row.isHidden),
      isStopList: Boolean(row.isStopList),
      sortOrder: Number(row.sortOrder || 0)
    }))
  };
}

async function createSection(input) {
  await initDb();
  const name = String(input?.name || "").trim();
  if (!name) throw new Error("Section name is required.");
  const sortOrder = Number.isFinite(Number(input?.sortOrder))
    ? Math.round(Number(input.sortOrder))
    : 999;
  const isVisible = input?.isVisible !== false;
  const row = await pool.query(
    `INSERT INTO menu_sections (name, sort_order, is_visible)
     VALUES ($1, $2, $3)
     RETURNING id, name, sort_order, is_visible`,
    [name, sortOrder, isVisible]
  );
  return row.rows[0];
}

async function updateSection(sectionId, input) {
  await initDb();
  const updates = [];
  const values = [];
  let idx = 1;

  if (Object.prototype.hasOwnProperty.call(input, "name")) {
    const name = String(input.name || "").trim();
    if (!name) throw new Error("Section name is required.");
    updates.push(`name = $${idx}`);
    values.push(name);
    idx += 1;
  }
  if (Object.prototype.hasOwnProperty.call(input, "sortOrder")) {
    updates.push(`sort_order = $${idx}`);
    values.push(Math.round(Number(input.sortOrder) || 0));
    idx += 1;
  }
  if (Object.prototype.hasOwnProperty.call(input, "isVisible")) {
    updates.push(`is_visible = $${idx}`);
    values.push(Boolean(input.isVisible));
    idx += 1;
  }
  updates.push(`updated_at = NOW()`);
  values.push(Number(sectionId));

  const row = await pool.query(
    `UPDATE menu_sections
     SET ${updates.join(", ")}
     WHERE id = $${idx}
     RETURNING id, name, sort_order, is_visible`,
    values
  );
  if (!row.rows[0]) throw new Error("Section not found.");
  return row.rows[0];
}

async function deleteSection(sectionId) {
  await initDb();
  const itemCount = await pool.query(
    "SELECT COUNT(*)::int AS count FROM menu_items WHERE section_id = $1",
    [Number(sectionId)]
  );
  const count = Number(itemCount.rows[0]?.count || 0);
  if (count > 0) {
    throw new Error("Нельзя удалить секцию, пока в ней есть блюда.");
  }
  const result = await pool.query("DELETE FROM menu_sections WHERE id = $1", [Number(sectionId)]);
  if (!result.rowCount) throw new Error("Section not found.");
}

async function createMenuItem(input) {
  await initDb();
  const sectionId = Number(input.sectionId);
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Dish name is required.");
  if (!Number.isFinite(sectionId) || sectionId <= 0) throw new Error("Section is required.");
  const maxResult = await pool.query("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM menu_items");
  const nextId = Number(maxResult.rows[0].next_id);
  const row = await pool.query(
    `INSERT INTO menu_items (
      id, section_id, name, weight, description, tasty_description, price, image, tags, is_hidden, is_stop_list, sort_order
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)
    RETURNING id`,
    [
      nextId,
      sectionId,
      name,
      String(input.weight || "—"),
      String(input.description || "").trim(),
      String(input.tastyDescription || "").trim() || null,
      normalizePrice(input.price),
      String(input.image || "").trim(),
      JSON.stringify(normalizeTags(input.tags)),
      Boolean(input.isHidden),
      Boolean(input.isStopList),
      Math.round(Number(input.sortOrder) || 0)
    ]
  );
  return Number(row.rows[0].id);
}

async function updateMenuItem(itemId, input) {
  await initDb();
  const updates = [];
  const values = [];
  let idx = 1;
  const assign = (column, value) => {
    updates.push(`${column} = $${idx}`);
    values.push(value);
    idx += 1;
  };

  if (Object.prototype.hasOwnProperty.call(input, "sectionId")) {
    const sectionId = Number(input.sectionId);
    if (!Number.isFinite(sectionId) || sectionId <= 0) throw new Error("Section is required.");
    assign("section_id", sectionId);
  }
  if (Object.prototype.hasOwnProperty.call(input, "name")) {
    const name = String(input.name || "").trim();
    if (!name) throw new Error("Dish name is required.");
    assign("name", name);
  }
  if (Object.prototype.hasOwnProperty.call(input, "weight")) assign("weight", String(input.weight || "—"));
  if (Object.prototype.hasOwnProperty.call(input, "description")) assign("description", String(input.description || "").trim());
  if (Object.prototype.hasOwnProperty.call(input, "tastyDescription")) {
    assign("tasty_description", String(input.tastyDescription || "").trim() || null);
  }
  if (Object.prototype.hasOwnProperty.call(input, "price")) assign("price", normalizePrice(input.price));
  if (Object.prototype.hasOwnProperty.call(input, "image")) assign("image", String(input.image || "").trim());
  if (Object.prototype.hasOwnProperty.call(input, "tags")) {
    updates.push(`tags = $${idx}::jsonb`);
    values.push(JSON.stringify(normalizeTags(input.tags)));
    idx += 1;
  }
  if (Object.prototype.hasOwnProperty.call(input, "isHidden")) assign("is_hidden", Boolean(input.isHidden));
  if (Object.prototype.hasOwnProperty.call(input, "isStopList")) assign("is_stop_list", Boolean(input.isStopList));
  if (Object.prototype.hasOwnProperty.call(input, "sortOrder")) assign("sort_order", Math.round(Number(input.sortOrder) || 0));
  if (Object.prototype.hasOwnProperty.call(input, "iikoProductId")) {
    const raw = String(input.iikoProductId || "").trim();
    assign("iiko_product_id", raw || null);
  }

  updates.push("updated_at = NOW()");
  values.push(Number(itemId));

  const result = await pool.query(
    `UPDATE menu_items
     SET ${updates.join(", ")}
     WHERE id = $${idx}
     RETURNING id`,
    values
  );
  if (!result.rows[0]) throw new Error("Item not found.");
}

async function deleteMenuItem(itemId) {
  await initDb();
  const result = await pool.query("DELETE FROM menu_items WHERE id = $1", [Number(itemId)]);
  if (!result.rowCount) throw new Error("Item not found.");
}

async function getMenuItemsIikoProductIds(itemIds) {
  await initDb();
  const ids = [...new Set(itemIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
  const map = new Map();
  if (!ids.length) return map;
  const result = await pool.query(
    `SELECT id, name, COALESCE(iiko_product_id, '') AS iiko_product_id
     FROM menu_items
     WHERE id = ANY($1::bigint[])`,
    [ids]
  );
  for (const row of result.rows) {
    const raw = String(row.iiko_product_id || "").trim();
    map.set(Number(row.id), {
      name: row.name,
      iikoProductId: raw || null
    });
  }
  return map;
}

async function updateMenuItemIikoProductId(itemId, iikoProductId) {
  await initDb();
  const raw = String(iikoProductId || "").trim();
  await pool.query(
    `UPDATE menu_items SET iiko_product_id = $2, updated_at = NOW() WHERE id = $1`,
    [Number(itemId), raw || null]
  );
}

async function listMenuItemsForIikoSync() {
  await initDb();
  const result = await pool.query(
    `SELECT id, name, COALESCE(iiko_product_id, '') AS iiko_product_id FROM menu_items ORDER BY id ASC`
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    iikoProductId: String(row.iiko_product_id || "").trim() || null
  }));
}

async function getDeliveryContent() {
  await initDb();
  const result = await pool.query("SELECT content_html, updated_at FROM delivery_content WHERE id = 1");
  const row = result.rows[0];
  if (!row) {
    return { contentHtml: DEFAULT_DELIVERY_CONTENT_HTML.trim(), updatedAt: null };
  }
  return {
    contentHtml: row.content_html,
    updatedAt: row.updated_at
  };
}

async function updateDeliveryContent(contentHtml) {
  await initDb();
  const html = String(contentHtml || "").trim();
  if (!html) throw new Error("Delivery content is required.");
  await pool.query(
    `INSERT INTO delivery_content (id, content_html, updated_at)
     VALUES (1, $1, NOW())
     ON CONFLICT (id)
     DO UPDATE SET content_html = EXCLUDED.content_html, updated_at = NOW()`,
    [html]
  );
}

/**
 * Один SQL-запрос = одна атомарная транзакция в Postgres без явного BEGIN/COMMIT.
 * Так стабильнее на Supabase pooler, чем несколько round-trip на одном клиенте.
 */
async function createOrderWithItems(order) {
  await initDb();

  const itemsJson = JSON.stringify(
    order.items.map((item) => ({
      id: String(item.id),
      name: item.name,
      qty: Math.round(Number(item.qty)),
      price: Math.round(Number(item.price))
    }))
  );

  const sql = `
    WITH ins AS (
      INSERT INTO orders (
        customer_name,
        phone,
        address,
        delivery_time,
        comment,
        total_amount,
        status,
        source,
        payload
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      RETURNING id
    )
    INSERT INTO order_items (
      order_id,
      external_item_id,
      name,
      quantity,
      unit_price,
      line_total
    )
    SELECT
      ins.id,
      elem->>'id',
      elem->>'name',
      (elem->>'qty')::integer,
      (elem->>'price')::integer,
      ((elem->>'qty')::integer * (elem->>'price')::integer)
    FROM ins
    CROSS JOIN jsonb_array_elements($10::jsonb) AS elem
    RETURNING order_id;
  `;

  const params = [
    order.customer.name,
    order.customer.phone,
    order.customer.address,
    order.deliveryTime,
    order.comment || null,
    Math.round(Number(order.totalAmount)),
    "new",
    "website",
    JSON.stringify(order),
    itemsJson
  ];

  const maxAttempts = 4;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await pool.query(sql, params);
      const orderId = result.rows[0]?.order_id;
      if (orderId == null) {
        throw new Error("Insert order returned no order_id");
      }
      return orderId;
    } catch (err) {
      lastErr = err;
      const msg = String(err.message || "");
      const retryable =
        /Connection terminated|ECONNRESET|timeout|ECONNREFUSED/i.test(msg);
      if (!retryable || attempt === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  throw lastErr;
}

async function updateOrderIntegration(orderId, integration) {
  await initDb();
  await pool.query(
    `UPDATE orders
      SET
        status = $2,
        iiko_order_id = $3,
        iiko_status = $4,
        iiko_error = $5,
        updated_at = NOW()
      WHERE id = $1`,
    [orderId, integration.status, integration.iikoOrderId, integration.iikoStatus, integration.iikoError]
  );
}

async function addIntegrationLog(log) {
  await initDb();
  await pool.query(
    `INSERT INTO integration_logs (
      order_id,
      provider,
      request_payload,
      response_payload
    ) VALUES ($1,$2,$3,$4)`,
    [log.orderId, log.provider, JSON.stringify(log.requestPayload), JSON.stringify(log.responsePayload)]
  );
}

function initialsFromName(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "Г";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function formatReviewDateRu(isoDate) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function mapPublicReviewRow(row) {
  const text = String(row.review_text || "").trim();
  return {
    initials: initialsFromName(row.author_name),
    name: row.author_name,
    source: "site",
    date: formatReviewDateRu(row.created_at),
    rating: Number(row.rating),
    text,
    long: text.length > 260
  };
}

function mapAdminReviewRow(row) {
  return {
    id: Number(row.id),
    authorName: row.author_name,
    rating: Number(row.rating),
    text: row.review_text,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function getPublicSiteReviews() {
  await initDb();
  const result = await pool.query(
    `SELECT author_name, rating, review_text, created_at
     FROM site_reviews
     WHERE status = 'approved'
     ORDER BY created_at DESC
     LIMIT 50`
  );
  return result.rows.map(mapPublicReviewRow);
}

async function createSiteReview(input) {
  await initDb();
  const result = await pool.query(
    `INSERT INTO site_reviews (author_name, rating, review_text, status)
     VALUES ($1, $2, $3, 'pending')
     RETURNING id`,
    [input.authorName, input.rating, input.text]
  );
  return Number(result.rows[0].id);
}

async function getAdminSiteReviews() {
  await initDb();
  const result = await pool.query(
    `SELECT id, author_name, rating, review_text, status, created_at, updated_at
     FROM site_reviews
     ORDER BY created_at DESC
     LIMIT 200`
  );
  return result.rows.map(mapAdminReviewRow);
}

async function updateSiteReviewStatus(id, status) {
  await initDb();
  const allowed = new Set(["pending", "approved", "rejected"]);
  if (!allowed.has(status)) {
    throw new Error("Invalid review status.");
  }
  const result = await pool.query(
    `UPDATE site_reviews
     SET status = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [id, status]
  );
  if (!result.rowCount) throw new Error("Review not found.");
}

async function deleteSiteReview(id) {
  await initDb();
  const result = await pool.query(`DELETE FROM site_reviews WHERE id = $1 RETURNING id`, [id]);
  if (!result.rowCount) throw new Error("Review not found.");
}

module.exports = {
  initDb,
  createOrderWithItems,
  updateOrderIntegration,
  addIntegrationLog,
  getPublicMenuData,
  getAdminMenuData,
  createSection,
  updateSection,
  deleteSection,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  getDeliveryContent,
  updateDeliveryContent,
  getPublicSiteReviews,
  createSiteReview,
  getAdminSiteReviews,
  updateSiteReviewStatus,
  deleteSiteReview,
  getMenuItemsIikoProductIds,
  updateMenuItemIikoProductId,
  listMenuItemsForIikoSync
};
