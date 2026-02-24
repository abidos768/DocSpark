import {
  createConversionJob,
  getJobStatus,
  getJobInsights,
  getJobDownloadUrl,
  deleteJob,
} from "./api.js";

const app = document.getElementById("app");
const THEME_STORAGE_KEY = "docspark-theme";

const routes = {
  "/": renderHome,
  "/convert": renderConvert,
  "/pricing": renderPricing,
  "/privacy": renderPrivacy,
};

window.addEventListener("hashchange", renderRoute);
window.addEventListener("DOMContentLoaded", () => {
  initTheme();
  renderRoute();
});

function getPath() {
  const route = location.hash.replace(/^#/, "") || "/";
  return route.startsWith("/") ? route : `/${route}`;
}

function renderRoute() {
  const path = getPath();
  const render = routes[path] || renderNotFound;
  app.innerHTML = render();
  app.classList.add("fade-in");
  setTimeout(() => app.classList.remove("fade-in"), 450);
  bindEvents(path);
}

function renderHome() {
  return `
    <section class="hero">
      <div>
        <h1>Convert less. Understand more.</h1>
        <p>
          DocSpark is a fast document converter with optional analysis for users who want it.
          Conversion stays simple by default, with extra insights only when consent is given.
        </p>
        <div class="btn-row">
          <a class="btn btn-primary" href="#/convert">Convert a file</a>
          <a class="btn btn-ghost" href="#/privacy">Privacy rules</a>
        </div>
      </div>
      <aside class="hero-panel">
        <span class="tag">Privacy-First</span>
        <h2>No surprise analysis.</h2>
        <p>
          Default mode is convert-only. Smart Output Pack is opt-in and controlled by the user.
        </p>
      </aside>
    </section>
    <section>
      <h2 class="section-title">Why DocSpark feels different</h2>
      <div class="cards">
        <article class="card">
          <h3>Default Simplicity</h3>
          <p>Upload, convert, download. No extra processing unless requested.</p>
        </article>
        <article class="card">
          <h3>Optional Smart Pack</h3>
          <p>Summary, key fields, redaction hints, and quality score only with consent.</p>
        </article>
        <article class="card">
          <h3>Temporary Storage</h3>
          <p>Auto-delete policy keeps converted files short-lived by design.</p>
        </article>
      </div>
    </section>
  `;
}

function renderConvert() {
  return `
    <section class="convert-page">
      <div class="convert-intro">
        <h1 class="section-title">Converter</h1>
        <p>Fast conversion by default, with optional Smart Output Pack only when you opt in.</p>
      </div>

      <div class="convert-layout">
        <form id="convert-form" class="form-grid convert-form" novalidate>
          <div class="field-stack">
            <label>
              File
              <div class="dropzone" id="dropzone" tabindex="0" role="button" aria-label="Drop a file or browse">
                <p class="dropzone-title">Drop your file here</p>
                <p class="dropzone-subtitle">or click to browse</p>
              </div>
              <input id="file" name="file" type="file" class="sr-only-file" />
              <small class="field-hint">Supports PDF, DOCX, TXT up to 25MB.</small>
              <small class="file-pill" id="file-pill">No file selected</small>
              <small class="error" id="file-error"></small>
            </label>
          </div>

          <div class="field-row">
            <label>
              Target Format
              <select id="targetFormat" name="targetFormat">
                <option value="pdf">PDF</option>
                <option value="docx">DOCX</option>
                <option value="txt">TXT</option>
              </select>
            </label>

            <label>
              Preset
              <select id="preset" name="preset">
                <option value="">None</option>
                <option value="resume-safe">Resume-safe</option>
                <option value="print-safe">Print-safe</option>
                <option value="mobile-safe">Mobile-safe</option>
              </select>
            </label>
          </div>

          <div class="field-stack">
            <label>
              Processing Mode
              <select id="analysisMode" name="analysisMode">
                <option value="convert_only">Convert only (default)</option>
                <option value="convert_plus_insights">Convert + Smart Output Pack</option>
              </select>
            </label>
          </div>

          <section class="config-block">
            <h3>Document Configuration</h3>
            <div class="field-row">
              <label>
                Output Name (optional)
                <input id="outputName" name="outputName" type="text" placeholder="e.g. final-report" />
              </label>
              <label>
                Optimize For
                <select id="optimizeFor" name="optimizeFor">
                  <option value="balanced">Balanced</option>
                  <option value="small_size">Small file size</option>
                  <option value="high_quality">High quality</option>
                </select>
              </label>
            </div>
            <div class="field-row">
              <label>
                Page Range (optional)
                <input id="pageRange" name="pageRange" type="text" placeholder="e.g. 1-3,5" />
              </label>
              <label class="inline-toggle">
                <input id="retainMetadata" name="retainMetadata" type="checkbox" />
                Keep original metadata
              </label>
            </div>
          </section>

          <div class="consent-block">
            <label class="consent-row">
              <input id="analysisConsent" name="analysisConsent" type="checkbox" />
              I agree to process this file for optional insights.
            </label>
            <small class="field-hint" id="consent-hint">Enable Smart Output Pack to activate this consent checkbox.</small>
            <small class="error" id="consent-error"></small>
          </div>

          <button class="btn btn-primary" type="submit">Start Conversion</button>
          <p class="success" id="convert-success"></p>
        </form>

        <aside class="convert-sidepanel">
          <h3>What happens next</h3>
          <ul>
            <li>Upload and queue starts immediately</li>
            <li>Live progress updates during processing</li>
            <li>One-click download when conversion completes</li>
          </ul>
          <div class="convert-note">
            <strong>Privacy default:</strong> analysis is disabled unless you explicitly choose Smart Output Pack and provide consent.
          </div>
        </aside>
      </div>
    </section>
  `;
}

function renderPricing() {
  return `
    <section class="about">
      <h1 class="section-title">Pricing</h1>
      <p><strong>Free:</strong> Core conversion with temporary file storage.</p>
      <p><strong>Pro (planned):</strong> Higher file limits and longer retention windows.</p>
    </section>
  `;
}

function renderPrivacy() {
  return `
    <section class="about">
      <h1 class="section-title">Privacy</h1>
      <p>Convert-only is the default mode for every upload.</p>
      <p>Smart Output Pack runs only if you choose insights mode and explicitly consent.</p>
      <p>Files are temporary and auto-deleted by backend TTL policy.</p>
    </section>
  `;
}

function renderNotFound() {
  return `
    <section class="about">
      <h1 class="section-title">Page not found</h1>
      <p>Use the top navigation to continue.</p>
    </section>
  `;
}

function bindEvents(path) {
  if (path !== "/convert") {
    return;
  }

  const form = document.getElementById("convert-form");
  setupConvertFormUx();
  form?.addEventListener("submit", onConvertSubmit);
}

function setupConvertFormUx() {
  const fileInput = document.getElementById("file");
  const dropzone = document.getElementById("dropzone");
  const modeSelect = document.getElementById("analysisMode");
  const consentInput = document.getElementById("analysisConsent");
  const consentBlock = document.querySelector(".consent-block");
  const consentHint = document.getElementById("consent-hint");
  const filePill = document.getElementById("file-pill");
  const submitBtn = document.querySelector("#convert-form button[type=submit]");

  const syncModeState = () => {
    const insightsMode = modeSelect?.value === "convert_plus_insights";
    if (consentInput) {
      consentInput.disabled = !insightsMode;
      if (!insightsMode) {
        consentInput.checked = false;
      }
    }
    if (consentBlock) {
      consentBlock.classList.toggle("is-active", insightsMode);
      consentBlock.classList.toggle("is-disabled", !insightsMode);
    }
    if (consentHint) {
      consentHint.textContent = insightsMode
        ? "Consent is required while Smart Output Pack is enabled."
        : "Enable Smart Output Pack to activate this consent checkbox.";
    }
  };

  const syncFileState = () => {
    const file = fileInput?.files?.[0];
    if (filePill) {
      filePill.textContent = file ? `${file.name} (${Math.ceil(file.size / 1024)} KB)` : "No file selected";
    }
    if (dropzone) {
      dropzone.classList.toggle("has-file", Boolean(file));
    }
    if (submitBtn) {
      submitBtn.disabled = !file;
    }
  };

  const applyDroppedFile = (file) => {
    if (!file || !fileInput) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInput.files = transfer.files;
    syncFileState();
  };

  dropzone?.addEventListener("click", () => fileInput?.click());
  dropzone?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInput?.click();
    }
  });
  dropzone?.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragging");
  });
  dropzone?.addEventListener("dragleave", () => {
    dropzone.classList.remove("is-dragging");
  });
  dropzone?.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragging");
    const dropped = event.dataTransfer?.files?.[0];
    applyDroppedFile(dropped);
  });

  modeSelect?.addEventListener("change", syncModeState);
  fileInput?.addEventListener("change", syncFileState);
  syncModeState();
  syncFileState();
}

function initTheme() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const startingTheme = savedTheme || (systemDark ? "dark" : "light");
  applyTheme(startingTheme);

  const themeToggle = document.getElementById("theme-toggle");
  themeToggle?.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  });
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const toggleLabel = document.getElementById("theme-toggle-label");
  if (toggleLabel) {
    toggleLabel.textContent = theme === "dark" ? "Light Mode" : "Dark Mode";
  }
}

async function onConvertSubmit(event) {
  event.preventDefault();
  clearErrors();

  const fileInput = document.getElementById("file");
  const mode = document.getElementById("analysisMode").value;
  const consent = document.getElementById("analysisConsent").checked;
  const preset = document.getElementById("preset").value;
  const targetFormat = document.getElementById("targetFormat").value;
  const outputName = document.getElementById("outputName")?.value?.trim();
  const optimizeFor = document.getElementById("optimizeFor")?.value;
  const pageRange = document.getElementById("pageRange")?.value?.trim();
  const retainMetadata = document.getElementById("retainMetadata")?.checked;
  const file = fileInput?.files?.[0];

  const errors = {};
  if (!file) {
    errors.file = "Please choose a file.";
  }
  if (mode === "convert_plus_insights" && !consent) {
    errors.consent = "Consent is required to enable Smart Output Pack.";
  }

  if (Object.keys(errors).length) {
    showErrors(errors);
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("targetFormat", targetFormat);
  if (preset) {
    formData.append("preset", preset);
  }
  if (outputName) {
    formData.append("outputName", outputName);
  }
  if (pageRange) {
    formData.append("pageRange", pageRange);
  }
  formData.append("optimizeFor", optimizeFor || "balanced");
  formData.append("retainMetadata", retainMetadata ? "true" : "false");
  formData.append("analysisMode", mode);
  if (mode === "convert_plus_insights") {
    formData.append("analysisConsent", "true");
  }

  const success = document.getElementById("convert-success");
  const submitBtn = event.target.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  submitBtn.textContent = "Uploading...";

  try {
    const result = await createConversionJob(formData);
    success.textContent = `Job queued (${result.jobId.slice(0, 8)}...). Processing...`;

    const job = await pollJobStatus(result.jobId, success);

    if (job.status === "done") {
      renderResult(result.jobId, mode);
    } else {
      success.textContent = "Job failed. Please try again.";
      success.style.color = "var(--error)";
    }
  } catch (error) {
    success.textContent = error.message || "Could not reach backend.";
    success.style.color = "var(--error)";
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Start Conversion";
  }
}

async function pollJobStatus(jobId, statusEl) {
  const POLL_INTERVAL = 800;
  const MAX_POLLS = 150; // 120s timeout
  for (let i = 0; i < MAX_POLLS; i++) {
    const job = await getJobStatus(jobId);
    const pct = job.progress || 0;
    statusEl.textContent = `Processing... ${pct}%`;
    if (job.status === "done" || job.status === "failed") {
      return job;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }
  throw new Error("Processing timed out. Please try again.");
}

function renderResult(jobId, analysisMode) {
  const container = document.getElementById("app");
  const downloadUrl = getJobDownloadUrl(jobId);
  const showInsights = analysisMode === "convert_plus_insights";

  container.innerHTML = `
    <section class="contact">
      <h1 class="section-title">Conversion Complete</h1>
      <div class="result-actions">
        <a class="btn btn-primary" href="${downloadUrl}" download>Download File</a>
        <button class="btn btn-ghost" id="delete-btn">Delete Now</button>
        <a class="btn btn-ghost" href="#/convert">Convert Another</a>
      </div>
      ${showInsights ? '<div id="insights-panel"><p>Loading insights...</p></div>' : ""}
      <p id="result-status"></p>
    </section>
  `;

  document.getElementById("delete-btn").addEventListener("click", async () => {
    const statusEl = document.getElementById("result-status");
    try {
      await deleteJob(jobId);
      statusEl.textContent = "Job deleted.";
      statusEl.style.color = "";
    } catch (e) {
      statusEl.textContent = "Delete failed: " + e.message;
      statusEl.style.color = "var(--error)";
    }
  });

  if (showInsights) {
    loadInsights(jobId);
  }
}

async function loadInsights(jobId) {
  const panel = document.getElementById("insights-panel");
  try {
    const data = await getJobInsights(jobId);
    panel.innerHTML = `
      <div class="cards">
        <article class="card">
          <h3>Summary</h3>
          <p>${escapeHtml(data.summary)}</p>
        </article>
        <article class="card">
          <h3>Key Fields</h3>
          <ul>${data.keyFields.map((f) => `<li><strong>${escapeHtml(f.label)}:</strong> ${escapeHtml(f.value)}</li>`).join("")}</ul>
        </article>
        <article class="card">
          <h3>Redaction Hints</h3>
          <ul>${data.redactionHints.map((h) => `<li><strong>${escapeHtml(h.type)}:</strong> ${escapeHtml(h.value)}</li>`).join("")}</ul>
        </article>
        <article class="card">
          <h3>Quality Score</h3>
          <p>Layout: ${data.qualityScore.layout}% &middot; Text Integrity: ${data.qualityScore.textIntegrity}% &middot; Overall: ${data.qualityScore.overall}%</p>
        </article>
      </div>
    `;
  } catch (e) {
    panel.innerHTML = `<p style="color:var(--error)">Could not load insights: ${escapeHtml(e.message)}</p>`;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function showErrors(errors) {
  if (errors.file) {
    document.getElementById("file-error").textContent = errors.file;
  }
  if (errors.consent) {
    document.getElementById("consent-error").textContent = errors.consent;
  }
}

function clearErrors() {
  ["file-error", "consent-error"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = "";
    }
  });
  const success = document.getElementById("convert-success");
  if (success) {
    success.textContent = "";
    success.style.color = "";
  }
}
