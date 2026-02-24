function resolveApiBaseUrl() {
  const fromGlobal = window.DOCSPARK_API_BASE_URL;
  if (typeof fromGlobal === "string" && fromGlobal.trim()) {
    return fromGlobal.trim().replace(/\/+$/, "");
  }

  const fromStorage = window.localStorage.getItem("docspark-api-base-url");
  if (typeof fromStorage === "string" && fromStorage.trim()) {
    return fromStorage.trim().replace(/\/+$/, "");
  }

  const fromMeta = document.querySelector('meta[name="docspark-api-base-url"]')?.content;
  if (typeof fromMeta === "string" && fromMeta.trim()) {
    return fromMeta.trim().replace(/\/+$/, "");
  }

  // On Vercel, frontend and API share the same origin
  // Locally, backend runs on port 3000
  const loc = window.location;
  if (loc.hostname === "localhost" || loc.hostname === "127.0.0.1") {
    return `${loc.protocol}//${loc.hostname}:3000`;
  }
  return loc.origin;
}

const API_BASE_URL = resolveApiBaseUrl();

async function parseError(response, fallbackPrefix) {
  let details = "";
  try {
    const data = await response.json();
    if (data?.error) {
      details = `: ${data.error}`;
    }
  } catch {
    // ignore json parse errors
  }
  return `${fallbackPrefix} ${response.status}${details}`;
}

export async function createConversionJob(formData) {
  const response = await fetch(`${API_BASE_URL}/api/convert`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await parseError(response, "Convert request failed with status"));
  }

  return response.json();
}

export async function getJobStatus(jobId) {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`);
  if (!response.ok) {
    throw new Error(await parseError(response, "Status request failed with status"));
  }
  return response.json();
}

export async function getJobInsights(jobId) {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/insights`);
  if (!response.ok) {
    throw new Error(await parseError(response, "Insights request failed with status"));
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
  if (response.status === 404) {
    return { success: true };
  }
  if (!response.ok) {
    throw new Error(await parseError(response, "Delete request failed with status"));
  }
  return response.json();
}

export async function createPdfFromHtml(html, filename = "document") {
  const response = await fetch(`${API_BASE_URL}/api/html-to-pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ html, filename }),
  });

  if (!response.ok) {
    throw new Error(await parseError(response, "HTML to PDF request failed with status"));
  }

  return response.blob();
}

export { API_BASE_URL };
