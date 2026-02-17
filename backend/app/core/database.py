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
        
        # Create Motor client
        self.client = AsyncIOMotorClient(settings.mongodb_uri)
        self.database = self.client[settings.mongodb_database]
        
        # Import models here to avoid circular imports
        from app.models.user import User
        from app.models.submission import Submission
        from app.models.comment import Comment
        
        # Initialize Beanie with all document models
        await init_beanie(
            database=self.database,
            document_models=[User, Submission, Comment]
        )
        
        logger.info("Connected to MongoDB: %s", settings.mongodb_database)
    
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
