const { parse } = require("url");
const multipart = require("parse-multipart-data");
const { v4: uuidv4 } = require("uuid");
const db = require("../backend/db");
const { processJob } = require("../backend/converter");

const ALLOWED_INPUT = ["pdf", "docx", "txt"];
const ALLOWED_OUTPUT = ["pdf", "docx", "txt"];
const ALLOWED_PRESETS = ["resume-safe", "print-safe", "mobile-safe"];
const TTL_MINUTES = 30;
const MAX_SIZE = 250 * 1024 * 1024;

module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { pathname } = parse(req.url, true);

  try {
    // Health
    if (pathname === "/api/health" && req.method === "GET") {
      return res.status(200).json({ ok: true, service: "docspark-backend" });
    }

    // POST /api/convert
    if (pathname === "/api/convert" && req.method === "POST") {
      return await handleConvert(req, res);
    }

    // GET /api/jobs/:id
    const jobMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/);
    if (jobMatch && req.method === "GET") {
      const job = await db.getJob(jobMatch[1]);
      if (!job) return res.status(404).json({ error: "Job not found" });
      return res.status(200).json({ jobId: job.id, status: job.status, progress: job.progress });
    }

    // GET /api/jobs/:id/download
    const dlMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/download$/);
    if (dlMatch && req.method === "GET") {
      const job = await db.getJob(dlMatch[1]);
      if (!job) return res.status(404).json({ error: "Job not found" });
      if (job.status !== "done") return res.status(409).json({ error: "Job not yet complete" });
      return res.status(200).json({ error: "File download not available in serverless mode" });
    }

    // GET /api/jobs/:id/insights
    const insMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/insights$/);
    if (insMatch && req.method === "GET") {
      const job = await db.getJob(insMatch[1]);
      if (!job) return res.status(404).json({ error: "Job not found" });
      if (job.analysis_mode === "convert_only") return res.status(409).json({ error: "Convert-only mode" });
      if (job.status !== "done") return res.status(409).json({ error: "Job not yet complete" });
      if (!job.insights) return res.status(404).json({ error: "No insights" });
      return res.status(200).json(JSON.parse(job.insights));
    }

    // DELETE /api/jobs/:id
    if (jobMatch && req.method === "DELETE") {
      const job = await db.getJob(jobMatch[1]);
      if (!job) return res.status(404).json({ error: "Job not found" });
      await db.deleteJob(job.id);
      return res.status(200).json({ success: true });
    }

    return res.status(404).json({ error: "Not found" });
  } catch (err) {
    console.error("API error:", err);
    return res.status(500).json({ error: err.message });
  }
};

async function handleConvert(req, res) {
  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("multipart/form-data")) {
    return res.status(400).json({ error: "Expected multipart/form-data" });
  }

  const boundary = contentType.split("boundary=")[1];
  if (!boundary) return res.status(400).json({ error: "No boundary found" });

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);

  if (body.length > MAX_SIZE) {
    return res.status(413).json({ error: "File exceeds 250 MB limit" });
  }

  const parts = multipart.parse(body, boundary);
  const filePart = parts.find((p) => p.filename);
  if (!filePart) return res.status(400).json({ error: "File is required" });

  const fields = {};
  for (const p of parts) {
    if (!p.filename && p.name) {
      fields[p.name] = p.data.toString();
    }
  }

  const ext = (filePart.filename.split(".").pop() || "").toLowerCase();
  if (!ALLOWED_INPUT.includes(ext)) {
    return res.status(400).json({ error: `Unsupported input: ${ext}` });
  }

  const targetFormat = (fields.targetFormat || "").toLowerCase();
  if (!ALLOWED_OUTPUT.includes(targetFormat)) {
    return res.status(400).json({ error: `Unsupported target: ${targetFormat}` });
  }

  const preset = fields.preset || null;
  if (preset && !ALLOWED_PRESETS.includes(preset)) {
    return res.status(400).json({ error: `Invalid preset: ${preset}` });
  }

  const analysisMode = fields.analysisMode || "convert_only";
  const analysisConsent = fields.analysisConsent === "true";

  if (analysisMode === "convert_plus_insights" && !analysisConsent) {
    return res.status(400).json({ error: "Consent required for insights" });
  }

  // Write file to /tmp
  const fs = require("fs");
  const path = require("path");
  const tmpDir = "/tmp/uploads";
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const tmpPath = path.join(tmpDir, `${uuidv4()}-${filePart.filename}`);
  fs.writeFileSync(tmpPath, filePart.data);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_MINUTES * 60000);
  const jobId = uuidv4();

  const job = await db.createJob({
    id: jobId,
    originalName: filePart.filename,
    originalPath: tmpPath,
    targetFormat,
    preset,
    analysisMode,
    analysisConsent: analysisConsent ? 1 : 0,
    status: "queued",
    progress: 0,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });

  await processJob(job);

  const completed = await db.getJob(job.id);
  return res.status(201).json({ jobId: completed.id, status: completed.status });
}
