import {
  createConversionJob,
  getJobStatus,
  getJobInsights,
  getJobDownloadUrl,
  deleteJob,
} from "./api.js";

const app = document.getElementById("app");
const THEME_STORAGE_KEY = "docspark-theme";
const CHALLENGE_KEY_STORAGE = "docspark-turnstile-site-key";
const challengeState = {
  siteKey: null,
  token: "",
  widgetId: null,
  scriptPromise: null,
};

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
    <section class="mini-band">
      <div class="mini-band-item">
        <h3>Fast by Design</h3>
        <p>Most conversions complete in seconds with live status updates.</p>
      </div>
      <div class="mini-band-item">
        <h3>Consent by Default</h3>
        <p>Smart Output Pack never runs unless you actively enable it.</p>
      </div>
      <div class="mini-band-item">
        <h3>Built for Real Work</h3>
        <p>Presets and configuration options keep output consistent across teams.</p>
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
              <small class="field-hint">Supports PDF, DOCX, TXT, HTML, MD, RTF, CSV up to 250MB.</small>
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
                <option value="html">HTML</option>
                <option value="md">MD</option>
                <option value="rtf">RTF</option>
                <option value="csv">CSV</option>
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

          <div class="challenge-block" id="challenge-block">
            <label>Verification</label>
            <div id="challenge-widget"></div>
            <small class="field-hint" id="challenge-hint">Complete the human verification to prevent spam.</small>
            <small class="error" id="challenge-error"></small>
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
    <section class="about pricing-page">
      <h1 class="section-title">Pricing</h1>
      <p>Start free, then scale when your workflow needs higher limits.</p>
      <div class="pricing-grid">
        <article class="pricing-card">
          <span class="tag">Current</span>
          <h3>Free</h3>
          <p class="pricing-price">$0</p>
          <ul>
            <li>Core format conversion</li>
            <li>Consent-based Smart Output Pack</li>
            <li>Temporary secure storage</li>
          </ul>
        </article>
        <article class="pricing-card">
          <span class="tag tag-alt">Planned</span>
          <h3>Pro</h3>
          <p class="pricing-price">$19<span>/month</span></p>
          <ul>
            <li>Higher file-size thresholds</li>
            <li>Longer retention windows</li>
            <li>Priority processing queue</li>
          </ul>
        </article>
      </div>
    </section>
  `;
}

function renderPrivacy() {
  return `
    <section class="about privacy-page">
      <h1 class="section-title">Privacy</h1>
      <p>Privacy controls are part of the product, not a hidden setting.</p>
      <div class="privacy-list">
        <article class="privacy-item">
          <h3>Convert-Only Default</h3>
          <p>Every upload starts in convert-only mode automatically.</p>
        </article>
        <article class="privacy-item">
          <h3>Explicit Opt-In</h3>
          <p>Smart Output Pack is available only after mode selection and consent.</p>
        </article>
        <article class="privacy-item">
          <h3>Time-Limited Storage</h3>
          <p>Temporary files are auto-removed by TTL cleanup policy.</p>
        </article>
      </div>
    </section>
  `;
}

function renderNotFound() {
  return `
    <section class="about notfound-page">
      <h1 class="section-title">Page not found</h1>
      <p>Use the top navigation to continue.</p>
      <div class="btn-row">
        <a class="btn btn-primary" href="#/">Back to Home</a>
        <a class="btn btn-ghost" href="#/convert">Open Converter</a>
      </div>
    </section>
  `;
}

function bindEvents(path) {
  if (path !== "/convert") {
    return;
  }

  const form = document.getElementById("convert-form");
  setupConvertFormUx();
  setupChallengeWidget();
  form?.addEventListener("submit", onConvertSubmit);
}

function resolveChallengeSiteKey() {
  const fromGlobal = window.DOCSPARK_TURNSTILE_SITE_KEY;
  if (typeof fromGlobal === "string" && fromGlobal.trim()) {
    return fromGlobal.trim();
  }
  const fromStorage = window.localStorage.getItem(CHALLENGE_KEY_STORAGE);
  if (typeof fromStorage === "string" && fromStorage.trim()) {
    return fromStorage.trim();
  }
  const fromMeta = document.querySelector('meta[name="docspark-turnstile-site-key"]')?.content;
  if (typeof fromMeta === "string" && fromMeta.trim()) {
    return fromMeta.trim();
  }
  return "";
}

function loadTurnstileScript() {
  if (window.turnstile) {
    return Promise.resolve();
  }
  if (challengeState.scriptPromise) {
    return challengeState.scriptPromise;
  }
  challengeState.scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load verification widget."));
    document.head.appendChild(script);
  });
  return challengeState.scriptPromise;
}

function setupChallengeWidget() {
  const block = document.getElementById("challenge-block");
  const hint = document.getElementById("challenge-hint");
  const widget = document.getElementById("challenge-widget");

  challengeState.siteKey = resolveChallengeSiteKey();
  challengeState.token = "";
  challengeState.widgetId = null;

  if (!block || !widget) return;
  if (!challengeState.siteKey) {
    block.classList.add("is-hidden");
    return;
  }

  block.classList.remove("is-hidden");
  widget.innerHTML = "";

  loadTurnstileScript()
    .then(() => {
      if (!window.turnstile || challengeState.widgetId !== null) {
        return;
      }
      challengeState.widgetId = window.turnstile.render(widget, {
        sitekey: challengeState.siteKey,
        callback: (token) => {
          challengeState.token = token;
          const challengeError = document.getElementById("challenge-error");
          if (challengeError) challengeError.textContent = "";
        },
        "expired-callback": () => {
          challengeState.token = "";
        },
        "error-callback": () => {
          challengeState.token = "";
        },
      });
    })
    .catch(() => {
      if (hint) {
        hint.textContent = "Verification widget failed to load. Refresh and try again.";
      }
    });
}

function resetChallengeWidget() {
  challengeState.token = "";
  if (window.turnstile && challengeState.widgetId !== null) {
    window.turnstile.reset(challengeState.widgetId);
  }
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

  dropzone?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!fileInput) return;
    // Reset so choosing the same file again still triggers "change".
    fileInput.value = "";
    fileInput.click();
  });
  dropzone?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!fileInput) return;
      fileInput.value = "";
      fileInput.click();
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
  if (challengeState.siteKey && !challengeState.token) {
    errors.challenge = "Please complete verification.";
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
  if (challengeState.token) {
    formData.append("challengeToken", challengeState.token);
  }
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
    if (challengeState.siteKey) {
      resetChallengeWidget();
    }
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
  if (errors.challenge) {
    document.getElementById("challenge-error").textContent = errors.challenge;
  }
}

function clearErrors() {
  ["file-error", "consent-error", "challenge-error"].forEach((id) => {
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
