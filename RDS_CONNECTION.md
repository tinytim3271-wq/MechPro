# MechPro RDS Database Connection Guide

## Your Database Details

```
Host: database-1.cluster-crycioqkyke3.us-east-2.rds.amazonaws.com
Port: 5432
Database: postgres (initially)
Username: postgres
Region: us-east-2
Engine: Aurora PostgreSQL
```

**⚠️ Note**: Your RDS is in `us-east-2` but CDK was configured for `us-east-1`. Update CDK before deployment.

## Option 1: Connect Using psql (Direct Password)

### Prerequisites
- psql installed: https://www.postgresql.org/download/
- AWS credentials configured
- Security group allows your IP on port 5432

### Steps

```bash
# 1. Set variables
$RDSHOST = "database-1.cluster-crycioqkyke3.us-east-2.rds.amazonaws.com"
$DBUSER = "postgres"
$DBPASS = "your-master-password"  # Set during RDS creation
$REGION = "us-east-2"

# 2. Connect with psql
psql -h $RDSHOST -U $DBUSER -d postgres -p 5432

# When prompted, enter password
```

## Option 2: Connect Using IAM Authentication (Recommended for Lambda)

### Prerequisites
- AWS CLI installed and configured
- PostgreSQL client library with SSL support
- RDS CA certificate

### Steps

```bash
# 1. Download RDS CA certificate
curl https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -o rds-ca-bundle.pem

# 2. Generate temporary auth token
$RDSHOST = "database-1.cluster-crycioqkyke3.us-east-2.rds.amazonaws.com"
$TOKEN = aws rds generate-db-auth-token `
  --hostname $RDSHOST `
  --port 5432 `
  --username postgres `
  --region us-east-2

# 3. Connect using token
psql -h $RDSHOST `
  -U postgres `
  -d postgres `
  -p 5432 `
  --sslmode=require `
  --sslrootcert=rds-ca-bundle.pem `
  -c "SELECT 1" `
  <<< $TOKEN
```

## Option 3: Using AWS RDS Proxy (For Applications)

### Benefits
- Connection pooling
- Automatic credential rotation
- Better security
- Built-in monitoring

### Configuration
```
Create RDS Proxy in AWS Console:
- Name: mechpro-proxy
- Database: database-1
- Auth: Credentials from Secrets Manager
- Endpoint: mechpro-proxy.proxy-crycioqkyke3.us-east-2.rds.amazonaws.com:3306
```

## Option 4: Connect via AWS Systems Manager Session Manager

### Steps

```bash
# 1. Create Bastion host in your VPC
# 2. Use Session Manager to SSH
aws ssm start-session --target i-1234567890abcdef0 --region us-east-2

# 3. Connect from bastion
psql -h database-1.cluster-crycioqkyke3.us-east-2.rds.amazonaws.com \
  -U postgres \
  -d postgres
```

## Option 5: Lambda Connection (What Your App Uses)

### Node.js Code Example

```typescript
import { Client } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

async function connectToRDS() {
  // Get credentials from Secrets Manager
  const secretsClient = new SecretsManagerClient({ region: 'us-east-2' });
  const secret = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: 'rds!cluster-XXXXX' })
  );
  
  const creds = JSON.parse(secret.SecretString!);
  
  // Connect
  const client = new Client({
    host: 'database-1.cluster-crycioqkyke3.us-east-2.rds.amazonaws.com',
    port: 5432,
    database: 'postgres',
    user: creds.username,
    password: creds.password,
    ssl: true,
  });
  
  await client.connect();
  const result = await client.query('SELECT 1');
  console.log(result);
  await client.end();
}

connectToRDS();
```

## Troubleshooting

### Error: "could not connect to server: Connection timed out"

**Causes**:
1. Security group doesn't allow your IP
2. RDS endpoint is wrong
3. Network ACLs blocking traffic

**Fix**:
```bash
# 1. Check RDS endpoint
aws rds describe-db-clusters --region us-east-2

# 2. Add your IP to security group
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxx \
  --protocol tcp \
  --port 5432 \
  --cidr your.ip.address/32 \
  --region us-east-2
```

### Error: "FATAL: password authentication failed"

**Causes**:
1. Wrong username/password
2. Database doesn't exist
3. User permissions issue

**Fix**:
```bash
# Reset master password
aws rds modify-db-cluster \
  --db-cluster-identifier database-1 \
  --master-user-password NewPassword123! \
  --apply-immediately \
  --region us-east-2
```

### Error: "SSL connection error"

**Fix**:
```bash
# Download certificate
curl https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
  -o rds-ca-bundle.pem

# Use with psql
psql -h $RDSHOST \
  -U postgres \
  --sslmode=require \
  --sslrootcert=rds-ca-bundle.pem
```

## Initialize Database Schema

Once connected, create your MechPro tables:

```sql
-- Create database
CREATE DATABASE mechpro;

-- Connect to it
\c mechpro

-- Create tables
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  shop_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  address TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(shop_id, email)
);

CREATE TABLE employees (
  id SERIAL PRIMARY KEY,
  shop_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  role VARCHAR(50),
  salary NUMERIC(10, 2),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(shop_id, email)
);

CREATE TABLE bookings (
  id SERIAL PRIMARY KEY,
  shop_id VARCHAR(255) NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  employee_id INTEGER REFERENCES employees(id),
  booking_date TIMESTAMP NOT NULL,
  service_type VARCHAR(255),
  notes TEXT,
  status VARCHAR(50) DEFAULT 'scheduled',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE invoices (
  id SERIAL PRIMARY KEY,
  shop_id VARCHAR(255) NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  booking_id INTEGER REFERENCES bookings(id),
  total_amount NUMERIC(12, 2),
  status VARCHAR(50) DEFAULT 'pending',
  stripe_payment_intent_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE invoice_items (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
  description VARCHAR(255),
  quantity NUMERIC(10, 2),
  unit_price NUMERIC(12, 2)
);

CREATE TABLE inspections (
  id SERIAL PRIMARY KEY,
  shop_id VARCHAR(255) NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  vehicle_vin VARCHAR(17),
  findings TEXT,
  ai_analysis TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_customers_shop_id ON customers(shop_id);
CREATE INDEX idx_employees_shop_id ON employees(shop_id);
CREATE INDEX idx_bookings_shop_id ON bookings(shop_id);
CREATE INDEX idx_invoices_shop_id ON invoices(shop_id);
CREATE INDEX idx_inspections_shop_id ON inspections(shop_id);

-- Create test data
INSERT INTO customers (shop_id, name, email, phone, address) VALUES
  ('shop_001', 'John Doe', 'john@example.com', '555-1234', '123 Main St'),
  ('shop_001', 'Jane Smith', 'jane@example.com', '555-5678', '456 Oak Ave');

INSERT INTO employees (shop_id, name, email, role, salary) VALUES
  ('shop_001', 'Bob Mechanic', 'bob@example.com', 'Technician', 50000),
  ('shop_001', 'Alice Manager', 'alice@example.com', 'Manager', 60000);

-- Verify
SELECT * FROM customers;
SELECT * FROM employees;
```

## Quick Connection Test Script

Save as `test-rds-connection.sh`:

```bash
#!/bin/bash

RDSHOST="database-1.cluster-crycioqkyke3.us-east-2.rds.amazonaws.com"
DBUSER="postgres"
DBNAME="postgres"
REGION="us-east-2"

echo "Testing RDS connection..."
echo "Host: $RDSHOST"
echo "Region: $REGION"

# Test 1: DNS resolution
echo ""
echo "Test 1: DNS Resolution"
nslookup $RDSHOST || dig $RDSHOST

# Test 2: Port connectivity
echo ""
echo "Test 2: Port Connectivity"
timeout 5 bash -c "</dev/tcp/$RDSHOST/5432" && echo "✅ Port 5432 open" || echo "❌ Port 5432 blocked"

# Test 3: IAM token generation
echo ""
echo "Test 3: IAM Token Generation"
TOKEN=$(aws rds generate-db-auth-token \
  --hostname $RDSHOST \
  --port 5432 \
  --username $DBUSER \
  --region $REGION)
echo "✅ Token generated: ${TOKEN:0:50}..."

# Test 4: psql connection
echo ""
echo "Test 4: PostgreSQL Connection"
curl https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -o rds-ca-bundle.pem 2>/dev/null
psql -h $RDSHOST \
  -U $DBUSER \
  -d $DBNAME \
  -p 5432 \
  --sslmode=require \
  --sslrootcert=rds-ca-bundle.pem \
  -c "SELECT version();" || echo "❌ Connection failed"

echo ""
echo "All tests complete!"
```

Run it:
```bash
chmod +x test-rds-connection.sh
./test-rds-connection.sh
```

## Environment Variables for CDK

Update `E:\MechPro-AWS\lib\mech_pro-aws-stack.ts`:

```typescript
// Change from us-east-1 to us-east-2
const environment = {
  account: '001018341557',
  region: 'us-east-2',
};

new MechProAwsStack(app, 'MechProAwsStack', { env: environment });
```

Then redeploy:
```bash
cd E:\MechPro-AWS
npx cdk deploy --require-approval=never
```

## Next Steps

1. ✅ Download psql client
2. ✅ Test connection using Option 1 or 2
3. ✅ Initialize database schema (SQL above)
4. ✅ Update CDK region to us-east-2
5. ✅ Redeploy Lambda functions
6. ✅ Test API endpoints

---

**Need help?** Check CloudWatch logs:
```bash
aws logs tail /aws/lambda/MechPro-Customers --follow --region us-east-2
```
