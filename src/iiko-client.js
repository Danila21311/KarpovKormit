function isStubMode() {
  return String(process.env.IIKO_STUB_MODE || "true").toLowerCase() !== "false";
}

async function sendOrderToIiko(order) {
  if (isStubMode()) {
    return {
      success: true,
      mode: "stub",
      externalOrderId: `stub-${Date.now()}`,
      message: "Stub mode is enabled."
    };
  }

  return {
    success: false,
    mode: "disabled",
    externalOrderId: null,
    errorMessage:
      "IIKO integration is not configured yet. Set IIKO_API_LOGIN, IIKO_TERMINAL_GROUP_ID and implement API calls."
  };
}

module.exports = { sendOrderToIiko };
