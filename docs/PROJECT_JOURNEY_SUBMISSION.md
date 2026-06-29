# Guardian's Embrace
## Volunteer Management Portal

**Project:** Technology / IT Infrastructure - Volunteer Management Portal  
**Prepared by:** Ujwal Suresh  
**Project Status:** In Progress  
**Date:** April 2026

---

## What This Project Is About

This project is about building a secure and simple internal portal for Guardian's Embrace so volunteers, team leads, and admins can work in one organized place.

Right now, work updates, project coordination, and visibility can become scattered across different tools and conversations. This portal creates a clearer structure so that:

- volunteers can submit weekly updates in one place
- project work can be organized and tracked
- admins and team leads can see progress across the organization
- blockers, hours, and next steps can be reviewed consistently
- leadership can eventually receive clearer summaries and reporting

---

## Where Things Stand Right Now

The project already has a strong working foundation in place:

- Google sign-in and role-based access are working
- volunteers can submit weekly updates
- admins can review submissions, manage users, and send reminders
- projects and work items are now available inside the portal
- accessibility, autosave, monitoring, and test coverage have been improved
- AWS deployment scripts and cloud deployment planning are already in progress

The next stage is to finish the remaining collaboration work, complete the AWS rollout path, and keep improving how the portal supports project coordination.

---

## The 5-Step Journey

The portal moves through 5 steps. Each step builds on the previous one and creates a clear result before the next stage moves forward.

| Step | Focus | Output |
|------|-------|--------|
| 1 | Build the foundation | Working login, database, and weekly submission flow |
| 2 | Add core volunteer and admin features | Full-featured portal for day-to-day use |
| 3 | Improve user experience, quality, and accessibility | Polished, tested, and easier-to-use application |
| 4 | Expand collaboration and project workflows | Project boards, work items, access requests, and team coordination |
| 5 | Deploy to AWS and prepare production | Live cloud-hosted portal with stronger infrastructure |

**[Insert Diagram 1 here: Project Journey Flow - export from `docs/diagrams/01_project_journey_flow.xml`]**

This diagram should be placed here because it shows the full journey from vision to live delivery across all 5 steps.

---

## Step-by-Step Plan

### Step 1 - Build the Foundation

The first step was to create the core system the rest of the portal depends on.

This included:

- Google OAuth sign-in
- JWT-based session handling
- MongoDB data models
- volunteer, team lead, and admin roles
- first-login name setup
- weekly submission form with hours, blockers, and next steps

**Output:** A working portal where volunteers can log in and submit weekly updates.

### Step 2 - Add Core Volunteer and Admin Features

Once the foundation was stable, the portal expanded into a daily-use tool.

This included:

- admin dashboard and review tools
- user management
- reminder emails
- file uploads
- attendance and hours tracking
- comments and feedback on submissions
- quick check-in mode for faster weekly updates

**Output:** A functional portal that supports regular volunteer and admin workflows.

### Step 3 - Improve User Experience, Quality, and Accessibility

The third step focused on making the portal more trustworthy, recoverable, and easier to use.

This included:

- a simpler volunteer dashboard
- a clearer admin dashboard
- autosave and draft recovery
- stronger admin review queue filters and status views
- accessibility improvements across forms, tables, navigation, and focus states
- frontend and backend test coverage
- monitoring and error capture

**Output:** A more polished and dependable portal experience.

### Step 4 - Expand Collaboration and Project Workflows

This step moves the portal beyond reporting and into real team coordination.

This includes:

- project boards
- work items with status, priority, assignees, and due dates
- project access requests
- lead requests and deletion requests
- delegated admin access for selected admin functions

Planned next-wave collaboration improvements include:

- suggestions and improvement intake
- project-interest and portal-contributor notifications
- handoff notes, checklists, and ownership history
- shadow lead support and lightweight leadership rotation
- workflow refinements inspired by useful patterns from Monday, ClickUp, Jira, Pipedrive, Miro, Asana, Trello, Linear, and Plane

**Output:** A portal where volunteers can collaborate on projects, not only report completed work.

### Step 5 - Deploy to AWS and Prepare Production

The final major step is moving the portal into a stable cloud-hosted production environment.

This includes:

- React frontend hosted through S3 and CloudFront
- FastAPI backend hosted through Lambda and API Gateway
- file storage migration to S3
- production-safe configuration handling
- CI/CD deployment automation
- production hardening such as custom domains, WAF, secrets handling, and monitoring

**Output:** A production-ready volunteer portal hosted in AWS.

**[Insert Diagram 2 here: System Architecture - export from `docs/diagrams/02_system_architecture.xml`]**

This diagram should be placed here because it shows how the portal is structured across users, frontend, backend, data, and AWS services.

---

## Planned Improvements and Iterations

This project is not just being built once and left alone. It is expected to improve over time through feedback, testing, and practical use.

Key future improvements currently identified are:

- suggestion and feedback workflows inside the portal
- notification flows for project interest and contributor coordination
- structured handoff support for project leadership changes
- lightweight leadership rotation support for volunteer environments
- workflow refinement using the best common ideas from modern project-management tools
- stronger CI quality checks for accessibility, performance, and reliability

Likely workflow ideas to evaluate include:

- Kanban-style work boards
- clearer ownership and reassignment
- comments and updates on work items
- due dates and reminders
- saved views and filters
- templates for repeated project setup
- visible project health snapshots

---

## How This Connects to Maxwell's Direction

Maxwell's direction is to make the full journey from vision to execution visible at every level - from the individual volunteer to the project team to leadership.

This portal supports that direction in a practical way:

| Maxwell's Ask | How This Project Delivers It |
|---------------|------------------------------|
| A roadmap for every person, group, and project | The 5-step journey shows how the portal grows from foundation to full organizational support |
| Visibility into what everyone is working on | Weekly submissions and project work items create one structured place for activity |
| Progress visible at each milestone | Dashboards, review queues, hours data, and project workflows make progress easier to see |
| Improvement along the way | The portal is being refined through feedback, testing, and ongoing iteration |
| Executive-level summary and dashboard | The portal creates the data structure needed for future leadership reporting and summaries |

---

## Current Status and Next Steps

| Area | Status |
|------|--------|
| Foundation (Auth, Submissions, Database) | Complete |
| Core Features (Admin, Files, Email) | Complete |
| UX, Quality, Accessibility, and Monitoring | Largely complete |
| Collaboration (Projects and Work Items) | In Progress |
| AWS Deployment | In Progress |
| CI/CD Pipeline | In Progress |
| Custom Domain | Pending |

**Next Steps**

- complete the remaining project and work-item collaboration features
- finish file storage migration from local and Drive-based handling to S3
- validate the AWS test deployment end-to-end
- set up the GitHub Actions CI/CD deployment flow
- complete production hardening and go-live preparation
- begin the next collaboration package: suggestions, notifications, and lightweight handoff workflows

**[Insert Diagram 3 here: Continuous Improvement / DMAIC - export from `docs/diagrams/03_improvement_cycle.xml`]**

This diagram should be placed here because it shows how the portal will keep improving through feedback, analysis, implementation, and quality control.

---

## Expected Outcome

By the end of this project, Guardian's Embrace will have:

- a secure and organized volunteer management portal
- one place for volunteers to submit updates, hours, blockers, and next steps
- stronger project coordination through project boards and work items
- better visibility for admins, team leads, and leadership
- a clearer operational path from daily volunteer work to leadership reporting
- a technical foundation that can support future dashboards, summaries, and collaboration improvements

