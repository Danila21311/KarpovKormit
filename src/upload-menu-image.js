const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const EXT_BY_MIME = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif"
};
const MAX_BYTES = 5 * 1024 * 1024;

const uploadsDir = path.join(__dirname, "..", "uploads", "menu");

function ensureUploadsDir() {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

function createMenuImageStorage() {
  ensureUploadsDir();
  return {
    destination: uploadsDir,
    filename: (req, file, cb) => {
      const ext = EXT_BY_MIME[file.mimetype] || ".jpg";
      const name = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
      cb(null, name);
    }
  };
}

function menuImageFileFilter(req, file, cb) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    cb(new Error("Допустимы только JPG, PNG, WebP и GIF."));
    return;
  }
  cb(null, true);
}

function publicUrlForUploadedFile(filename) {
  return `/uploads/menu/${filename}`;
}

module.exports = {
  uploadsDir,
  ensureUploadsDir,
  createMenuImageStorage,
  menuImageFileFilter,
  publicUrlForUploadedFile,
  MAX_BYTES,
  ALLOWED_MIME
};
