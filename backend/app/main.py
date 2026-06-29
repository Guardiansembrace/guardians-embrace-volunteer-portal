"""
Guardian's Embrace - Volunteer Portal Backend
FastAPI application entry point.
"""

from contextlib import asynccontextmanager
import asyncio
import logging
import os
import sys
import uuid

# Motor (the async MongoDB driver) is incompatible with the Windows ProactorEventLoop
# introduced as default in Python 3.8+ / 3.13. Force the SelectorEventLoop on Windows
# so that Motor's socket operations work correctly during startup.
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

def _env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def configure_logging() -> None:
    """Configure application logging once, preferring stdout for cloud runtimes."""
    root_logger = logging.getLogger()
    if root_logger.handlers:
        return

    root_logger.setLevel(logging.DEBUG)
    formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.DEBUG)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    is_lambda = bool(os.getenv("AWS_LAMBDA_FUNCTION_NAME"))
    if not is_lambda and _env_flag("LOG_TO_FILE"):
        log_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "logs")
        os.makedirs(log_dir, exist_ok=True)
        file_handler = logging.FileHandler(os.path.join(log_dir, "app.log"))
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)


configure_logging()

logger = logging.getLogger(__name__)
logger.info("=" * 60)
logger.info("Logging initialized - backend starting up")
logger.info("=" * 60)

from app.core.config import get_settings
from app.core.database import db
from app.core.weekly_updates import hydrate_weekly_update_settings
from app.models.settings import AdminSettings

_DEFAULT_JWT_SECRET = "change-this-in-production-to-a-secure-random-string"
from app.api import (
    auth_router,
    users_router,
    submissions_router,
    project_submissions_router,
    comments_router,
    files_router,
    project_files_router,
    submission_files_router,
    notifications_router,
    projects_router,
    project_work_items_router,
    project_join_requests_router,
    invites_router,
    settings_router,
    monitoring_router,
    admin_access_router,
    crm_router,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown."""
    # Startup
    settings = get_settings()
    if settings.jwt_secret == _DEFAULT_JWT_SECRET:
        logger.warning(
            "SECURITY WARNING: JWT_SECRET is set to the default insecure value. "
            "Set a strong random secret in your .env before deploying to production."
        )
    await db.connect()
    try:
        settings_doc = await AdminSettings.find_one({"settings_id": "global"})
    except Exception:
        settings_doc = None
    hydrate_weekly_update_settings(settings_doc)
    yield
    # Shutdown
    await db.disconnect()


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()
    
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="Secure volunteer portal for Guardian's Embrace - submit work updates and track contributions.",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )
    
    # CORS middleware
    logger.info("Allowed origins: %s", settings.allowed_origins)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
    )
    
    # Global exception handler to catch all errors
    from starlette.requests import Request
    from starlette.responses import JSONResponse
    from bson import ObjectId
    from app.core.audit import write_audit_log
    from app.core.security import decode_access_token
    from app.models.user import User
    
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        request_id = getattr(request.state, "request_id", None)
        logger.error(
            "[%s] Unhandled exception on %s %s: %s",
            request_id, request.method, request.url.path, exc, exc_info=True
        )
        # Prevent leaking sensitive traceback and internal details to the client
        return JSONResponse(
            status_code=500,
            content={
                "detail": "Internal server error occurred.",
                "request_id": request_id,
            },
            headers={"X-Request-ID": request_id} if request_id else None,
        )
    
    # Add request logging middleware
    from starlette.middleware.base import BaseHTTPMiddleware
    
    class LoggingMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
            request.state.request_id = request_id
            logger.debug("[%s] %s %s - Processing...", request_id, request.method, request.url.path)
            response = await call_next(request)
            response.headers["X-Request-ID"] = request_id
            logger.info("[%s] %s %s -> %s", request_id, request.method, request.url.path, response.status_code)
            if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
                try:
                    actor = None
                    auth_header = request.headers.get("Authorization", "")
                    if auth_header.startswith("Bearer "):
                        payload = decode_access_token(auth_header.removeprefix("Bearer ").strip())
                        if payload and payload.get("sub"):
                            try:
                                actor = await User.get(ObjectId(payload["sub"]))
                            except Exception:
                                actor = None
                    if actor is not None:
                        await write_audit_log(
                            request=request,
                            actor=actor,
                            action=f"http.{request.method.lower()}",
                            resource_type="http_request",
                            resource_id=request.url.path,
                            summary=f"{request.method} {request.url.path}",
                            status_code=response.status_code,
                            success=response.status_code < 400,
                            metadata={"query": dict(request.query_params)},
                        )
                except Exception:
                    logger.warning("[%s] Failed to write audit log for %s %s", request_id, request.method, request.url.path, exc_info=True)
            return response
    
    app.add_middleware(LoggingMiddleware)
    
    # Include API routers
    api_prefix = settings.api_prefix
    
    app.include_router(auth_router, prefix=api_prefix)
    app.include_router(invites_router, prefix=api_prefix)
    app.include_router(users_router, prefix=api_prefix)
    app.include_router(submissions_router, prefix=api_prefix)
    app.include_router(project_submissions_router, prefix=api_prefix)
    app.include_router(comments_router, prefix=api_prefix)
    app.include_router(files_router, prefix=api_prefix)
    app.include_router(project_files_router, prefix=api_prefix)
    app.include_router(submission_files_router, prefix=api_prefix)
    app.include_router(notifications_router, prefix=api_prefix)
    app.include_router(projects_router, prefix=api_prefix)
    app.include_router(project_work_items_router, prefix=api_prefix)
    app.include_router(project_join_requests_router, prefix=api_prefix)
    app.include_router(settings_router, prefix=api_prefix)
    app.include_router(monitoring_router, prefix=api_prefix)
    app.include_router(admin_access_router, prefix=api_prefix)
    app.include_router(crm_router, prefix=api_prefix)
    
    # Health check
    @app.get("/health")
    async def health_check():
        """Health check endpoint."""
        return {"status": "healthy", "version": settings.app_version}
    
    @app.get("/")
    async def root():
        """Root endpoint with API info."""
        return {
            "name": settings.app_name,
            "version": settings.app_version,
            "docs": "/api/docs",
            "health": "/health",
        }
    
    # Mount static files
    from fastapi.staticfiles import StaticFiles
    static_dir = os.path.join(os.path.dirname(__file__), "static")
    os.makedirs(static_dir, exist_ok=True)
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

    return app


# Create app instance
app = create_app()


if __name__ == "__main__":
    import uvicorn
    
    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
