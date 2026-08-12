# RDS Connection Helper for MechPro
# Save as: connect-rds.ps1

param(
    [string]$Method = "password",  # password, iam, or test
    [string]$DBPassword = ""
)

$RDSHOST = "database-1.cluster-crycioqkyke3.us-east-2.rds.amazonaws.com"
$DBUSER = "postgres"
$DBNAME = "postgres"
$PORT = 5432
$REGION = "us-east-2"

Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   MechPro RDS Connection Helper        ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "Configuration:" -ForegroundColor Green
Write-Host "  Host:     $RDSHOST"
Write-Host "  Port:     $PORT"
Write-Host "  User:     $DBUSER"
Write-Host "  Database: $DBNAME"
Write-Host "  Region:   $REGION"
Write-Host ""

# Method 1: Connect with password
if ($Method -eq "password") {
    Write-Host "Method: Direct Password Authentication" -ForegroundColor Yellow
    
    if (-not $DBPassword) {
        $DBPassword = Read-Host "Enter database password" -AsSecureString
        $DBPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($DBPassword))
    }
    
    Write-Host "Attempting connection..." -ForegroundColor Gray
    
    # Build connection string
    $ConnString = "host=$RDSHOST port=$PORT dbname=$DBNAME user=$DBUSER password=$DBPassword sslmode=require"
    
    # Try psql
    $psqlPath = "psql"
    try {
        $env:PGPASSWORD = $DBPassword
        & psql -h $RDSHOST -p $PORT -U $DBUSER -d $DBNAME -c "SELECT 'Connection successful!' as status;"
        Write-Host "✅ Connection established!" -ForegroundColor Green
    }
    catch {
        Write-Host "❌ Connection failed: $_" -ForegroundColor Red
        Write-Host ""
        Write-Host "Troubleshooting:" -ForegroundColor Yellow
        Write-Host "1. Is psql installed? (https://www.postgresql.org/download/)"
        Write-Host "2. Is the password correct?"
        Write-Host "3. Does your IP have access? (Check security group)"
        Write-Host "4. Is RDS endpoint correct?"
    }
    finally {
        Remove-Item env:PGPASSWORD -ErrorAction SilentlyContinue
    }
}

# Method 2: IAM Authentication Token
elseif ($Method -eq "iam") {
    Write-Host "Method: IAM Authentication Token" -ForegroundColor Yellow
    Write-Host "This requires AWS CLI and will generate a temporary token." -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "Step 1: Download RDS CA certificate..." -ForegroundColor Gray
    try {
        Invoke-WebRequest -Uri "https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem" `
            -OutFile "$PSScriptRoot\rds-ca-bundle.pem" | Out-Null
        Write-Host "✅ Certificate downloaded" -ForegroundColor Green
    }
    catch {
        Write-Host "⚠️  Could not download certificate: $_" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "Step 2: Generate IAM authentication token..." -ForegroundColor Gray
    try {
        $TOKEN = & aws rds generate-db-auth-token `
            --hostname $RDSHOST `
            --port $PORT `
            --username $DBUSER `
            --region $REGION 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Token generated (valid for 15 minutes)" -ForegroundColor Green
            Write-Host "   Token: $($TOKEN.Substring(0, 50))..." -ForegroundColor Gray
        }
        else {
            throw "AWS CLI failed: $TOKEN"
        }
    }
    catch {
        Write-Host "❌ Token generation failed: $_" -ForegroundColor Red
        Write-Host ""
        Write-Host "Troubleshooting:" -ForegroundColor Yellow
        Write-Host "1. Is AWS CLI installed and configured?"
        Write-Host "2. Run: aws configure"
        Write-Host "3. Verify credentials: aws sts get-caller-identity"
        return
    }
    
    Write-Host ""
    Write-Host "Step 3: Connect using token..." -ForegroundColor Gray
    try {
        $env:PGPASSWORD = $TOKEN
        & psql -h $RDSHOST `
            -p $PORT `
            -U $DBUSER `
            -d $DBNAME `
            --sslmode=require `
            --sslrootcert="$PSScriptRoot\rds-ca-bundle.pem" `
            -c "SELECT 'IAM Authentication successful!' as status;"
        Write-Host "✅ IAM authentication successful!" -ForegroundColor Green
    }
    catch {
        Write-Host "❌ Connection failed: $_" -ForegroundColor Red
    }
    finally {
        Remove-Item env:PGPASSWORD -ErrorAction SilentlyContinue
    }
}

# Method 3: Test connectivity
elseif ($Method -eq "test") {
    Write-Host "Running connectivity tests..." -ForegroundColor Yellow
    Write-Host ""
    
    # Test 1: DNS
    Write-Host "Test 1: DNS Resolution" -ForegroundColor Gray
    try {
        $ip = [System.Net.Dns]::GetHostAddresses($RDSHOST) | Select-Object -First 1
        Write-Host "✅ Resolved to: $ip" -ForegroundColor Green
    }
    catch {
        Write-Host "❌ DNS resolution failed: $_" -ForegroundColor Red
    }
    
    # Test 2: Port connectivity
    Write-Host ""
    Write-Host "Test 2: Port Connectivity (TCP 5432)" -ForegroundColor Gray
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tcp.ConnectAsync($RDSHOST, $PORT).Wait(5000) | Out-Null
        if ($tcp.Connected) {
            Write-Host "✅ Port 5432 is open" -ForegroundColor Green
            $tcp.Close()
        }
        else {
            Write-Host "❌ Could not connect to port 5432" -ForegroundColor Red
        }
    }
    catch {
        Write-Host "❌ Port test failed: $_" -ForegroundColor Red
    }
    
    # Test 3: AWS CLI
    Write-Host ""
    Write-Host "Test 3: AWS CLI Configuration" -ForegroundColor Gray
    try {
        $identity = & aws sts get-caller-identity 2>&1 | ConvertFrom-Json
        Write-Host "✅ AWS CLI configured" -ForegroundColor Green
        Write-Host "   Account: $($identity.Account)" -ForegroundColor Gray
        Write-Host "   User: $($identity.Arn)" -ForegroundColor Gray
    }
    catch {
        Write-Host "⚠️  AWS CLI not available or not configured" -ForegroundColor Yellow
        Write-Host "   Run: aws configure" -ForegroundColor Gray
    }
    
    # Test 4: psql
    Write-Host ""
    Write-Host "Test 4: PostgreSQL Client" -ForegroundColor Gray
    try {
        $version = & psql --version 2>&1
        Write-Host "✅ psql installed" -ForegroundColor Green
        Write-Host "   $version" -ForegroundColor Gray
    }
    catch {
        Write-Host "❌ psql not found" -ForegroundColor Red
        Write-Host "   Install from: https://www.postgresql.org/download/" -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "Summary:" -ForegroundColor Cyan
    Write-Host "  If all tests pass, try: .\connect-rds.ps1 -Method password" -ForegroundColor Gray
}

# Default help
else {
    Write-Host "Usage:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  .\connect-rds.ps1 -Method password          # Connect with password" -ForegroundColor Gray
    Write-Host "  .\connect-rds.ps1 -Method iam               # Connect with IAM token" -ForegroundColor Gray
    Write-Host "  .\connect-rds.ps1 -Method test              # Run connectivity tests" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  # Prompt for password interactively" -ForegroundColor Gray
    Write-Host "  .\connect-rds.ps1 -Method password" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  # Provide password as argument" -ForegroundColor Gray
    Write-Host "  .\connect-rds.ps1 -Method password -DBPassword 'MyPassword123!'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  # Use IAM authentication (requires AWS CLI)" -ForegroundColor Gray
    Write-Host "  .\connect-rds.ps1 -Method iam" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  # Test connectivity before connecting" -ForegroundColor Gray
    Write-Host "  .\connect-rds.ps1 -Method test" -ForegroundColor Gray
    Write-Host ""
}
