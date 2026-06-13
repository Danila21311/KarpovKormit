/**
 * Выводит продукты из номенклатуры iiko (для ручного маппинга модификаторов).
 * Run: node scripts/list-iiko-nomenclature.js [filter]
 */
require("dotenv").config();

const { getIikoConfig } = require("../src/iiko-config");
const { fetchNomenclature, resetTokenCache } = require("../src/iiko-api");
const { flattenNomenclatureProducts } = require("../src/iiko-order-builder");

async function main() {
  const filter = String(process.argv.slice(2).join(" ") || "").toLowerCase();
  const config = getIikoConfig();
  if (!config.apiLogin || !config.organizationId) {
    console.error("Set IIKO_API_LOGIN and IIKO_ORGANIZATION_ID in .env");
    process.exit(1);
  }

  resetTokenCache();
  const nomenclature = await fetchNomenclature(config.organizationId);
  const products = flattenNomenclatureProducts(nomenclature);
  const filtered = filter
    ? products.filter((product) => product.name.toLowerCase().includes(filter))
    : products;

  console.log(`Products: ${filtered.length} / ${products.length}`);
  filtered.slice(0, 200).forEach((product) => {
    console.log(`${product.id}\t${product.name}`);
  });
  if (filtered.length > 200) {
    console.log(`... and ${filtered.length - 200} more (use filter argument)`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
