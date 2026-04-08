# Portal User Guide

This guide explains what people can do in the Guardian's Embrace Volunteer Management Portal, how permissions work, and how to use the main features day to day.

This guide reflects the current portal behavior as of April 2, 2026.

## What The Portal Is For

The portal is the shared place where Guardian's Embrace volunteers and leaders can:

- submit weekly work updates
- browse projects and see what is happening across teams
- request access to projects
- manage project work items and assignments
- review work when the right access has been granted
- track operational tasks without losing context between volunteers and leaders

## Getting Started

1. Sign in with your approved Google account.
2. If this is your first login, complete your display name.
3. Open the main areas you need:
   - `Dashboard` for your overview
   - `Submissions` for weekly updates
   - `Projects` for project boards and work items
   - `Admin` only if you have full admin access or delegated admin privileges

If you were invited but have not logged in yet, your account may appear in the system as `Pending login` until you complete your first sign-in.

## How Permissions Work

Portal permissions come from two places:

- Your main role:
  - `Volunteer`
  - `Team Lead`
  - `Admin`
- Optional delegated admin scopes:
  - extra privileges granted by an admin without making someone a full admin

Important:

- Not every team lead automatically gets the full admin portal.
- Admin portal screens are controlled by delegated scopes unless the user is a full `Admin`.
- Two people with the same main role may still see different tools if one of them has delegated access.

## What Volunteers Can Do

Volunteers can:

- sign in and complete their profile
- view their dashboard and submission history
- create weekly updates
- save drafts and submit updates for review
- view their own submission comments and reply in their own thread
- browse all projects and see boards, work items, and members
- request access to a project they want to help with
- contribute to project work after being added to that project

Volunteers cannot, unless separately granted access:

- open the admin portal
- manage users, roles, or invites
- review all submissions
- change global settings
- view audit logs

## What Team Leads Can Do

Team leads can do everything volunteers can do, plus project operations inside the project area.

Team leads can:

- create new projects
- update project details
- add and remove project members
- assign or reassign project work items
- assign one work item to multiple teammates
- approve or decline project join requests
- help organize work on project boards

Team leads do not automatically get full admin portal access. If a team lead needs extra tools like submission review, reminders, user management, or settings access, an admin should grant delegated scopes.

## What Admins Can Do

Admins have full access across the portal.

Admins can:

- do everything volunteers and team leads can do
- access the admin portal
- view users and user statistics
- edit user profiles
- activate or deactivate users
- promote or demote users between volunteer, team lead, and admin roles
- create, resend, and revoke invitations
- review submissions
- send reminder emails
- manage projects
- edit forms, weekly update settings, tags, and global settings
- view audit logs
- grant or revoke delegated admin access

## What Delegated Access Means

Admins can grant limited admin access to a volunteer or team lead without making them a full admin.

Delegated access can be given for one or more of these scopes:

- `View users`
  - Open the user directory and inspect accounts.
- `Edit user profiles`
  - Update user names and team assignments without changing access.
- `Manage account status`
  - Activate or deactivate user accounts.
- `Manage user roles`
  - Promote or demote volunteers and team leads.
- `Review submissions`
  - Open the submission queue and mark weekly reports reviewed.
- `Send reminders`
  - Check email status and send reminder emails.
- `Manage invites`
  - Create, resend, and revoke invitations.
- `Manage projects`
  - Create project boards, manage assignments, and review join requests.
- `Forms & settings`
  - Edit submission forms, schedules, and global portal settings.
- `View audit logs`
  - Inspect tracked admin and security activity.
- `View delegated access`
  - See who currently has delegated admin access.
- `Manage delegated access`
  - Create, update, and revoke delegated access grants.

Notes:

- Delegated access can expire automatically if an expiry date is set.
- Delegated access can be revoked at any time by an admin.
- Delegated access is scoped. It does not turn someone into a full admin unless their main role is changed.

## Weekly Submission Tutorial

Use this flow for your weekly update:

1. Open `Dashboard` or `Submissions`.
2. Click `New Submission`.
3. Review the current week and any scheduling notice.
4. Fill in your work:
   - past work
   - present work
   - future work
   - blockers
   - notes
   - files, if needed
5. Save a draft if you are not ready yet.
6. Submit when the update is complete.
7. Return later to view comments or review history.

Submission statuses:

- `Draft`
  - You started the update but have not submitted it yet.
- `Submitted`
  - You sent it for review.
- `Reviewed`
  - It has been reviewed and is treated as final.

Helpful notes:

- The portal can show whether the weekly submission window is open.
- Late submissions may still be allowed, depending on the current settings.
- If a reviewed submission is locked, you may need an admin to help if changes are required.

## Project And Work Item Tutorial

Everyone who is signed in can view projects and see what is happening on project boards.

### If You Want To Join A Project

1. Open `Projects`.
2. Open the project you want.
3. Click `Request Access` if you are not already part of the team.
4. Add a short message about how you want to help.
5. Wait for a project manager, team lead, or someone with project-management access to approve it.

### If You Are Already On The Project

You can:

- view project updates and work items
- create work items if you are a project contributor
- join an existing work item
- work on assigned tasks
- collaborate with other assigned teammates when a work item has multiple assignees

### If You Manage Project Work

You can:

- create and edit project boards
- assign members
- create work items
- assign a work item to one or more people
- review join requests
- keep bugs, improvements, and handoffs visible on the board

## How To Report Bugs Or Improvement Ideas

If something breaks, feels confusing, or should be improved, use both of these systems when appropriate:

- GitHub issues for engineering tracking
- Portal work items for team coordination

### GitHub Issue Workflow

Open an issue in the Guardian's Embrace repository:

- Repository: `https://github.com/Guardiansembrace/guardians-embrace-volunteer-portal`

When you raise an issue, include:

- a clear title
- what you expected
- what actually happened
- steps to reproduce it
- screenshots or screen recordings if helpful
- your role in the portal
- browser or device details if relevant

### Portal Work Item Workflow

If the issue belongs to an active project:

1. Open the relevant project board in the portal.
2. Create a work item for the bug, fix, or improvement.
3. Add the GitHub issue link in the description if one exists.
4. Assign the work item to one or more teammates.

This keeps the engineering issue in GitHub and the operational follow-through visible in the portal.

## If You Want To Fix A Bug Yourself

If you or another contributor want to implement the fix:

1. Open or claim the GitHub issue.
2. Add or update a related project work item in the portal.
3. Follow the repo guidance in [CONTRIBUTING.md](/c:/Guardian's%20Embrace%20Dev/guardians-volunteer-portal/CONTRIBUTING.md).
4. Work in a branch, keep the change focused, and avoid editing shared hotspot files without coordination.

## Common Situations

### I Can Sign In But I Cannot Access The Admin Portal

That usually means:

- you are not a full admin
- or you have not been granted delegated admin scopes yet

Ask an admin to verify your access level.

### I Can See A Project But I Cannot Work On It

That usually means you can view the board, but you are not yet a project member.

Use `Request Access` on the project page or ask a project lead/admin to add you.

### My Work Submission Is Locked

Possible reasons:

- the submission window is closed
- late submissions are disabled for that week
- the submission has already been reviewed

Ask an admin if the week needs to be reopened or clarified.

### I Was Invited But I Do Not Show As Fully Active Yet

That usually means your account exists, but you still need to complete your first login.

### I Need A Different Level Of Access

Ask an admin whether you need:

- a role change
- project membership
- or a delegated admin scope

## Recommended Day-To-Day Use

### Volunteers

- Check your dashboard.
- Submit your weekly update on time.
- Browse projects and request access where you want to help.
- Use project work items to stay aligned with the team.

### Team Leads

- Keep project boards current.
- Assign work clearly.
- Review join requests quickly.
- Use shared work items when multiple people are collaborating.
- Ask admins for delegated access only when you need broader tools.

### Admins

- Keep users, invites, and delegated access clean.
- Review submissions regularly.
- Use reminders when needed.
- Keep forms and weekly schedule settings aligned with current operations.
- Watch audit logs for important admin and security activity.

## Related References

- Role matrix: [ROLE_PERMISSION_MATRIX.md](/c:/Guardian's%20Embrace%20Dev/guardians-volunteer-portal/docs/ROLE_PERMISSION_MATRIX.md)
- Contributor workflow: [CONTRIBUTING.md](/c:/Guardian's%20Embrace%20Dev/guardians-volunteer-portal/CONTRIBUTING.md)
- Collaboration roadmap: [COLLABORATION_FEATURE_PLAN.md](/c:/Guardian's%20Embrace%20Dev/guardians-volunteer-portal/docs/COLLABORATION_FEATURE_PLAN.md)
