# AWS CLI Installation Guide

## Problem: `aws: command not found`

This means AWS CLI (Command Line Interface) is not installed on your computer.

---

## Solution: Install AWS CLI v2

### Option 1: Download MSI Installer (Easiest for Windows)

#### Step 1: Download
Open this link in your browser:
```
https://awscli.amazonaws.com/AWSCLIV2.msi
```

This downloads the AWS CLI installer (~50 MB).

#### Step 2: Run Installer
1. Find the downloaded file: `AWSCLIV2.msi`
2. Double-click it
3. Click "Next" → "Install" → "Finish"
4. **Close and reopen PowerShell** (important!)

#### Step 3: Verify Installation
Open a **new PowerShell window** and run:
```powershell
aws --version
```

Should show:
```
aws-cli/2.x.x Python/3.x.x Windows/10.0.x
```

If you see this, AWS CLI is installed! ✅

---

### Option 2: Install via Package Manager

#### Using Chocolatey (if installed)
```powershell
choco install awscli
```

#### Using Windows Package Manager
```powershell
winget install Amazon.AWSCLI
```

---

### Option 3: Manual Installation (Advanced)

1. Download Python: https://www.python.org/downloads/
2. Install Python (check "Add to PATH")
3. Open PowerShell:
   ```powershell
   pip install awscliv2
   ```

---

## After Installation: Configure Credentials

Once AWS CLI is installed, run:

```powershell
aws configure
```

You'll be prompted:

```
AWS Access Key ID [None]: AKIA...
AWS Secret Access Key [None]: bVjz...
Default region name [None]: us-east-2
Default output format [None]: json
```

**Important**: Use your NEW credentials (not the old ones you shared)

---

## Verify Configuration

```powershell
aws sts get-caller-identity
```

Should return:
```json
{
    "UserId": "AIDAI...",
    "Account": "001018341557",
    "Arn": "arn:aws:iam::001018341557:user/username"
}
```

If you see this, you're ready to deploy! ✅

---

## Troubleshooting

### "Python not found"
- AWS CLI v2 includes Python, no separate install needed
- Just use the MSI installer (Option 1)

### "Access Denied" when running aws command
- Close PowerShell completely
- Open a NEW PowerShell window
- Try again

### "Still not recognized"
```powershell
# Check if installed
Get-Command aws

# If not found, reinstall and restart Windows
```

### "aws configure not working"
```powershell
# Check location
aws --version

# If version shows, then configure:
aws configure
```

---

## Next Steps After Installation

1. **Install AWS CLI** (use MSI - easiest)
2. **Close and reopen PowerShell**
3. **Run**: `aws configure`
4. **Enter your NEW access key** (create new one first!)
5. **Verify**: `aws sts get-caller-identity`
6. **Deploy**: `npx cdk deploy --all --require-approval=never`

---

## Quick Download Link

**Windows MSI Installer:**
https://awscli.amazonaws.com/AWSCLIV2.msi

Just download, double-click, follow prompts, restart PowerShell.

That's it! ✅
