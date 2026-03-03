# Getting a Refresh Token for Central Account (gptunc954@gmail.com)

## Problem
The file upload system requires a valid Google OAuth refresh token for `gptunc954@gmail.com` to upload files to the centralized account. This token expires quickly when generated via OAuth Playground, but can be made long-lived with proper configuration.

## Solution: Use Google OAuth Playground with App Credentials

### Step 1: Open OAuth 2.0 Playground
Go to: https://developers.google.com/oauthplayground

### Step 2: Configure the Playground
In the top-right corner, click the **gear icon** (⚙️) to access settings:
- Check: "Use your own OAuth credentials"
- **OAuth 2.0 Client ID**: `YOUR_CLIENT_ID_HERE`
- **OAuth 2.0 Client Secret**: `YOUR_CLIENT_SECRET_HERE`
- Click "Close"

### Step 3: Select Google Drive API Scope
1. In the left panel under "Step 1", paste this scope:
   ```
   https://www.googleapis.com/auth/drive
   ```
2. Click "Authorize APIs" button

### Step 4: Authenticate as gptunc954@gmail.com
- You'll be redirected to Google login
- **Important**: Sign in as `gptunc954@gmail.com` (not your personal account)
- Grant permissions when prompted

### Step 5: Exchange Authorization Code for Tokens
After authorization, the playground will show tokens in "Step 2":
- **Authorization Code** - This will be shown briefly
- Click "Exchange authorization code for tokens"
- The playground will display:
  - **Access Token** (expires in ~1 hour)
  - **Refresh Token** (long-lived, doesn't expire unless revoked)

### Step 6: Copy the Refresh Token
Copy the **Refresh Token** value (it looks like):
```
1//0au0-VLysDhDcgYiAAA6AQnwf-l3Irpa0X5ev2C7u6EIceag8cFqDD2ilwaqt3x4ex3cmSCxWNtE2v_EFXu5fw_xXA
```

### Step 7: Update .env File
Open `backend/.env` and update:
```
GOOGLE_PERSONAL_ACCOUNT_TOKEN=<paste-refresh-token-here>
```

Example:
```
GOOGLE_PERSONAL_ACCOUNT_TOKEN=1//0au0-VLysDhDcgYiAAA6AQnwf-l3Irpa0X5ev2C7u6EIceag8cFqDD2ilwaqt3x4ex3cmSCxWNtE2v_EFXu5fw_xXA
```

### Step 8: Restart Backend
Stop the running backend (Ctrl+C) and restart:
```powershell
cd "c:\Guardian's Embrace Dev\guardians-volunteer-portal\backend"
uvicorn app.main:app --reload --port 8000
```

The settings cache will reload with the new token.

## Important Notes

### Token Lifetime
- **Refresh Token**: Long-lived (doesn't expire unless user revokes it or token is unused for 6+ months)
- **Access Token**: ~1 hour expiration - the app will auto-refresh using the refresh token

### Security
- ⚠️ Never commit the `.env` file with the actual token to git
- ⚠️ Keep credentials in `.env` which is in `.gitignore`
- For production, use secure environment variable management (e.g., GitHub Secrets, AWS Secrets Manager)

### If Token Becomes Invalid
If you get `invalid_grant: Bad Request` errors, the token may have:
1. **Expired** - Tokens unused for 6+ months are automatically revoked
2. **Been revoked** - User revoked app access in Google Account settings
3. **Mismatched credentials** - Ensure you're using the exact client ID/secret from Step 2

**Solution**: Repeat this guide to generate a new refresh token.

### Testing the Token
Once you've added the token to `.env` and restarted the backend, test by uploading a file:
1. Go to http://localhost:3000
2. Login as a volunteer
3. Upload a file
4. Check `backend/logs/app.log` for:
   ```
   [DRIVE] SUCCESS: File uploaded to CENTRAL ACCOUNT - ID: <file_id>
   ```

## Troubleshooting

### "Central account token not configured" Error
- Check that `.env` has `GOOGLE_PERSONAL_ACCOUNT_TOKEN=<token>`
- Backend must be restarted for `.env` changes to take effect

### "invalid_grant: Bad Request" Error
- Token has expired or been revoked
- Regenerate using this guide

### "Insufficient scope" Error
- Wrong API scope used in Step 3
- Must use `https://www.googleapis.com/auth/drive`
- Regenerate token with correct scope

### File doesn't appear in gptunc954@gmail.com Drive
- Check that the folder structure was created in the account's Drive
- Use the file ID from logs to verify: https://drive.google.com/file/d/{file_id}/view
