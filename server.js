require("dotenv").config();

const express = require("express");
const path = require("path");

const { initDb, createOrderWithItems, updateOrderIntegration, addIntegrationLog } = require("./src/db");
const { validateOrderPayload } = require("./src/validate-order");
const { sendOrderToIiko } = require("./src/iiko-client");
const { loadMenuItems } = require("./src/menu-loader");

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", async (req, res) => {
  try {
    await initDb();
    res.json({ ok: true, service: "restobar-api" });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Database is unavailable." });
  }
});

app.get("/api/menu", async (req, res) => {
  try {
    const items = await loadMenuItems(path.join(__dirname, "menu-data.js"));
    res.json({ ok: true, items });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Failed to load menu." });
  }
});

app.post("/api/order", async (req, res) => {
  const validation = validateOrderPayload(req.body);
  if (!validation.ok) {
    return res.status(400).json({ ok: false, errors: validation.errors });
  }

  const order = validation.value;
  let internalOrderId = null;

  try {
    internalOrderId = await createOrderWithItems(order);

    const iikoResult = await sendOrderToIiko(order);

    try {
      await updateOrderIntegration(internalOrderId, {
        status: iikoResult.success ? "sent_to_iiko" : "requires_manual_processing",
        iikoOrderId: iikoResult.externalOrderId || null,
        iikoStatus: iikoResult.mode,
        iikoError: iikoResult.success ? null : iikoResult.errorMessage
      });
    } catch (syncErr) {
      console.error("updateOrderIntegration:", syncErr.message);
    }

    try {
      await addIntegrationLog({
        orderId: internalOrderId,
        provider: "iiko",
        requestPayload: order,
        responsePayload: iikoResult
      });
    } catch (logErr) {
      console.error("addIntegrationLog:", logErr.message);
    }

    if (!iikoResult.success) {
      return res.status(202).json({
        ok: true,
        orderId: internalOrderId,
        message: "Заказ сохранен. Требуется обработка оператором."
      });
    }

    return res.status(201).json({
      ok: true,
      orderId: internalOrderId,
      message: "Заказ успешно оформлен."
    });
  } catch (error) {
    console.error("POST /api/order failed:", error);

    if (internalOrderId) {
      try {
        await updateOrderIntegration(internalOrderId, {
          status: "integration_error",
          iikoOrderId: null,
          iikoStatus: "error",
          iikoError: error.message
        });
      } catch (markErr) {
        console.error("Could not mark order integration_error:", markErr.message);
      }
    }

    const isDev = process.env.NODE_ENV !== "production";
    return res.status(500).json({
      ok: false,
      message: "Не удалось оформить заказ. Попробуйте еще раз.",
      ...(isDev && error.message ? { detail: error.message } : {})
    });
  }
});

app.use(express.static(__dirname));

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

module.exports = app;

if (require.main === module) {
  app.listen(port, async () => {
    try {
      await initDb();
      console.log(`Server is running on http://localhost:${port}`);
    } catch (error) {
      console.error("Database initialization failed:", error.message);
      process.exit(1);
    }
  });
}
