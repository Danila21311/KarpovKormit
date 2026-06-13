/**
 * Central place for iiko Cloud / iikoTransport-related env vars.
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
    paymentTypeKind: trimOrUndefined(process.env.IIKO_PAYMENT_TYPE_KIND) || "Cash",
    externalMenuId: trimOrUndefined(process.env.IIKO_EXTERNAL_MENU_ID),
    priceCategoryId: trimOrUndefined(process.env.IIKO_PRICE_CATEGORY_ID),
    deliveryCity: trimOrUndefined(process.env.IIKO_DELIVERY_CITY) || "Оренбург",
    defaultLatitude: trimOrUndefined(process.env.IIKO_DEFAULT_LAT),
    defaultLongitude: trimOrUndefined(process.env.IIKO_DEFAULT_LON)
  };
}

function validateIikoConfigForOrders() {
  const config = getIikoConfig();
  const missing = [];
  if (!config.apiLogin) missing.push("IIKO_API_LOGIN");
  if (!config.organizationId) missing.push("IIKO_ORGANIZATION_ID");
  if (!config.terminalGroupId) missing.push("IIKO_TERMINAL_GROUP_ID");
  if (!config.paymentTypeId) missing.push("IIKO_PAYMENT_TYPE_ID");
  return { ok: missing.length === 0, missing, config };
}

function hasIikoOrganization() {
  const c = getIikoConfig();
  return Boolean(c.organizationId);
}

module.exports = { getIikoConfig, validateIikoConfigForOrders, hasIikoOrganization };
