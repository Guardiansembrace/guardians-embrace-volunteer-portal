# 🗂️ Google Drive Integration Setup Guide

This guide walks you through configuring Google Drive for automatic file uploads in the Guardian's Embrace Volunteer Portal.

---

## 📋 Overview

When configured, volunteers can:
- **Drag & drop files** directly in the submission form
- Files are **automatically uploaded** to Google Drive
- Files are **organized by week and volunteer name**

```
Guardian's Embrace Volunteers/
├── 2026-W04/
│   ├── Ujwal V/
│   │   ├── report.pdf
│   │   └── timesheet.xlsx
│   └── Jane Doe/
│       └── meeting-notes.docx
├── 2026-W05/
│   └── ...
```

> **Note:** The system uses a **Hybrid Storage Strategy**:
> 1.  **Organization Drive (Recommended):** Uses a Service Account to upload files to a central shared folder.
> 2.  **Personal Drive (Fallback):** If Organization Drive is not configured, it tries to upload to the user's personal Google Drive (requires user consent).
> 3.  **Local Storage (Final Fallback):** If neither Drive option works, files are stored securely on the server.

---

## 🔧 Step-by-Step Setup

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a Project** → **New Project**
3. Name it: `Guardians Embrace Portal`
4. Click **Create**

### Step 2: Enable Google Drive API

1. In the Cloud Console, go to **APIs & Services** → **Library**
2. Search for **"Google Drive API"**
3. Click on it → Click **Enable**

### Step 3: Create a Service Account

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **Service Account**
3. Fill in:
   - **Name**: `volunteer-portal-drive`
   - **Description**: `Service account for volunteer file uploads`
4. Click **Create and Continue**
5. For Role, select: **Basic** → **Editor** (or skip)
6. Click **Done**

### Step 4: Download the JSON Key

1. In the Service Accounts list, click on your new account
2. Go to the **Keys** tab
3. Click **Add Key** → **Create New Key**
4. Choose **JSON** format
5. Click **Create** - a file will download (e.g., `guardians-embrace-portal-xxx.json`)

⚠️ **Keep this file secure!** It grants access to your Drive.

### Step 5: Create a Shared Folder in Google Drive

1. Open [Google Drive](https://drive.google.com/)
2. Create a new folder: `Guardian's Embrace Volunteers`
3. Right-click the folder → **Share**
4. Add the **Service Account Email** (find it in Cloud Console, looks like: `volunteer-portal-drive@xxx.iam.gserviceaccount.com`)
5. Set permission to **Editor**
6. Click **Share**

### Step 6: Get the Folder ID

1. Open the folder you created
2. Look at the URL: `https://drive.google.com/drive/folders/1Abc123XYZ...`
3. Copy the ID after `/folders/`: `1Abc123XYZ...`

### Step 7: Configure the Backend

Open `backend/.env` and add:

```env
# Google Drive Integration
GOOGLE_DRIVE_PARENT_FOLDER_ID=1Abc123XYZ...

# The ENTIRE JSON content from your key file, on a single line
GOOGLE_DRIVE_CREDENTIALS_JSON={"type":"service_account","project_id":"your-project",...}
```

#### How to format the JSON:

**Option A: Manual (simple)**
1. Open the JSON file in a text editor
2. Remove all line breaks to make it a single line
3. Paste it as the value

**Option B: Using PowerShell**
```powershell
# Read and minify the JSON
(Get-Content "guardians-embrace-portal-xxx.json" -Raw) -replace '\s+', ' ' | Set-Clipboard
# Now paste from clipboard into .env
```

**Option C: Using Python**
```python
import json
with open("guardians-embrace-portal-xxx.json") as f:
    print(json.dumps(json.load(f)))
# Copy the output
```

### Step 8: Restart & Test

1. Restart the backend server
2. Go to the portal → Create a new submission
3. You should see the **"Files & Attachments"** section
4. Drag a file → It should upload and show a Drive link!

---

## ✅ Verification Checklist

- [ ] Google Cloud project created
- [ ] Drive API enabled
- [ ] Service account created
- [ ] JSON key downloaded
- [ ] Folder created in Google Drive
- [ ] Folder shared with service account email
- [ ] `GOOGLE_DRIVE_PARENT_FOLDER_ID` set in `.env`
- [ ] `GOOGLE_DRIVE_CREDENTIALS_JSON` set in `.env`
- [ ] Backend restarted
- [ ] File upload tested successfully

---

## 🔍 Troubleshooting

### "Google Drive is not configured"
- Check that both env variables are set
- Verify the JSON is valid (no line breaks, proper escaping)

### "403 Forbidden" or "Access Denied"
- Make sure the folder is shared with the service account email
- Verify the Service Account has "Editor" access

### "Invalid credentials"
- The JSON might be malformed
- Try re-downloading and re-formatting the JSON key

### Files not appearing in Drive
- Check the folder ID is correct
- Look in the correct folder (subfolders are created per week)

---

## 📞 Support

If you encounter issues:
1. Check the backend console for `[DRIVE]` log messages
2. Verify API is enabled in Cloud Console
3. Test with the `/api/v1/files/drive-status` endpoint
