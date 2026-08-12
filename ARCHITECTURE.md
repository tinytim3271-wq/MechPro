# MechPro AWS Architecture Reference

## Directory Structure

```
E:\MechPro/
├── MechPro/                          # React Frontend
│   ├── src/
│   │   ├── api/
│   │   │   └── awsClient.ts          # AWS API client (replaces Hercules)
│   │   ├── context/
│   │   │   └── AuthContext.tsx       # Cognito authentication context
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx         # Login UI
│   │   │   └── CustomersPage.tsx     # Customers CRUD example
│   │   └── package.json
│   └── Vite build output → S3 + CloudFront
│
└── MechPro-AWS/                      # AWS CDK Infrastructure
    ├── bin/
    │   └── mech_pro-aws.ts           # CDK App entry point
    ├── lib/
    │   ├── mech_pro-aws-stack.ts     # Main infrastructure stack
    │   └── monitoring-stack.ts       # CloudWatch monitoring
    ├── lambda/
    │   └── functions/
    │       ├── customers.ts          # Customers API handler
    │       ├── bookings.ts           # Bookings API handler
    │       ├── invoices.ts           # Invoices API handler
    │       ├── inspections.ts        # Inspections API handler
    │       ├── employees.ts          # Employees API handler
    │       ├── auth.ts               # Auth handler
    │       └── db.ts                 # Database utilities
    ├── QUICKSTART.md                 # Getting started guide
    ├── DEPLOYMENT.md                 # Detailed deployment guide
    ├── package.json
    ├── tsconfig.json
    └── cdk.json                      # CDK configuration
```

## AWS Services Used

| Service | Purpose | Configuration |
|---------|---------|---|
| **RDS Aurora PostgreSQL** | Multi-tenant database | t4g.medium x2, 30-day backups, 2 AZs |
| **Lambda** | Serverless compute for APIs | Node.js 20, 512MB memory, VPC attached |
| **API Gateway** | REST API endpoints | Cognito authorizer, CORS enabled |
| **Cognito User Pool** | Authentication & authorization | Custom `shop_id` claim for multi-tenancy |
| **S3** | Static frontend hosting | Versioned, encrypted, blocked public access |
| **CloudFront** | Global CDN | Caches dist/, redirects 404→index.html |
| **CloudWatch** | Logs, metrics, alarms | 2-week retention, SNS alerts |
| **VPC + Security Groups** | Network isolation | Private subnets for RDS, NAT gateway for egress |
| **Secrets Manager** | Database credentials | Auto-rotated RDS credentials |

## Multi-Tenant Data Isolation

Each auto shop is isolated using **shop_id**:

```
┌─ Frontend Login
│  └─ Cognito authenticates user
│     └─ JWT token includes custom:shop_id claim
│        └─ User sends Bearer token to API
│           └─ API Gateway validates with Cognito
│              └─ Lambda extracts shop_id from JWT
│                 └─ All database queries filter by shop_id
│                    └─ Row-level security ensures data isolation
```

**Example**: Shop A's customers query:
```sql
SELECT * FROM customers WHERE shop_id = 'shop_a_id' 
-- Only returns Shop A's customers, not Shop B's
```

## API Endpoints

All endpoints require Cognito Bearer token.

### Customers
```
GET    /customers                 # List all customers for shop
GET    /customers/{id}            # Get single customer
POST   /customers                 # Create new customer
PUT    /customers/{id}            # Update customer
DELETE /customers/{id}            # Delete customer
```

### Bookings
```
GET    /bookings                  # List all bookings for shop
POST   /bookings                  # Create new booking
```

### Invoices
```
GET    /invoices                  # List all invoices
POST   /invoices                  # Create new invoice (with Stripe integration)
```

### Inspections
```
GET    /inspections               # List all inspections
POST   /inspections               # Create inspection (with AI analysis)
```

### Employees
```
GET    /employees                 # List all employees
POST   /employees                 # Create new employee
```

## Lambda Function Specifications

### Memory & Timeout
- **Memory**: 512 MB (increase to 1024 MB for heavy processing)
- **Timeout**: 30 seconds (sufficient for database queries + external APIs)
- **VPC**: Attached to private subnets to access RDS

### Environment Variables
```
DB_HOST               # RDS cluster endpoint
DB_PORT               # 5432
DB_NAME               # mechpro
DB_USER               # postgres
DB_SECRET_ARN         # Secrets Manager ARN with credentials
COGNITO_USER_POOL_ID  # User pool ID
COGNITO_CLIENT_ID     # App client ID
STRIPE_SECRET_KEY     # Stripe API key
OPENAI_API_KEY        # OpenAI API key
NHTSA_API_BASE        # https://webapi.nhtsa.gov/api
```

### Layers
- `NodeModulesLayer`: Shared dependencies (pg, stripe, openai, @aws-sdk/*)

## Database Schema (Per Shop)

```sql
-- Customers table
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  shop_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  address TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(shop_id, email)
);

-- Employees table
CREATE TABLE employees (
  id SERIAL PRIMARY KEY,
  shop_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  role VARCHAR(50),
  salary NUMERIC(10, 2),
  status VARCHAR(50),
  created_at TIMESTAMP,
  UNIQUE(shop_id, email)
);

-- Bookings table
CREATE TABLE bookings (
  id SERIAL PRIMARY KEY,
  shop_id VARCHAR(255) NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  employee_id INTEGER REFERENCES employees(id),
  booking_date TIMESTAMP NOT NULL,
  service_type VARCHAR(255),
  notes TEXT,
  status VARCHAR(50),
  created_at TIMESTAMP
);

-- Invoices table
CREATE TABLE invoices (
  id SERIAL PRIMARY KEY,
  shop_id VARCHAR(255) NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  booking_id INTEGER REFERENCES bookings(id),
  total_amount NUMERIC(12, 2),
  status VARCHAR(50),
  stripe_payment_intent_id VARCHAR(255),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Invoice items table
CREATE TABLE invoice_items (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
  description VARCHAR(255),
  quantity NUMERIC(10, 2),
  unit_price NUMERIC(12, 2)
);

-- Inspections table
CREATE TABLE inspections (
  id SERIAL PRIMARY KEY,
  shop_id VARCHAR(255) NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  vehicle_vin VARCHAR(17),
  findings TEXT,
  ai_analysis TEXT,
  created_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_customers_shop_id ON customers(shop_id);
CREATE INDEX idx_employees_shop_id ON employees(shop_id);
CREATE INDEX idx_bookings_shop_id ON bookings(shop_id);
CREATE INDEX idx_invoices_shop_id ON invoices(shop_id);
CREATE INDEX idx_inspections_shop_id ON inspections(shop_id);
```

## Monitoring & Observability

### CloudWatch Dashboard Widgets
1. **API Gateway Metrics**
   - Request count (5-min avg)
   - Latency (avg, p99, p999)
   - 4XX & 5XX errors

2. **Lambda Metrics**
   - Invocations
   - Duration (avg)
   - Errors
   - Throttles

3. **RDS Metrics**
   - CPU utilization
   - Active connections
   - Read/Write latency
   - Database throughput

### CloudWatch Alarms
- 5XX errors > 10 in 5 min
- Lambda errors > 5 in 1 min
- Lambda throttles > 0
- RDS CPU > 80% for 10 min
- RDS connections > 80

### Log Insights Queries
```sql
-- Slow requests
fields @timestamp, @duration, @httpPath
| filter @duration > 1000
| stats avg(@duration), count() by @httpPath

-- Error rate
fields @message
| filter @message like /ERROR/
| stats count() as errors

-- Cold starts
fields @initDuration
| filter @initDuration > 0
| stats count() as cold_starts
```

## Security

### Authentication
- **Cognito User Pool**: Industry-standard OIDC/OAuth 2.0
- **JWT Tokens**: Signed, verified at API Gateway
- **Token Expiry**: 1 hour (refresh tokens: 30 days)

### Encryption
- **In Transit**: HTTPS/TLS 1.2+
- **At Rest**: 
  - RDS: AWS KMS encryption
  - S3: Server-side encryption
  - Secrets: AWS Secrets Manager

### Network Security
- **VPC**: Isolated, private subnets for RDS
- **Security Groups**: Restrict access by source
- **NAT Gateway**: Outbound-only access for Lambda

### API Authorization
- **Cognito Authorizer**: Validates JWT at API Gateway
- **Row-Level Security**: shop_id filter in Lambda
- **CORS**: Configured for frontend domain only

## Cost Optimization

### Free Tier (if applicable)
- Lambda: 1M requests/month
- API Gateway: 1M requests/month
- RDS: Some DB instances included

### Reserved Instances (RI)
- RDS: 1-year RI saves ~40% on compute
- Lambda: Provisioned concurrency for predictable load

### Auto-Scaling
- Lambda: Automatic (no configuration needed)
- RDS Aurora: Auto-scales read replicas

### Cost Breakdown (~$100/month)
```
RDS Aurora        $50  (primary + 1 replica, t4g.medium)
Lambda            $10  (1M requests @ $0.0000002/ms)
API Gateway       $15  (1M requests @ $1 per 100k)
NAT Gateway       $15  (data processing)
S3 + CloudFront   $10  (storage + data transfer)
─────────────────────
Total            ~$100
```

## Adding New Features

### Add a new entity (e.g., Parts Inventory)

1. **Create Lambda function**:
   ```bash
   touch lambda/functions/parts.ts
   ```

2. **Add database table**:
   ```sql
   CREATE TABLE parts (
     id SERIAL PRIMARY KEY,
     shop_id VARCHAR(255),
     name VARCHAR(255),
     sku VARCHAR(50),
     quantity INTEGER,
     ...
   );
   ```

3. **Add API endpoint** to `mech_pro-aws-stack.ts`:
   ```typescript
   const partsFunction = createLambdaFunction('Parts', 'parts', 'Manage parts');
   const partsResource = api.root.addResource('parts');
   partsResource.addMethod('GET', new apigateway.LambdaIntegration(partsFunction), {...});
   ```

4. **Add React component**:
   ```bash
   touch src/pages/PartsPage.tsx
   ```

5. **Update awsClient.ts** with new methods:
   ```typescript
   async getParts() { return this.request('/parts'); }
   async createPart(data) { return this.request('/parts', { method: 'POST', body: data }); }
   ```

## Troubleshooting

### Lambda Cold Starts
- Increase memory to 1024MB
- Use Lambda provisioned concurrency
- Consider Lambda@Edge for CloudFront

### RDS Slow Queries
- Add indexes on frequently filtered columns (shop_id)
- Use RDS Performance Insights
- Optimize Lambda timeout/memory

### Cognito Token Issues
- Verify custom claims are set on user
- Check token expiration
- Ensure callback URLs match exactly

## Resources

- **AWS CDK Docs**: https://docs.aws.amazon.com/cdk/
- **Lambda Best Practices**: https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html
- **RDS Aurora**: https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/
- **Cognito**: https://docs.aws.amazon.com/cognito/

---

Last Updated: 2026-08-12  
MechPro Version: 1.0.0  
AWS CDK Version: 2.135.0
