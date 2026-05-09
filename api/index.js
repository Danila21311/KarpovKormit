/**
 * Точка входа Vercel: Express как одна serverless-функция.
 * Локально по-прежнему `npm start` → server.js.
 */
const serverless = require("serverless-http");
const app = require("../server");

module.exports = serverless(app);
