# Contributing

This repository is active and collaborative, so the main goal is to help people contribute without stepping on each other's work.

## Principles

- Keep `main` stable and deployable.
- Work in small, focused branches.
- Coordinate before editing shared hotspot files.
- Prefer feature-sized pull requests over long-running branches.
- Do not mix unrelated cleanup, formatting, or refactors into feature work.

## Branch Strategy

- Branch from the latest `main`.
- Use one branch per feature, fix, or doc update.
- Keep branch names descriptive, for example:
  - `feature/project-notifications`
  - `fix/admin-user-status`
  - `docs/contributing-guide`
- Sync with `main` often, especially before opening or merging a PR.

## Best Way To Avoid Merge Conflicts

- Claim a feature area before starting work.
- Keep PRs small enough to review and merge quickly.
- Avoid editing the same file as someone else unless you have agreed on ownership first.
- If a shared file must change, make that change in a small PR first, then build other work on top of it.
- Pull or rebase from `main` before starting each work session.
- Do not include unrelated renames, reformatting, or "while I'm here" changes.

## Ownership By Area

Use these as default ownership boundaries when multiple people are contributing at once:

- `backend/app/api`, `backend/app/models`, `backend/app/core`, `backend/tests`
  - Backend feature work, permissions, database behavior, API routes, and tests.
- `frontend-react/src/pages`, `frontend-react/src/components`, `frontend-react/src/lib`, `frontend-react/src/types`
  - Frontend screens, UI behavior, routing, client API wiring, and UI tests.
- `docs`, `scripts`, deployment assets, and planning files
  - Documentation, deployment workflow, and process improvements.

If work crosses both frontend and backend, split ownership by file path and agree on who owns the integration points.

## Hotspot Files To Coordinate On

These files change often and should be treated as shared coordination points:

- `frontend-react/src/App.tsx`
- `frontend-react/src/lib/api.ts`
- `frontend-react/src/lib/AuthContext.tsx`
- `frontend-react/src/pages/AdminUsersPage.tsx`
- `frontend-react/src/pages/ProjectsPage.tsx`
- `frontend-react/src/pages/ProjectDetailPage.tsx`
- `backend/app/api/users.py`
- `backend/app/api/auth.py`
- `backend/app/api/invites.py`
- `backend/tests/test_api_routes.py`
- `shared/config.json`

If two contributors need the same hotspot file, decide ownership first instead of resolving it later in Git.

## Suggested Task Splitting

Good parallel work usually looks like this:

- One person owns a backend feature end-to-end.
- One person owns the frontend for a different feature.
- One person owns docs, planning, or deployment updates.
- One person owns test coverage or cleanup for a feature that has already settled.

Examples:

- Person 1: suggestions and feedback feature
- Person 2: notifications feature
- Person 3: project handoff and leadership rotation
- Person 4: docs, testing, and deployment support

## Local Setup

See [README.md](/c:/Guardian's%20Embrace%20Dev/guardians-volunteer-portal/README.md) for full setup. The quick version:

### Backend

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python -m uvicorn app.main:app --reload --port 8081
```

### Frontend

```powershell
cd frontend-react
npm install
copy .env.example .env
npm run dev
```

## Testing Before Opening A PR

Run only the checks relevant to your change, and run broader checks when your change crosses layers.

### Backend

```powershell
cd backend
pytest tests/ -v
```

For targeted backend work, it is also fine to run:

```powershell
pytest backend/tests/test_api_routes.py
```

### Frontend

```powershell
cd frontend-react
npm run build
npm run test -- --run
```

Use targeted frontend tests for the page or component you changed when possible.

## Pull Request Expectations

- Keep the PR focused on one change.
- Include a short summary of what changed and why.
- Mention any files that were intentionally left alone because they are shared hotspots.
- Note any follow-up work instead of bundling it into the same PR.
- If you changed permissions, auth, deployments, or shared config, call that out clearly.

## Deployment Coordination

- Do not deploy directly from a feature branch.
- Batch related changes together when possible.
- Coordinate before running production or shared-environment deploys.
- AWS deploy scripts live in `scripts/aws/`.
- The main reusable deploy entry point is:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/aws/deploy.ps1 -EnvironmentName test -Region us-east-1 -BackendEnvPath backend/.env.aws -WaitForCloudFront
```

## Sensitive Data

- Never commit `.env`, `.env.aws`, secrets, app passwords, tokens, or service-account credentials.
- Use the example env files as templates.
- If a secret is shared in chat or anywhere insecure, rotate it before production use.

## Good Collaboration Habits

- Announce what you are working on before touching shared areas.
- Merge early instead of letting branches drift.
- Ask for help when a feature crosses too many files or too many layers.
- Leave concise comments and tests so the next contributor can pick up where you left off.

When in doubt, optimize for clarity, small diffs, and fast merges.
