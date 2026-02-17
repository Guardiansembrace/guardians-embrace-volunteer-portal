"""
Guardian's Embrace - Volunteer Portal Backend
FastAPI application entry point.
"""

from contextlib import asynccontextmanager
import logging
import os
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Configure logging FIRST, before any other imports
log_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "logs")
os.makedirs(log_dir, exist_ok=True)

# Configure root logger with both file and console output
root_logger = logging.getLogger()
root_logger.setLevel(logging.DEBUG)

# File handler
file_handler = logging.FileHandler(os.path.join(log_dir, "app.log"))
file_handler.setLevel(logging.DEBUG)
file_formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
file_handler.setFormatter(file_formatter)

# Console handler with flush
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.DEBUG)
console_formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
console_handler.setFormatter(console_formatter)

root_logger.addHandler(file_handler)
root_logger.addHandler(console_handler)

logger = logging.getLogger(__name__)
logger.info("=" * 60)
logger.info("Logging initialized - backend starting up")
logger.info("=" * 60)

from app.core.config import get_settings
from app.core.database import db
from app.api import auth_router, users_router, submissions_router, comments_router, files_router, notifications_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown."""
    # Startup
    await db.connect()
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
    
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger.error(
            "Unhandled exception on %s %s: %s",
            request.method, request.url.path, exc, exc_info=True
        )
        return JSONResponse(
            status_code=500,
            content={"detail": str(exc)}
        )
    
    # Add request logging middleware
    from starlette.middleware.base import BaseHTTPMiddleware
    
    class LoggingMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            logger.debug("%s %s - Processing...", request.method, request.url.path)
            response = await call_next(request)
            logger.info("%s %s -> %s", request.method, request.url.path, response.status_code)
            return response
    
    app.add_middleware(LoggingMiddleware)
    
    # Include API routers
    api_prefix = settings.api_prefix
    
    app.include_router(auth_router, prefix=api_prefix)
    app.include_router(users_router, prefix=api_prefix)
    app.include_router(submissions_router, prefix=api_prefix)
    app.include_router(comments_router, prefix=api_prefix)
    app.include_router(files_router, prefix=api_prefix)
    app.include_router(notifications_router, prefix=api_prefix)
    
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
