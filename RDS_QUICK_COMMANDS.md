# Quick RDS Commands

## Your RDS Instance

```
Host: database-1.cluster-crycioqkyke3.us-east-2.rds.amazonaws.com
Port: 5432
Region: us-east-2
Cluster: Aurora PostgreSQL
```

---

## Quick Start

### 1. Test Connection (No Password Required)
```powershell
# PowerShell - Run connectivity tests
.\connect-rds.ps1 -Method test
```

### 2. Connect with Password
```powershell
# PowerShell - Interactive password prompt
.\connect-rds.ps1 -Method password

# Or with password as argument
.\connect-rds.ps1 -Method password -DBPassword "YourPassword123!"
```

### 3. Connect with IAM Token (More Secure)
```powershell
# Requires AWS CLI configured
.\connect-rds.ps1 -Method iam
```

---

## Direct psql Commands

### Password Authentication
```bash
# Windows PowerShell
$env:PGPASSWORD = "your_password"
psql -h database-1.cluster-crycioqkyke3.us-east-2.rds.amazonaws.com `
  -U postgres `
  -d postgres `
  -p 5432 `
  -c "SELECT version();"
```

### IAM Token Authentication
```bash
# 1. Generate token
$TOKEN = aws rds generate-db-auth-token `
  --hostname database-1.cluster-crycioqkyke3.us-east-2.rds.amazonaws.com `
  --port 5432 `
  --username postgres `
  --region us-east-2

# 2. Download certificate
curl https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem `
  -o rds-ca-bundle.pem

# 3. Connect
$env:PGPASSWORD = $TOKEN
psql -h database-1.cluster-crycioqkyke3.us-east-2.rds.amazonaws.com `
  -U postgres `
  -d postgres `
  -p 5432 `
  --sslmode=require `
  --sslrootcert=rds-ca-bundle.pem `
  -c "SELECT 1;"
```

---

## Common Tasks

### Check RDS Status
```bash
aws rds describe-db-clusters `
  --db-cluster-identifier database-1 `
  --region us-east-2 `
  --query 'DBClusters[0].[Status,Engine,EngineVersion]'
```

### Modify Master Password
```bash
aws rds modify-db-cluster `
  --db-cluster-identifier database-1 `
  --master-user-password "NewPassword123!" `
  --apply-immediately `
  --region us-east-2
```

### Get Database Endpoint
```bash
aws rds describe-db-clusters `
  --db-cluster-identifier database-1 `
  --region us-east-2 `
  --query 'DBClusters[0].[Endpoint,ReaderEndpoint]'
```

### Check Security Group
```bash
aws rds describe-db-clusters `
  --db-cluster-identifier database-1 `
  --region us-east-2 `
  --query 'DBClusters[0].VpcSecurityGroups'

# Get security group ID and update it
$SG_ID = "sg-xxxxx"
aws ec2 authorize-security-group-ingress `
  --group-id $SG_ID `
  --protocol tcp `
  --port 5432 `
  --cidr YOUR_IP_ADDRESS/32 `
  --region us-east-2
```

### View Recent Logs
```bash
aws rds describe-db-log-files `
  --db-instance-identifier database-1 `
  --region us-east-2
```

---

## Initialize Database Schema

Once connected, run this SQL:

```sql
-- Create mechpro database
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
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(shop_id, email)
);

CREATE TABLE bookings (
  id SERIAL PRIMARY KEY,
  shop_id VARCHAR(255) NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  booking_date TIMESTAMP,
  service_type VARCHAR(255),
  status VARCHAR(50) DEFAULT 'scheduled',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE invoices (
  id SERIAL PRIMARY KEY,
  shop_id VARCHAR(255) NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  total_amount NUMERIC(12, 2),
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
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

CREATE TABLE employees (
  id SERIAL PRIMARY KEY,
  shop_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  role VARCHAR(50),
  salary NUMERIC(10, 2),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(shop_id, email)
);

-- Indexes
CREATE INDEX idx_customers_shop ON customers(shop_id);
CREATE INDEX idx_bookings_shop ON bookings(shop_id);
CREATE INDEX idx_invoices_shop ON invoices(shop_id);
CREATE INDEX idx_inspections_shop ON inspections(shop_id);
CREATE INDEX idx_employees_shop ON employees(shop_id);

-- Insert test data
INSERT INTO customers (shop_id, name, email, phone) VALUES
  ('shop_001', 'John Doe', 'john@example.com', '555-1234'),
  ('shop_001', 'Jane Smith', 'jane@example.com', '555-5678');

-- Verify
SELECT COUNT(*) as customer_count FROM customers;
```

---

## Troubleshooting

### "Connection refused"
```
→ RDS endpoint is wrong
→ Port 5432 is blocked by firewall
→ Security group doesn't have your IP
```

**Fix:**
```bash
# Add your IP to security group
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxx \
  --protocol tcp \
  --port 5432 \
  --cidr YOUR_IP/32 \
  --region us-east-2
```

### "Password authentication failed"
```
→ Wrong password
→ User doesn't exist
→ Database not created
```

**Fix:**
```bash
# Reset password
aws rds modify-db-cluster \
  --db-cluster-identifier database-1 \
  --master-user-password "NewPassword!" \
  --apply-immediately \
  --region us-east-2
```

### "SSL error: CERTIFICATE_VERIFY_FAILED"
```
→ Certificate not downloaded or path wrong
```

**Fix:**
```bash
# Download certificate
curl https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
  -o rds-ca-bundle.pem

# Use correct path in psql
psql ... --sslrootcert=rds-ca-bundle.pem
```

### "psql: command not found"
```
→ PostgreSQL client not installed
```

**Fix:**
```
Download from: https://www.postgresql.org/download/
Choose your OS and install
```

---

## Next Steps

1. ✅ Run: `.\connect-rds.ps1 -Method test`
2. ✅ Fix any issues from troubleshooting
3. ✅ Connect: `.\connect-rds.ps1 -Method password`
4. ✅ Initialize schema (SQL above)
5. ✅ Verify tables created
6. ✅ Update CDK region to us-east-2
7. ✅ Deploy Lambda functions
8. ✅ Test API endpoints

---

## AWS CLI Installation

```powershell
# Install AWS CLI
msiexec.exe /i https://awscli.amazonaws.com/AWSCLIV2.msi

# Configure
aws configure

# Verify
aws sts get-caller-identity
```

## PostgreSQL Client Installation

**Windows:**
- Download: https://www.postgresql.org/download/windows/
- Run installer
- Choose "PostgreSQL Server" or just "pgAdmin"
- Add to PATH if needed

**Verify psql installed:**
```powershell
psql --version
```

---

**Questions?** Check:
- RDS_CONNECTION.md (detailed guide)
- connect-rds.ps1 (automated script)
- DEPLOYMENT.md (Lambda setup)
