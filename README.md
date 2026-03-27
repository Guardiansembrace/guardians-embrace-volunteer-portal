# Guardian's Embrace — Volunteer Portal

A secure, internal volunteer management portal for [Guardian's Embrace](https://guardiansembrace.org). Volunteers sign in with Google, submit weekly check-ins, upload files to a shared Google Drive, and track their contributions over time.

> *Defending the Vulnerable, Restoring Hope*

---

## Features

- **Google OAuth** — Sign in with your `@guardiansembrace.org` account (or any approved Google account).
- **Weekly Check-ins** — Log past/present/future work, hours, and blockers each week.
- **Quick Check-in Mode** — Minimal form for fast weekly updates when you're short on time.
- **File Uploads** — Attach files to submissions; stored on a Shared Google Drive via a service account.
- **Goal Carry-Forward** — Unfinished goals from last week are surfaced in the new submission.
- **Categories & Tags** — Classify work entries (Outreach, Events, Tech, Admin, etc.).
- **Mood / Satisfaction Rating** — Optional emoji-based self-rating per submission.
- **Submission Streaks** — Track consecutive weeks of on-time submissions.
- **Late Submission Detection** — Submissions after the deadline are automatically flagged.
- **Hours Trend Chart** — Visualize hours contributed over recent weeks.
- **Attendance Grid** — GitHub-style heatmap showing weekly submission history.
- **Comments & Feedback** — Admins can leave comments on submissions; threaded replies supported.
- **Email Reminders** — Admins can send reminder emails to volunteers who haven't submitted yet.
- **Admin Dashboard** — Manage users, review submissions, send reminders, view org-wide stats.
- **Role-Based Access** — Volunteer, Team Lead, and Admin roles with scoped permissions.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Python 3.11+, FastAPI, Beanie (MongoDB ODM), Motor |
| **Frontend** | React 19, TypeScript, Vite, React Router |
| **Database** | MongoDB Atlas (free tier works fine) |
| **Auth** | Google OAuth 2.0 → JWT |
| **File Storage** | Google Shared Drive (service account) with local fallback |
| **Email** | SMTP (Gmail / Google Workspace compatible) |
| **Styling** | Custom CSS with design tokens from `shared/config.json` |

---

## Project Structure

```
guardians-volunteer-portal/
├── backend/                     # FastAPI application
│   ├── app/
│   │   ├── api/                 # Route handlers
│   │   │   ├── auth.py          # Google OAuth login
│   │   │   ├── users.py         # User profile & admin ops
│   │   │   ├── submissions.py   # Weekly check-ins CRUD
│   │   │   ├── comments.py      # Submission comments
│   │   │   ├── files.py         # File upload / download
│   │   │   └── notifications.py # Email reminders
│   │   ├── core/                # Shared services
│   │   │   ├── config.py        # Settings from .env
│   │   │   ├── database.py      # MongoDB connection
│   │   │   ├── security.py      # JWT & Google token verification
│   │   │   ├── drive.py         # Shared Drive integration
│   │   │   ├── storage.py       # Local file fallback
│   │   │   ├── email.py         # SMTP email service
│   │   │   └── utils.py         # Week/date helpers
│   │   ├── models/              # Beanie document models
│   │   │   ├── user.py
│   │   │   ├── submission.py
│   │   │   └── comment.py
│   │   └── main.py              # App entry point
│   ├── tests/                   # Pytest test suite
│   ├── requirements.txt
│   └── .env                     # Environment vars (not committed)
│
├── frontend-react/              # Vite + React + TypeScript
│   ├── src/
│   │   ├── components/          # Reusable UI (Layout, FileUpload, etc.)
│   │   ├── lib/                 # API client, AuthContext, config
│   │   ├── pages/               # Route pages
│   │   │   ├── LoginPage.tsx
│   │   │   ├── SetNamePage.tsx  # First-login name prompt
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── NewSubmissionPage.tsx
│   │   │   ├── SubmissionsPage.tsx
│   │   │   ├── AdminUsersPage.tsx
│   │   │   └── AdminSubmissionsPage.tsx
│   │   └── types/index.ts
│   ├── package.json
│   └── .env                     # Frontend env vars (not committed)
│
├── shared/
│   └── config.json              # Shared settings: roles, colors, categories
│
└── README.md
```

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- A MongoDB database (Atlas free tier, or local)
- A Google Cloud project with OAuth 2.0 credentials
- *(Optional)* A Google Workspace Shared Drive + service account for file uploads
- *(Optional)* SMTP credentials for email reminders

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/guardians-volunteer-portal.git
cd guardians-volunteer-portal
```

### 2. Backend Setup

```bash
cd backend

# Create a virtual environment
python -m venv venv
venv\Scripts\activate           # Windows
# source venv/bin/activate      # macOS / Linux

# Install dependencies
pip install -r requirements.txt

# Create your environment file
cp .env.example .env
# Edit .env — fill in MongoDB URI, Google OAuth credentials, JWT secret, etc.

# Run the server
python -m uvicorn app.main:app --reload --port 8081
```

The API will be available at `http://localhost:8081` with interactive docs at `/api/docs`.

### 3. Frontend Setup

```bash
cd frontend-react

# Install dependencies
npm install

# Create your environment file
cp .env.example .env
# Edit .env — set API URL and Google Client ID

# Start the dev server
npm run dev
```

The app will open at `http://localhost:5173`.

### 4. First Login

1. Open `http://localhost:5173` and sign in with Google.
2. On first login you'll be asked to confirm your full name.
3. If your email is listed in `ADMIN_EMAILS` (backend `.env`) or `shared/config.json → admins`, you'll automatically get the Admin role.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Example |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | `mongodb+srv://user:pass@cluster.mongodb.net/db` |
| `MONGODB_DATABASE` | Database name | `guardians_portal` |
| `JWT_SECRET` | Secret key for signing JWT tokens | *(random string, 32+ chars)* |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | `123456.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | `GOCSPX-...` |
| `ALLOWED_ORIGINS` | CORS origins (comma-separated) | `http://localhost:5173,http://localhost:3000` |
| `ADMIN_EMAILS` | Admin email addresses (comma-separated) | `admin@guardiansembrace.org` |
| `DEBUG` | Enable debug mode | `true` |
| `HOST` | Backend bind host | `0.0.0.0` |
| `PORT` | Backend bind port | `8081` |
| `GOOGLE_DRIVE_SHARED_DRIVE_ID` | Shared Drive ID for file uploads | `0AHy...` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service account JSON | `service-account.json` |
| `SMTP_HOST` | SMTP server hostname | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP server port | `587` |
| `SMTP_USERNAME` | SMTP login email | `noreply@guardiansembrace.org` |
| `SMTP_PASSWORD` | SMTP password or app password | *(app password)* |
| `SMTP_FROM_EMAIL` | "From" address on outgoing emails | `noreply@guardiansembrace.org` |

### Frontend (`frontend-react/.env`)

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_DEV_PORT` | Frontend dev server port | `5173` |
| `VITE_API_PORT` | Backend API port used by the frontend | `8081` |
| `VITE_API_URL` | Optional full backend API base URL override | `http://localhost:8081` |
| `VITE_GOOGLE_CLIENT_ID` | Same Google OAuth client ID | `123456.apps.googleusercontent.com` |

---

## Google Drive Setup

File uploads are stored on a Google Workspace **Shared Drive** using a service account. This avoids per-user Drive quota issues and keeps all files in a central location.

1. Create a Shared Drive in Google Workspace (e.g., "Volunteer Submissions").
2. Create a service account in the Google Cloud Console with Drive API enabled.
3. Download the service account key as `service-account.json` and place it in `backend/`.
4. Add the service account email as a **Content Manager** on the Shared Drive.
5. Set `GOOGLE_DRIVE_SHARED_DRIVE_ID` and `GOOGLE_APPLICATION_CREDENTIALS` in `.env`.

See [`docs/GOOGLE_DRIVE_SETUP.md`](docs/GOOGLE_DRIVE_SETUP.md) for detailed instructions.

If Google Drive is not configured, file uploads fall back to local storage in `backend/uploads/`.

---

## API Overview

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/auth/google` | Exchange Google token for JWT |
| `GET` | `/api/v1/auth/verify` | Verify current JWT |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/users/me` | Get current user profile |
| `POST` | `/api/v1/users/me/set-name` | Set display name (first login) |
| `GET` | `/api/v1/users` | List all users *(admin)* |
| `PATCH` | `/api/v1/users/{id}` | Update a user *(admin)* |

### Submissions
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/submissions/current-week` | Current week info + deadline |
| `GET` | `/api/v1/submissions/my` | List my submissions |
| `POST` | `/api/v1/submissions` | Create or update a submission |
| `POST` | `/api/v1/submissions/{id}/submit` | Mark as submitted |
| `GET` | `/api/v1/submissions/hours-trend` | Hours over recent weeks |
| `GET` | `/api/v1/submissions/attendance` | Weekly attendance grid |
| `GET` | `/api/v1/submissions/categories` | Available work categories |
| `GET` | `/api/v1/submissions/last-week-goals` | Carry-forward goals |

### Files
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/files/upload/{submission_id}` | Upload a file |
| `GET` | `/api/v1/files/download/{filename}` | Download a file |
| `DELETE` | `/api/v1/files/{submission_id}/{file_id}` | Delete a file |

### Comments
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/comments/submission/{id}` | Get comments on a submission |
| `POST` | `/api/v1/comments/submission/{id}` | Add a comment |

### Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/notifications/email-status` | Check SMTP config status *(admin)* |
| `POST` | `/api/v1/notifications/send-reminders` | Send reminder emails *(admin)* |

Full interactive documentation is available at `/api/docs` when the backend is running.

---

## User Roles

| Role | Level | Permissions |
|------|-------|-------------|
| **Volunteer** | 1 | View/edit own submissions, upload files |
| **Team Lead** | 2 | + View team submissions |
| **Admin** | 10 | Full access: manage users, review all submissions, send reminders |

Admin emails can be set in two places:
- `ADMIN_EMAILS` in `backend/.env`
- `admins` array in `shared/config.json`

---

## Weekly Submission Schedule

- **Submission window**: Friday → Sunday (configurable in `shared/config.json`)
- **Timezone**: `America/New_York`
- Submissions after the deadline are accepted but flagged as **late**.
- Volunteers who haven't submitted by the deadline can receive email reminders (sent by admins).

---

## Running Tests

```bash
cd backend
pytest tests/ -v
```

---

## Deployment Notes

- Set `DEBUG=false` in production.
- Use a strong, random `JWT_SECRET`.
- Configure `ALLOWED_ORIGINS` to match your production frontend URL.
- Ensure `service-account.json` is **never** committed to version control.
- For Gmail SMTP, use an [App Password](https://support.google.com/accounts/answer/185833) instead of your account password.

---

## License

Private — Guardian's Embrace © 2026
