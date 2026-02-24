# Product One-Shot Spec

Date: 2026-02-23
Project Codename: DocSpark
Mode: Two-agent parallel build (Agent A frontend, Agent B backend)

## 1) Product Goal
Build a document platform that is not "just another converter".

Core promise:
- Convert or download documents fast
- Add optional value after conversion so users can choose deeper analysis

## 2) Differentiation Strategy (Why users choose us)
Most converter websites only output a file. DocSpark outputs a useful package.

Primary differentiator:
- Optional "Smart Output Pack" (user must opt in before analysis):
  - Converted file
  - One-click summary (plain language)
  - Key data extraction (dates, totals, names)
  - Redaction suggestions (emails, phone numbers, IDs)
  - Reformat presets (resume-safe, print-safe, mobile-safe)

Secondary differentiators:
- Privacy-first mode: auto-delete files after processing (default)
- Conversion quality score: layout confidence + text integrity score
- Workflow memory: user can re-run last conversion settings instantly
- Shareable output link with expiration controls

## 3) Target Users
- Students converting notes/pdfs quickly
- Freelancers converting proposals/invoices/contracts
- Small teams that need conversion + summary + clean share links

## 4) MVP Scope (build now)
### User features
- Upload document
- Choose conversion format (PDF, DOCX, TXT, JPG/PNG where possible)
- Download converted file
- Choose analysis mode:
  - `Convert only` (default)
  - `Convert + Smart Output Pack` (optional, explicit consent)
- View Smart Output Pack (only when opted in)
- Copy summary and extracted key fields
- Enable/disable redaction suggestions

### Required pages (frontend)
- Home (hero + value proposition)
- Converter page (upload + format + status + result)
- Output page (summary, key fields, redaction list, download)
- Pricing/Why Us section
- Privacy page (auto-delete policy)

### Required API (backend)
- `POST /api/convert` -> upload + convert
- `GET /api/jobs/:id` -> job status
- `GET /api/jobs/:id/download` -> converted file
- `GET /api/jobs/:id/insights` -> summary, extracted fields, redaction hints, quality score (only if opted in)
- `DELETE /api/jobs/:id` -> manual delete

## 5) Core User Flow
1. User uploads file
2. User selects target format + optional preset
3. User chooses processing mode (`convertOnly` default, or opt-in analysis)
4. Backend processes job and returns job id
5. Frontend polls status
6. User gets converted file
7. If analysis was opted in, user also gets Smart Output Pack
8. Files auto-delete after TTL (default 30 minutes for guest users)

## 6) UX Direction
- Positioning: "Convert less. Understand more."
- Tone: professional, fast, trustworthy
- Design principles:
  - Minimal steps (max 3 clicks to first result)
  - Clear trust indicators (auto-delete timer visible)
  - High confidence messaging (quality score shown with explanation)

## 7) Frontend / Backend Contract
### Convert request
`POST /api/convert` (multipart/form-data)
- `file` (required)
- `targetFormat` (required)
- `preset` (optional: `resume-safe|print-safe|mobile-safe`)
- `analysisMode` (required: `convert_only|convert_plus_insights`)
- `analysisConsent` (required boolean when `analysisMode=convert_plus_insights`)

Response:
```json
{ "jobId": "abc123", "status": "queued" }
```

### Job status
`GET /api/jobs/:id`

Response:
```json
{ "jobId": "abc123", "status": "queued|processing|done|failed", "progress": 0 }
```

### Download
`GET /api/jobs/:id/download`
- Returns converted binary file

### Insights
`GET /api/jobs/:id/insights`
- Returns `409` with reason when job was created in `convert_only` mode

Response:
```json
{
  "summary": "...",
  "keyFields": [
    { "label": "Date", "value": "2026-02-10" },
    { "label": "Total", "value": "$1,280.00" }
  ],
  "redactionHints": [
    { "type": "email", "value": "name@example.com" }
  ],
  "qualityScore": {
    "layout": 88,
    "textIntegrity": 93,
    "overall": 90
  }
}
```

## 8) Technical Boundaries for MVP
- Guest mode first (no auth required)
- File size limit: 25MB
- Allowed formats first release:
  - Input: pdf, docx, txt
  - Output: pdf, docx, txt
- Processing timeout: 120 seconds
- Storage: temporary only, auto-delete by TTL worker
- Consent default: off (`convert_only`)

## 9) Build Split (Do not overlap)
### Agent A (Frontend)
- UI pages and routing
- Upload widget + progress UI
- Polling + result rendering
- Analysis consent toggle + clear copy explaining optional processing
- Insights cards and quality score display
- Error/retry states

### Agent B (Backend)
- File upload pipeline
- Conversion workers
- Job storage + TTL cleanup
- Enforce `analysisMode` and consent validation
- Insights generation endpoint
- Input validation and rate limiting

## 10) Acceptance Criteria
- User can convert at least one supported file type end-to-end
- User can complete flow without analysis (default path)
- Insights endpoint returns summary + keyFields + qualityScore only for opted-in jobs
- Auto-delete works and is visible in UI
- Mobile layout is usable and complete
- No overlap conflict between agent-owned files

## 11) Metrics (first 2 weeks)
- Conversion success rate >= 95%
- Time-to-first-download <= 20 seconds (median)
- Output pack viewed rate >= 40%
- Repeat conversion rate >= 25%

## 12) Risks and Mitigation
- Risk: converters feel generic
  - Mitigation: prioritize Smart Output Pack before adding many formats
- Risk: privacy trust issues
  - Mitigation: analysis is opt-in only + clear consent text + deletion timer + manual delete button
- Risk: slow processing
  - Mitigation: async queue + progress states + strict size limits

## 13) Non-Goals (for now)
- OCR-heavy scanned docs pipeline
- Team workspaces and permissions
- Payment integration
- Browser extension

## 14) Immediate Execution Order
1. Backend: stand up `/api/convert` and `/api/jobs/:id` with mock processing
2. Frontend: upload flow + status polling
3. Backend: add `/insights` mock payload
4. Frontend: render output pack
5. Backend: real conversion path + cleanup worker
6. Joint QA and hardening

## 15) One-line Pitch
DocSpark is a converter with optional Smart Output Pack, so users can choose plain conversion or richer insights with explicit consent.
