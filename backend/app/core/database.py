"""
MongoDB database connection and initialization using Motor and Beanie.
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import get_settings


class Database:
    """MongoDB database manager using Motor async driver and Beanie ODM."""
    
    client: Optional[AsyncIOMotorClient] = None
    database: Optional[AsyncIOMotorDatabase] = None
    
    async def connect(self):
        """Initialize the MongoDB connection and Beanie ODM."""
        settings = get_settings()
        
        if settings.use_mock_db:
            from mongomock_motor import AsyncMongoMockClient
            self.client = AsyncMongoMockClient()
            self.database = self.client.get_database(settings.mongodb_database)
            logger.info("Using mongomock_motor in-memory mock database")
        else:
            # Create Motor client
            self.client = AsyncIOMotorClient(settings.mongodb_uri)
            self.database = self.client[settings.mongodb_database]
            logger.info("Connected to MongoDB: %s", settings.mongodb_database)
        
        # Import models here to avoid circular imports
        from app.models.user import User
        from app.models.submission import Submission
        from app.models.comment import Comment
        from app.models.project import Project
        from app.models.project_file import ProjectFile
        from app.models.project_work_item import ProjectWorkItem
        from app.models.project_join_request import ProjectJoinRequest
        from app.models.admin_access import AdminAccessGrant
        from app.models.audit_log import AuditLog
        from app.models.allowed_email import AllowedEmail
        from app.models.settings import AdminSettings
        from app.models.notification import Notification

        # Initialize Beanie with all document models
        await init_beanie(
            database=self.database,
            document_models=[
                Notification,
                User,
                Submission,
                Comment,
                Project,
                ProjectFile,
                ProjectWorkItem,
                ProjectJoinRequest,
                AdminAccessGrant,
                AuditLog,
                AllowedEmail,
                AdminSettings,
            ]
        )
    
    async def disconnect(self):
        """Close the MongoDB connection."""
        if self.client:
            self.client.close()
            logger.info("Disconnected from MongoDB")
    
    def get_collection(self, name: str):
        """Get a MongoDB collection by name."""
        if self.database is None:
            raise RuntimeError("Database not connected. Call connect() first.")
        return self.database[name]


# Global database instance
db = Database()


def get_database() -> AsyncIOMotorDatabase:
    """Get the current database instance."""
    if db.database is None:
        raise RuntimeError("Database not connected")
    return db.database
