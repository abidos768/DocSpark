const API_BASE_URL = window.location.origin;

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
