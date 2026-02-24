module.exports = (req, res) => {
  res.json({
    CORS_ORIGINS: process.env.CORS_ORIGINS || "(not set)",
    DATABASE_URL: process.env.DATABASE_URL ? "set" : "missing",
    VERCEL: process.env.VERCEL || "(not set)",
    CHALLENGE_PROVIDER: process.env.CHALLENGE_PROVIDER || "(not set)",
  });
};
