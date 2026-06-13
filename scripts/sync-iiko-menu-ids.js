/**
 * Сопоставляет блюда сайта с номенклатурой iiko по названию и записывает iiko_product_id.
 * Run: node scripts/sync-iiko-menu-ids.js
 * Dry run: node scripts/sync-iiko-menu-ids.js --dry-run
 */
require("dotenv").config();

const path = require("path");
const { getIikoConfig } = require("../src/iiko-config");
const { fetchNomenclature, resetTokenCache } = require("../src/iiko-api");
const { flattenNomenclatureProducts, matchProductByName } = require("../src/iiko-order-builder");
const { initDb, listMenuItemsForIikoSync, updateMenuItemIikoProductId } = require("../src/db");
const { loadMenuItems } = require("../src/menu-loader");

async function loadMenuItemsForSync() {
  try {
    await initDb();
    const items = await listMenuItemsForIikoSync();
    return { items, source: "database", canWrite: true };
  } catch (error) {
    console.warn("\nБД недоступна:", error.message);
    console.warn("Используем menu-data.js — UUID только выводятся в консоль, в БД не пишем.");
    console.warn("Чтобы записать в прод-БД: исправьте DATABASE_URL или запустите на Railway.\n");
    const staticItems = await loadMenuItems(path.join(__dirname, "..", "menu-data.js"));
    return {
      items: staticItems.map((item, index) => ({
        id: Number(item.id) || index + 1,
        name: String(item.name || "").trim(),
        iikoProductId: null
      })),
      source: "menu-data.js",
      canWrite: false
    };
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const config = getIikoConfig();
  if (!config.apiLogin || !config.organizationId) {
    console.error("Set IIKO_API_LOGIN and IIKO_ORGANIZATION_ID in .env");
    process.exit(1);
  }

  resetTokenCache();
  const nomenclature = await fetchNomenclature(config.organizationId);
  const products = flattenNomenclatureProducts(nomenclature);
  console.log("iiko products loaded:", products.length);

  const { items: menuItems, source, canWrite } = await loadMenuItemsForSync();
  console.log("Menu source:", source, "— items:", menuItems.length);

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const item of menuItems) {
    if (item.iikoProductId) {
      skipped += 1;
      continue;
    }
    const match = matchProductByName(item.name, products);
    if (!match) {
      notFound += 1;
      console.log("NOT FOUND:", item.id, item.name);
      continue;
    }
    console.log(`${dryRun || !canWrite ? "[preview] " : ""}MAP:`, item.id, item.name, "->", match.id, `(${match.name})`);
    if (!dryRun && canWrite) {
      await updateMenuItemIikoProductId(item.id, match.id);
    }
    updated += 1;
  }

  console.log("\nDone.");
  console.log("Matched:", updated);
  console.log("Skipped (already mapped):", skipped);
  console.log("Not found:", notFound);
  if (dryRun) console.log("Dry run — БД не изменена.");
  if (!canWrite && updated > 0) {
    console.log("\nСкопируйте UUID в админку или исправьте DATABASE_URL и запустите снова без --dry-run.");
  }
}

main().catch((error) => {
  console.error(error.message);
  if (error.body) console.error(JSON.stringify(error.body, null, 2));
  process.exit(1);
});
