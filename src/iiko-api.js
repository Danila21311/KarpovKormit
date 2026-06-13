const { getIikoConfig } = require("./iiko-config");

let tokenCache = { token: null, expiresAt: 0 };
const TOKEN_TTL_MS = 50 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function apiBase() {
  return getIikoConfig().apiBase.replace(/\/+$/, "");
}

async function parseJsonResponse(response) {
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const message =
      data.errorDescription ||
      data.message ||
      (typeof data.error === "string" ? data.error : null) ||
      `HTTP ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.body = data;
    throw err;
  }
  return data;
}

async function post(path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  return parseJsonResponse(response);
}

async function getAccessToken(forceRefresh = false) {
  const config = getIikoConfig();
  if (!config.apiLogin) {
    throw new Error("IIKO_API_LOGIN is not set.");
  }
  const now = Date.now();
  if (!forceRefresh && tokenCache.token && tokenCache.expiresAt > now) {
    return tokenCache.token;
  }
  const data = await post("/api/1/access_token", { apiLogin: config.apiLogin });
  if (!data?.token) {
    throw new Error("iiko access_token response did not include token.");
  }
  tokenCache = { token: data.token, expiresAt: now + TOKEN_TTL_MS };
  return data.token;
}

async function terminalGroupsIsAlive(organizationId, terminalGroupId) {
  const token = await getAccessToken();
  const data = await post(
    "/api/1/terminal_groups/is_alive",
    {
      organizationIds: [organizationId],
      terminalGroupIds: [terminalGroupId]
    },
    token
  );
  const groups = Array.isArray(data?.isAliveStatus) ? data.isAliveStatus : [];
  const match = groups.find((entry) => String(entry.terminalGroupId) === String(terminalGroupId));
  return Boolean(match?.isAlive);
}

async function createDelivery(body) {
  const token = await getAccessToken();
  return post("/api/1/deliveries/create", body, token);
}

async function getCommandStatus(organizationId, correlationId) {
  const token = await getAccessToken();
  return post("/api/1/commands/status", { organizationId, correlationId }, token);
}

async function waitForCommand(organizationId, correlationId, options = {}) {
  const maxAttempts = options.maxAttempts || 20;
  const delayMs = options.delayMs || 1000;
  let last = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    last = await getCommandStatus(organizationId, correlationId);
    const state = String(last?.state || "").trim();
    if (state === "Success") return { ok: true, status: last };
    if (state === "Error") {
      return {
        ok: false,
        status: last,
        error: last?.errorDescription || last?.exception?.message || "iiko command failed."
      };
    }
    await sleep(delayMs);
  }
  return { ok: false, status: last, error: "iiko command status timeout." };
}

async function fetchNomenclature(organizationId) {
  const token = await getAccessToken();
  return post("/api/1/nomenclature", { organizationId, startRevision: 0 }, token);
}

async function fetchOrganizations() {
  const token = await getAccessToken();
  return post("/api/1/organizations", {}, token);
}

async function fetchTerminalGroups(organizationIds) {
  const token = await getAccessToken();
  return post("/api/1/terminal_groups", { organizationIds }, token);
}

async function fetchPaymentTypes(organizationIds) {
  const token = await getAccessToken();
  return post("/api/1/payment_types", { organizationIds }, token);
}

function resetTokenCache() {
  tokenCache = { token: null, expiresAt: 0 };
}

module.exports = {
  getAccessToken,
  terminalGroupsIsAlive,
  createDelivery,
  getCommandStatus,
  waitForCommand,
  fetchNomenclature,
  fetchOrganizations,
  fetchTerminalGroups,
  fetchPaymentTypes,
  resetTokenCache
};
