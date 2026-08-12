# MechPro AWS Quick Start Guide

## What You've Got

Your MechPro application is now **production-ready on AWS**. Here's the complete architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                     MECHPRO ON AWS                           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  FRONTEND (React)                                            │
│  ├─ S3 (static file storage)                                │
│  ├─ CloudFront (CDN distribution)                           │
│  └─ Authenticated via Cognito                               │
│                                                               │
│  BACKEND (API Gateway + Lambda)                             │
│  ├─ /customers (CRUD operations)                            │
│  ├─ /bookings (appointment scheduling)                      │
│  ├─ /invoices (billing + Stripe integration)                │
│  ├─ /inspections (vehicle analysis + OpenAI)                │
│  ├─ /employees (staff management)                           │
│  └─ All requests authenticated via Cognito                  │
│                                                               │
│  DATABASE (Aurora PostgreSQL)                               │
│  ├─ Multi-tenant isolation by shop_id                       │
│  ├─ Auto-scaling read replicas                              │
│  └─ Automated daily backups                                 │
│                                                               │
│  AUTH (Cognito User Pool)                                   │
│  ├─ User registration & login                               │
│  ├─ Custom shop_id claim for multi-tenancy                  │
│  └─ JWT tokens for API authentication                       │
│                                                               │
│  MONITORING (CloudWatch)                                    │
│  ├─ Real-time dashboards                                    │
│  ├─ Alarms for errors/throttling                            │
│  └─ Log aggregation & insights                              │
│                                                               │
│  CI/CD (GitHub Actions)                                     │
│  ├─ Automated tests on every push                           │
│  ├─ Automatic deployment to AWS                             │
│  └─ Frontend + Backend sync                                 │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Key Features Implemented

✅ **Multi-Tenant Architecture**: Each auto shop is completely isolated by shop_id  
✅ **Customer Management**: Create, read, update, delete customers  
✅ **Booking System**: Schedule appointments with auto-confirmation  
✅ **Invoicing**: Generate invoices with line items, Stripe payment integration  
✅ **Vehicle Inspections**: Capture findings, AI analysis via OpenAI, NHTSA integration  
✅ **Employee Management**: Staff profiles, roles, salary tracking  
✅ **Authentication**: Cognito user pool with OAuth support  
✅ **Real-time Monitoring**: CloudWatch dashboards and alarms  
✅ **Automated Backups**: RDS daily snapshots (30-day retention)  
✅ **CI/CD Pipeline**: GitHub Actions auto-deploy on git push  

## Prerequisites

1. **AWS Account**: 001018341557 ✓
2. **AWS CLI**: Install from https://aws.amazon.com/cli/
3. **Node.js 20+**: Install from https://nodejs.org/
4. **AWS CDK**: `npm install -g aws-cdk`
5. **Git**: For GitHub Actions
6. **Environment Variables**: See DEPLOYMENT.md

## Step 1: Set AWS Credentials

```bash
# Configure AWS CLI
aws configure

# Enter:
# AWS Access Key ID: [your-access-key]
# AWS Secret Access Key: [your-secret-key]
# Default region: us-east-1
# Default output format: json
```

Or set environment variables:

```bash
$env:AWS_ACCESS_KEY_ID = "your-access-key"
$env:AWS_SECRET_ACCESS_KEY = "your-secret-key"
$env:AWS_DEFAULT_REGION = "us-east-1"
```

## Step 2: Bootstrap AWS CDK

```bash
cd E:\MechPro-AWS
npx cdk bootstrap aws://001018341557/us-east-1
```

## Step 3: Set Up Secrets

Create `.env` file in `E:\MechPro-AWS`:

```bash
STRIPE_SECRET_KEY=sk_live_your_stripe_key
OPENAI_API_KEY=sk-your-openai-key
```

## Step 4: Deploy Infrastructure

```bash
cd E:\MechPro-AWS
npm install
npx cdk deploy --require-approval=never
```

**Wait 10-15 minutes** for:
- RDS Aurora cluster creation
- VPC & networking setup
- Lambda functions creation
- API Gateway provisioning
- CloudFront distribution

Once complete, you'll see outputs like:

```
✅ MechProAwsStack
   APIGatewayURL = https://xxxxx.execute-api.us-east-1.amazonaws.com/production
   CloudFrontURL = https://d12345.cloudfront.net
   UserPoolId = us-east-1_xxxxx
   S3BucketName = mechpro-frontend-001018341557
```

## Step 5: Build & Deploy Frontend

```bash
cd E:\MechPro\MechPro
npm install
npm run build
```

Copy the build to S3:

```bash
$bucket = "mechpro-frontend-001018341557"
aws s3 sync ./dist s3://$bucket/ --delete
```

Invalidate CloudFront cache:

```bash
$distId = $(aws cloudfront list-distributions --query "DistributionList.Items[0].Id" --output text)
aws cloudfront create-invalidation --distribution-id $distId --paths "/*"
```

## Step 6: Create Your First Shop Owner

In AWS Console → Cognito → User Pools → MechPro-UserPool:

1. Click "Create user"
2. Fill in username (email), password
3. Uncheck "Send an invitation email"
4. Add custom attribute `custom:shop_id` = `shop_12345`
5. Create

## Step 7: Test the Application

1. Open CloudFront URL from Step 4
2. Login with credentials from Step 6
3. Navigate to Customers → Add Customer
4. Create a test customer
5. View it in the table

## API Endpoints (for advanced users)

All requests require Bearer token from login.

```bash
# Login
POST https://xxxxx.execute-api.us-east-1.amazonaws.com/production/auth/login
{
  "email": "shop@example.com",
  "password": "password123"
}

# Get Customers
GET https://xxxxx.execute-api.us-east-1.amazonaws.com/production/customers
Header: Authorization: Bearer <token>

# Create Customer
POST https://xxxxx.execute-api.us-east-1.amazonaws.com/production/customers
Header: Authorization: Bearer <token>
Body: {
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "555-1234",
  "address": "123 Main St"
}

# Create Booking
POST https://xxxxx.execute-api.us-east-1.amazonaws.com/production/bookings
Header: Authorization: Bearer <token>
Body: {
  "customer_id": 1,
  "employee_id": 1,
  "booking_date": "2026-08-15T10:00:00Z",
  "service_type": "Oil Change",
  "notes": "Full synthetic"
}

# Create Invoice
POST https://xxxxx.execute-api.us-east-1.amazonaws.com/production/invoices
Header: Authorization: Bearer <token>
Body: {
  "customer_id": 1,
  "booking_id": 1,
  "total_amount": 49.99,
  "items": [{"description": "Oil Change", "quantity": 1, "unit_price": 49.99}],
  "payment_method": "stripe"
}

# Create Inspection (with AI analysis)
POST https://xxxxx.execute-api.us-east-1.amazonaws.com/production/inspections
Header: Authorization: Bearer <token>
Body: {
  "customer_id": 1,
  "vehicle_vin": "WBADT43452G917860",
  "findings": "Found rust on undercarriage, brake pads worn 60%"
}
```

## Monitoring & Dashboards

1. **CloudWatch Dashboard**: AWS Console → CloudWatch → Dashboards → MechPro-Operations
2. **API Logs**: AWS Console → CloudWatch → Log Groups → /aws/apigateway/MechPro
3. **Lambda Logs**: AWS Console → CloudWatch → Log Groups → /aws/lambda/MechPro-*
4. **RDS Performance**: AWS Console → RDS → Clusters → MechPro-DBCluster → Performance Insights

## Scaling Your App

As your customer base grows:

- **Lambda**: Auto-scales to handle 1000s of concurrent requests
- **RDS Aurora**: Auto-scales read replicas; upgrade instance type for write capacity
- **API Gateway**: Can handle 10k requests/second (contact AWS support for increases)
- **CloudFront**: Global CDN automatically scales

## Costs (Estimated Monthly)

| Service         | Cost    | Notes                          |
|-----------------|---------|--------------------------------|
| RDS Aurora      | $45-60  | 2 instances t4g.medium         |
| Lambda          | $10-20  | 1M requests/month              |
| API Gateway     | $10-15  | 1M requests + data out         |
| S3 + CloudFront | $5-10   | Typical usage                  |
| NAT Gateway     | $15-20  | Outbound data transfer         |
| **Total**       | ~$100   | **Baseline**                   |

## Selling to Auto Shops

To onboard a new shop:

1. Create new Cognito user with unique shop_id
2. User logs in, gets isolated database schema automatically
3. Shop data is immediately isolated from others
4. Multi-tenant isolation is automatic via shop_id in all queries

## Troubleshooting

### Deployment Stuck?

```bash
# Check CloudFormation events
aws cloudformation describe-stack-events --stack-name MechProAwsStack --region us-east-1

# View CDK logs
npx cdk deploy --verbose
```

### API Returns 403 Unauthorized?

1. Verify Cognito token is valid: `aws cognito-idp admin-initiate-auth --user-pool-id us-east-1_xxxxx ...`
2. Check token has `custom:shop_id` claim
3. Verify Lambda has access to database secret

### Database Connection Timeout?

1. Check security group allows traffic from Lambda VPC
2. Verify RDS cluster is in the same VPC
3. Check RDS secret in Secrets Manager exists

### Lambda Cold Starts Taking 5+ Seconds?

1. Increase Lambda memory to 1024MB (faster CPU)
2. Use Lambda provisioned concurrency for predictable load

## Next Steps

1. **Set up domain**: Route53 + Certificate Manager → CloudFront
2. **Enable custom branding**: Update React app colors/logos
3. **Add multi-shop admin console**: See all shops, analytics, billing
4. **Set up backup email alerts**: CloudWatch → SNS → Email
5. **Implement tenant analytics**: QuickSight + RDS queries
6. **Add mobile app**: Deploy same backend to iOS/Android

## Support Resources

- **AWS Documentation**: https://docs.aws.amazon.com/
- **CDK Reference**: https://docs.aws.amazon.com/cdk/latest/guide/
- **Lambda Best Practices**: https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html
- **RDS Aurora**: https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/

---

**Ready to go live? Follow the deployment checklist in DEPLOYMENT.md** ✅
