# Work Queue

Project: DocSpark
Date: 2026-02-23
Source of truth: `PRODUCT_ONE_SHOT_SPEC.md`

## Status Legend
- `todo`: not started
- `doing`: in progress
- `blocked`: waiting on dependency
- `done`: completed

## Task Queue
| ID | Area | Task | Owner | Depends On | Status | Files |
|---|---|---|---|---|---|---|
| D-001 | Backend | Create upload endpoint `POST /api/convert` with `analysisMode` + consent validation | Agent B | - | done | backend/server.js |
| D-002 | Backend | Create job status endpoint `GET /api/jobs/:id` | Agent B | D-001 | done | backend/server.js |
| D-003 | Backend | Create download endpoint `GET /api/jobs/:id/download` | Agent B | D-001 | done | backend/server.js |
| D-004 | Backend | Create insights endpoint `GET /api/jobs/:id/insights` (return 409 when job is convert-only) | Agent B | D-001 | done | backend/server.js |
| D-005 | Backend | Add TTL auto-delete + `DELETE /api/jobs/:id` | Agent B | D-001 | done | backend/server.js,backend/ttl.js |
| D-006 | Frontend | Build Home page with differentiated value proposition | Agent A | - | done | frontend/* |
| D-007 | Frontend | Build Converter page (upload, format select, analysis consent toggle, submit) | Agent A | D-001 | done | frontend/app.js,frontend/styles.css,frontend/api.js |
| D-008 | Frontend | Add polling UI for `GET /api/jobs/:id` | Agent A | D-002,D-007 | done | frontend/app.js,frontend/api.js |
| D-009 | Frontend | Build Output page (summary, keyFields, redaction hints, quality score) | Agent A | D-004,D-008 | done | frontend/app.js,frontend/styles.css |
| D-010 | Frontend | Download action + expiry/deletion UI | Agent A | D-003,D-005,D-009 | done | frontend/app.js,frontend/api.js |
| D-011 | Joint QA | End-to-end test for one full conversion flow | Agent A + Agent B | D-010 | todo | frontend/*,backend/* |

## Active Claims
| Agent | Claimed IDs | Start Time | Notes |
|---|---|---|---|
| Agent A (Codex) | D-006,D-007,D-008,D-009,D-010 | 2026-02-23 22:25 | Frontend flow complete (convert, poll, result, download/delete, optional insights) |
| Agent B (Claude Code) | D-001,D-002,D-003,D-004,D-005 | 2026-02-23 22:25 | All backend endpoints complete and tested |

## API Contract Snapshot
- `POST /api/convert` -> `{ jobId, status }`
- Convert payload includes `analysisMode` and optional `analysisConsent` (required when insights mode selected)
- `GET /api/jobs/:id` -> `{ jobId, status, progress }`
- `GET /api/jobs/:id/download` -> converted file
- `GET /api/jobs/:id/insights` -> `{ summary, keyFields, redactionHints, qualityScore }` only for opted-in jobs
- `DELETE /api/jobs/:id` -> `{ success: true }`

## Blockers
- Format: `YYYY-MM-DD HH:MM | ID | Blocker | Needed From | ETA`

## Handoff Notes
- Format: `YYYY-MM-DD HH:MM | ID | From -> To | What changed | Next step`
- 2026-02-23 22:25 | D-001 | Agent A -> Agent B | Contract frozen in `PRODUCT_ONE_SHOT_SPEC.md` Section 7 | Implement backend endpoints exactly as defined
- 2026-02-23 22:35 | D-001 | Agent A -> Agent B | Privacy rule added: analysis must be user opt-in | Validate `analysisMode` + `analysisConsent`; default to convert-only
- 2026-02-23 22:45 | Integration | Agent B | Wired app.js post-submit flow: polling, results page, download, insights cards, delete button. Touched frontend/app.js + frontend/styles.css
- 2026-02-23 22:48 | D-007,D-008,D-009,D-010 | Agent A -> Team | Frontend implemented against backend contract: consent validation, polling, result actions, and insights rendering | Proceed to joint end-to-end QA (D-011)

## Done Log
- 2026-02-23 22:25 | Planning | Agent A | One-shot product + queue finalized before implementation
- 2026-02-23 22:33 | D-006 | Agent A | Home page reworked to DocSpark value proposition + consent-first messaging
- 2026-02-23 22:40 | D-001 | Agent B | POST /api/convert with file upload, format validation, analysisMode + consent enforcement
- 2026-02-23 22:40 | D-002 | Agent B | GET /api/jobs/:id returns jobId, status, progress
- 2026-02-23 22:40 | D-003 | Agent B | GET /api/jobs/:id/download serves converted file with correct filename
- 2026-02-23 22:40 | D-004 | Agent B | GET /api/jobs/:id/insights returns 409 for convert-only, full payload for opted-in
- 2026-02-23 22:40 | D-005 | Agent B | DELETE /api/jobs/:id + TTL worker (60s interval, 30min expiry)
- 2026-02-23 22:48 | D-007 | Agent A | Converter UI implemented with format/preset/mode selection and consent-gated submission
- 2026-02-23 22:48 | D-008 | Agent A | Polling loop integrated with progress updates for `GET /api/jobs/:id`
- 2026-02-23 22:48 | D-009 | Agent A | Output rendering implemented for summary, keyFields, redactionHints, qualityScore
- 2026-02-23 22:48 | D-010 | Agent A | Download action and manual delete workflow implemented in completion view
