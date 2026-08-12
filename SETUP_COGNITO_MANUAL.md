# Manual Cognito User Pool Setup - Step by Step

## Step 1: Open AWS Cognito Console

Go to:
```
https://console.aws.amazon.com/cognito/
```

Or:
1. Login to AWS Console: https://console.aws.amazon.com/
2. Search for "Cognito" in the search bar
3. Click "Cognito"

---

## Step 2: Create User Pool

Click **"Create user pool"** button

---

## Step 3: Configure Sign-in Experience

### Authentication providers
Check BOTH:
- ☑ Email
- ☑ Username (optional - for flexibility)

### MFA configuration
Select: **No MFA** (for testing/development)
*Note: Use MFA in production*

Click **"Next"** →

---

## Step 4: Configure Security Requirements

### Password policy
Select: **Custom** 

Set these values:
- **Minimum length**: 12
- **Require uppercase**: ☑ Yes
- **Require lowercase**: ☑ Yes
- **Require numbers**: ☑ Yes
- **Require special characters**: ☑ Yes

### User account recovery
Select: **Email only**

Click **"Next"** →

---

## Step 5: Configure Sign-up Experience

### Self-service sign-up
Select: **Enable self-registration** ☑

### Attribute verification and user account confirmation
- **Verifying email addresses**: ☑ Send email message (Automatic for new users)
- **Keep original attribute value active when an update is pending**: ☑ Yes

### Required attributes
Check ALL:
- ☑ email
- ☑ name
- ☑ family_name
- ☑ given_name
- ☑ preferred_username

Click **"Next"** →

---

## Step 6: Configure Message Delivery

### Email
Select: **Send email with Cognito** (default)

*Note: In production, use SES for higher volume*

Click **"Next"** →

---

## Step 7: Review and Create

### User pool name
Enter:
```
MechPro-UserPool
```

### Cognito user pool sign-in options
Keep defaults (email)

Click **"Create user pool"** →

**WAIT** - This will take 1-2 minutes to create

---

## Step 8: After Pool is Created - Create App Client

Once the pool is created, you'll see the pool details page.

Click **"App integration"** in the left sidebar

Then click **"App clients"**

Click **"Create app client"** button

### App client name
Enter:
```
MechPro-WebApp
```

### Client type
Select: **Public client** (for web apps)

### Authentication flows
Check:
- ☑ ALLOW_USER_PASSWORD_AUTH
- ☑ ALLOW_REFRESH_TOKEN_AUTH
- ☑ ALLOW_CUSTOM_AUTH

### Token expiration
- **Access token expiration**: 60 (minutes)
- **ID token expiration**: 60 (minutes)
- **Refresh token expiration**: 30 (days)

### Prevent user existence errors
☑ Check this (security best practice)

Click **"Create app client"** →

---

## Step 9: Configure App Client Settings

After creation, click on the app client name: **MechPro-WebApp**

### Hosted UI
Click **"Hosted UI"** in left sidebar

#### App client settings
- **Enabled identity providers**: Check ☑ Cognito user pool
- **Callback URL(s)**: 
  ```
  http://localhost:3000/callback
  https://yourdomain.com/callback
  ```
  (Add both lines, separate with comma)

- **Sign out URL(s)**:
  ```
  http://localhost:3000
  https://yourdomain.com
  ```
  (Add both lines, separate with comma)

- **OAuth 2.0 allowed redirect URIs**: 
  ```
  implicit
  code
  ```

- **Allowed OAuth Scopes**:
  ☑ email
  ☑ openid
  ☑ profile

Click **"Save changes"** →

---

## Step 10: Get Your Credentials

Go back to **User pool overview** page

You'll need these values (save them):

### User Pool ID
Look for: **User pool ID**
```
Example: us-east-2_XXXXXXXXX
```

### App Client ID
Go to **"App integration"** → **"App clients and analytics"**
```
Example: 1234567890abcdefghijklmnop
```

### Domain Name
Go to **"App integration"** → **"Domain"**
Create a domain (if not exists):
```
Example: mechpro-RANDOMSTRING
```

---

## Step 11: Save Your Credentials

Create a file: `E:\MechPro-AWS\COGNITO_CREDENTIALS.txt`

Save these values:
```
=== COGNITO CONFIGURATION ===

AWS Region: us-east-2

User Pool ID: us-east-2_XXXXXXXXX

App Client ID: 1234567890abcdefghijklmnop

Domain: mechpro-randomstring

Hosted UI URL: https://mechpro-randomstring.auth.us-east-2.amazoncognito.com/login

=== UPDATE ENVIRONMENT VARIABLES ===

Update your React app with:
- REACT_APP_COGNITO_USER_POOL_ID = us-east-2_XXXXXXXXX
- REACT_APP_COGNITO_CLIENT_ID = 1234567890abcdefghijklmnop
- REACT_APP_COGNITO_DOMAIN = mechpro-randomstring
```

---

## Step 12: Test Your Setup

### Test 1: Open Hosted UI
Go to:
```
https://mechpro-randomstring.auth.us-east-2.amazoncognito.com/login
```

You should see Cognito login page

### Test 2: Create a Test User
1. Click "Sign up"
2. Enter:
   - Email: `test@example.com`
   - Password: `TestPassword123!`
3. Verify email (check inbox)

### Test 3: Login
Go back to login page
Enter credentials
Should redirect to your callback URL

---

## What You Just Created

✅ **User Pool**: `MechPro-UserPool`
- Email-based authentication
- Strong password policy
- Self-service registration enabled
- Email verification required

✅ **App Client**: `MechPro-WebApp`
- OAuth 2.0 enabled
- Multiple authentication flows
- Callback URLs configured

✅ **Hosted UI**: Cognito login page
- Ready to use
- No custom login form needed

---

## Next Steps After Cognito Setup

1. ✅ **Cognito setup** (you're here)
2. ⬜ **Create Lambda Functions** manually
3. ⬜ **Create API Gateway** manually
4. ⬜ **Deploy Frontend** to S3
5. ⬜ **Connect RDS Database**

---

## Credentials to Save

After completing these steps, you'll have:

```
COGNITO_USER_POOL_ID = us-east-2_XXXXXXXXX
COGNITO_CLIENT_ID = 1234567890abcdefghijklmnop
COGNITO_DOMAIN = mechpro-randomstring
```

**These go in your React app's environment variables** for authentication.

---

## Issues During Setup?

### "Cannot create user pool"
→ Check IAM permissions
→ May need admin to create

### "Email verification not working"
→ Check spam folder
→ May need SES setup for production

### "Callback URL not working"
→ Ensure exact match (https:// vs http://)
→ Add both development and production URLs

---

## Helpful Links

- **Cognito Console**: https://console.aws.amazon.com/cognito/
- **Cognito Docs**: https://docs.aws.amazon.com/cognito/
- **User Pool Settings**: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings.html

---

**Once complete, reply with your:**
- User Pool ID
- App Client ID  
- Domain Name

Then we'll move to **Step 2: Create Lambda Functions** manually.
