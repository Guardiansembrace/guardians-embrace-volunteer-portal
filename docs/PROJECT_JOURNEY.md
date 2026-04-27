# Guardian's Embrace — Volunteer Management Portal
## Technology Project Journey

**Project:** Tech / IT Infrastructure — Volunteer Management Portal  
**Prepared by:** Ujwal Suresh (Technology Team)  
**Project Status:** In Progress  
**Date:** April 2026

---

## What This Project Is About

This project is about building and deploying a secure, internal web application for Guardian's Embrace that replaces scattered manual communication with a structured, mission-aligned system.

Volunteers need a simple, clear place to report their weekly work, collaborate on projects, and stay connected to the organization's mission. Admins and team leads need real-time visibility into all volunteer activity so they can guide, support, and report on progress across the organization.

Right now, without this portal:
- Volunteer work updates are untracked or sent informally
- Project collaboration depends on external tools with no central ownership
- Leadership has no automated way to see what is happening across teams
- There is no structured record of volunteer hours, blockers, or progress

This project puts that structure in place.

---

## Overall Goal

Build, deploy, and maintain a production-ready volunteer management portal that:

- Gives every volunteer a clear weekly place to log their work, hours, and blockers
- Gives admins and team leads real-time visibility across all projects and submissions
- Enables structured team collaboration through projects, work items, and role-based access
- Operates securely on AWS cloud infrastructure with Google sign-in
- Continuously improves through feedback from volunteers, admins, and the guidance of the Lord

---

## The 5-Phase Journey

The project moves through 5 phases. Each phase builds on the previous one and produces a clear, usable result before the next phase begins.

| Phase | Focus | Key Output |
|-------|-------|------------|
| 1 | Foundation: Authentication, Database, Core Submissions | Working login and first weekly submission flow |
| 2 | Core Features: Admin Dashboard, Files, Email | Full-featured portal for volunteers and admins |
| 3 | UX, Quality, and Accessibility | Polished, tested, and accessible application |
| 4 | Collaboration: Projects and Work Items | Team-based project management inside the portal |
| 5 | AWS Deployment: Cloud and Production | Live production environment on AWS |

*See Diagram 1 for the full journey flow.*

---

## Phase-by-Phase Detail

### Phase 1 — Foundation

The goal of Phase 1 was to establish the core infrastructure that everything else is built on.

**What was built:**
- Google OAuth sign-in with JWT session management
- MongoDB Atlas database with structured models for users and weekly submissions
- Weekly submission form covering past work, current work, next steps, hours contributed, and blockers
- Role-based access control: Volunteer, Team Lead, and Admin roles
- Admin email configuration for automatic role assignment on first login
- First-login name confirmation flow

**Output:** A working portal where volunteers can sign in with their Google account and submit weekly updates.

---

### Phase 2 — Core Features

Phase 2 extended the foundation into a full-featured application that volunteers and admins could use daily.

**What was built:**
- Admin Dashboard: manage users, review all submissions, send email reminders, view org-wide stats
- File Uploads: volunteers can attach files to submissions, stored on Google Shared Drive via a service account with local fallback
- Submission streaks and late submission detection
- Hours trend chart showing hours contributed across recent weeks
- Attendance heatmap (GitHub-style weekly submission history)
- Comments and feedback: admins can leave comments on submissions with threaded replies
- Quick Check-in mode for fast weekly updates when time is short
- Email reminders via SMTP for volunteers who have not yet submitted

**Output:** A fully functional portal for day-to-day use across the volunteer organization.

---

### Phase 3 — UX, Quality, and Accessibility

Phase 3 focused on making the portal trustworthy, polished, and usable for everyone.

**What was built:**
- Simplified volunteer dashboard: a weekly action page focused on what to do right now
- Simplified admin dashboard: an operations-first page focused on what needs attention
- Autosave for submissions with visible save state, recovery messaging, and safe draft clearing
- Admin submissions queue improvements: attention-first views, urgency sorting, better filters, clear empty and error states
- Accessibility pass: shared focus states, skip navigation, semantic tables, screen-reader labels, reduced-motion support, and improved contrast throughout
- Frontend test coverage: login flows, protected routes, submission workflows, and admin review workflows
- Backend test coverage: user profile completion, current-week submission status, settings, invite create and revoke flows
- Production monitoring pipeline: backend request IDs, frontend error reporter, and a log ingestion endpoint so runtime issues can be traced
- Frontend lint cleanup and full build stabilization

**Output:** A polished, tested, and accessible portal ready for production-level usage.

---

### Phase 4 — Collaboration

Phase 4 adds team-based project management to the portal so volunteers can collaborate, not just report.

**What is being built:**
- Projects: volunteers can view all projects, create new ones, and request to join
- Work items: structured tasks within projects with status, priority, assignees, and due dates
- Role-based project access: team leads can manage members, approve or decline join requests, assign work items to one or multiple people
- Project lead requests and project deletion requests managed inside the portal
- Admin delegated access: admins can grant specific permissions (submissions review, project management, invites, settings) without making someone a full admin

**Output:** A portal where the full volunteer organization can collaborate on projects, not just submit weekly reports.

**Planned next-wave collaboration roadmap:**
- Feedback and suggestions workflow with intake, categorization, and visible statuses such as `planned` and `completed`
- Interest and notification system for project-interest and portal-contributor-interest events
- Project handoff workflows with current lead, next lead, handoff notes, checklist, transfer confirmation, and ownership history
- Lightweight leadership rotation support with shadow leads, reminders, and handoff-readiness signals
- Workflow refinement based on useful patterns studied from Monday, ClickUp, Jira, Pipedrive, Miro, Asana, Trello, Linear, and Plane
- Likely workflow ideas to evaluate include Kanban-style boards, clearer assignee ownership, comments and updates on work items, due dates and reminders, saved views and filters, templates, and project health snapshots
- Product guardrails that keep the portal simple, role-aware, easy to scan, and collaborative without becoming noisy

---

### Phase 5 — AWS Deployment

Phase 5 moves the portal from local development to a live, cloud-hosted production environment.

**What is being built:**
- Frontend: React build deployed to a private S3 bucket served through CloudFront CDN
- Backend: FastAPI application packaged for AWS Lambda and fronted by API Gateway
- File storage: migrating from local fallback and Google Drive to S3 for serverless-safe storage
- Configuration management: `.env.aws` pattern separating production credentials from local development
- Deployment scripts: PowerShell scripts for automated backend and frontend deployment to AWS
- CI/CD pipeline: GitHub Actions workflow for automated test, build, and deploy on merge to main
- Production hardening: custom domains, WAF, Secrets Manager, and CloudWatch alarms

**Output:** A live production portal hosted on AWS, accessible at `https://portal.guardiansembrace.org`.

*See Diagram 2 for the system architecture.*

---

## How This Connects to Maxwell's Direction

Maxwell's direction is to build a system where the full journey from vision to execution is visible at every level — from individual volunteers to project teams to leadership.

This project creates the technical foundation that makes that possible:

| Maxwell's Ask | How This Project Delivers It |
|--------------|------------------------------|
| A clear roadmap from vision to execution | The 5-phase journey takes the portal from an idea to a live, cloud-hosted production system |
| Visibility into what everyone is working on | Weekly submissions and project work items capture all volunteer activity in one place |
| Progress visible at each milestone | The admin dashboard, submission history, and hours tracking give real-time org-wide visibility |
| Improvement along the way | Every sprint refines the portal based on volunteer feedback, admin input, and guidance |
| Roadmap for every person, group, and project | Role-based access ensures every volunteer, team lead, and admin has the right view |
| Executive-level summary | Admin dashboards and weekly submission data feed reporting and future leadership summaries |

---

## Current Status and Next Steps

| Area | Status |
|------|--------|
| Foundation (Auth, Submissions, Database) | Complete |
| Core Features (Admin, Files, Email) | Complete |
| UX and Quality (Accessibility, Testing, Monitoring) | Largely complete — accessibility polish ongoing |
| Collaboration (Projects, Work Items) | In Progress |
| AWS Deployment | In Progress — scripts in place, test deployment underway |
| CI/CD Pipeline | In Progress |
| Custom Domain (portal.guardiansembrace.org) | Pending |

**Immediate Next Steps:**
1. Complete project and work item collaboration features
2. Complete file storage migration from local/Drive to S3
3. Validate the full AWS test deployment end-to-end (login, submissions, file upload, admin pages)
4. Set up the GitHub Actions CI/CD pipeline
5. Production hardening and go-live
6. Start the next collaboration package: suggestions, notifications, and lightweight handoff workflows

---

## Guided by Feedback, Prayer, and Purpose

Every improvement in this portal is shaped by two things: feedback from volunteers and admins about what is working and what needs to change, and prayerful guidance as we seek to serve God's mission through Guardian's Embrace.

We are grateful for every suggestion, bug report, and prayer that helps this work move forward with clarity and purpose.

| Volunteer Feedback | Admin Feedback | Prayer and Faith Guidance |
|-------------------|----------------|--------------------------|
| Weekly submission responses | Submission review patterns | Prayerful discernment |
| Bug reports and improvement suggestions | User management and role decisions | Direction from God's word |
| Project join requests and collaboration needs | Dashboard clarity and reporting needs | Faith-aligned decisions |
| Work item updates and blockers | Reminder workflow effectiveness | Leadership inspiration |

*See Diagram 3 for the continuous improvement cycle.*

---

## Expected Outcomes

By the completion of this project, Guardian's Embrace will have:

- A live, secure volunteer management portal hosted on AWS
- Every volunteer able to sign in, submit weekly updates, and collaborate on projects from any device
- Full project management tools for all active teams across the organization
- Real-time visibility for admins and team leads into all volunteer activity and progress
- A reliable, tested, monitored system that grows alongside the organization and its mission
- A technical foundation that supports future dashboards, reporting, and leadership visibility tools
