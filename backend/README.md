# Backend — FastAPI + MongoDB + Beanie

The volunteer portal API built with FastAPI, MongoDB, and Beanie ODM.

## Setup

```bash
python -m venv venv
venv\Scripts\activate           # Windows
# source venv/bin/activate      # macOS / Linux

pip install -r requirements.txt
cp .env.example .env            # fill in credentials
python -m uvicorn app.main:app --reload --port 8000
```

API docs: `http://localhost:8000/api/docs`

## Key Modules

| Module | Purpose |
|--------|---------|
| `app/api/auth.py` | Google OAuth login, JWT token issuance |
| `app/api/submissions.py` | Weekly check-in CRUD, attendance, hours trend |
| `app/api/users.py` | User profile, admin user management |
| `app/api/files.py` | File upload / download (Drive or local) |
| `app/api/comments.py` | Comments on submissions |
| `app/api/notifications.py` | Email reminders (admin-only) |
| `app/core/config.py` | Settings loaded from `.env` |
| `app/core/database.py` | MongoDB connection via Motor + Beanie |
| `app/core/security.py` | JWT creation/verification, Google token validation |
| `app/core/drive.py` | Google Shared Drive integration (service account) |
| `app/core/storage.py` | Local file storage fallback |
| `app/core/email.py` | SMTP email sending |
| `app/core/utils.py` | Week ID helpers, submission window logic |
| `app/models/` | Beanie document models (User, Submission, Comment) |

## Tests

```bash
pytest tests/ -v
```

## Environment Variables

See `.env.example` for the full list with setup instructions.
