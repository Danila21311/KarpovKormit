function validateOrderPayload(payload) {
  const errors = [];
  const body = payload && typeof payload === "object" ? payload : {};

  const customer = body.customer && typeof body.customer === "object" ? body.customer : {};
  const items = Array.isArray(body.items) ? body.items : [];

  if (!customer.name || String(customer.name).trim().length < 2) {
    errors.push("Укажите корректное имя.");
  }

  const phoneDigits = String(customer.phone || "").replace(/\D/g, "");
  if (phoneDigits.length < 11) {
    errors.push("Укажите корректный номер телефона.");
  }

  if (!customer.address || String(customer.address).trim().length < 5) {
    errors.push("Укажите корректный адрес доставки.");
  }

  if (!body.deliveryTime || String(body.deliveryTime).trim().length === 0) {
    errors.push("Выберите время доставки.");
  }

  if (!items.length) {
    errors.push("Корзина пуста.");
  }

  const normalizedItems = [];
  for (const item of items) {
    const qty = Number(item.qty);
    const price = Number(item.price);
    if (!item || typeof item !== "object") {
      errors.push("Некорректная позиция в заказе.");
      continue;
    }
    if (!item.id || !item.name || !Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0 || price <= 0) {
      errors.push(`Некорректная позиция: ${item.name || "без названия"}.`);
      continue;
    }
    normalizedItems.push({
      id: item.id,
      name: String(item.name),
      qty: Math.round(qty),
      price: Math.round(price)
    });
  }

  const totalAmount = Math.round(
    normalizedItems.reduce((sum, item) => sum + item.qty * item.price, 0)
  );
  if (totalAmount <= 0) {
    errors.push("Сумма заказа должна быть больше нуля.");
  }

  const promoCode = String(body.promoCode || "")
    .trim()
    .slice(0, 64);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      customer: {
        name: String(customer.name).trim(),
        phone: String(customer.phone).trim(),
        address: String(customer.address).trim()
      },
      deliveryTime: String(body.deliveryTime).trim(),
      comment: String(body.comment || "").trim(),
      promoCode,
      items: normalizedItems,
      totalAmount
    }
  };
}

module.exports = { validateOrderPayload };
