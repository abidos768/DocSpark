const fs = require("fs");
const db = require("./db");

const TTL_CHECK_INTERVAL_MS = 60_000; // check every minute

function startTTLWorker() {
  const timer = setInterval(cleanExpiredJobs, TTL_CHECK_INTERVAL_MS);
  timer.unref();
  console.log("[TTL] Cleanup worker started (interval: 60s)");
  return timer;
}

async function cleanExpiredJobs() {
  try {
    const expired = await db.getExpiredJobs();
    for (const job of expired) {
      removeJobFiles(job);
      await db.deleteJob(job.id);
      console.log(`[TTL] Deleted expired job ${job.id}`);
    }
    if (expired.length > 0) {
      console.log(`[TTL] Cleaned ${expired.length} expired job(s)`);
    }
  } catch (err) {
    console.error("[TTL] Cleanup error:", err.message);
  }
}

function removeJobFiles(job) {
  tryUnlink(job.original_path);
  tryUnlink(job.converted_path);
}

function tryUnlink(filePath) {
  if (!filePath) return;
  try {
    fs.unlinkSync(filePath);
  } catch {
    // file already gone, ignore
  }
}

module.exports = { startTTLWorker, cleanExpiredJobs, removeJobFiles };
