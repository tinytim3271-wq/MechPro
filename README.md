# MechPro: AWS Multi-Tenant Automotive Management Platform

**Your complete, production-ready automotive shop management system on AWS.**

## 🚀 What's Included

### Backend Infrastructure (AWS CDK)
- ✅ **RDS Aurora PostgreSQL** — Multi-tenant database with 2 replicas
- ✅ **Lambda Functions** — Serverless APIs for customers, bookings, invoices, inspections, employees
- ✅ **API Gateway** — REST endpoints with Cognito authorization
- ✅ **Cognito User Pool** — OIDC/OAuth authentication, custom shop_id claims
- ✅ **CloudWatch** — Real-time dashboards, alarms, log aggregation
- ✅ **S3 + CloudFront** — Static React frontend hosting with global CDN
- ✅ **VPC + Security Groups** — Network isolation, encrypted secrets

### Frontend (React)
- ✅ **AWS API Client** — Replaces Hercules SDK, native AWS integration
- ✅ **Auth Context** — Cognito login/register, token management
- ✅ **Pages** — Customers, bookings, invoices, inspections, employees
- ✅ **Forms** — Full CRUD operations with validation

### Features
- ✅ **Multi-Tenant Isolation** — Each shop's data completely isolated by shop_id
- ✅ **Customer Management** — Create, read, update, delete customers
- ✅ **Booking System** — Schedule appointments
- ✅ **Invoicing** — Generate invoices with Stripe payment integration
- ✅ **Vehicle Inspections** — AI-powered analysis with OpenAI, NHTSA integration
- ✅ **Employee Management** — Staff profiles and scheduling
- ✅ **CI/CD Pipeline** — GitHub Actions auto-deploys on git push

## 📊 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ FRONTEND: React on CloudFront + S3                          │
│ └─ Authenticated via Cognito                                │
│    └─ Calls API Gateway endpoints                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ API LAYER: API Gateway + Cognito Authorizer                │
│ └─ /customers, /bookings, /invoices, /inspections, /employees
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ COMPUTE: Lambda Functions (Node.js 20)                      │
│ └─ Filter by shop_id from JWT token                         │
│    └─ Access RDS Aurora via Secrets Manager credentials     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ DATABASE: Aurora PostgreSQL (Multi-Tenant)                  │
│ ├─ customers table (shop_id isolation)                      │
│ ├─ bookings table                                           │
│ ├─ invoices table (Stripe integration)                      │
│ ├─ inspections table (OpenAI + NHTSA)                       │
│ ├─ employees table                                          │
│ └─ All tables indexed by shop_id for performance            │
└─────────────────────────────────────────────────────────────┘

EXTERNAL: Stripe (payments), OpenAI (AI), NHTSA (vehicle data)
MONITORING: CloudWatch (logs, metrics, alarms)
CI/CD: GitHub Actions
```

## 🚀 Quick Start (5 Steps)

### 1. Prerequisites
```bash
# Install AWS CLI, Node.js 20+, AWS CDK
npm install -g aws-cdk
aws configure  # Set your credentials
```

### 2. Deploy Infrastructure
```bash
cd E:\MechPro-AWS
npm install
npx cdk deploy --require-approval=never
# Wait 10-15 minutes for AWS resources to provision
```

### 3. Build & Deploy Frontend
```bash
cd E:\MechPro\MechPro
npm install
npm run build
aws s3 sync ./dist s3://mechpro-frontend-001018341557/ --delete
```

### 4. Create First Shop Owner
- AWS Console → Cognito → Users → Create user
- Email + password
- Add custom attribute `custom:shop_id = shop_12345`

### 5. Login & Test
- Open CloudFront URL (from CDK deploy output)
- Login with credentials
- Add a customer → See it in the table

**That's it!** Your app is live. 🎉

## 📚 Documentation

- **[QUICKSTART.md](./QUICKSTART.md)** — Detailed getting started guide
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** — Step-by-step deployment instructions
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — Technical reference & schema

## 💰 Estimated Costs

| Service | Cost/Month |
|---------|-----------|
| RDS Aurora | $45–60 |
| Lambda | $10–20 |
| API Gateway | $10–15 |
| S3 + CloudFront | $5–10 |
| NAT Gateway | $15–20 |
| **Total** | **~$100** |

(Costs scale with usage; free tier included for first 12 months on new AWS accounts)

## 🔒 Security Features

- ✅ **Encryption**: TLS in transit, KMS at rest
- ✅ **Authentication**: Cognito OAuth 2.0 / OIDC
- ✅ **Authorization**: Row-level security by shop_id
- ✅ **Network**: VPC with private subnets, NAT gateway
- ✅ **Secrets**: AWS Secrets Manager (auto-rotated credentials)

## 🌍 Global Deployment

- **Frontend**: CloudFront edge locations (200+ cities)
- **Backend**: Regional (us-east-1, easily extend to multi-region)
- **Database**: Aurora with read replicas (auto-failover)
- **CDN**: 99.99% SLA with automatic failover

## 📈 Scaling

Your app automatically scales to handle:
- **10k+ concurrent users** (Lambda + API Gateway)
- **Millions of database records** (Aurora with auto-scaling)
- **Global traffic** (CloudFront caching)

No server management needed—AWS handles it.

## 🎯 Selling to Auto Shops

To onboard a new shop:

```typescript
// 1. Register new user in Cognito
const shopId = generateUniqueId();
await cognito.adminCreateUser({
  UserPoolId: pool.id,
  Username: shop_email,
  TemporaryPassword: temp_password,
  UserAttributes: [
    { Name: 'email', Value: shop_email },
    { Name: 'custom:shop_id', Value: shopId },
  ],
});

// 2. Database is automatically isolated
// All queries filter by this shop_id
SELECT * FROM customers WHERE shop_id = shopId;
// → Only this shop's customers visible
```

## 🔧 Adding New Features

Example: Add Parts Inventory

1. Create Lambda function: `lambda/functions/parts.ts`
2. Add RDS table with `shop_id` field
3. Add API endpoint to `mech_pro-aws-stack.ts`
4. Add React component in `src/pages/PartsPage.tsx`
5. Call from React using `apiClient.getParts()`

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed example.

## 🛠️ Common Tasks

### View Logs
```bash
# API Gateway logs
aws logs tail /aws/apigateway/MechPro --follow

# Lambda logs
aws logs tail /aws/lambda/MechPro-Customers --follow
```

### Deploy Updates
```bash
cd E:\MechPro-AWS
npm run build
npx cdk deploy --require-approval=never
```

### Delete Everything (avoid charges)
```bash
npx cdk destroy --force
```

### Monitor Costs
AWS Console → Billing → Bills → Services → Sort by cost

## 📞 Support

- **AWS Docs**: https://docs.aws.amazon.com/
- **Lambda Troubleshooting**: https://docs.aws.amazon.com/lambda/latest/dg/troubleshooting.html
- **RDS Support**: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/

## 🎓 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| API | AWS API Gateway + Lambda (Node.js 20) |
| Database | Aurora PostgreSQL |
| Auth | Cognito User Pool |
| Infrastructure | AWS CDK (TypeScript) |
| Monitoring | CloudWatch |
| CI/CD | GitHub Actions |
| Hosting | S3 + CloudFront |
| Payments | Stripe API |
| AI | OpenAI API |
| Vehicle Data | NHTSA API |

## 📝 Files

```
E:\MechPro/
├── MechPro/                    # React frontend
│   └── src/
│       ├── api/awsClient.ts   # AWS API client
│       ├── context/AuthContext.tsx
│       └── pages/
├── MechPro-AWS/                # AWS infrastructure
│   ├── lib/mech_pro-aws-stack.ts
│   ├── lib/monitoring-stack.ts
│   ├── lambda/functions/       # API handlers
│   ├── QUICKSTART.md
│   ├── DEPLOYMENT.md
│   └── ARCHITECTURE.md
```

## 🚢 Production Checklist

- [ ] AWS account configured with credentials
- [ ] Environment variables set (Stripe, OpenAI, etc.)
- [ ] Infrastructure deployed via CDK
- [ ] Frontend built and pushed to S3
- [ ] Domain configured (Route53 + CloudFront)
- [ ] SSL certificate created (ACM)
- [ ] CloudWatch alarms configured
- [ ] Backup email set for SNS alerts
- [ ] GitHub Actions workflow tested
- [ ] First shop owner created in Cognito
- [ ] End-to-end test: login → add customer → view → success ✅

## 📄 License

ISC

---

**Ready to launch your SaaS?** Start with [QUICKSTART.md](./QUICKSTART.md) 🚀
