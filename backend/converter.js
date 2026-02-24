const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const { execFile } = require("child_process");
const db = require("./db");

const runExecFile = promisify(execFile);
const IS_VERCEL = !!process.env.VERCEL;
const CONVERTED_DIR = IS_VERCEL ? "/tmp/converted" : path.join(__dirname, "converted");

if (!fs.existsSync(CONVERTED_DIR)) {
  fs.mkdirSync(CONVERTED_DIR, { recursive: true });
}

function findExecutable(name, knownPaths) {
  for (const p of knownPaths) {
    if (fs.existsSync(p)) return p;
  }
  return name; // fall back to bare name (relies on PATH)
}

const PANDOC_BIN = findExecutable("pandoc", [
  path.join(process.env.LOCALAPPDATA || "", "Pandoc", "pandoc.exe"),
  "C:\\Program Files\\Pandoc\\pandoc.exe",
  "/usr/local/bin/pandoc",
  "/usr/bin/pandoc",
]);

const SOFFICE_BIN = findExecutable("soffice", [
  "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
  "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
  "/usr/bin/soffice",
  "/usr/local/bin/soffice",
]);

function normalizeFormat(format) {
  const normalized = String(format || "").trim().toLowerCase();
  if (normalized === "htm") return "html";
  if (normalized === "markdown") return "md";
  return normalized;
}

async function processJob(job) {
  try {
    await db.updateJobStatus(job.id, "processing", 10);

    if (!IS_VERCEL) {
      await delay(300);
      await db.updateJobStatus(job.id, "processing", 35);
    }

    const sourceExt = normalizeFormat(path.extname(job.original_name).replace(".", ""));
    const targetExt = normalizeFormat(job.target_format || "");
    const outName = `${job.id}.${targetExt}`;
    const outPath = path.join(CONVERTED_DIR, outName);

    await convertFile(job.original_path, outPath, sourceExt, targetExt);

    await db.updateJobStatus(job.id, "processing", 85);

    if (job.analysis_mode === "convert_plus_insights" && job.analysis_consent === 1) {
      const insights = generateMockInsights(job.original_name);
      await db.saveInsights(job.id, insights);
    }

    const fileBuffer = fs.readFileSync(outPath);
    const base64Data = fileBuffer.toString("base64");
    await db.markJobDone(job.id, outPath, base64Data);
  } catch (err) {
    const reason = err?.message || "Conversion failed.";
    console.error(`Job ${job.id} failed:`, reason);
    await db.markJobFailed(job.id, reason);
  }
}

async function convertFile(inputPath, outputPath, sourceExt, targetExt) {
  const passthroughSet = new Set(["txt", "md", "csv"]);

  if (sourceExt === targetExt) {
    fs.copyFileSync(inputPath, outputPath);
    return;
  }

  if (passthroughSet.has(sourceExt) && passthroughSet.has(targetExt)) {
    fs.copyFileSync(inputPath, outputPath);
    return;
  }

  if (sourceExt === "html" && targetExt === "txt") {
    const html = fs.readFileSync(inputPath, "utf8");
    const text = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    fs.writeFileSync(outputPath, text, "utf8");
    return;
  }

  if (sourceExt === "txt" && targetExt === "html") {
    const text = fs.readFileSync(inputPath, "utf8");
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const html = `<!doctype html><html><body><pre>${escaped}</pre></body></html>`;
    fs.writeFileSync(outputPath, html, "utf8");
    return;
  }

  const serverlessPdfError = await tryServerlessPdf(inputPath, outputPath, sourceExt, targetExt);
  if (!serverlessPdfError && fs.existsSync(outputPath)) {
    return;
  }

  const pandocError = await tryPandoc(inputPath, outputPath);
  if (!pandocError && fs.existsSync(outputPath)) {
    return;
  }

  const sofficeError = await trySoffice(inputPath, outputPath, targetExt);
  if (!sofficeError && fs.existsSync(outputPath)) {
    return;
  }

  const reasons = [serverlessPdfError, pandocError, sofficeError].filter(Boolean).join(" | ");
  throw new Error(`Unsupported conversion: ${sourceExt} -> ${targetExt}. ${reasons || "No conversion engine available."}`);
}

async function tryServerlessPdf(inputPath, outputPath, sourceExt, targetExt) {
  if (targetExt !== "pdf") return "serverless_pdf_not_target";
  if (!["html", "txt", "md"].includes(sourceExt)) return "serverless_pdf_source_unsupported";

  let htmlContent = "";
  if (sourceExt === "html") {
    htmlContent = fs.readFileSync(inputPath, "utf8");
  } else {
    const text = fs.readFileSync(inputPath, "utf8");
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    htmlContent = `<!doctype html><html><body><pre>${escaped}</pre></body></html>`;
  }

  try {
    const pdfBuffer = await generatePdfBufferFromHtml(htmlContent);
    fs.writeFileSync(outputPath, pdfBuffer);
    return null;
  } catch (error) {
    return `serverless_pdf_failed:${error.message}`;
  }
}

const LOCAL_CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe")
    : "",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

async function generatePdfBufferFromHtml(htmlContent) {
  // Strategy 1: serverless Chromium (@sparticuz/chromium) — works on Vercel/Lambda
  let browser;
  try {
    const chromium = require("@sparticuz/chromium");
    const puppeteer = require("puppeteer-core");
    const executablePath = await chromium.executablePath();
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath,
      headless: chromium.headless,
      defaultViewport: { width: 1280, height: 720 },
    });
    const page = await browser.newPage();
    await page.setContent(String(htmlContent || ""), { waitUntil: "networkidle0" });
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  } catch (serverlessErr) {
    if (browser) try { await browser.close(); } catch {}
    browser = null;

    // Strategy 2: local Chrome/Chromium via puppeteer-core
    const localPath = LOCAL_CHROME_PATHS.find((p) => fs.existsSync(p));
    if (!localPath) {
      throw new Error(
        `serverless_pdf_runtime_missing and no local Chrome found. Serverless error: ${serverlessErr.message}`
      );
    }

    let puppeteer;
    try {
      puppeteer = require("puppeteer-core");
    } catch {
      throw new Error("puppeteer-core is not installed");
    }

    try {
      browser = await puppeteer.launch({
        executablePath: localPath,
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
        defaultViewport: { width: 1280, height: 720 },
      });
      const page = await browser.newPage();
      await page.setContent(String(htmlContent || ""), { waitUntil: "networkidle0" });
      return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    } finally {
      if (browser) try { await browser.close(); } catch {}
    }
  } finally {
    if (browser) try { await browser.close(); } catch {}
  }
}

async function tryPandoc(inputPath, outputPath) {
  try {
    await runExecFile(PANDOC_BIN, [inputPath, "-o", outputPath], { timeout: 15000 });
    return null;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return "pandoc_not_installed";
    }
    return `pandoc_failed:${error.message}`;
  }
}

function sofficeTarget(targetExt) {
  const map = {
    pdf: "pdf",
    docx: "docx",
    txt: "txt:Text",
    html: "html:XHTML Writer File",
    rtf: "rtf",
    csv: "csv:Text - txt - csv (StarCalc)",
  };
  return map[targetExt] || targetExt;
}

async function trySoffice(inputPath, outputPath, targetExt) {
  const outDir = path.dirname(outputPath);
  try {
    await runExecFile(
      SOFFICE_BIN,
      ["--headless", "--convert-to", sofficeTarget(targetExt), "--outdir", outDir, inputPath],
      { timeout: 25000 }
    );

    const convertedName = `${path.basename(inputPath, path.extname(inputPath))}.${targetExt}`;
    const producedPath = path.join(outDir, convertedName);
    if (!fs.existsSync(producedPath)) {
      return "soffice_no_output";
    }
    fs.copyFileSync(producedPath, outputPath);
    if (producedPath !== outputPath) {
      try {
        fs.unlinkSync(producedPath);
      } catch {
        // ignore cleanup failure
      }
    }
    return null;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return "soffice_not_installed";
    }
    return `soffice_failed:${error.message}`;
  }
}

function generateMockInsights(filename) {
  return {
    summary: `This document "${filename}" contains structured content including text paragraphs, headings, and data fields. The layout is well-organized with clear sections.`,
    keyFields: [
      { label: "Document Title", value: filename.replace(/\.[^.]+$/, "") },
      { label: "Detected Date", value: new Date().toISOString().split("T")[0] },
      { label: "Estimated Word Count", value: String(Math.floor(Math.random() * 2000) + 200) },
    ],
    redactionHints: [
      { type: "email", value: "example@redacted.com" },
      { type: "phone", value: "+1-555-XXX-XXXX" },
    ],
    qualityScore: {
      layout: Math.floor(Math.random() * 15) + 80,
      textIntegrity: Math.floor(Math.random() * 10) + 88,
      overall: Math.floor(Math.random() * 12) + 85,
    },
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { processJob, generatePdfBufferFromHtml };
