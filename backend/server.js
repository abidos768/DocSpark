const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const db = require("./db");
const { processJob } = require("./converter");
const { startTTLWorker, removeJobFiles } = require("./ttl");

const app = express();
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const TTL_MINUTES = 30;
const MAX_FILE_SIZE = 250 * 1024 * 1024; // 250 MB
const ALLOWED_INPUT_FORMATS = ["pdf", "docx", "txt", "html", "md", "rtf", "csv"];
const ALLOWED_OUTPUT_FORMATS = ["pdf", "docx", "txt", "html", "md", "rtf", "csv"];
const ALLOWED_PRESETS = ["resume-safe", "print-safe", "mobile-safe"];
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const CONVERT_RATE_WINDOW_MS = Number(process.env.CONVERT_RATE_WINDOW_MS || 10 * 60 * 1000);
const CONVERT_RATE_MAX = Number(process.env.CONVERT_RATE_MAX || 8);
const READ_RATE_WINDOW_MS = Number(process.env.READ_RATE_WINDOW_MS || 60 * 1000);
const READ_RATE_MAX = Number(process.env.READ_RATE_MAX || 120);
const MAX_ACTIVE_CONVERSIONS_PER_IP = Number(process.env.MAX_ACTIVE_CONVERSIONS_PER_IP || 2);
const CHALLENGE_PROVIDER = (process.env.CHALLENGE_PROVIDER || "none").toLowerCase();
const CHALLENGE_SECRET_KEY = process.env.CHALLENGE_SECRET_KEY || "";
const DUPLICATE_WINDOW_MS = Number(process.env.DUPLICATE_WINDOW_MS || 2 * 60 * 1000);

// Use /tmp on Vercel (serverless), local dirs otherwise
const IS_VERCEL = !!process.env.VERCEL;
const uploadsDir = IS_VERCEL ? "/tmp/uploads" : path.join(__dirname, "uploads");
const convertedDir = IS_VERCEL ? "/tmp/converted" : path.join(__dirname, "converted");
const rateBuckets = new Map();
const activeConversionsByIp = new Map();
const recentFingerprints = new Map();

function normalizeFormat(format) {
  const normalized = String(format || "").trim().toLowerCase();
  if (normalized === "htm") return "html";
  if (normalized === "markdown") return "md";
  return normalized;
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function createRateLimiter({ bucketKey, windowMs, maxRequests }) {
  return (req, res, next) => {
    const ip = getClientIp(req);
    const key = `${bucketKey}:${ip}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key) || { resetAt: now + windowMs, hits: 0 };

    if (now > bucket.resetAt) {
      bucket.hits = 0;
      bucket.resetAt = now + windowMs;
    }

    bucket.hits += 1;
    rateBuckets.set(key, bucket);

    if (bucket.hits > maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      auditSecurityEvent("rate_limited", req, {
        bucketKey,
        hits: bucket.hits,
        maxRequests,
        retryAfterSeconds,
      });
      return res.status(429).json({
        error: "Too many requests. Please wait and try again.",
      });
    }

    next();
  };
}

function limitActiveConversions(req, res, next) {
  const ip = getClientIp(req);
  const active = activeConversionsByIp.get(ip) || 0;
  if (active >= MAX_ACTIVE_CONVERSIONS_PER_IP) {
    auditSecurityEvent("active_conversion_limit", req, {
      active,
      maxActive: MAX_ACTIVE_CONVERSIONS_PER_IP,
    });
    return res.status(429).json({
      error: "Too many active conversions from this IP. Please wait for current jobs to finish.",
    });
  }

  activeConversionsByIp.set(ip, active + 1);
  res.on("finish", () => {
    const current = activeConversionsByIp.get(ip) || 0;
    if (current <= 1) {
      activeConversionsByIp.delete(ip);
      return;
    }
    activeConversionsByIp.set(ip, current - 1);
  });
  next();
}

function auditSecurityEvent(event, req, details = {}) {
  const payload = {
    ts: new Date().toISOString(),
    event,
    ip: getClientIp(req),
    method: req.method,
    path: req.path,
    userAgent: req.get("user-agent") || "unknown",
    ...details,
  };
  console.warn(`[SECURITY] ${JSON.stringify(payload)}`);
}

function buildFingerprintKey(ip, hash) {
  return `${ip}:${hash}`;
}

function rememberFingerprint(ip, hash) {
  recentFingerprints.set(buildFingerprintKey(ip, hash), Date.now() + DUPLICATE_WINDOW_MS);
}

function isRecentDuplicate(ip, hash) {
  const key = buildFingerprintKey(ip, hash);
  const expiresAt = recentFingerprints.get(key);
  if (!expiresAt) return false;
  if (expiresAt < Date.now()) {
    recentFingerprints.delete(key);
    return false;
  }
  return true;
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function verifyChallengeToken(req) {
  if (CHALLENGE_PROVIDER === "none") {
    return { ok: true };
  }

  if (!CHALLENGE_SECRET_KEY) {
    return { ok: false, reason: "challenge_not_configured" };
  }

  const token = typeof req.body.challengeToken === "string" ? req.body.challengeToken : "";
  if (!token) {
    return { ok: false, reason: "missing_challenge_token" };
  }

  let endpoint = "";
  if (CHALLENGE_PROVIDER === "turnstile") {
    endpoint = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
  } else if (CHALLENGE_PROVIDER === "hcaptcha") {
    endpoint = "https://hcaptcha.com/siteverify";
  } else {
    return { ok: false, reason: "unsupported_challenge_provider" };
  }

  try {
    const body = new URLSearchParams({
      secret: CHALLENGE_SECRET_KEY,
      response: token,
      remoteip: getClientIp(req),
    });
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const data = await response.json();
    if (data?.success) {
      return { ok: true };
    }
    return {
      ok: false,
      reason: "challenge_failed",
      errorCodes: Array.isArray(data?.["error-codes"]) ? data["error-codes"] : [],
    };
  } catch {
    return { ok: false, reason: "challenge_service_unavailable" };
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets.entries()) {
    if (bucket.resetAt < now) {
      rateBuckets.delete(key);
    }
  }
}, 60 * 1000).unref();

setInterval(() => {
  const now = Date.now();
  for (const [key, expiresAt] of recentFingerprints.entries()) {
    if (expiresAt < now) {
      recentFingerprints.delete(key);
    }
  }
}, 60 * 1000).unref();

// -- Middleware --
app.set("trust proxy", 1);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || CORS_ORIGINS.length === 0 || CORS_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
  })
);
app.use(express.json());
const convertLimiter = createRateLimiter({
  bucketKey: "convert",
  windowMs: CONVERT_RATE_WINDOW_MS,
  maxRequests: CONVERT_RATE_MAX,
});
const readLimiter = createRateLimiter({
  bucketKey: "read",
  windowMs: READ_RATE_WINDOW_MS,
  maxRequests: READ_RATE_MAX,
});

// -- Ensure dirs exist --
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(convertedDir)) {
  fs.mkdirSync(convertedDir, { recursive: true });
}

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: MAX_FILE_SIZE },
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "docspark-backend" });
});

// =============================================
// D-001: POST /api/convert
// =============================================
app.post("/api/convert", convertLimiter, limitActiveConversions, upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "File is required" });
  }

  if (req.file.originalname.length > 255) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "Filename is too long." });
  }

  const ext = normalizeFormat(path.extname(req.file.originalname).replace(".", ""));
  if (!ALLOWED_INPUT_FORMATS.includes(ext)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: `Unsupported input format: ${ext}. Allowed: ${ALLOWED_INPUT_FORMATS.join(", ")}` });
  }

  const targetFormat = normalizeFormat(req.body.targetFormat || "");
  if (!ALLOWED_OUTPUT_FORMATS.includes(targetFormat)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: `Unsupported target format: ${targetFormat}. Allowed: ${ALLOWED_OUTPUT_FORMATS.join(", ")}` });
  }

  const preset = req.body.preset || null;
  if (preset && !ALLOWED_PRESETS.includes(preset)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: `Invalid preset: ${preset}. Allowed: ${ALLOWED_PRESETS.join(", ")}` });
  }

  const analysisMode = req.body.analysisMode || "convert_only";
  if (!["convert_only", "convert_plus_insights"].includes(analysisMode)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "analysisMode must be 'convert_only' or 'convert_plus_insights'" });
  }

  const analysisConsent = req.body.analysisConsent === "true" || req.body.analysisConsent === true;
  if (analysisMode === "convert_plus_insights" && !analysisConsent) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "analysisConsent is required when analysisMode is 'convert_plus_insights'" });
  }

  const challenge = await verifyChallengeToken(req);
  if (!challenge.ok) {
    fs.unlinkSync(req.file.path);
    auditSecurityEvent("challenge_rejected", req, {
      reason: challenge.reason,
      errorCodes: challenge.errorCodes || [],
    });
    return res.status(403).json({ error: "Verification failed. Please try again." });
  }

  const ip = getClientIp(req);
  const fingerprint = await hashFile(req.file.path);
  if (isRecentDuplicate(ip, fingerprint)) {
    fs.unlinkSync(req.file.path);
    auditSecurityEvent("duplicate_upload_blocked", req, {
      fingerprint: fingerprint.slice(0, 16),
      windowMs: DUPLICATE_WINDOW_MS,
    });
    return res.status(429).json({ error: "Duplicate upload detected. Please wait before retrying the same file." });
  }
  rememberFingerprint(ip, fingerprint);

  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TTL_MINUTES * 60_000);
    const jobId = uuidv4();

    const job = await db.createJob({
      id: jobId,
      originalName: req.file.originalname,
      originalPath: req.file.path,
      targetFormat,
      preset,
      analysisMode,
      analysisConsent: analysisConsent ? 1 : 0,
      status: "queued",
      progress: 0,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });

    // Await processing — required for Vercel serverless (function freezes after response)
    await processJob(job);

    const completed = await db.getJob(job.id);
    res.status(201).json({ jobId: completed.id, status: completed.status });
  } catch (err) {
    console.error("Convert error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

// =============================================
// D-002: GET /api/jobs/:id
// =============================================
app.get("/api/jobs/:id", readLimiter, async (req, res) => {
  const job = await db.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  res.json({ jobId: job.id, status: job.status, progress: job.progress });
});

// =============================================
// D-003: GET /api/jobs/:id/download
// =============================================
app.get("/api/jobs/:id/download", readLimiter, async (req, res) => {
  const job = await db.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  if (job.status !== "done") {
    return res.status(409).json({ error: "Job is not yet complete", status: job.status });
  }
  if (!job.converted_path || !fs.existsSync(job.converted_path)) {
    return res.status(410).json({ error: "Converted file no longer available" });
  }

  const downloadName = job.original_name.replace(/\.[^.]+$/, `.${job.target_format}`);
  res.download(job.converted_path, downloadName);
});

// =============================================
// D-004: GET /api/jobs/:id/insights
// =============================================
app.get("/api/jobs/:id/insights", readLimiter, async (req, res) => {
  const job = await db.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  if (job.analysis_mode === "convert_only") {
    return res.status(409).json({ error: "This job was created in convert-only mode. Insights are not available." });
  }
  if (job.status !== "done") {
    return res.status(409).json({ error: "Job is not yet complete", status: job.status });
  }
  if (!job.insights) {
    return res.status(404).json({ error: "Insights not available for this job" });
  }

  res.json(JSON.parse(job.insights));
});

// =============================================
// D-005: DELETE /api/jobs/:id
// =============================================
app.delete("/api/jobs/:id", readLimiter, async (req, res) => {
  const job = await db.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  removeJobFiles(job);
  await db.deleteJob(job.id);
  res.json({ success: true });
});

// -- Error handler for multer file-size limit --
app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File exceeds 250 MB limit" });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

// -- Start server only when not on Vercel --
if (!IS_VERCEL) {
  app.listen(PORT, HOST, () => {
    console.log(`[DocSpark] Backend running on http://${HOST}:${PORT}`);
    startTTLWorker();
  });
}

module.exports = app;
