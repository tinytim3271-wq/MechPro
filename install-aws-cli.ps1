# Install AWS CLI v2 - Automated Script
# Save as: install-aws-cli.ps1
# Run: .\install-aws-cli.ps1

Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   AWS CLI v2 Installation Script       ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check if already installed
Write-Host "Checking if AWS CLI is already installed..." -ForegroundColor Yellow
try {
    $version = & aws --version 2>&1
    Write-Host "✅ AWS CLI already installed:" -ForegroundColor Green
    Write-Host "   $version" -ForegroundColor Gray
    Write-Host ""
    Write-Host "No installation needed. Skipping..." -ForegroundColor Yellow
    exit 0
}
catch {
    Write-Host "❌ AWS CLI not found - installing now..." -ForegroundColor Yellow
}

Write-Host ""

# Check Windows architecture
Write-Host "Detecting system architecture..." -ForegroundColor Gray
$arch = [Environment]::Is64BitOperatingSystem
if ($arch) {
    $url = "https://awscli.amazonaws.com/AWSCLIV2.msi"
    Write-Host "✅ 64-bit Windows detected" -ForegroundColor Green
} else {
    $url = "https://awscli.amazonaws.com/AWSCLIV2-32.msi"
    Write-Host "✅ 32-bit Windows detected" -ForegroundColor Green
}

Write-Host ""

# Create temp directory
$tempDir = "$env:TEMP\aws-cli-install"
if (-not (Test-Path $tempDir)) {
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
}

$installerPath = "$tempDir\AWSCLIV2.msi"

# Download installer
Write-Host "Downloading AWS CLI v2..." -ForegroundColor Yellow
Write-Host "URL: $url" -ForegroundColor Gray
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $url -OutFile $installerPath -UseBasicParsing
    Write-Host "✅ Download complete" -ForegroundColor Green
    Write-Host "   Size: $((Get-Item $installerPath).Length / 1MB -as [int]) MB" -ForegroundColor Gray
}
catch {
    Write-Host "❌ Download failed: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Manual installation:" -ForegroundColor Yellow
    Write-Host "1. Download: $url" -ForegroundColor Gray
    Write-Host "2. Double-click the MSI file" -ForegroundColor Gray
    Write-Host "3. Follow the prompts" -ForegroundColor Gray
    exit 1
}

Write-Host ""

# Run installer
Write-Host "Running installer..." -ForegroundColor Yellow
try {
    Start-Process msiexec.exe -ArgumentList "/i `"$installerPath`" /quiet /norestart" -NoNewWindow -Wait
    Write-Host "✅ Installation started" -ForegroundColor Green
}
catch {
    Write-Host "❌ Installer failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Wait for installer to complete
Write-Host "Waiting for installation to complete..." -ForegroundColor Gray
Start-Sleep -Seconds 3

# Clean up
Write-Host "Cleaning up temporary files..." -ForegroundColor Gray
Remove-Item -Path $installerPath -Force -ErrorAction SilentlyContinue

Write-Host ""

# Verify installation
Write-Host "Verifying installation..." -ForegroundColor Yellow
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

Start-Sleep -Seconds 2

try {
    $version = & aws --version 2>&1
    Write-Host "✅ Installation successful!" -ForegroundColor Green
    Write-Host "   Version: $version" -ForegroundColor Gray
}
catch {
    Write-Host "⚠️  AWS CLI may need PowerShell restart" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please:" -ForegroundColor Yellow
    Write-Host "1. Close this PowerShell window" -ForegroundColor Gray
    Write-Host "2. Open a NEW PowerShell window" -ForegroundColor Gray
    Write-Host "3. Run: aws --version" -ForegroundColor Gray
    exit 0
}

Write-Host ""
Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║   ✅ AWS CLI Installation Complete     ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Green

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Run: aws configure" -ForegroundColor Gray
Write-Host "2. Enter your AWS credentials" -ForegroundColor Gray
Write-Host "3. Set region: us-east-2" -ForegroundColor Gray
Write-Host "4. Deploy: npx cdk deploy --all --require-approval=never" -ForegroundColor Gray
Write-Host ""
