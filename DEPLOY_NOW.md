# MechPro AWS Deployment - Step by Step

## Status: ✅ Code Ready, Awaiting AWS Credentials

Your CDK infrastructure code has been updated to **us-east-2** and is ready to deploy!

```
✅ Stack updated: us-east-1 → us-east-2
✅ TypeScript compiled: 0 errors
✅ Infrastructure defined: VPC, RDS, Lambda, API Gateway, Cognito, S3, CloudFront
❌ Missing: AWS credentials
```

---

## Step 1: Configure AWS Credentials

You need to provide AWS credentials to the CLI. Choose ONE method:

### Method 1: AWS CLI Interactive (Recommended)

```powershell
# Install AWS CLI if not already installed
msiexec.exe /i https://awscli.amazonaws.com/AWSCLIV2.msi

# Configure with your access key
aws configure

# When prompted, enter:
# AWS Access Key ID: [your-access-key]
# AWS Secret Access Key: [your-secret-key]
# Default region: us-east-2
# Default output format: json
```

### Method 2: Environment Variables

```powershell
# Set in PowerShell session
$env:AWS_ACCESS_KEY_ID = "your-access-key-id"
$env:AWS_SECRET_ACCESS_KEY = "your-secret-access-key"
$env:AWS_DEFAULT_REGION = "us-east-2"

# Verify
aws sts get-caller-identity
```

### Method 3: AWS Credentials File

Create file: `C:\Users\YourUsername\.aws\credentials`

```
[default]
aws_access_key_id = your-access-key-id
aws_secret_access_key = your-secret-access-key

[default]
region = us-east-2
```

---

## Step 2: Get AWS Credentials

### From AWS Console:

1. Go to: https://console.aws.amazon.com/iam/
2. Click: **Users** → Your user account
3. Click: **Security credentials** tab
4. Click: **Create access key**
5. Choose: **Application running outside AWS**
6. Copy: **Access key ID** and **Secret access key**

⚠️ **IMPORTANT**: Store these securely! Don't share them.

---

## Step 3: Verify Credentials

```powershell
# Test AWS credentials
aws sts get-caller-identity

# Should show:
# {
#     "UserId": "AIDAI...",
#     "Account": "001018341557",
#     "Arn": "arn:aws:iam::001018341557:user/your-username"
# }
```

If you see the above, your credentials are working! ✅

---

## Step 4: Bootstrap AWS CDK (First Time Only)

```powershell
cd E:\MechPro-AWS

# Bootstrap CDK in us-east-2
npx cdk bootstrap aws://001018341557/us-east-2

# Expected output:
# ✓ Environment aws://001018341557/us-east-2 bootstrapped
```

---

## Step 5: Deploy Infrastructure

```powershell
cd E:\MechPro-AWS

# Deploy all stacks
npx cdk deploy --all --require-approval=never

# This will create:
# ✅ VPC with 2 Availability Zones
# ✅ RDS Aurora PostgreSQL cluster
# ✅ Lambda functions (5 services)
# ✅ API Gateway with Cognito auth
# ✅ S3 + CloudFront (frontend)
# ✅ CloudWatch monitoring
# ✅ Security groups & IAM roles

# Deployment time: ~15-20 minutes
```

---

## Expected Output

After deployment completes, you'll see:

```
✅ MechProAwsStack
  Outputs:
  - APIGatewayURL = https://abc123.execute-api.us-east-2.amazonaws.com/production
  - CloudFrontURL = https://d12345abcde.cloudfront.net
  - DatabaseEndpoint = database-1.cluster-crycioqkyke3.us-east-2.rds.amazonaws.com
  - UserPoolId = us-east-2_xxxxx
  - UserPoolClientId = xxxxx
  - S3BucketName = mechpro-frontend-001018341557

✅ MechProMonitoringStack
  Outputs:
  - DashboardURL = https://console.aws.amazon.com/cloudwatch/...
  - AlarmTopicArn = arn:aws:sns:us-east-2:...
```

**Save these outputs!** You'll need them for:
- Lambda environment variables
- Frontend API configuration
- Database connection strings
- Monitoring dashboards

---

## Step 6: Verify Deployment

### Check CloudFormation Stacks

```powershell
aws cloudformation list-stacks --region us-east-2
```

### Check RDS Cluster

```powershell
aws rds describe-db-clusters --region us-east-2 --query 'DBClusters[0].[DBClusterIdentifier,Status,Engine]'
```

### Check Lambda Functions

```powershell
aws lambda list-functions --region us-east-2 --query 'Functions[*].[FunctionName,Runtime,LastModified]'
```

### Check API Gateway

```powershell
aws apigateway get-rest-apis --region us-east-2
```

---

## Troubleshooting

### Error: "Need to perform AWS calls for account 001018341557, but no credentials have been configured"

**Solution**: Run `aws configure` first (see Step 1)

### Error: "User is not authorized to perform: iam:CreateRole"

**Solution**: Your AWS user doesn't have IAM permissions. Ask your AWS admin to grant:
- `AdministratorAccess` (or)
- `IAMFullAccess` + `RDSFullAccess` + `LambdaFullAccess` + `APIGatewayFullAccess` + `CognitoFullAccess`

### Error: "Limit exceeded for resource: ..."

**Solution**: Check AWS service quotas. May need to request increases for:
- VPCs per region
- RDS DB instances
- Lambda functions

### Deployment is slow / taking >30 minutes

**This is normal!** Creating RDS takes 10-15 minutes. CloudFront takes 5-10 minutes. Just wait.

To monitor progress:
```powershell
# Check CloudFormation events
aws cloudformation describe-stack-events --stack-name MechProAwsStack --region us-east-2
```

---

## After Deployment

### 1. Initialize Database Schema

```powershell
# Connect to RDS
.\connect-rds.ps1 -Method password

# Then run SQL from RDS_CONNECTION.md
```

### 2. Build React Frontend

```powershell
cd E:\MechPro\MechPro
npm run build
```

### 3. Deploy Frontend to S3

```powershell
$BUCKET = "mechpro-frontend-001018341557"
aws s3 sync ./dist s3://$BUCKET/ --delete --region us-east-2
```

### 4. Invalidate CloudFront Cache

```powershell
$DIST_ID = aws cloudfront list-distributions --query "DistributionList.Items[0].Id" --output text
aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/*" --region us-east-2
```

### 5. Test the Application

```powershell
# Get CloudFront URL
$CF_URL = aws cloudfront list-distributions --query "DistributionList.Items[0].DomainName" --output text
echo "Open: https://$CF_URL"
```

---

## Quick Reference Commands

```powershell
# Verify credentials
aws sts get-caller-identity

# Bootstrap CDK
npx cdk bootstrap aws://001018341557/us-east-2

# Deploy infrastructure
npx cdk deploy --all --require-approval=never

# View outputs
aws cloudformation describe-stacks --stack-name MechProAwsStack --region us-east-2 --query 'Stacks[0].Outputs'

# Check RDS
aws rds describe-db-clusters --region us-east-2

# View Lambda logs
aws logs tail /aws/lambda/MechPro-Customers --follow --region us-east-2

# Connect to database
.\connect-rds.ps1 -Method password

# Deploy frontend
aws s3 sync ./dist s3://mechpro-frontend-001018341557/ --delete --region us-east-2

# Clean up (DELETE ALL RESOURCES)
npx cdk destroy --all --force
```

---

## Region is Now: 🟢 us-east-2

Your infrastructure will be created in:
- **Region**: us-east-2 (Ohio)
- **Account**: 001018341557
- **RDS**: database-1.cluster-crycioqkyke3.us-east-2.rds.amazonaws.com
- **API Gateway**: {api-id}.execute-api.us-east-2.amazonaws.com

---

## Next Action

### ⬇️ Configure AWS Credentials Now

```powershell
# 1. Get access keys from AWS IAM console
# 2. Run this command
aws configure

# 3. Enter your credentials
```

**Then run:**
```powershell
npx cdk bootstrap aws://001018341557/us-east-2
npx cdk deploy --all --require-approval=never
```

---

**Estimated total time to full deployment**: 20-30 minutes

Once complete, you'll have a production-ready multi-tenant SaaS! 🎉
