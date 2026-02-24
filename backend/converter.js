const fs = require("fs");
const path = require("path");
const db = require("./db");

const IS_VERCEL = !!process.env.VERCEL;
const CONVERTED_DIR = IS_VERCEL ? "/tmp/converted" : path.join(__dirname, "converted");

if (!fs.existsSync(CONVERTED_DIR)) {
  fs.mkdirSync(CONVERTED_DIR, { recursive: true });
}

async function processJob(job) {
  try {
    await db.updateJobStatus(job.id, "processing", 10);

    // Simulate conversion delay (1-3 seconds)
    await delay(1000);
    await db.updateJobStatus(job.id, "processing", 40);

    await delay(500);
    await db.updateJobStatus(job.id, "processing", 70);

    // Copy uploaded file as the "converted" output (mock conversion)
    const ext = job.target_format.toLowerCase();
    const outName = `${job.id}.${ext}`;
    const outPath = path.join(CONVERTED_DIR, outName);
    fs.copyFileSync(job.original_path, outPath);

    await db.updateJobStatus(job.id, "processing", 90);

    // Generate insights if opted in
    if (job.analysis_mode === "convert_plus_insights" && job.analysis_consent === 1) {
      const insights = generateMockInsights(job.original_name);
      await db.saveInsights(job.id, insights);
    }

    await db.markJobDone(job.id, outPath);
  } catch (err) {
    console.error(`Job ${job.id} failed:`, err.message);
    await db.markJobFailed(job.id);
  }
}

function generateMockInsights(filename) {
  return {
    summary: `This document "${filename}" contains structured content including text paragraphs, headings, and data fields. The layout is well-organized with clear sections.`,
    keyFields: [
      { label: "Document Title", value: filename.replace(/\.[^.]+$/, "") },
      { label: "Detected Date", value: new Date().toISOString().split("T")[0] },
      { label: "Estimated Word Count", value: String(Math.floor(Math.random() * 2000) + 200) },
    ],
    redactionHints: [
      { type: "email", value: "example@redacted.com" },
      { type: "phone", value: "+1-555-XXX-XXXX" },
    ],
    qualityScore: {
      layout: Math.floor(Math.random() * 15) + 80,
      textIntegrity: Math.floor(Math.random() * 10) + 88,
      overall: Math.floor(Math.random() * 12) + 85,
    },
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { processJob };
