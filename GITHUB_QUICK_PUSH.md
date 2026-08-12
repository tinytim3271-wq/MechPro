# Push to GitHub - Quick Script

## Copy and Paste These Commands

Replace `YOUR-USERNAME` and `YOUR-TOKEN` first!

```powershell
# ====================================
# STEP 1: Navigate to project
# ====================================
cd E:\MechPro-AWS

# ====================================
# STEP 2: Add GitHub as remote
# ====================================
git remote add origin https://github.com/YOUR-USERNAME/MechPro.git

# ====================================
# STEP 3: Stage all files
# ====================================
git add .

# ====================================
# STEP 4: Create commit
# ====================================
git commit -m "Initial commit: MechPro infrastructure - AWS CDK, Lambda, API Gateway, Cognito, RDS integration"

# ====================================
# STEP 5: Set main branch
# ====================================
git branch -M main

# ====================================
# STEP 6: Push to GitHub
# ====================================
git push -u origin main

# ====================================
# VERIFY: Check remote
# ====================================
git remote -v
git log
```

---

## 📋 Before Running

1. **Create GitHub repo** at: https://github.com/new
   - Name: `MechPro`
   - Make it Private
   - Do NOT initialize with README/gitignore

2. **Replace these in the script:**
   - `YOUR-USERNAME` → Your GitHub username
   - Example: `https://github.com/john-doe/MechPro.git`

3. **Get personal access token:**
   - Go to: https://github.com/settings/tokens
   - Generate new token (classic)
   - Scope: `repo`
   - Copy the token

---

## 🚀 Run It

```powershell
# Paste the complete command block above into PowerShell
# When asked for password, paste your personal access token
```

---

## ✅ After Push

Go to: `https://github.com/YOUR-USERNAME/MechPro`

You should see all your files!

---

## 📞 What Gets Pushed

```
✓ Infrastructure code (AWS CDK)
✓ Lambda functions
✓ All documentation
✓ Configuration files
✓ GitHub Actions workflow
✓ Package.json
✓ TypeScript config
```

All source code + docs in one place! 🎯
