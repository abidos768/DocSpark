# DocSpark Project Brief

Date: 2026-02-23  
Status: MVP implemented, pending joint QA

## Purpose
Build a document conversion website that stands out from generic converters.

Core value:
- Fast conversion and download
- Optional advanced analysis for users who explicitly want it

## Differentiator
DocSpark offers an optional **Smart Output Pack**:
- Plain-language summary
- Key field extraction (dates, totals, names)
- Redaction hints
- Quality score

Important:
- Smart Output Pack is **opt-in only**
- Default user path is **convert only**

## Privacy Rule (Critical)
- Never run analysis by default
- User must actively choose analysis mode
- User consent is required before Smart Output Pack processing

## MVP Scope
- Upload file
- Choose target format
- Convert and download
- Optional analysis mode (with consent)
- Auto-delete temporary files by TTL

## Implementation Update (2026-02-23)
- Backend: `/api/convert`, `/api/jobs/:id`, `/api/jobs/:id/download`, `/api/jobs/:id/insights`, and `DELETE /api/jobs/:id` are implemented.
- Backend: TTL cleanup worker and manual delete path are implemented.
- Frontend: Home, Converter, Pricing, and Privacy pages are implemented with SPA routing.
- Frontend: Converter flow includes analysis mode, explicit consent enforcement, async polling, completion view, download action, delete-now action, and conditional insights rendering.
- Remaining: joint end-to-end QA for one full conversion flow.

## API Contract (MVP)
- `POST /api/convert`
  - Fields: `file`, `targetFormat`, `preset?`, `analysisMode`, `analysisConsent?`
  - `analysisMode`: `convert_only | convert_plus_insights`
  - `analysisConsent` required when `analysisMode=convert_plus_insights`
- `GET /api/jobs/:id`
- `GET /api/jobs/:id/download`
- `GET /api/jobs/:id/insights` (must return `409` for convert-only jobs)
- `DELETE /api/jobs/:id`

## Agent Ownership
- Agent A (Codex): Frontend (`frontend/*`)
- Agent B (Claude Code): Backend (`backend/*`)

## Start Order
1. Backend bootstraps `/api/convert` + `/api/jobs/:id`
2. Frontend builds upload flow + polling
3. Backend adds `/insights`
4. Frontend renders output pack when opted in
5. Both complete QA

## Source Files
- Product detail: `PRODUCT_ONE_SHOT_SPEC.md`
- Team coordination: `TEAM_SYNC.md`
- Task tracking: `WORK_QUEUE.md`

## One-line Pitch
DocSpark is a converter that gives users control: simple conversion by default, and optional insights only when they ask for it.
