const { parse } = require("url");
const multipart = require("parse-multipart-data");
const { v4: uuidv4 } = require("uuid");
const db = require("../backend/db");
const { processJob, generatePdfBufferFromHtml } = require("../backend/converter");

const ALLOWED_INPUT = ["pdf", "docx", "txt", "html", "htm", "md", "rtf", "csv"];
const ALLOWED_OUTPUT = ["pdf", "docx", "txt", "html", "md", "rtf", "csv"];
const ALLOWED_PRESETS = ["resume-safe", "print-safe", "mobile-safe"];
const TTL_MINUTES = 30;
const MAX_SIZE = 250 * 1024 * 1024;

function toPublicFailureMessage(reason) {
  const text = String(reason || "");
  if (!text) return "Conversion could not be completed. Please try another format pair.";
  if (text.includes("Unsupported conversion")) return "This format pair is not available right now.";
  if (
    text.includes("serverless_pdf_failed") ||
    text.includes("pandoc_not_installed") ||
    text.includes("soffice_not_installed") ||
    text.includes("No conversion engine available")
  ) {
    return "This conversion is temporarily unavailable. Please try a different format pair.";
  }
  return "Conversion failed. Please try again.";
}

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

    // POST /api/html-to-pdf
    if (pathname === "/api/html-to-pdf" && req.method === "POST") {
      return await handleHtmlToPdf(req, res);
    }

    // GET /api/jobs/:id
    const jobMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/);
    if (jobMatch && req.method === "GET") {
      const job = await db.getJob(jobMatch[1]);
      if (!job) return res.status(404).json({ error: "Job not found" });
      return res.status(200).json({
        jobId: job.id,
        status: job.status,
        progress: job.progress,
        failureReason: toPublicFailureMessage(job.failure_reason),
      });
    }

    // GET /api/jobs/:id/download
    const dlMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/download$/);
    if (dlMatch && req.method === "GET") {
      const job = await db.getJob(dlMatch[1]);
      if (!job) return res.status(404).json({ error: "Job not found" });
      if (job.status !== "done") return res.status(409).json({ error: "Job not yet complete" });

      if (!job.converted_data) {
        return res.status(410).json({ error: "Converted file no longer available" });
      }

      const fileBuffer = Buffer.from(job.converted_data, "base64");
      const downloadName = job.original_name.replace(/\.[^.]+$/, `.${job.target_format}`);
      const mimeMap = {
        pdf: "application/pdf",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        txt: "text/plain",
        html: "text/html",
        md: "text/markdown",
        rtf: "application/rtf",
        csv: "text/csv",
      };
      const contentType = mimeMap[job.target_format] || "application/octet-stream";

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
      res.setHeader("Content-Length", String(fileBuffer.length));
      return res.status(200).send(fileBuffer);
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
    return res.status(500).json({ error: "Internal server error" });
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

  let ext = (filePart.filename.split(".").pop() || "").toLowerCase();
  if (ext === "htm") ext = "html";
  if (ext === "markdown") ext = "md";
  if (!ALLOWED_INPUT.includes(ext)) {
    return res.status(400).json({ error: `Unsupported input: ${ext}` });
  }

  let targetFormat = (fields.targetFormat || "").toLowerCase();
  if (targetFormat === "htm") targetFormat = "html";
  if (targetFormat === "markdown") targetFormat = "md";
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
  if (completed.status !== "done") {
    return res.status(422).json({
      error: toPublicFailureMessage(completed.failure_reason),
      jobId: completed.id,
      status: completed.status,
    });
  }
  return res.status(201).json({ jobId: completed.id, status: completed.status });
}

async function handleHtmlToPdf(req, res) {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    return res.status(400).json({ error: "Expected application/json body with { html }" });
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const html = typeof payload?.html === "string" ? payload.html : "";
  if (!html.trim()) {
    return res.status(400).json({ error: "html (string) is required" });
  }

  const requestedName = typeof payload?.filename === "string" ? payload.filename.trim() : "";
  const safeBaseName = (requestedName || "document").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "document";

  try {
    const pdfBuffer = await generatePdfBufferFromHtml(html);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=\"${safeBaseName}.pdf\"`);
    res.setHeader("Content-Length", String(pdfBuffer.length));
    return res.status(200).send(pdfBuffer);
  } catch (err) {
    const reason = String(err?.message || "");
    if (reason.includes("serverless_pdf_runtime_missing")) {
      return res.status(503).json({ error: "PDF runtime is not available on this server." });
    }
    console.error("html-to-pdf error:", err);
    return res.status(500).json({ error: "Failed to generate PDF" });
  }
}
