# COGNITO SETUP - QUICK REFERENCE

## 🚀 Quick Steps

1. **Open**: https://console.aws.amazon.com/cognito/
2. **Click**: "Create user pool"
3. **Fill in values** (see steps below)
4. **Save your credentials**

---

## 📋 Values to Enter

### User Pool Settings

| Field | Value |
|-------|-------|
| **User Pool Name** | MechPro-UserPool |
| **Sign-in options** | Email, Username |
| **MFA** | No MFA (for now) |
| **Password Min Length** | 12 |
| **Require Uppercase** | Yes |
| **Require Lowercase** | Yes |
| **Require Numbers** | Yes |
| **Require Special Chars** | Yes |
| **Recovery** | Email only |
| **Self-registration** | Enabled |
| **Email verification** | Automatic |

### App Client Settings

| Field | Value |
|-------|-------|
| **App Client Name** | MechPro-WebApp |
| **Client Type** | Public client |
| **Auth Flows** | User Password, Refresh Token, Custom |
| **Access Token Duration** | 60 minutes |
| **ID Token Duration** | 60 minutes |
| **Refresh Token Duration** | 30 days |
| **Callback URLs** | http://localhost:3000/callback, https://yourdomain.com/callback |
| **Sign Out URLs** | http://localhost:3000, https://yourdomain.com |
| **OAuth Scopes** | email, openid, profile |

---

## 📍 Where to Find After Creation

### User Pool ID
**Location**: User pool overview page
**Example**: `us-east-2_XXXXXXXXX`

### App Client ID
**Location**: App integration → App clients and analytics
**Example**: `1234567890abcdefghijklmnop`

### Domain Name
**Location**: App integration → Domain
**Example**: `mechpro-randomstring`

---

## ✅ After Setup

Save these to a text file:

```
USER_POOL_ID = us-east-2_XXXXXXXXX
APP_CLIENT_ID = 1234567890abcdefghijklmnop
DOMAIN = mechpro-randomstring
```

---

## 🧪 Test Login

Visit:
```
https://mechpro-randomstring.auth.us-east-2.amazoncognito.com/login
```

Create test user:
- Email: test@example.com
- Password: TestPassword123!

---

## ⏭️ Next After Cognito

1. Create Lambda Functions (manual)
2. Create API Gateway (manual)
3. Deploy Frontend
4. Connect RDS

---

**Status**: Ready to begin Cognito setup!

Full guide: See `SETUP_COGNITO_MANUAL.md`
