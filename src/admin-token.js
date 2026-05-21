const B64_PREFIX = "b64.";

function hasNonLatin1Chars(value) {
  return /[^\u0000-\u00ff]/u.test(String(value || ""));
}

function encodeAdminTokenForHeader(token) {
  const raw = String(token || "").trim();
  if (!raw) return "";
  if (!hasNonLatin1Chars(raw)) return raw;
  return `${B64_PREFIX}${Buffer.from(raw, "utf8").toString("base64")}`;
}

function decodeAdminTokenFromHeader(headerValue) {
  const raw = String(headerValue || "").trim();
  if (!raw) return "";
  if (!raw.startsWith(B64_PREFIX)) return raw;
  try {
    return Buffer.from(raw.slice(B64_PREFIX.length), "base64").toString("utf8");
  } catch {
    return "";
  }
}

module.exports = {
  encodeAdminTokenForHeader,
  decodeAdminTokenFromHeader
};
