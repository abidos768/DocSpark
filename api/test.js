module.exports = (req, res) => {
  res.json({ ok: true, env_has_db: !!process.env.DATABASE_URL });
};
