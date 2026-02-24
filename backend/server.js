const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const db = require("./db");
const { processJob } = require("./converter");
const { startTTLWorker, removeJobFiles } = require("./ttl");

const app = express();
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const TTL_MINUTES = 30;
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const ALLOWED_INPUT_FORMATS = ["pdf", "docx", "txt"];
const ALLOWED_OUTPUT_FORMATS = ["pdf", "docx", "txt"];
const ALLOWED_PRESETS = ["resume-safe", "print-safe", "mobile-safe"];

// Use /tmp on Vercel (serverless), local dirs otherwise
const IS_VERCEL = !!process.env.VERCEL;
const uploadsDir = IS_VERCEL ? "/tmp/uploads" : path.join(__dirname, "uploads");
const convertedDir = IS_VERCEL ? "/tmp/converted" : path.join(__dirname, "converted");

// -- Middleware --
app.use(cors());
app.use(express.json());

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
app.post("/api/convert", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "File is required" });
  }

  const ext = path.extname(req.file.originalname).replace(".", "").toLowerCase();
  if (!ALLOWED_INPUT_FORMATS.includes(ext)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: `Unsupported input format: ${ext}. Allowed: ${ALLOWED_INPUT_FORMATS.join(", ")}` });
  }

  const targetFormat = (req.body.targetFormat || "").toLowerCase();
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

  // Start async processing (don't await — runs in background)
  processJob(job);

  res.status(201).json({ jobId: job.id, status: job.status });
});

// =============================================
// D-002: GET /api/jobs/:id
// =============================================
app.get("/api/jobs/:id", async (req, res) => {
  const job = await db.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  res.json({ jobId: job.id, status: job.status, progress: job.progress });
});

// =============================================
// D-003: GET /api/jobs/:id/download
// =============================================
app.get("/api/jobs/:id/download", async (req, res) => {
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
app.get("/api/jobs/:id/insights", async (req, res) => {
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
app.delete("/api/jobs/:id", async (req, res) => {
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
    return res.status(413).json({ error: "File exceeds 25 MB limit" });
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
