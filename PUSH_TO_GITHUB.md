# Push to GitHub - Step by Step Guide

## 🚀 Step 1: Create GitHub Repository

### 1.1 Go to GitHub
```
https://github.com/new
```

### 1.2 Fill in the Form

**Repository name:**
```
MechPro
```

**Description:**
```
Multi-tenant automotive management SaaS platform on AWS
```

**Public or Private?**
- Select: **Private** (for your own project)
- OR **Public** (if you want to share)

**Initialize repository?**
- ☐ Do NOT check "Add a README"
- ☐ Do NOT check "Add .gitignore"
- ☐ Do NOT check "Add a license"

Click **"Create repository"** →

---

## 🔑 Step 2: Get Your Repository URL

After creation, you'll see your repository page.

Look for the green **"Code"** button.

Click it and copy the **HTTPS URL**:

```
https://github.com/YOUR-USERNAME/MechPro.git
```

*Replace YOUR-USERNAME with your actual GitHub username*

---

## 💻 Step 3: Add Remote to Your Local Repository

Open PowerShell and run:

```powershell
cd E:\MechPro-AWS

git remote add origin https://github.com/YOUR-USERNAME/MechPro.git
```

Replace `YOUR-USERNAME` with your actual GitHub username.

**Verify it worked:**
```powershell
git remote -v
```

Should show:
```
origin  https://github.com/YOUR-USERNAME/MechPro.git (fetch)
origin  https://github.com/YOUR-USERNAME/MechPro.git (push)
```

---

## 📝 Step 4: Commit Your Code

### 4.1 Add all files
```powershell
git add .
```

### 4.2 Create initial commit
```powershell
git commit -m "Initial commit: MechPro infrastructure and documentation"
```

### 4.3 Verify commit
```powershell
git log
```

Should show your commit.

---

## 🔐 Step 5: Configure Git Credentials

If this is your first push, Git will ask for credentials.

### Option A: Personal Access Token (Recommended)

1. Go to GitHub Settings:
   ```
   https://github.com/settings/tokens
   ```

2. Click **"Generate new token"** → **"Generate new token (classic)"**

3. Fill in:
   - **Note**: `MechPro Deployment`
   - **Expiration**: 90 days
   - **Scopes**: Check `repo` (full control of private repositories)

4. Click **"Generate token"**

5. **Copy the token** (you'll only see it once!)

6. When Git asks for password, paste the token

### Option B: GitHub CLI

```powershell
gh auth login
```

Follow the prompts to authenticate.

---

## 🚀 Step 6: Push to GitHub

### 6.1 Push your code
```powershell
cd E:\MechPro-AWS

git branch -M main

git push -u origin main
```

### 6.2 Enter credentials

If prompted:
- **Username**: Your GitHub username
- **Password**: Your personal access token (from Step 5)

### 6.3 Wait for upload

Should see:
```
Enumerating objects: X, done.
Counting objects: 100% (X/X), done.
...
To https://github.com/YOUR-USERNAME/MechPro.git
 * [new branch]      main -> main
Branch 'main' is set up to track remote branch 'main' from 'origin'.
```

---

## ✅ Verify on GitHub

1. Go to your repository:
   ```
   https://github.com/YOUR-USERNAME/MechPro
   ```

2. You should see all your files:
   - bin/
   - lib/
   - lambda/
   - All .md documentation files
   - package.json
   - tsconfig.json
   - etc.

---

## 📋 Complete Commands Summary

```powershell
# Step 1: Navigate to project
cd E:\MechPro-AWS

# Step 2: Add remote
git remote add origin https://github.com/YOUR-USERNAME/MechPro.git

# Step 3: Add all files
git add .

# Step 4: Commit
git commit -m "Initial commit: MechPro infrastructure and documentation"

# Step 5: Set main branch
git branch -M main

# Step 6: Push
git push -u origin main
```

---

## 🔄 Future Pushes

After the initial push, future updates are simpler:

```powershell
# Make your changes
# ...

# Stage changes
git add .

# Commit
git commit -m "Your message here"

# Push
git push
```

---

## 🐛 Troubleshooting

### "fatal: not a git repository"
```powershell
cd E:\MechPro-AWS
git init
```

### "error: permission denied"
→ Check your personal access token
→ Regenerate if expired

### "error: src refspec main does not match any"
```powershell
git branch -M main
git push -u origin main
```

### "failed to push some refs"
```powershell
git pull origin main
git push origin main
```

---

## 🎯 Next Steps

After pushing to GitHub:

1. ✅ Code is backed up
2. ✅ Share with team members
3. ✅ Set up CI/CD (GitHub Actions already configured)
4. ✅ Enable branch protection
5. ✅ Collaborate via pull requests

---

## 📞 Files in Your Repository

Your GitHub repo will contain:

```
MechPro/
├── bin/
│   └── mech_pro-aws.ts
├── lib/
│   ├── mech_pro-aws-stack.ts
│   ├── minimal-stack.ts
│   └── monitoring-stack.ts
├── lambda/
│   └── functions/
│       ├── customers.ts
│       ├── bookings.ts
│       ├── invoices.ts
│       ├── inspections.ts
│       ├── employees.ts
│       ├── auth.ts
│       └── db.ts
├── .github/
│   └── workflows/
│       └── deploy.yml
├── package.json
├── tsconfig.json
├── README.md
├── QUICKSTART.md
└── [all documentation files]
```

---

## 🚀 Ready?

Replace `YOUR-USERNAME` with your actual GitHub username and run:

```powershell
cd E:\MechPro-AWS

git remote add origin https://github.com/YOUR-USERNAME/MechPro.git

git add .

git commit -m "Initial commit: MechPro infrastructure and documentation"

git branch -M main

git push -u origin main
```

---

**Let me know your GitHub username and I can verify the push worked!**
