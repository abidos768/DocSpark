require("dotenv").config();
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL_DISABLE === "true" ? false : { rejectUnauthorized: false },
});

const schemaReady = pool.query(`
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
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_jobs_expires_at ON jobs (expires_at);
`);

async function ready() {
  await schemaReady;
}

async function createJob(job) {
  await ready();
  await pool.query(
    `INSERT INTO jobs (id, original_name, original_path, target_format, preset,
                       analysis_mode, analysis_consent, status, progress,
                       created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      job.id, job.originalName, job.originalPath, job.targetFormat, job.preset,
      job.analysisMode, job.analysisConsent, job.status, job.progress,
      job.createdAt, job.expiresAt,
    ]
  );
  return getJob(job.id);
}

async function getJob(id) {
  await ready();
  const { rows } = await pool.query("SELECT * FROM jobs WHERE id = $1", [id]);
  return rows[0] || null;
}

async function updateJobStatus(id, status, progress) {
  await ready();
  await pool.query(
    "UPDATE jobs SET status = $1, progress = $2 WHERE id = $3",
    [status, progress, id]
  );
}

async function markJobDone(id, convertedPath) {
  await ready();
  await pool.query(
    "UPDATE jobs SET converted_path = $1, status = 'done', progress = 100 WHERE id = $2",
    [convertedPath, id]
  );
}

async function markJobFailed(id) {
  await ready();
  await pool.query("UPDATE jobs SET status = 'failed' WHERE id = $1", [id]);
}

async function saveInsights(id, insights) {
  await ready();
  await pool.query("UPDATE jobs SET insights = $1 WHERE id = $2", [
    JSON.stringify(insights),
    id,
  ]);
}

async function deleteJob(id) {
  await ready();
  const job = await getJob(id);
  if (!job) return null;
  await pool.query("DELETE FROM jobs WHERE id = $1", [id]);
  return job;
}

async function getExpiredJobs() {
  await ready();
  const { rows } = await pool.query(
    "SELECT * FROM jobs WHERE expires_at <= $1",
    [new Date().toISOString()]
  );
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
