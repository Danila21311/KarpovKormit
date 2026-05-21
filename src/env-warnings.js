const fs = require("fs");
const path = require("path");

function readAdminTokenFromEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return "";
  const line = fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((entry) => /^ADMIN_TOKEN=/.test(entry));
  if (!line) return "";
  let raw = line.slice("ADMIN_TOKEN=".length).trim();
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    raw = raw.slice(1, -1);
  }
  return raw;
}

function warnAdminTokenEnvIssues(projectRoot = path.join(__dirname, "..")) {
  if (process.env.NODE_ENV === "production") return;
  const envPath = path.join(projectRoot, ".env");
  const raw = readAdminTokenFromEnvFile(envPath);
  const parsed = String(process.env.ADMIN_TOKEN || "").trim();
  if (!raw || raw === parsed) return;

  if (raw.includes("#") && raw.split("#")[0].trim() === parsed) {
    console.warn(
      '[startup] ADMIN_TOKEN в .env обрезан на символе "#". Запишите полный токен в кавычках: ADMIN_TOKEN="ваш_токен"'
    );
    return;
  }

  console.warn(
    "[startup] ADMIN_TOKEN в .env и значение, которое видит сервер, различаются. Проверьте кавычки и спецсимволы в .env."
  );
}

module.exports = { warnAdminTokenEnvIssues, readAdminTokenFromEnvFile };
