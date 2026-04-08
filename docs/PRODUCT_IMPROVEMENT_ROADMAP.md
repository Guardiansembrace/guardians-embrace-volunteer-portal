# Product Improvement Roadmap

This document captures the current direction for making the Guardians Volunteer Portal simpler, more trustworthy, and more effective for both volunteers and admins.

## Product Principles

- Keep the primary task obvious on every screen.
- Show only the information needed to act now.
- Push reporting and advanced workflows one level deeper instead of stacking them onto the first view.
- Prefer clarity, consistency, accessibility, and recoverability over visual density.
- Treat admin complexity as a workflow problem, not a dashboard problem.

## UX Foundations We Are Following

- Nielsen Norman Group:
  https://www.nngroup.com/articles/top-articles-2025/
- Baymard usability guidance:
  https://baymard.com/learn/website-usability
- Baymard UX principles:
  https://baymard.com/learn/ux-design-principles
- Laws of UX:
  https://lawsofux.com/
- WCAG 2.2:
  https://www.w3.org/TR/WCAG22/

## Current Product Diagnosis

### Strengths

- Clean sign-in and role-aware routing already exist.
- Weekly submission flow is functional.
- Admin workflows for users, submissions, settings, and projects are present.
- The design language already has a recognizable brand foundation.

### Pain Points

- The dashboard tries to be a landing page, reporting screen, and action center at the same time.
- Admin and volunteer information are mixed too closely.
- High-value tasks do not stand out enough from supporting information.
- Deep workflows still depend too much on raw stats instead of clear "needs attention" summaries.
- Frontend quality still has cleanup debt in lint/accessibility/test coverage.

## Priority Roadmap

### Phase 1: Information Architecture and UX Clarity

- Completed: Simplify `/dashboard` into a weekly action page.
- Completed: Simplify `/admin` into an admin operations page focused on attention and actions.
- Reduce duplicate stats and remove nonessential dashboard sections.
- Keep deep reporting in dedicated pages instead of the main dashboard.
- Improve mobile scanning for dashboard, tables, and navigation.

### Phase 2: Submission Experience

- Completed: Add autosave for drafts.
- Completed: Add visible save state and recovery messaging.
- Completed: Reduce friction in file uploads and progress feedback.
- Add carry-forward suggestions from last week.
- Add a cleaner first-submission onboarding flow.

### Phase 3: Admin Operations

- Completed: Improve review queue with better filters and saved views.
- Completed: Fix the admin submissions queue load failure and add clearer empty, filtered, and error states.
- Add bulk review actions.
- Add audit logging for admin changes.
- Improve reminder workflows and confirmation states.
- Add clearer "needs attention" signals for blockers, overdue drafts, and inactive volunteers.

### Phase 4: Reliability and Quality

- Completed: Expand frontend test coverage for route and workflow behavior.
- Completed: Resolve current frontend lint debt.
- Completed: Expand backend API test coverage for real business flows.
- In progress: Remove backend deprecation warnings and modernize time handling.
- Completed: Add production monitoring and error capture.

### Phase 5: Accessibility and Performance

- In progress: Add stronger keyboard and focus support.
- In progress: Improve semantics and screen-reader labeling.
- Verify contrast and reduced-motion support.
- Add Lighthouse, accessibility, and test checks in CI.
- Introduce performance budgets for key pages.

## Immediate Work Queue

### In Progress

- Backend deprecation cleanup, including centralized UTC time handling, Pydantic v2 model config migration, and trimming app-owned warnings before tackling Beanie internals.

### Recently Completed

- Simplify the dedicated admin dashboard to match the new lighter dashboard hierarchy.
- Add autosave and recovery for weekly submissions.
- Improve the admin submission queue with attention-first views and faster filtering.
- Add route-level frontend coverage for login, protected submission routes, and admin review.
- Resolve the remaining frontend lint issues across auth, admin pages, projects, and the submission editor.
- Add backend API coverage for user profile completion, current-week status, settings reads/updates, and invite create/revoke flows.
- Add env-driven backend/frontend monitoring so runtime frontend errors are captured with request IDs and backend log ingestion.

### Next Recommended Items

1. Remove backend deprecation warnings and modernize time handling.
2. Add production monitoring and error capture.
3. Add Lighthouse, accessibility, and test checks in CI.
4. Add carry-forward suggestions from last week.

## Work Log

### March 17, 2026

- Centralized backend/frontend port configuration so the API and dev server can be managed from environment files.
- Stabilized backend settings parsing and added backend config coverage.
- Restored frontend test/build stability and fixed the frontend API config flow.
- Simplified the volunteer dashboard into a lighter weekly action page.
- Simplified the admin dashboard into an operations-first landing page.
- Added local autosave, recovery messaging, and safe draft clearing for weekly submissions.
- Improved the admin submissions queue with attention-first views, saved review filters, and urgency sorting.
- Started the accessibility pass with shared focus states, skip navigation, better nav semantics, main-content anchors, and stronger form/table labeling.
- Added reduced-motion handling and improved primary button contrast for better readability and comfort.
- Extended the accessibility pass to the admin users page with labeled filters, semantic tables, and a more accessible invite dialog.
- Extended the accessibility pass to volunteer-facing tables and comment forms with captions, column scopes, and better input labeling.
- Added app-level route tests and an admin submission review workflow test to protect the core login, submission, and review flows.
- Cleaned up the remaining frontend lint debt and split the auth hook from the provider so lint, tests, and builds all pass together.

### March 18, 2026

- Added backend API route tests for user profile completion, current-week submission status, settings defaults/updates, and invite create/revoke behavior.
- Fixed invite revocation so deleting an invite actually removes the allowed-email entry instead of silently succeeding without deleting it.
- Centralized backend UTC timestamp creation, replaced deprecated `datetime.utcnow()` usage across app-owned code and tests, and migrated our Pydantic models from `class Config` to `ConfigDict`.
- Reduced backend test warning noise to the remaining Beanie dependency warnings so the next cleanup pass can focus on library upgrade strategy instead of app code.
- Added a first-party monitoring pipeline with backend request IDs, a frontend runtime error reporter, and an API ingestion endpoint so production issues can be traced without relying on manual console checks.
- Fixed the admin submissions queue `422` caused by the frontend requesting 200 results while the backend capped admin list queries at 100.
- Improved the admin submissions review screen so it now distinguishes between a clear queue, filter-only empty results, and actual load failures, with more visible review-view pills and better retry and clear-filter actions.
- Added a clearer submission-progress panel, stronger draft confidence cues, and a more reassuring action area on the weekly update form.
- Blocked executable and script uploads on both the frontend and backend so the file flow is safer and the upload rules are clearer before the user submits anything.

## Definition of "Better"

We should consider the product meaningfully improved when:

- A volunteer can understand what to do in under 5 seconds after landing on the dashboard.
- An admin can see what needs attention without scanning multiple stat groups.
- A user can safely leave and return to an in-progress submission without losing work.
- Core workflows remain test-covered and stable as the app grows.
- The product is accessible enough to be confidently used across devices and input methods.
