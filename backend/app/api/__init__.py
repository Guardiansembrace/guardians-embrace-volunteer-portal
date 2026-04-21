from .submissions import project_router as project_submissions_router
from .auth import router as auth_router
from .users import router as users_router
from .submissions import router as submissions_router
from .comments import router as comments_router
from .files import router as files_router
from .files import project_files_router, submission_files_router
from .notifications import router as notifications_router
from .projects import router as projects_router
from .project_work_items import router as project_work_items_router
from .project_join_requests import router as project_join_requests_router
from .invites import router as invites_router
from .settings import router as settings_router
from .monitoring import router as monitoring_router
from .admin_access import router as admin_access_router
