require("dotenv").config();
const fs = require("fs");
const path = require("path");
const {
  encodeAdminTokenForHeader,
  decodeAdminTokenFromHeader
} = require("../src/admin-token");

const envPath = path.join(__dirname, "..", ".env");
const line =
  fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((l) => /^ADMIN_TOKEN=/.test(l)) || "";
const raw = line.slice("ADMIN_TOKEN=".length);
const trimmed = raw.trim();
const header = encodeAdminTokenForHeader(trimmed);
const roundtrip = decodeAdminTokenFromHeader(header) === trimmed;

console.log({
  configured: Boolean(trimmed),
  rawLen: raw.length,
  trimLen: trimmed.length,
  roundtrip,
  hasQuotes: raw.startsWith('"') || raw.startsWith("'"),
  hasNonLatin: /[^\u0000-\u00ff]/u.test(trimmed),
  headerEncoded: header.startsWith("b64.")
});
