const fs = require("fs/promises");
const path = require("path");
const { Pool } = require("pg");

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
  return {
    connectionString,
    ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
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

async function initDb() {
  if (initialized) return;
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }
  const schemaPath = path.join(__dirname, "..", "db", "schema.sql");
  const schemaSql = await fs.readFile(schemaPath, "utf8");
  await pool.query(schemaSql);
  initialized = true;
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

module.exports = {
  initDb,
  createOrderWithItems,
  updateOrderIntegration,
  addIntegrationLog
};
