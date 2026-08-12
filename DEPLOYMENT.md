# AWS Infrastructure Deployment Guide for MechPro

## Prerequisites

1. **AWS Account**: 001018341557
2. **AWS CLI**: Installed and configured with credentials
3. **Node.js**: v20 or later
4. **AWS CDK**: Installed globally (`npm install -g aws-cdk`)

## Deployment Steps

### Step 1: Prepare Environment Variables

Create a `.env` file in the `MechPro-AWS` root directory:

```bash
# AWS Configuration
AWS_ACCOUNT_ID=001018341557
AWS_REGION=us-east-1

# Stripe (for payment processing)
STRIPE_SECRET_KEY=sk_live_your_stripe_key_here

# OpenAI (for AI inspection analysis)
OPENAI_API_KEY=sk-your-openai-key-here

# Frontend Configuration
REACT_APP_API_GATEWAY_URL=https://your-api-gateway-id.execute-api.us-east-1.amazonaws.com/production
REACT_APP_COGNITO_USER_POOL_ID=us-east-1_xxxxx
REACT_APP_COGNITO_CLIENT_ID=xxxxx
```

### Step 2: Install Dependencies

```bash
cd E:\MechPro-AWS
npm install

# Also install React frontend dependencies
cd E:\MechPro\MechPro
npm install
```

### Step 3: Bootstrap AWS CDK

First time only - prepares AWS account for CDK deployments:

```bash
cd E:\MechPro-AWS
npx cdk bootstrap aws://001018341557/us-east-1
```

### Step 4: Synthesize CloudFormation Template

```bash
npx cdk synth
```

This generates the CloudFormation template in `cdk.out/`. Review it to ensure all resources are correct.

### Step 5: Deploy Infrastructure

Deploy all AWS resources (RDS, Cognito, Lambda, API Gateway, S3, CloudFront):

```bash
npx cdk deploy --require-approval=never
```

**Output**: The CDK will output the following URLs and IDs:
- `DatabaseEndpoint`: RDS cluster endpoint
- `APIGatewayURL`: Your backend API endpoint
- `UserPoolId`: Cognito User Pool ID
- `UserPoolClientId`: Cognito Client ID
- `CloudFrontURL`: Frontend distribution URL
- `S3BucketName`: Frontend bucket name

### Step 6: Build React Frontend

```bash
cd E:\MechPro\MechPro
npm run build
```

### Step 7: Deploy Frontend to S3 + CloudFront

```bash
# Set the API Gateway URL from Step 5
$apiUrl = "https://xxxxx.execute-api.us-east-1.amazonaws.com/production"

# Copy build files to S3
aws s3 sync ./dist s3://mechpro-frontend-001018341557/ --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id XXXXX --paths "/*"
```

### Step 8: Configure Cognito Callback URLs

In AWS Console → Cognito → User Pools → MechPro-UserPool → App Clients → MechPro-Web-App:

Update **Allowed callback URLs**:
```
https://yourdomain.com/callback
https://your-cloudfront-id.cloudfront.net/callback
```

### Step 9: Add Environment Variables to Lambda Functions

In AWS Console → Lambda → Each Function → Configuration → Environment Variables:

```
STRIPE_SECRET_KEY=sk_live_...
OPENAI_API_KEY=sk-...
NHTSA_API_BASE=https://webapi.nhtsa.gov/api
```

## Monitoring

### CloudWatch Logs

View API Gateway and Lambda logs:

```bash
# API Gateway logs
aws logs tail /aws/apigateway/MechPro --follow

# Lambda logs
aws logs tail /aws/lambda/MechPro-Customers --follow
```

### CloudWatch Metrics

Monitor in AWS Console → CloudWatch → Dashboards → MechPro

Key metrics:
- API requests/latency
- Lambda duration/errors
- RDS CPU/connections

## Cleanup

To delete all AWS resources and avoid charges:

```bash
cd E:\MechPro-AWS
npx cdk destroy --force
```

## Multi-Tenant Architecture

Each auto shop is isolated by:
1. **Database**: Separate schema per shop_id
2. **Auth**: Cognito custom claim `custom:shop_id` ensures users only see their shop's data
3. **API**: All Lambda functions filter by shop_id from the JWT token
4. **Row-level security**: PostgreSQL policies enforce shop_id isolation

## Scaling

For production with 100-1000 users per month:

- **RDS Aurora**: Auto-scales read replicas
- **Lambda**: Automatically scales based on API requests
- **API Gateway**: Handles up to 10k req/s (increase via support ticket)
- **S3 + CloudFront**: Globally distributed, automatically scaled

Estimated AWS costs at $100/month:
- RDS Aurora: $45-60/month (2 instances)
- Lambda: $10-20/month (1M requests)
- API Gateway: $10-15/month
- S3 + CloudFront: $5-10/month
- NAT Gateway: $15-20/month

**Total**: ~$100/month baseline

## Support

For issues:
1. Check CloudWatch logs: `aws logs tail /aws/lambda/MechPro-* --follow`
2. Check CloudFormation events: `aws cloudformation describe-stack-events --stack-name MechProAwsStack`
3. Verify RDS connectivity from Lambda security group
4. Verify API Gateway authorizer (Cognito) configuration
