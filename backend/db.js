require("dotenv").config();
const { Client } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const sslOption = process.env.PGSSL_DISABLE === "true" ? false : { rejectUnauthorized: false };
let schemaInitialized = false;

async function getClient() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: sslOption,
  });
  await client.connect();
  return client;
}

async function query(sql, params) {
  const client = await getClient();
  try {
    return await client.query(sql, params);
  } finally {
    await client.end();
  }
}

async function ensureSchema() {
  if (schemaInitialized) return;
  await query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      original_name TEXT NOT NULL,
      original_path TEXT NOT NULL,
      converted_path TEXT,
      target_format TEXT NOT NULL,
      preset TEXT,
      analysis_mode TEXT NOT NULL,
      analysis_consent INTEGER NOT NULL DEFAULT 0,
      insights TEXT,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      failure_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_expires_at ON jobs (expires_at);
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS failure_reason TEXT;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS converted_data TEXT;
  `);
  schemaInitialized = true;
}

async function createJob(job) {
  await ensureSchema();
  await query(
    `INSERT INTO jobs (id, original_name, original_path, target_format, preset,
                       analysis_mode, analysis_consent, status, progress,
                       created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      job.id,
      job.originalName,
      job.originalPath,
      job.targetFormat,
      job.preset,
      job.analysisMode,
      job.analysisConsent,
      job.status,
      job.progress,
      job.createdAt,
      job.expiresAt,
    ]
  );
  return getJob(job.id);
}

async function getJob(id) {
  await ensureSchema();
  const { rows } = await query("SELECT * FROM jobs WHERE id = $1", [id]);
  return rows[0] || null;
}

async function updateJobStatus(id, status, progress) {
  await ensureSchema();
  await query("UPDATE jobs SET status = $1, progress = $2 WHERE id = $3", [status, progress, id]);
}

async function markJobDone(id, convertedPath, convertedDataBase64) {
  await ensureSchema();
  await query(
    "UPDATE jobs SET converted_path = $1, status = 'done', progress = 100, failure_reason = NULL, converted_data = $2 WHERE id = $3",
    [convertedPath, convertedDataBase64 || null, id]
  );
}

async function markJobFailed(id, reason) {
  await ensureSchema();
  await query("UPDATE jobs SET status = 'failed', failure_reason = $1 WHERE id = $2", [reason || "Conversion failed.", id]);
}

async function saveInsights(id, insights) {
  await ensureSchema();
  await query("UPDATE jobs SET insights = $1 WHERE id = $2", [JSON.stringify(insights), id]);
}

async function deleteJob(id) {
  await ensureSchema();
  const job = await getJob(id);
  if (!job) return null;
  await query("DELETE FROM jobs WHERE id = $1", [id]);
  return job;
}

async function getExpiredJobs() {
  await ensureSchema();
  const { rows } = await query("SELECT * FROM jobs WHERE expires_at <= $1", [new Date().toISOString()]);
  return rows;
}

module.exports = {
  createJob,
  getJob,
  updateJobStatus,
  markJobDone,
  markJobFailed,
  saveInsights,
  deleteJob,
  getExpiredJobs,
};