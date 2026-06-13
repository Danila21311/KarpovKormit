const { getIikoConfig, validateIikoConfigForOrders } = require("./iiko-config");
const { getMenuItemsIikoProductIds } = require("./db");
const {
  getIikoProductIdForModifier
} = require("../menu-modifiers-presets");
const { buildDeliveryCreatePayload } = require("./iiko-order-builder");
const {
  terminalGroupsIsAlive,
  createDelivery,
  waitForCommand
} = require("./iiko-api");

function isStubMode() {
  return String(process.env.IIKO_STUB_MODE || "true").toLowerCase() !== "false";
}

async function sendOrderToIiko(order, options = {}) {
  if (isStubMode()) {
    return {
      success: true,
      mode: "stub",
      externalOrderId: `stub-${Date.now()}`,
      message: "Stub mode is enabled."
    };
  }

  const validation = validateIikoConfigForOrders();
  if (!validation.ok) {
    return {
      success: false,
      mode: "config_error",
      externalOrderId: null,
      errorMessage: `iiko: не заданы переменные ${validation.missing.join(", ")}.`
    };
  }

  const internalOrderId = options.internalOrderId || null;
  const itemIds = (order.items || []).map((item) => Number(item.id)).filter(Boolean);
  let productMap;
  try {
    productMap = await getMenuItemsIikoProductIds(itemIds);
  } catch (error) {
    return {
      success: false,
      mode: "db_error",
      externalOrderId: null,
      errorMessage: error.message || "Не удалось загрузить iiko_product_id из БД."
    };
  }

  const payloadResult = buildDeliveryCreatePayload(order, {
    internalOrderId,
    productMap,
    resolveModifierIikoId: getIikoProductIdForModifier
  });

  if (!payloadResult.ok) {
    return {
      success: false,
      mode: "mapping_error",
      externalOrderId: null,
      errorMessage: payloadResult.error
    };
  }

  const config = getIikoConfig();
  let requestPayload = payloadResult.payload;

  try {
    let terminalAlive = true;
    try {
      terminalAlive = await terminalGroupsIsAlive(config.organizationId, config.terminalGroupId);
    } catch (aliveErr) {
      console.warn("[iiko] terminal_groups/is_alive:", aliveErr.message);
    }
    if (!terminalAlive) {
      console.warn("[iiko] Terminal group is not alive, trying to create delivery anyway.");
    }

    const response = await createDelivery(requestPayload);
    const correlationId = response?.correlationId || null;
    let orderId = response?.orderInfo?.id || response?.orderInfo?.order?.id || null;
    const creationStatus = response?.orderInfo?.creationStatus || response?.orderInfo?.order?.status || null;

    if (!orderId && correlationId) {
      const command = await waitForCommand(config.organizationId, correlationId);
      if (!command.ok) {
        return {
          success: false,
          mode: "command_error",
          externalOrderId: null,
          errorMessage: command.error,
          requestPayload,
          responsePayload: { create: response, command: command.status }
        };
      }
      orderId =
        command.status?.orderInfo?.id ||
        command.status?.orderInfo?.order?.id ||
        command.status?.id ||
        null;
    }

    if (!orderId && creationStatus && String(creationStatus).toLowerCase() === "success") {
      orderId = response?.orderInfo?.id || null;
    }

    if (!orderId) {
      return {
        success: false,
        mode: "create_error",
        externalOrderId: null,
        errorMessage: "iiko принял запрос, но не вернул id заказа.",
        requestPayload,
        responsePayload: response
      };
    }

    return {
      success: true,
      mode: "live",
      externalOrderId: String(orderId),
      correlationId,
      terminalAlive,
      warnings: payloadResult.warnings,
      requestPayload,
      responsePayload: response,
      message: "Заказ передан в iiko."
    };
  } catch (error) {
    console.error("[iiko] create delivery failed:", error.message);
    return {
      success: false,
      mode: "api_error",
      externalOrderId: null,
      errorMessage: error.message || "Ошибка iiko API.",
      requestPayload,
      responsePayload: error.body || null
    };
  }
}

module.exports = { sendOrderToIiko, isStubMode };
