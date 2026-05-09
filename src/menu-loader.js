const fs = require("fs/promises");

async function loadMenuItems(filePath) {
  const source = await fs.readFile(filePath, "utf8");
  const match = source.match(/const\s+menuItems\s*=\s*(\[[\s\S]*\]);?\s*$/);
  if (!match) {
    throw new Error("menuItems not found in menu-data.js");
  }
  return JSON.parse(match[1]);
}

module.exports = { loadMenuItems };
