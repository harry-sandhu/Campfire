# Project Improvement Plan

## Current State
Campfire is a single-organization internal ticket-management system: Express + MongoDB backend, Next.js (App Router, React 19) frontend. 30 commits on `main`, in sync with `origin/main`. A `hardening` branch also exists locally but was not touched per task scope. Working tree is clean. Core feature set (auth, groups/topics/tickets, boards, reports, webhooks, PWA, OpenAPI docs) is implemented per the README's feature list, and backend has a substantial `vitest` integration-test suite (`backend/tests/`: auth, permissions, access, features, security, realtime, automations, ticket-filters, dependencies, openapi, origins).

**Naming observation:** the local project folder is named "Pjira," but the product is branded "Campfire" consistently throughout the README, docs, and `package.json` (`"name": "campfire"`), and the GitHub remote is `harry-sandhu/Campfire.git`. This is purely a local folder-naming leftover (likely from an earlier working title referencing Jira-style ticketing) with no functional impact — flagged here as an observation only; the folder/repo were not renamed per task constraints.

## What Is Already Good
- README is honest and well-scoped: a detailed feature list, an explicit "Access rules in one place" section documenting the permission model, clear local setup steps, a tests section describing both the in-memory MongoDB integration tests and Playwright e2e tests, and a frank "Not included yet" section (email, file attachments, 2FA) explaining why those are deferred.
- `docs/` folder has dedicated files for API reference, architecture, deployment, an automations/milestones plan, and a progress log — good separation of concerns from the README itself.
- Backend test suite is broad: dedicated spec files per concern (permissions, access control, auth, security, realtime, automations, dependencies, OpenAPI contract, CORS origins) rather than one monolithic test file.
- `.env.example` files at root, `backend/`, and `frontend/` give a clear, minimal set of variables with inline comments (e.g. `CORS_ORIGINS`, `BOOTSTRAP_TOKEN` usage explained in-line).

## Issues Found
- Folder name ("Pjira") vs. product/repo name ("Campfire") mismatch — see Current State. No action taken beyond flagging, per task constraints.
- No functional README/doc errors were found; commands, ports, and env vars in `backend/.env.example` (`PORT=4000`, `MONGODB_URI`, `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`, bootstrap flow) all match the actual backend code and README instructions.

## Documentation
Verified the README's local-setup and test instructions against `package.json` scripts in root, `backend/`, and `frontend/`: `npm run dev:backend` / `dev:frontend` at root delegate correctly; `npm test` in `backend` maps to `vitest run`; `npm run e2e` in `frontend` maps to `playwright test`. All accurate — no rewrite or factual fix needed (README classified Excellent, left as-is per instructions).

## Code Quality
N/A — not reviewed line-by-line in this doc-only pass.

## Testing
Backend: `vitest run` over a wide integration suite in `backend/tests/` using an in-memory MongoDB. Frontend: Playwright e2e in `frontend/e2e/` (`app.spec.ts`, with `helpers.ts` and a `start-backend.mjs` harness) against a real API + database. README states CI runs build, lint, tests, and browser tests — consistent with the two-tier (integration + e2e) testing approach actually present in the repo.

## Security
No secrets found in tracked files. `.env.example` files contain only placeholder values (e.g. `JWT_ACCESS_SECRET=replace-with-a-long-random-secret`), consistent with the README's instruction to replace them with random values of at least 32 characters. Working tree had nothing uncommitted to review.

## Architecture
Matches README: Express API + MongoDB, Next.js frontend, clear access-control model (group membership vs. ungrouped ticket visibility, field-level edit permissions) documented directly in the README and presumably expanded in `docs/architecture.md`.

## UX / UI
N/A — not assessed in this doc-only pass; the README already lists list/board views, filters, saved views, bulk edits, and a command palette as implemented.

## Performance
N/A — no obvious opportunity surfaced during this review.

## DevOps / Deployment
A `scripts/backup-mongo.sh` exists for backups, and `docs/deployment.md` presumably covers deployment specifics (not modified in this pass). CI is described as covering build/lint/tests/browser tests per the README.

## GitHub / Open Source Presentation
Repo is private; open-source presentation concerns (badges, license, contributing guide) are not a priority unless visibility changes.

## Screenshots / Visual Assets
None present in the README. Given the breadth of UI features (board views, command palette, reports), a few screenshots would help convey the product's maturity, but this is optional for an internal private tool.

## README
Classification: Excellent (per briefing, confirmed). No rewrite performed. No factual errors found — all commands, ports, and env var names check out against the actual backend/frontend code.

## Priority Roadmap

### P0 — Critical
N/A — no critical issues found in this documentation-focused review.

### P1 — Important
- Resolve the Pjira/Campfire folder-naming inconsistency at a convenient time (e.g. next time the project is re-cloned or moved), purely for contributor clarity — not urgent since it has no functional effect.

### P2 — Nice to Have
- Add a handful of UI screenshots (board view, ticket detail, command palette) to the README to make the feature list more concrete for new contributors.
- Consider documenting the `hardening` branch's purpose/status somewhere (e.g. docs/progress.md) if it represents ongoing work, so contributors understand why it exists alongside `main`.

## Recommended Next Steps
1. No urgent doc or security fixes needed — the README and env examples are already accurate and secret-free.
2. When convenient, rename the local folder from "Pjira" to "Campfire" (or clone fresh from the `Campfire` remote under that name) to remove the naming confusion for future contributors.
3. Continue filling out `docs/progress.md` and `docs/plan-automations-milestones.md` as features land, since the README explicitly defers deeper detail to those files.
