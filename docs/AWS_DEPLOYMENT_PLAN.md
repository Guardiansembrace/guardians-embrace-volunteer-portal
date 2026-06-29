# AWS Deployment Plan

## Goal

Deploy:

- Frontend to S3 behind CloudFront
- Backend to Lambda behind API Gateway
- MongoDB stays on MongoDB Atlas for now
- Files move to S3 so the backend is fully serverless-safe

For testing, use:

- CloudFront distribution URL for the frontend
- API Gateway invoke URL for the backend

Do not use the raw S3 website endpoint as the main test URL if Google login is enabled. CloudFront gives us HTTPS, better SPA routing support, and a cleaner production path.

## Current Scripted Workflow

The repo now includes reusable PowerShell deployment scripts under `scripts/aws`:

- `scripts/aws/deploy.ps1`
- `scripts/aws/deploy-backend.ps1`
- `scripts/aws/deploy-frontend.ps1`
- `scripts/aws/build-backend-package.ps1`

For AWS deployments, the scripts now prefer `backend/.env.aws` when it exists, and fall back to `backend/.env` otherwise. This lets local development keep using localhost while Lambda uses Atlas.

Recommended setup:

1. Copy `backend/.env.aws.example` to `backend/.env.aws`
2. Fill in the real Atlas URI and production-like secrets
3. Leave `backend/.env` for local development

### One-command test deployment

From the repo root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/aws/deploy.ps1 -EnvironmentName test -Region us-east-1
```

If you want to be explicit about which AWS env file is used:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/aws/deploy.ps1 -EnvironmentName test -Region us-east-1 -BackendEnvPath backend/.env.aws
```

### Individual deploy commands

Backend only:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/aws/deploy-backend.ps1 -EnvironmentName test -Region us-east-1
```

Frontend only:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/aws/deploy-frontend.ps1 -EnvironmentName test -Region us-east-1 -ApiUrl https://<api-id>.execute-api.us-east-1.amazonaws.com
```

### Database behavior for Lambda test deploys

The backend deploy script now supports both real and temporary test databases:

- If `backend/.env.aws` exists, AWS deploys use it first.
- If the selected env file contains a real remote MongoDB URI, Lambda uses it.
- If the selected env file still points to `localhost` or `127.0.0.1`, the deploy script automatically sets `USE_MOCK_DB=true` for Lambda so the test stack can boot successfully.
- You can override the database URI explicitly with `-MongoDbUri`.
- You can force mock mode explicitly with `-UseMockDb`.

This auto-mock behavior is helpful for smoke testing the AWS deployment, but it is not a substitute for a persistent cloud database in production.

## Recommended Architecture

Frontend:

- Vite build output from `frontend-react/dist`
- Private S3 bucket as CloudFront origin
- CloudFront distribution as the public URL
- SPA fallback so unknown routes return `index.html`

Backend:

- FastAPI app packaged for AWS Lambda
- API Gateway HTTP API in front of Lambda
- CloudWatch for logs
- AWS Secrets Manager or Lambda environment variables for secrets

Data and storage:

- MongoDB Atlas for application data
- S3 bucket for uploaded files and public images

## Why This Fits This Repo

The frontend is already a static Vite app, so S3 + CloudFront is a natural fit.

The backend is FastAPI and can run on Lambda, but a few parts need to change first:

- `backend/app/main.py` currently writes logs to a local file.
- `backend/app/core/storage.py` stores uploaded files on the local filesystem.
- `backend/app/api/files.py` writes public images into `app/static/uploads`.

Those local filesystem writes are not a good fit for Lambda.

## Current Constraints To Fix Before Lambda

### 1. Local file logging

`backend/app/main.py` creates `backend/logs/app.log` and attaches a `FileHandler`.

Plan:

- Remove file-based logging for Lambda
- Log to stdout/stderr only
- Let CloudWatch collect logs

### 2. Local fallback file storage

`backend/app/core/storage.py` stores files under `backend/uploads`.

Plan:

- Replace local fallback storage with S3-backed storage
- Return S3 object keys or presigned URLs instead of local file paths

### 3. Public image upload path

`backend/app/api/files.py` stores public uploads in `app/static/uploads` and serves them from `/static`.

Plan:

- Move public image uploads to S3
- Return either:
  - a CloudFront URL for public files, or
  - a presigned S3 URL for private files

### 4. Lambda adapter

The FastAPI app needs an adapter such as `mangum` so API Gateway can invoke it cleanly.

Plan:

- Add `mangum`
- Export a Lambda handler from the backend

## Testing URLs

Use these while validating the deployment:

- Frontend test URL: `https://<cloudfront-distribution>.cloudfront.net`
- Backend test URL: `https://<api-id>.execute-api.<region>.amazonaws.com`

Recommended approach:

- Point the frontend at the API Gateway URL during testing with `VITE_API_URL`
- Set backend `ALLOWED_ORIGINS` to the CloudFront URL
- Set backend `FRONTEND_URL` to the same CloudFront URL

Later, if you want custom domains:

- Frontend: `https://portal.guardiansembrace.org`
- Backend: `https://api.guardiansembrace.org`

## Frontend Deployment Plan

### AWS resources

- S3 bucket for frontend build artifacts
- CloudFront distribution
- ACM certificate if using a custom domain
- Route 53 DNS record later if needed

### CloudFront behavior

- Default root object: `index.html`
- SPA fallback:
  - 403 -> `/index.html`
  - 404 -> `/index.html`
- Cache static assets aggressively
- Keep `index.html` on a shorter cache TTL

### Frontend environment

For test deploys:

```env
VITE_API_URL=https://<api-id>.execute-api.<region>.amazonaws.com
VITE_GOOGLE_CLIENT_ID=<google-client-id>
VITE_MONITORING_ENABLED=true
VITE_APP_VERSION=<git-sha-or-release>
```

### Google OAuth note

Because the frontend uses Google login in the browser, add the CloudFront URL to the Google OAuth allowed origins list before testing sign-in.

For this app, the OAuth client in Google Cloud Console should be a `Web application` client.

Add the frontend URLs under `Authorized JavaScript origins`:

- `https://d23ehd1xmno01h.cloudfront.net`
- `http://localhost:5173`
- `http://localhost:3000`

If Google still reports `redirect_uri_mismatch`, also add these under `Authorized redirect URIs`:

- `https://d23ehd1xmno01h.cloudfront.net`
- `https://d23ehd1xmno01h.cloudfront.net/login`
- `http://localhost:5173`
- `http://localhost:5173/login`
- `http://localhost:3000`
- `http://localhost:3000/login`

If the current client ID was created for a non-web app type, create a new `Web application` OAuth client and update both:

- `backend/.env` -> `GOOGLE_CLIENT_ID`
- `frontend-react/.env` -> `VITE_GOOGLE_CLIENT_ID`

## Backend Deployment Plan

### AWS resources

- Lambda function
- API Gateway HTTP API
- IAM role for Lambda
- CloudWatch log group
- S3 bucket for uploads
- Secrets Manager for sensitive values

### Keep in Atlas for now

Use the existing MongoDB Atlas setup first instead of migrating databases during the same deployment project. That keeps risk lower.

### Backend environment

At minimum:

```env
DEBUG=false
MONGODB_URI=<mongodb-atlas-uri>
MONGODB_DATABASE=guardians_portal
JWT_SECRET=<strong-random-secret>
ALLOWED_ORIGINS=["https://<cloudfront-distribution>.cloudfront.net"]
FRONTEND_URL=https://<cloudfront-distribution>.cloudfront.net
GOOGLE_CLIENT_ID=<google-client-id>
GOOGLE_CLIENT_SECRET=<google-client-secret>
SMTP_HOST=<smtp-host>
SMTP_PORT=<smtp-port>
SMTP_USERNAME=<smtp-username>
SMTP_PASSWORD=<smtp-password>
SMTP_FROM_EMAIL=<smtp-from-email>
```

If we switch file storage to S3, also add:

```env
AWS_REGION=<region>
AWS_S3_BUCKET=<uploads-bucket>
AWS_PUBLIC_ASSETS_BASE_URL=https://<cloudfront-or-s3-public-url>
```

### Lambda packaging plan

Recommended path:

1. Add `mangum` to backend dependencies
2. Create a Lambda handler module
3. Package the backend with its Python dependencies
4. Deploy with one of:
   - AWS SAM
   - Terraform
   - a GitHub Actions zip-based deployment

For this repo, AWS SAM is the cleanest first step because it keeps the infrastructure simple and easy to reason about.

## Suggested Rollout Order

### Phase 1: Make backend serverless-safe

- Add Lambda handler
- Remove file-based logging
- Replace local uploads with S3
- Update public image storage to S3

### Phase 2: Deploy test environment

- Deploy frontend to S3 + CloudFront
- Deploy backend to Lambda + API Gateway
- Wire frontend `VITE_API_URL` to API Gateway
- Set backend CORS to the CloudFront URL
- Add CloudFront domain to Google OAuth allowed origins

### Phase 3: Validate test environment

Test:

- login
- protected routes
- API CRUD flows
- file upload
- file download
- public image upload
- admin pages
- email reminders if enabled

### Phase 4: Production hardening

- custom domains
- ACM certificates
- WAF if needed
- CloudFront invalidation in CI/CD
- Secrets Manager rotation where appropriate
- alarms for Lambda errors and API 5xx spikes

## CI/CD Direction

There is already a CI workflow that runs backend tests, frontend tests, and frontend build.

Recommended next step:

- Keep current CI checks
- Add a deploy workflow for `main`

Deploy workflow outline:

1. Build frontend
2. Sync `frontend-react/dist` to the frontend S3 bucket
3. Invalidate CloudFront
4. Build backend deployment artifact
5. Deploy Lambda and API Gateway

Use GitHub Actions OIDC with AWS instead of long-lived AWS keys if possible.

## Recommendation

Yes, your overall direction is good:

- Frontend on S3 + CloudFront
- Backend on Lambda + API Gateway
- Test using CloudFront URL for frontend and API Gateway URL for backend

The main adjustment I recommend is this:

- do not rely on local backend storage once we move to Lambda
- switch uploads and public images to S3 as part of the deployment work

## Practical Next Step

Implement the deployment in this order:

1. Add Lambda support to the FastAPI backend
2. Replace local file storage with S3
3. Deploy a test backend on API Gateway + Lambda
4. Deploy the frontend to S3 + CloudFront
5. Connect Google OAuth and CORS to the CloudFront test domain
