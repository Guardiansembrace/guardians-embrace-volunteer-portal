# Service Account Setup for Permanent Google Drive Access

## Overview
Instead of using OAuth tokens (which expire), we'll use a **Google Service Account** with permanent credentials. The service account is granted access to a shared folder in gptunc954@gmail.com's Drive.

**Result**: All volunteers upload to gptunc954@gmail.com's Drive automatically, indefinitely, with no token expiration.

---

## Step 1: Create a Google Cloud Project

### 1.1 Go to Google Cloud Console
- Visit: https://console.cloud.google.com/
- Sign in as **gptunc954@gmail.com**

### 1.2 Create a New Project
1. Click the project dropdown at the top
2. Click "NEW PROJECT"
3. Project name: `Guardian's Embrace`
4. Click "CREATE"
5. Wait for the project to be created (takes ~1 minute)

### 1.3 Select Your Project
- Once created, click the project dropdown again
- Select "Guardian's Embrace" project

---

## Step 2: Enable Google Drive API

### 2.1 Go to APIs & Services
1. In the left sidebar, click "APIs & Services" → "Library"
2. Search for "Google Drive API"
3. Click on "Google Drive API" result
4. Click the blue "ENABLE" button
5. Wait for it to enable

---

## Step 3: Create Service Account

### 3.1 Create Service Account
1. In the left sidebar, click "APIs & Services" → "Credentials"
2. Click the blue "+ CREATE CREDENTIALS" button
3. Select "Service Account"
4. Fill in the form:
   - **Service account name**: `guardians-volunteer-uploader`
   - **Service account ID**: (auto-fills, keep default)
   - **Description**: `Service account for uploading volunteer files`
5. Click "CREATE AND CONTINUE"

### 3.2 Grant Permissions (Optional, can skip)
- Click "CONTINUE" (or grant Editor role if you want - not necessary for Drive access)
- Click "DONE"

### 3.3 Create JSON Key
1. You're back at "Credentials" page
2. Under "Service Accounts", click the service account you just created
3. Go to the "KEYS" tab
4. Click "ADD KEY" → "Create new key"
5. Select "JSON"
6. Click "CREATE"
7. **A JSON file will download automatically** - this is your service account credentials

**Save this file securely!** You'll need it next.

---

## Step 4: Create Shared Folder in gptunc954@gmail.com Drive

### 4.1 Open Google Drive
1. Go to https://drive.google.com
2. Make sure you're signed in as **gptunc954@gmail.com**

### 4.2 Create Folder Structure
1. Right-click in Drive → "New folder"
2. Name it: `Guardian's Embrace - Volunteer Submissions`
3. Right-click the folder → "Get link"
4. **Copy the folder ID from the URL**
   - URL looks like: `https://drive.google.com/drive/folders/1FOLDER_ID_HERE`
   - The long ID is your `GOOGLE_DRIVE_PARENT_FOLDER_ID`

### 4.3 Share Folder with Service Account
1. Right-click the folder → "Share"
2. Get your service account email from the JSON file you downloaded:
   - Open the JSON file (in a text editor)
   - Find `"client_email": "guardians-volunteer-uploader@YOUR_PROJECT.iam.gserviceaccount.com"`
3. Paste the service account email in the share dialog
4. Give it "Editor" permission
5. Click "Share"

---

## Step 5: Update Backend Configuration

### 5.1 Upload JSON Credentials to Backend
1. The JSON file you downloaded - copy its contents
2. Place it in: `backend/service-account.json`
3. Or update your existing `service-account.json` with the new file

### 5.2 Update .env File
```env
# Google Drive Integration
GOOGLE_APPLICATION_CREDENTIALS=service-account.json
GOOGLE_DRIVE_PARENT_FOLDER_ID=<the-folder-id-from-step-4.2>

# Remove these (no longer needed with Service Account):
# GOOGLE_PERSONAL_ACCOUNT_EMAIL=...
# GOOGLE_PERSONAL_ACCOUNT_TOKEN=...
```

### 5.3 Update Backend Code
The current implementation expects a personal account token. We need to update it to use the Service Account directly.

**Option A: Keep Current Implementation (Temporary)**
- Keep the token in `.env` as-is
- Service Account approach can come later

**Option B: Switch to Service Account (Permanent)**
- Update `backend/app/core/drive.py` to use service account
- Remove personal account token requirement

---

## Step 6: Update Backend Code (Service Account Version)

Update `backend/app/core/drive.py`:

```python
from google.oauth2 import service_account
from googleapiclient.discovery import build

def get_service_account_drive():
    """Get Google Drive service using Service Account."""
    try:
        credentials = service_account.Credentials.from_service_account_file(
            'service-account.json',
            scopes=['https://www.googleapis.com/auth/drive']
        )
        return build('drive', 'v3', credentials=credentials)
    except Exception as e:
        logger.error(f"Failed to create service account drive: {e}")
        return None

def upload_file_any_drive(
    file_data: bytes,
    filename: str,
    mime_type: str,
    week_id: str,
    user: Any,
) -> Dict[str, Any]:
    """
    Upload file using Service Account to centralized Drive folder.
    All volunteers' files go to the same account - no expiration, permanent.
    """
    settings = get_settings()
    log_debug(f"[DRIVE] Starting upload for {filename} to week {week_id}")
    log_debug(f"[DRIVE] Using Service Account (permanent credentials)")
    
    # Use Service Account
    service = get_service_account_drive()
    if not service:
        error_msg = "Service Account not configured"
        logger.error(f"[DRIVE] {error_msg}")
        raise Exception(error_msg)
    
    try:
        log_debug(f"[DRIVE] >>> UPLOADING TO CENTRALIZED DRIVE (Service Account)")
        
        # Get or create volunteer folder for this week
        parent_folder_id = settings.google_drive_parent_folder_id
        folder_id = create_week_folder(service, parent_folder_id, week_id, user.name)
        
        log_debug(f"[DRIVE] Got folder ID: {folder_id}")
        
        # Upload file
        file_metadata = {
            'name': filename,
            'parents': [folder_id],
            'properties': {
                'user_email': user.email,
                'week_id': week_id,
                'uploaded_by': user.name
            }
        }
        
        from googleapiclient.http import MediaIoBaseUpload
        import io
        
        media = MediaIoBaseUpload(io.BytesIO(file_data), mimetype=mime_type)
        file_result = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id, webViewLink'
        ).execute()
        
        file_id = file_result.get('id')
        link = file_result.get('webViewLink')
        
        log_debug(f"[DRIVE] SUCCESS: File uploaded - ID: {file_id}")
        logger.info(f"[DRIVE] File uploaded to centralized account. ID: {file_id}")
        
        return {
            'file_id': file_id,
            'filename': filename,
            'drive_link': link,
            'storage_type': 'service_account'
        }
    except Exception as e:
        error_msg = f"Service Account upload failed: {str(e)}"
        log_debug(f"[DRIVE] {error_msg}")
        logger.error(f"[DRIVE] {error_msg}", exc_info=True)
        raise Exception(error_msg)
```

---

## Key Benefits of Service Account Approach

| Feature | OAuth Token | Service Account |
|---------|------------|-----------------|
| Expiration | ❌ 24h (OAuth Playground) | ✅ Never expires |
| Maintenance | ❌ Must refresh | ✅ Set and forget |
| Security | ⚠️ Token in .env | ✅ JSON credentials |
| Production Ready | ❌ No | ✅ Yes |
| Google Workspace | ❌ Works but limited | ✅ Full support |

---

## Implementation Checklist

- [ ] Create Google Cloud Project
- [ ] Enable Google Drive API
- [ ] Create Service Account
- [ ] Download JSON credentials
- [ ] Create shared folder in gptunc954@gmail.com
- [ ] Share folder with service account email
- [ ] Copy folder ID to `.env`
- [ ] Place JSON file in `backend/service-account.json`
- [ ] Update `.env` with `GOOGLE_DRIVE_PARENT_FOLDER_ID`
- [ ] Restart backend
- [ ] Test file upload
- [ ] Verify files appear in gptunc954@gmail.com Drive

---

## Testing

Once set up:

1. Start backend: `uvicorn app.main:app --reload --port 8000`
2. Go to http://localhost:3000
3. Login as volunteer
4. Upload a file
5. Check logs for: `[DRIVE] SUCCESS: File uploaded - ID: ...`
6. Go to gptunc954@gmail.com Drive → Find the file

---

## Troubleshooting

### "Service Account not configured"
- Check `backend/service-account.json` exists
- Verify it contains valid JSON credentials
- Check file path in code

### "Permission denied" Error
- Service account email wasn't shared with the folder
- Go back to Step 4.3 and share the folder with service account
- Make sure you granted "Editor" permission

### "Invalid Credentials" Error
- JSON file is corrupted or incomplete
- Download a new JSON key from Google Cloud Console
- Replace `service-account.json`

### Files not appearing in Drive
- Check that service account email has Editor access
- Verify folder ID is correct in `.env`
- Check logs for actual folder ID being used

---

## Next Steps

1. **Immediate**: Follow Steps 1-5 to set up service account
2. **Testing**: Verify uploads work as expected
3. **Production**: Deploy with service account credentials secured

This is the **enterprise-grade, permanent solution** with zero maintenance.
