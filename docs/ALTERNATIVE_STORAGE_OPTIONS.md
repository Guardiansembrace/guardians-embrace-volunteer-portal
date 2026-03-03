# Alternative File Storage Options for Guardian's Embrace

## Problem with Google Drive
- **Token Management**: Refresh tokens expire or get revoked
- **OAuth Complexity**: Multiple accounts = multiple token management issues
- **Account Limitations**: Service accounts can't upload to regular Drive (need Shared Drive)
- **Maintenance**: Token refresh adds operational burden

## Recommended Alternatives

### 1. **AWS S3** ⭐ RECOMMENDED
**Best for: Scalability, Reliability, Long-term**

**Pros:**
- ✅ No token expiration - uses IAM credentials (stateless)
- ✅ Simple file lifecycle management (auto-delete old files)
- ✅ Built-in versioning and backup
- ✅ Extremely scalable and reliable
- ✅ Cost-effective for small to medium usage
- ✅ Direct file access without OAuth complexity
- ✅ Can serve files directly via CDN (CloudFront)

**Cons:**
- ❌ Requires AWS account + credit card
- ❌ Monthly costs (~$1-5 for small organizations)
- ❌ Slightly more complex setup

**Implementation:**
```python
import boto3

s3_client = boto3.client(
    's3',
    aws_access_key_id='YOUR_ACCESS_KEY',
    aws_secret_access_key='YOUR_SECRET_KEY',
    region_name='us-east-1'
)

# Upload file
s3_client.upload_fileobj(
    file_data,
    bucket_name='guardian-embrace-volunteers',
    key=f'2026-W05/ujwalv098@gmail.com/activity-bar-icon.svg'
)
```

**Pricing:** ~$0.023 per GB stored, ~$0.0004 per 10,000 PUT requests

---

### 2. **MongoDB GridFS** ⭐ GOOD OPTION
**Best for: Already using MongoDB, simplicity**

**Pros:**
- ✅ No external service needed
- ✅ Files stored alongside user data
- ✅ Built-in access control
- ✅ Automatic expiration via TTL indexes
- ✅ Zero additional cost (if MongoDB already deployed)
- ✅ Easy permission management

**Cons:**
- ❌ Files stored in MongoDB (not ideal for very large files)
- ❌ Not suitable for >100MB files
- ❌ MongoDB storage costs increase

**Implementation:**
```python
from pymongo import MongoClient
from gridfs import GridFS

client = MongoClient('mongodb://localhost:27017')
db = client['guardians_portal']
fs = GridFS(db)

# Upload file
file_id = fs.put(
    file_data,
    filename=filename,
    upload_date=datetime.datetime.utcnow(),
    metadata={'user_email': user.email, 'week_id': week_id}
)

# Download file
downloaded_file = fs.get(file_id)
```

---

### 3. **Azure Blob Storage**
**Best for: Microsoft ecosystem, enterprise**

**Pros:**
- ✅ Similar to S3, enterprise-grade
- ✅ Good Azure integration
- ✅ Flexible access control

**Cons:**
- ❌ Requires Azure account
- ❌ More expensive than S3
- ❌ Microsoft ecosystem lock-in

**Pricing:** ~$0.018 per GB, ~$0.0001 per transaction

---

### 4. **MinIO** (Self-hosted S3-compatible)
**Best for: Self-hosted, privacy-focused**

**Pros:**
- ✅ S3-compatible API (can switch to AWS anytime)
- ✅ Self-hosted = full control
- ✅ No external dependencies
- ✅ Open-source, free

**Cons:**
- ❌ Requires separate server/storage
- ❌ You manage backups and disaster recovery
- ❌ Operational overhead

**Implementation:** Same as S3 code, just different endpoint

---

### 5. **Cloudinary** (For images only)
**Best for: Image transformations, CDN delivery**

**Pros:**
- ✅ Automatic image optimization
- ✅ Built-in CDN
- ✅ Responsive image generation
- ✅ Simple free tier available

**Cons:**
- ❌ Image-only (not for documents)
- ❌ Less suitable for volunteer submissions

---

### 6. **Local Server Storage** (Filesystem)
**Best for: Development, small deployments**

**Pros:**
- ✅ Zero external dependencies
- ✅ Simple to implement
- ✅ No additional cost

**Cons:**
- ❌ Not scalable
- ❌ Manual backup required
- ❌ No built-in redundancy
- ❌ Doesn't work in serverless/cloud deployments

---

## Comparison Matrix

| Feature | Google Drive | AWS S3 | MongoDB GridFS | Azure | MinIO | Local FS |
|---------|-------------|--------|---------------|-------|-------|----------|
| Token Management | ❌ Complex | ✅ Simple | ✅ N/A | ✅ Simple | ✅ N/A | ✅ N/A |
| Cost | ❌ Unpredictable | ✅ $1-5/month | ✅ Included | ❌ $5-15/month | ✅ Free | ✅ Free |
| Scalability | ⚠️ Medium | ✅ Excellent | ⚠️ Medium | ✅ Excellent | ✅ Excellent | ❌ Poor |
| Setup Time | ⚠️ 30min | ✅ 15min | ✅ 10min | ⚠️ 20min | ⚠️ 45min | ✅ 5min |
| File Size Limit | ⚠️ 5TB/account | ✅ 5TB/file | ⚠️ 16MB GridFS default | ✅ 4.75TB/blob | ✅ Unlimited | ✅ Unlimited |
| Accessibility | ⚠️ Google UI | ✅ API only | ✅ API only | ✅ API only | ✅ API only | ✅ Web server |
| Backup/Recovery | ✅ Google | ✅ AWS | ⚠️ Your DB backup | ✅ Azure | ⚠️ Manual | ❌ Manual |
| Production Ready | ⚠️ Token issues | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No |

---

## My Recommendation: **AWS S3**

### Why S3 is Best for Guardian's Embrace

1. **Token-Free**: No OAuth token management headaches
2. **Reliable**: AWS uptime SLA: 99.99%
3. **Affordable**: ~$3-5/month for typical volunteer organization
4. **Scalable**: Grows with your organization
5. **Standard**: Industry-standard, widely used
6. **Easy Migration**: Can migrate from Google Drive later

### Setup Steps (Quick)

```bash
# 1. Create AWS account (free tier available)
# 2. Create IAM user with S3 access
# 3. Create S3 bucket: guardian-embrace-volunteers
# 4. Install boto3
pip install boto3

# 5. Add to .env
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_S3_BUCKET=guardian-embrace-volunteers
AWS_REGION=us-east-1
```

### Implementation Example

```python
# backend/app/core/storage.py
import boto3
from botocore.exceptions import ClientError

class S3StorageService:
    def __init__(self, bucket_name: str, region: str = 'us-east-1'):
        self.s3_client = boto3.client('s3', region_name=region)
        self.bucket_name = bucket_name
    
    def upload_file(self, file_data: bytes, filename: str, 
                   week_id: str, user_email: str) -> dict:
        """Upload file to S3"""
        key = f"{week_id}/{user_email}/{filename}"
        
        try:
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=key,
                Body=file_data,
                Metadata={'user': user_email, 'week': week_id}
            )
            
            # Generate presigned URL (expires in 7 days)
            url = self.s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.bucket_name, 'Key': key},
                ExpiresIn=7*24*3600
            )
            
            return {
                'file_id': key,
                'filename': filename,
                'download_url': url,
                'storage_type': 's3'
            }
        except ClientError as e:
            logger.error(f"S3 upload failed: {e}")
            raise
    
    def download_file(self, file_id: str) -> bytes:
        """Download file from S3"""
        try:
            response = self.s3_client.get_object(
                Bucket=self.bucket_name,
                Key=file_id
            )
            return response['Body'].read()
        except ClientError as e:
            logger.error(f"S3 download failed: {e}")
            raise
    
    def delete_file(self, file_id: str) -> bool:
        """Delete file from S3"""
        try:
            self.s3_client.delete_object(
                Bucket=self.bucket_name,
                Key=file_id
            )
            return True
        except ClientError as e:
            logger.error(f"S3 delete failed: {e}")
            return False
```

---

## Decision: Keep Google Drive or Switch?

### Switch to S3 if:
- ✅ Token management becomes ongoing problem
- ✅ Need enterprise-grade reliability
- ✅ Planning long-term growth
- ✅ Want to avoid token expiration issues

### Keep Google Drive if:
- ✅ Token is working reliably now
- ✅ Volunteers need easy access via Google Drive UI
- ✅ Want free storage
- ✅ Don't want to manage another service

---

## Next Steps

1. **If keeping Google Drive**: Monitor token expiration, consider automated token refresh mechanism
2. **If switching to S3**: 
   - Create AWS account (free tier)
   - Set up S3 bucket
   - Create IAM user with S3 permissions
   - Update `drive.py` to use S3
   - Migrate existing files (if needed)

Would you like me to implement the S3 integration, or would you prefer to stay with Google Drive and improve the token management?
