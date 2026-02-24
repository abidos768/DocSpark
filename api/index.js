const app = require("../backend/server");

module.exports = (req, res) => {
  // Ensure Vercel doesn't wait for open handles (pg pool, timers)
  res.on("finish", () => {
    if (res.writableEnded) return;
  });
  app(req, res);
};
