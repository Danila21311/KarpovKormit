/**
 * Опциональная точка входа для serverless (например Vercel): Express через serverless-http.
 * Продакшен на Railway: `npm start` → server.js напрямую.
 */
const serverless = require("serverless-http");
const app = require("../server");

module.exports = serverless(app);
