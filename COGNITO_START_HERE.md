# 🔐 Cognito User Pool Manual Setup - Start Here

## 📄 Documentation Created

I've created two guides for you:

1. **COGNITO_QUICK_SETUP.md** — Quick reference (values to enter)
2. **SETUP_COGNITO_MANUAL.md** — Detailed step-by-step guide

---

## 🚀 Quick Start (5 minutes)

### Step 1: Open Cognito Console
```
https://console.aws.amazon.com/cognito/
```

### Step 2: Create User Pool
Click **"Create user pool"** button

### Step 3: Enter These Values

**User Pool Name:**
```
MechPro-UserPool
```

**Sign-in options:**
- ☑ Email
- ☑ Username

**Password Policy:**
- Min length: 12
- ☑ Uppercase
- ☑ Lowercase
- ☑ Numbers
- ☑ Special characters

**MFA:** No MFA (for now)

**Recovery:** Email only

**Self-registration:** Enabled

### Step 4: Click "Create user pool"

Wait 1-2 minutes for creation...

---

## 📱 After Pool is Created

### Create App Client

1. Go to **App integration** → **App clients**
2. Click **"Create app client"**

**App client name:**
```
MechPro-WebApp
```

**Client type:** Public client

**Auth flows:**
- ☑ ALLOW_USER_PASSWORD_AUTH
- ☑ ALLOW_REFRESH_TOKEN_AUTH
- ☑ ALLOW_CUSTOM_AUTH

**Token expiration:**
- Access: 60 minutes
- ID: 60 minutes
- Refresh: 30 days

### Configure Callback URLs

1. Click on the app client name
2. Go to **Hosted UI**

**Callback URLs:**
```
http://localhost:3000/callback
https://yourdomain.com/callback
```

**Sign out URLs:**
```
http://localhost:3000
https://yourdomain.com
```

**OAuth Scopes:**
- ☑ email
- ☑ openid
- ☑ profile

---

## 💾 Save These Values

After creation, find and save:

### User Pool ID
**Where**: User pool overview page  
**Look for**: "User pool ID"  
**Looks like**: `us-east-2_XXXXXXXXX`

### App Client ID
**Where**: App integration → App clients  
**Look for**: "Client ID"  
**Looks like**: `1234567890abcdefghijklmnop`

### Domain Name
**Where**: App integration → Domain  
**Look for**: "Domain name"  
**Looks like**: `mechpro-randomstring`

---

## ✅ Test It Works

1. Visit: `https://mechpro-randomstring.auth.us-east-2.amazoncognito.com/login`
2. Click "Sign up"
3. Enter email: `test@example.com`
4. Password: `TestPassword123!`
5. Verify email (check inbox)
6. Try login

---

## 📋 Checklist

- [ ] Opened Cognito console
- [ ] Created user pool: MechPro-UserPool
- [ ] Set password policy (12 chars, uppercase, lowercase, numbers, special)
- [ ] Enabled self-registration
- [ ] Created app client: MechPro-WebApp
- [ ] Set callback URLs
- [ ] Set OAuth scopes
- [ ] Saved User Pool ID
- [ ] Saved App Client ID
- [ ] Saved Domain name
- [ ] Tested login page
- [ ] Created test user

---

## 📞 Next Steps

Once you've completed Cognito setup, reply with:

```
User Pool ID: us-east-2_XXXXXXXXX
App Client ID: 1234567890abcdefghijklmnop
Domain: mechpro-randomstring
```

Then we'll move to:
1. Create Lambda Functions manually
2. Create API Gateway manually
3. Deploy Frontend
4. Connect RDS

---

## 🔗 Useful Links

- **Cognito Console**: https://console.aws.amazon.com/cognito/
- **Full Setup Guide**: `SETUP_COGNITO_MANUAL.md`
- **Quick Reference**: `COGNITO_QUICK_SETUP.md`

---

**Ready?** Go to: https://console.aws.amazon.com/cognito/

Create the user pool and come back with your credentials! 🚀
