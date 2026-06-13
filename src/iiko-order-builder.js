const { getIikoConfig } = require("./iiko-config");

function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  let normalized = digits;
  if (normalized.startsWith("8") && normalized.length === 11) {
    normalized = `7${normalized.slice(1)}`;
  }
  if (normalized.startsWith("7") && normalized.length === 11) {
    return `+${normalized}`;
  }
  if (normalized.length === 10) {
    return `+7${normalized}`;
  }
  return digits.startsWith("+") ? digits : `+${normalized}`;
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDeliveryCoordinates(config) {
  const lat = Number(config.defaultLatitude);
  const lon = Number(config.defaultLongitude);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return { latitude: lat, longitude: lon };
  }
  return { latitude: 51.762235, longitude: 55.119189 };
}

function buildDeliveryPoint(address, config) {
  const fullAddress = String(address || "").trim();
  const city = config.deliveryCity || "Оренбург";
  return {
    coordinates: parseDeliveryCoordinates(config),
    address: {
      street: {
        name: fullAddress || city,
        city
      },
      house: "—",
      comment: fullAddress
    },
    comment: fullAddress
  };
}

function buildOrderComment(order, extras = []) {
  const parts = [];
  if (order.deliveryTime) parts.push(`Время доставки: ${order.deliveryTime}`);
  if (order.comment) parts.push(`Комментарий: ${order.comment}`);
  if (order.promoCode) parts.push(`Промокод: ${order.promoCode}`);
  if (extras.length) parts.push(extras.join("; "));
  parts.push("Источник: сайт Карпов Кормит");
  return parts.filter(Boolean).join("\n");
}

function buildIikoItems(orderItems, productMap, resolveModifierIikoId) {
  const items = [];
  const warnings = [];
  const missingProducts = [];

  for (const line of orderItems) {
    const siteId = Number(line.id);
    const meta = productMap.get(siteId);
    const productId = meta?.iikoProductId || null;
    if (!productId) {
      missingProducts.push(meta?.name || line.name || String(siteId));
      continue;
    }

    const modifierComments = [];
    const nestedModifiers = [];
    let modifierTotal = 0;
    for (const modifier of line.modifiers || []) {
      const modProductId = resolveModifierIikoId(modifier.id);
      const modPrice = Math.round(Number(modifier.price) || 0);
      if (modProductId) {
        modifierTotal += modPrice;
        nestedModifiers.push({
          productId: modProductId,
          amount: 1,
          price: modPrice
        });
      } else {
        modifierComments.push(`+ ${modifier.name}${modPrice ? ` (${modPrice} ₽)` : ""}`);
        modifierTotal += modPrice;
      }
    }

    const lineUnitPrice = Math.round(Number(line.price) || 0);
    const baseUnitPrice = Math.max(0, lineUnitPrice - modifierTotal);

    const itemComment = [line.name !== meta?.name ? line.name : "", modifierComments.join(", ")]
      .filter(Boolean)
      .join(" · ");

    const entry = {
      productId,
      type: "Product",
      amount: Math.max(1, Math.round(Number(line.qty) || 1))
    };
    if (baseUnitPrice > 0) entry.price = baseUnitPrice;
    if (itemComment) entry.comment = itemComment;
    if (nestedModifiers.length) entry.modifiers = nestedModifiers;
    items.push(entry);
  }

  if (missingProducts.length) {
    return {
      ok: false,
      error: `Не задан iiko_product_id для блюд: ${missingProducts.join(", ")}. Запустите node scripts/sync-iiko-menu-ids.js или укажите UUID в админке.`
    };
  }
  if (!items.length) {
    return { ok: false, error: "Нет позиций с iiko_product_id для отправки в iiko." };
  }

  return { ok: true, items, warnings };
}

function buildDeliveryCreatePayload(order, context) {
  const config = getIikoConfig();
  const productMap = context.productMap || new Map();
  const resolveModifierIikoId = context.resolveModifierIikoId || (() => null);
  const internalOrderId = context.internalOrderId;

  const itemsResult = buildIikoItems(order.items, productMap, resolveModifierIikoId);
  if (!itemsResult.ok) {
    return itemsResult;
  }

  const phone = normalizePhone(order.customer.phone);
  if (!phone || phone.length < 12) {
    return { ok: false, error: "Некорректный телефон для iiko." };
  }

  const paymentSum = Math.round(Number(order.totalAmount) || 0);
  const orderComment = buildOrderComment(order, itemsResult.warnings);

  const payload = {
    organizationId: config.organizationId,
    terminalGroupId: config.terminalGroupId,
    createOrderSettings: {
      transportToFrontTimeout: 120
    },
    order: {
      externalNumber: internalOrderId ? `web-${internalOrderId}` : undefined,
      phone,
      orderServiceType: "DeliveryByCourier",
      deliveryPoint: buildDeliveryPoint(order.customer.address, config),
      comment: orderComment,
      customer: {
        name: String(order.customer.name || "Гость").trim(),
        type: "regular"
      },
      items: itemsResult.items,
      payments: [
        {
          paymentTypeKind: config.paymentTypeKind || "Cash",
          sum: paymentSum,
          paymentTypeId: config.paymentTypeId,
          isProcessedExternally: false
        }
      ]
    }
  };

  if (config.orderTypeDeliveryId) {
    payload.order.orderTypeId = config.orderTypeDeliveryId;
  }

  return { ok: true, payload, warnings: itemsResult.warnings };
}

function flattenNomenclatureProducts(nomenclatureResponse) {
  const products = [];
  const groups = Array.isArray(nomenclatureResponse?.groups) ? nomenclatureResponse.groups : [];
  const items = Array.isArray(nomenclatureResponse?.products) ? nomenclatureResponse.products : [];
  for (const product of items) {
    if (!product?.id || !product?.name) continue;
    products.push({
      id: String(product.id),
      name: String(product.name),
      code: product.code ? String(product.code) : "",
      normalizedName: normalizeName(product.name)
    });
  }
  for (const group of groups) {
    if (Array.isArray(group?.items)) {
      for (const product of group.items) {
        if (!product?.id || !product?.name) continue;
        products.push({
          id: String(product.id),
          name: String(product.name),
          code: product.code ? String(product.code) : "",
          normalizedName: normalizeName(product.name)
        });
      }
    }
  }
  return products;
}

function matchProductByName(menuName, iikoProducts) {
  const target = normalizeName(menuName);
  if (!target) return null;
  const exact = iikoProducts.find((product) => product.normalizedName === target);
  if (exact) return exact;
  const contains = iikoProducts.find(
    (product) => product.normalizedName.includes(target) || target.includes(product.normalizedName)
  );
  return contains || null;
}

module.exports = {
  normalizePhone,
  normalizeName,
  buildDeliveryCreatePayload,
  flattenNomenclatureProducts,
  matchProductByName
};
