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
- Create new projects
- Request access to projects
- Request to become the lead of a project
- Request deletion of a project
- Contribute to project work after being added to a project
- Cannot access the admin portal by default

## Team Lead

- Includes everything a volunteer can do
- Create, update, and delete projects
- Add and remove project members
- Manage project work items and assignments
- Approve and decline project access requests
- Approve and decline project lead requests
- Approve and decline project deletion requests
- Can organize project operations directly in the project area
- Does not automatically get the full admin portal
- Needs delegated admin scopes for admin screens such as user management, submission review, reminders, settings, or audit logs

## Project Lead (per project)

Anyone assigned as the lead of a specific project — even a volunteer — can manage that project from its board, without needing a global role or delegated scope:

- Approve and decline access, leadership, and **deletion** requests for that project
- Approve a leadership request to transfer the lead role to another member
- Manage that project's work items, assignments, and tags
- Approving a deletion request permanently deletes the project (a confirmation is required); the requester is notified when their request is declined

This is scoped to the projects they lead. Operations users (`admin` / `team_lead`) and `manage_projects` holders can do the same across all projects.

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
- `manage_crm` (access the CRM workspace with donor, partner, and contact data)
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
- `/crm` -> full admins and users with `manage_crm` (the CRM nav link is hidden unless you have this scope)
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
