# CRM Feature

This feature is the portal-side CRM experience.

Architecture:

- EspoCRM is the open-source CRM system of record.
- The portal renders a modern internal CRM UI inspired by Twenty-style workspace patterns.
- Portal code should call the backend CRM bridge, not EspoCRM directly from the browser.
- EspoCRM entities should map to portal CRM views:
  - `Contact` -> people records
  - `Account` -> organizations and partners
  - `Task` -> follow-ups
  - `Note` or activity records -> timeline entries
  - Custom EspoCRM entities -> nonprofit-specific records when needed

Keep implementation boundaries:

- UI components, local view state, and CRM-specific presentation stay in `frontend-react/src/features/crm`.
- EspoCRM credentials and API calls belong in the backend.
- Do not store EspoCRM API keys in frontend environment variables.
