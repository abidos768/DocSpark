const API_HOST =
  typeof window !== "undefined" && window.location.hostname
    ? window.location.hostname
    : "localhost";
const API_BASE_URL = `http://${API_HOST}:3000`;

export async function createConversionJob(formData) {
  const response = await fetch(`${API_BASE_URL}/api/convert`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Convert request failed with status ${response.status}`);
  }

  return response.json();
}

export async function getJobStatus(jobId) {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`);
  if (!response.ok) {
    throw new Error(`Status request failed with status ${response.status}`);
  }
  return response.json();
}

export async function getJobInsights(jobId) {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/insights`);
  if (!response.ok) {
    throw new Error(`Insights request failed with status ${response.status}`);
  }
  return response.json();
}

export function getJobDownloadUrl(jobId) {
  return `${API_BASE_URL}/api/jobs/${jobId}/download`;
}

export async function deleteJob(jobId) {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Delete request failed with status ${response.status}`);
  }
  return response.json();
}

export { API_BASE_URL };
