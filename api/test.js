module.exports = (req, res) => {
  try {
    const app = require("../backend/server");
    res.json({ ok: true, type: typeof app });
  } catch (err) {
    res.json({ ok: false, error: err.message, stack: err.stack });
  }
};
