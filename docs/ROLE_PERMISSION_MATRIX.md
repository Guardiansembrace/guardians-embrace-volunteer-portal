# Role Permission Matrix

This portal currently uses two layers of access:

- a main role:
  - `volunteer`
  - `team_lead`
  - `admin`
- optional delegated admin scopes granted by an admin

## Volunteer

- Access dashboard, submissions, and projects
- Create, save, and submit their own weekly updates
- View their own submission history
- View their own submission comments and reply in their own thread
- Browse all projects and project boards
- Request access to projects
- Contribute to project work after being added to a project
- Cannot access the admin portal by default

## Team Lead

- Includes everything a volunteer can do
- Create, update, and delete projects
- Add and remove project members
- Manage project work items and assignments
- Approve and decline project join requests
- Can organize project operations directly in the project area
- Does not automatically get the full admin portal
- Needs delegated admin scopes for admin screens such as user management, submission review, reminders, settings, or audit logs

## Admin

- Full access across the portal
- Access all admin portal sections
- Manage users, roles, activation state, invites, settings, reminders, projects, audit logs, and delegated access

## Delegated Admin Access

Admins can grant limited admin access to volunteers or team leads without changing their main role.

Available scopes:

- `view_users`
- `edit_users`
- `manage_user_status`
- `manage_user_roles`
- `review_submissions`
- `send_reminders`
- `manage_invites`
- `manage_projects`
- `manage_settings`
- `view_audit_logs`
- `view_admin_access`
- `manage_admin_access`

Important:

- delegated access can be time-limited
- delegated access can be revoked
- delegated access gives only the scopes granted, not full admin control

## Current Product Mapping

- `/dashboard` -> all authenticated users
- `/submissions` -> all authenticated users
- `/projects` -> all authenticated users
- `/projects/:projectId` -> all authenticated users
- `/admin` -> full admins and users with delegated admin portal access
- `/admin/users` -> full admins and users with one of:
  - `view_users`
  - `edit_users`
  - `manage_user_status`
  - `manage_user_roles`
  - `manage_invites`
  - `view_admin_access`
  - `manage_admin_access`
- `/admin/submissions` -> full admins and users with `review_submissions`
- `/admin/settings` -> full admins and users with `manage_settings`
- `/admin/audit` -> full admins and users with `view_audit_logs`

For a fuller tutorial-style explanation, see [PORTAL_USER_GUIDE.md](/c:/Guardian's%20Embrace%20Dev/guardians-volunteer-portal/docs/PORTAL_USER_GUIDE.md).
