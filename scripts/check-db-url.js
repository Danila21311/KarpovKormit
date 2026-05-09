/**
 * Prints parsed DATABASE_URL (no password) to verify host/user/port.
 * Run: node scripts/check-db-url.js
 */
require("dotenv").config();

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(raw);
} catch {
  console.error(
    "DATABASE_URL is not a valid URL. If the password has @ # % & + etc., encode it (e.g. @ -> %40)."
  );
  process.exit(1);
}

console.log("Host:    ", parsed.hostname);
console.log("Port:    ", parsed.port || "(default)");
console.log("User:    ", decodeURIComponent(parsed.username || ""));
console.log("DB path: ", parsed.pathname);
console.log("Query:   ", parsed.search || "(none)");

if (!parsed.password) {
  console.warn("Warning: no password segment in URL — check [YOUR-PASSWORD] was replaced.");
}
