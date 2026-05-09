/**
 * Central place for iiko Cloud / iikoTransport-related env vars.
 * Used when IIKO_STUB_MODE=false and real API calls are implemented.
 */

function trimOrUndefined(value) {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s === "" ? undefined : s;
}

function getIikoConfig() {
  return {
    apiBase: trimOrUndefined(process.env.IIKO_API_BASE) || "https://api-ru.iiko.services",
    apiLogin: trimOrUndefined(process.env.IIKO_API_LOGIN),
    organizationId: trimOrUndefined(process.env.IIKO_ORGANIZATION_ID),
    terminalGroupId: trimOrUndefined(process.env.IIKO_TERMINAL_GROUP_ID),
    orderTypeDeliveryId: trimOrUndefined(process.env.IIKO_ORDER_TYPE_DELIVERY),
    orderTypeSbermarketPickupId: trimOrUndefined(process.env.IIKO_ORDER_TYPE_SBERMARKET_PICKUP),
    paymentTypeId: trimOrUndefined(process.env.IIKO_PAYMENT_TYPE_ID),
    externalMenuId: trimOrUndefined(process.env.IIKO_EXTERNAL_MENU_ID),
    priceCategoryId: trimOrUndefined(process.env.IIKO_PRICE_CATEGORY_ID)
  };
}

/** True when minimal secrets/refs exist for a future live integration (terminal group still required for orders). */
function hasIikoOrganization() {
  const c = getIikoConfig();
  return Boolean(c.organizationId);
}

module.exports = { getIikoConfig, hasIikoOrganization };
