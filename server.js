require("dotenv").config();

const { warnAdminTokenEnvIssues } = require("./src/env-warnings");
warnAdminTokenEnvIssues();

const express = require("express");
const path = require("path");
const multer = require("multer");
const {
  createMenuImageStorage,
  menuImageFileFilter,
  publicUrlForUploadedFile,
  MAX_BYTES
} = require("./src/upload-menu-image");

const {
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
  deleteSiteReview
} = require("./src/db");
const { validateOrderPayload } = require("./src/validate-order");
const { validateReviewPayload } = require("./src/validate-review");
const { decodeAdminTokenFromHeader } = require("./src/admin-token");
const { sendOrderToIiko } = require("./src/iiko-client");
const { loadMenuItems } = require("./src/menu-loader");

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "1mb" }));

const menuImageUpload = multer({
  storage: multer.diskStorage(createMenuImageStorage()),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: menuImageFileFilter
});

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
    const data = await getPublicMenuData();
    res.json({ ok: true, ...data });
  } catch (error) {
    try {
      const fallbackItems = await loadMenuItems(path.join(__dirname, "menu-data.js"));
      const sectionNames = [...new Set(fallbackItems.map((item) => item.category).filter(Boolean))];
      const sections = sectionNames.map((name, index) => ({ id: index + 1, name, sortOrder: index }));
      res.json({ ok: true, sections, items: fallbackItems });
    } catch (fallbackError) {
      res.status(500).json({ ok: false, message: "Failed to load menu." });
    }
  }
});

app.get("/api/reviews", async (req, res) => {
  try {
    const reviews = await getPublicSiteReviews();
    res.json({ ok: true, reviews });
  } catch (error) {
    console.error("GET /api/reviews:", error.message);
    res.json({ ok: true, reviews: [] });
  }
});

app.post("/api/reviews", async (req, res) => {
  const validation = validateReviewPayload(req.body);
  if (!validation.ok) {
    return res.status(400).json({ ok: false, errors: validation.errors });
  }
  try {
    const reviewId = await createSiteReview(validation.value);
    res.status(201).json({
      ok: true,
      reviewId,
      message:
        "Спасибо! Отзыв отправлен на проверку и появится на сайте после одобрения администратором."
    });
  } catch (error) {
    console.error("POST /api/reviews:", error.message);
    res.status(500).json({
      ok: false,
      message: "Не удалось отправить отзыв. Попробуйте позже."
    });
  }
});

app.get("/api/delivery-content", async (req, res) => {
  try {
    const content = await getDeliveryContent();
    res.json({ ok: true, ...content });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Failed to load delivery content." });
  }
});

function extractAdminToken(req) {
  const bearer = String(req.headers.authorization || "");
  if (bearer.toLowerCase().startsWith("bearer ")) {
    return decodeAdminTokenFromHeader(bearer.slice(7));
  }
  return decodeAdminTokenFromHeader(req.headers["x-admin-token"]);
}

function requireAdmin(req, res, next) {
  const expected = String(process.env.ADMIN_TOKEN || "").trim();
  if (!expected) {
    return res.status(503).json({ ok: false, message: "ADMIN_TOKEN is not configured on server." });
  }
  const actual = extractAdminToken(req);
  if (!actual || actual !== expected) {
    return res.status(401).json({
      ok: false,
      message: "Неверный ADMIN_TOKEN.",
      code: "admin_auth_failed"
    });
  }
  return next();
}

app.get("/api/admin/ping", requireAdmin, (req, res) => {
  res.json({ ok: true });
});

if (process.env.NODE_ENV !== "production") {
  app.get("/api/admin/auth-hint", (req, res) => {
    const expected = String(process.env.ADMIN_TOKEN || "").trim();
    res.json({
      ok: true,
      configured: Boolean(expected),
      length: expected.length
    });
  });
}

app.get("/api/admin/menu", requireAdmin, async (req, res) => {
  try {
    const data = await getAdminMenuData();
    res.json({ ok: true, ...data });
  } catch (error) {
    console.error("GET /api/admin/menu:", error.message);
    const isDev = process.env.NODE_ENV !== "production";
    res.status(500).json({
      ok: false,
      message:
        "Не удалось загрузить меню из базы данных. Проверьте DATABASE_URL в .env (для локальной работы — Session pooler Supabase на порту 5432 или локальный Postgres).",
      code: "admin_menu_db_failed",
      ...(isDev && error.message ? { detail: error.message } : {})
    });
  }
});

app.post("/api/admin/sections", requireAdmin, async (req, res) => {
  try {
    const section = await createSection(req.body || {});
    res.status(201).json({ ok: true, section });
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message || "Failed to create section." });
  }
});

app.patch("/api/admin/sections/:id", requireAdmin, async (req, res) => {
  try {
    const section = await updateSection(req.params.id, req.body || {});
    res.json({ ok: true, section });
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message || "Failed to update section." });
  }
});

app.delete("/api/admin/sections/:id", requireAdmin, async (req, res) => {
  try {
    await deleteSection(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message || "Failed to delete section." });
  }
});

app.post("/api/admin/items", requireAdmin, async (req, res) => {
  try {
    const itemId = await createMenuItem(req.body || {});
    res.status(201).json({ ok: true, itemId });
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message || "Failed to create item." });
  }
});

app.patch("/api/admin/items/:id", requireAdmin, async (req, res) => {
  try {
    await updateMenuItem(req.params.id, req.body || {});
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message || "Failed to update item." });
  }
});

app.delete("/api/admin/items/:id", requireAdmin, async (req, res) => {
  try {
    await deleteMenuItem(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message || "Failed to delete item." });
  }
});

app.get("/api/admin/delivery-content", requireAdmin, async (req, res) => {
  try {
    const content = await getDeliveryContent();
    res.json({ ok: true, ...content });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Failed to load delivery content." });
  }
});

app.get("/api/admin/reviews", requireAdmin, async (req, res) => {
  try {
    const reviews = await getAdminSiteReviews();
    res.json({ ok: true, reviews });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Не удалось загрузить отзывы." });
  }
});

app.patch("/api/admin/reviews/:id", requireAdmin, async (req, res) => {
  try {
    const status = String(req.body?.status || "").trim();
    await updateSiteReviewStatus(req.params.id, status);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message || "Не удалось обновить отзыв." });
  }
});

app.delete("/api/admin/reviews/:id", requireAdmin, async (req, res) => {
  try {
    await deleteSiteReview(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message || "Не удалось удалить отзыв." });
  }
});

app.put("/api/admin/delivery-content", requireAdmin, async (req, res) => {
  try {
    await updateDeliveryContent(req.body?.contentHtml);
    const updated = await getDeliveryContent();
    res.json({ ok: true, ...updated });
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message || "Failed to update delivery content." });
  }
});

app.post("/api/admin/upload-image", requireAdmin, (req, res) => {
  menuImageUpload.single("image")(req, res, (error) => {
    if (error) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? "Файл слишком большой (максимум 5 МБ)."
          : error.message || "Не удалось загрузить изображение.";
      return res.status(400).json({ ok: false, message });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, message: "Выберите файл изображения." });
    }
    return res.json({
      ok: true,
      url: publicUrlForUploadedFile(req.file.filename)
    });
  });
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

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(__dirname));

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

module.exports = app;

if (require.main === module) {
  app.listen(port, async () => {
    console.log(`Server listening on port ${port}`);
    console.log(
      `[startup] DATABASE_URL is ${process.env.DATABASE_URL ? "set" : "MISSING — add in Railway → KarpovKormit → Variables"}`
    );
    try {
      await initDb();
      console.log("Database initialized.");
    } catch (error) {
      console.error(
        "Database initialization failed (HTTP still running):",
        error.message
      );
      console.error(
        "Check Railway Variables: add Postgres and set DATABASE_URL, or fix SSL/network."
      );
    }
  });
}
