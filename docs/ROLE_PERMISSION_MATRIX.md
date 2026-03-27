# Role Permission Matrix

This portal now supports three practical access levels:

- `volunteer`: personal submissions and self-service access
- `team_lead`: operational management without full system control
- `admin`: full organizational and system control

## Volunteer

- Access dashboard, projects, submissions, and personal profile updates
- Create, edit, submit, and review only their own weekly updates
- View and manage only their own files within the standard access window
- Comment on their own submissions
- Cannot access admin portal, reminder tools, role changes, invites, or settings

## Team Lead

- Access the admin portal operational views
- View submission stats, list all submissions, open submission details, and mark submissions reviewed
- View and comment on any submission
- Send weekly reminders and check email readiness
- View the user directory and user statistics
- Create, update, and delete projects and manage project members
- View files across volunteers and bypass the volunteer file access expiry
- Cannot change user roles, deactivate users, manage invites, or edit global settings

## Admin

- Includes everything a team lead can do
- Can change user roles and activation state
- Can create, resend, and revoke invites
- Can update global settings and form configuration
- Keeps full system-level and organizational control

## Current Product Mapping

- `/admin` -> team lead + admin
- `/admin/submissions` -> team lead + admin
- `/admin/users` -> team lead + admin
  Team leads get read-only directory access
- `/admin/settings` -> admin only
- Invite management -> admin only
- Role changes / activation changes -> admin only
