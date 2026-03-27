"""
Local file storage service for file uploads.
Stores files on the server filesystem when Google Drive is not available.
"""

import logging
import os
import uuid

logger = logging.getLogger(__name__)
from pathlib import Path
from typing import Optional

from app.core.config import get_settings
from app.core.time import utc_now


class LocalStorageService:
    """Service for storing files locally on the server."""
    
    def __init__(self):
        self.settings = get_settings()
        # Store files in backend/uploads directory
        self.upload_dir = Path(__file__).parent.parent.parent / "uploads"
        self.upload_dir.mkdir(exist_ok=True)
    
    def upload_volunteer_file(
        self,
        file_data: bytes,
        filename: str,
        mime_type: str,
        week_id: str,
        volunteer_name: str
    ) -> dict:
        """
        Save a file locally for a volunteer's submission.
        
        Returns:
            Dict with file_id, filename, download_link, uploaded_at
        """
        # Sanitize volunteer name
        safe_name = "".join(c for c in volunteer_name if c.isalnum() or c in (' ', '-', '_')).strip()
        safe_name = safe_name.replace(' ', '_')
        
        # Create unique file ID
        file_id = str(uuid.uuid4())[:8]
        
        # Create filename with prefix
        stored_filename = f"{week_id}_{safe_name}_{file_id}_{filename}"
        
        # Save file
        file_path = self.upload_dir / stored_filename
        with open(file_path, 'wb') as f:
            f.write(file_data)
        
        logger.info("Saved file: %s", stored_filename)
        
        # Return file info (link will be served by API)
        return {
            'file_id': file_id,
            'filename': filename,
            'stored_filename': stored_filename,
            'mime_type': mime_type,
            'drive_link': f"/api/v1/files/download/{stored_filename}",
            'uploaded_at': utc_now().isoformat()
        }
    
    def get_file(self, stored_filename: str) -> Optional[tuple]:
        """
        Get a stored file.
        
        Returns:
            Tuple of (file_data, mime_type) or None if not found
        """
        file_path = self.upload_dir / stored_filename
        if file_path.exists():
            with open(file_path, 'rb') as f:
                return f.read()
        return None
    
    def delete_file(self, stored_filename: str) -> bool:
        """Delete a stored file."""
        file_path = self.upload_dir / stored_filename
        if file_path.exists():
            file_path.unlink()
            logger.info("Deleted file: %s", stored_filename)
            return True
        return False


# Singleton instance
_storage_service: Optional[LocalStorageService] = None


def get_storage_service() -> LocalStorageService:
    """Get the local storage service singleton."""
    global _storage_service
    if _storage_service is None:
        _storage_service = LocalStorageService()
    return _storage_service
