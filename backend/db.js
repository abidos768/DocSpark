const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "docspark.db");
const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");

db.exec(`
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
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_jobs_expires_at ON jobs(expires_at);
`);

const insertJobStmt = db.prepare(`
  INSERT INTO jobs (
    id,
    original_name,
    original_path,
    target_format,
    preset,
    analysis_mode,
    analysis_consent,
    status,
    progress,
    created_at,
    expires_at
  )
  VALUES (
    @id,
    @original_name,
    @original_path,
    @target_format,
    @preset,
    @analysis_mode,
    @analysis_consent,
    @status,
    @progress,
    @created_at,
    @expires_at
  )
`);

const getJobStmt = db.prepare(`SELECT * FROM jobs WHERE id = ?`);
const updateStatusStmt = db.prepare(`
  UPDATE jobs
  SET status = ?, progress = ?
  WHERE id = ?
`);
const markDoneStmt = db.prepare(`
  UPDATE jobs
  SET converted_path = ?, status = 'done', progress = 100
  WHERE id = ?
`);
const markFailedStmt = db.prepare(`
  UPDATE jobs
  SET status = 'failed'
  WHERE id = ?
`);
const saveInsightsStmt = db.prepare(`
  UPDATE jobs
  SET insights = ?
  WHERE id = ?
`);
const deleteJobStmt = db.prepare(`DELETE FROM jobs WHERE id = ?`);
const expiredJobsStmt = db.prepare(`
  SELECT * FROM jobs
  WHERE expires_at <= ?
`);

async function createJob(job) {
  insertJobStmt.run({
    id: job.id,
    original_name: job.originalName,
    original_path: job.originalPath,
    target_format: job.targetFormat,
    preset: job.preset,
    analysis_mode: job.analysisMode,
    analysis_consent: job.analysisConsent,
    status: job.status,
    progress: job.progress,
    created_at: job.createdAt,
    expires_at: job.expiresAt,
  });
  return getJob(job.id);
}

async function getJob(id) {
  return getJobStmt.get(id) || null;
}

async function updateJobStatus(id, status, progress) {
  updateStatusStmt.run(status, progress, id);
}

async function markJobDone(id, convertedPath) {
  markDoneStmt.run(convertedPath, id);
}

async function markJobFailed(id) {
  markFailedStmt.run(id);
}

async function saveInsights(id, insights) {
  saveInsightsStmt.run(JSON.stringify(insights), id);
}

async function deleteJob(id) {
  const job = await getJob(id);
  if (!job) return null;
  deleteJobStmt.run(id);
  return job;
}

async function getExpiredJobs() {
  return expiredJobsStmt.all(new Date().toISOString());
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
