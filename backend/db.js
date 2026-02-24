require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function createJob(job) {
  const row = {
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
  };

  const { error } = await supabase.from("jobs").insert(row);
  if (error) throw new Error(`createJob failed: ${error.message}`);

  return getJob(job.id);
}

async function getJob(id) {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .single();

  if (error && error.code === "PGRST116") return null;
  if (error) throw new Error(`getJob failed: ${error.message}`);
  return data;
}

async function updateJobStatus(id, status, progress) {
  const { error } = await supabase
    .from("jobs")
    .update({ status, progress })
    .eq("id", id);

  if (error) throw new Error(`updateJobStatus failed: ${error.message}`);
}

async function markJobDone(id, convertedPath) {
  const { error } = await supabase
    .from("jobs")
    .update({ converted_path: convertedPath, status: "done", progress: 100 })
    .eq("id", id);

  if (error) throw new Error(`markJobDone failed: ${error.message}`);
}

async function markJobFailed(id) {
  const { error } = await supabase
    .from("jobs")
    .update({ status: "failed" })
    .eq("id", id);

  if (error) throw new Error(`markJobFailed failed: ${error.message}`);
}

async function saveInsights(id, insights) {
  const { error } = await supabase
    .from("jobs")
    .update({ insights: JSON.stringify(insights) })
    .eq("id", id);

  if (error) throw new Error(`saveInsights failed: ${error.message}`);
}

async function deleteJob(id) {
  const job = await getJob(id);
  if (!job) return null;

  const { error } = await supabase.from("jobs").delete().eq("id", id);
  if (error) throw new Error(`deleteJob failed: ${error.message}`);

  return job;
}

async function getExpiredJobs() {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .lte("expires_at", new Date().toISOString());

  if (error) throw new Error(`getExpiredJobs failed: ${error.message}`);
  return data || [];
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
