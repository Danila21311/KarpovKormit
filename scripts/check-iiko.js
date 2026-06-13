/**
 * Проверка подключения к iiko Cloud API.
 * Run: node scripts/check-iiko.js
 */
require("dotenv").config();

const { validateIikoConfigForOrders, getIikoConfig } = require("../src/iiko-config");
const {
  getAccessToken,
  fetchOrganizations,
  fetchTerminalGroups,
  terminalGroupsIsAlive,
  fetchPaymentTypes,
  resetTokenCache
} = require("../src/iiko-api");

async function main() {
  const validation = validateIikoConfigForOrders();
  const config = getIikoConfig();

  console.log("IIKO_STUB_MODE:", process.env.IIKO_STUB_MODE ?? "(default true)");
  console.log("API base:", config.apiBase);
  console.log("Organization ID:", config.organizationId || "(missing)");
  console.log("Terminal group ID:", config.terminalGroupId || "(missing)");
  console.log("Payment type ID:", config.paymentTypeId || "(missing)");

  if (!config.apiLogin) {
    console.error("\nERROR: IIKO_API_LOGIN is not set.");
    process.exit(1);
  }

  try {
    resetTokenCache();
    const token = await getAccessToken();
    console.log("\nOK: access_token received (length", token.length, ")");

    const orgs = await fetchOrganizations();
    const orgList = Array.isArray(orgs?.organizations) ? orgs.organizations : [];
    console.log("Organizations accessible:", orgList.length);
    orgList.slice(0, 5).forEach((org) => {
      console.log(" -", org.name, org.id);
    });

    if (config.organizationId) {
      const groups = await fetchTerminalGroups([config.organizationId]);
      const terminalGroups = Array.isArray(groups?.terminalGroups) ? groups.terminalGroups : [];
      console.log("\nTerminal groups for organization:", terminalGroups.length);
      terminalGroups.forEach((entry) => {
        const items = Array.isArray(entry.items) ? entry.items : [];
        items.forEach((group) => {
          console.log(" -", group.name || "(no name)", group.id);
        });
      });

      if (config.terminalGroupId) {
        const alive = await terminalGroupsIsAlive(config.organizationId, config.terminalGroupId);
        console.log("\nTerminal group is alive:", alive ? "YES" : "NO");
      }
    }

    if (config.organizationId) {
      const payments = await fetchPaymentTypes([config.organizationId]);
      const types = Array.isArray(payments?.paymentTypes) ? payments.paymentTypes : [];
      console.log("\nPayment types:", types.length);
      types.slice(0, 8).forEach((type) => {
        console.log(" -", type.name, type.id, type.paymentTypeKind || "");
      });
      if (config.paymentTypeId) {
        const selected = types.find((type) => String(type.id) === String(config.paymentTypeId));
        console.log(
          selected
            ? `\nConfigured IIKO_PAYMENT_TYPE_ID matches: ${selected.name} (${selected.paymentTypeKind})`
            : "\nWARNING: IIKO_PAYMENT_TYPE_ID not found in payment types list."
        );
      }
    }

    if (!validation.ok) {
      console.warn("\nWARNING: for live orders also set:", validation.missing.join(", "));
    } else {
      console.log("\nConfig OK for live order creation (when IIKO_STUB_MODE=false).");
    }
  } catch (error) {
    console.error("\nERROR:", error.message);
    if (error.body) console.error(JSON.stringify(error.body, null, 2));
    process.exit(1);
  }
}

main();
