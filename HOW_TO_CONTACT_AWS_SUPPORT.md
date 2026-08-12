# How to Contact AWS Support - Step by Step

## Step 1: Go to AWS Support Console

Open this link in your browser:
```
https://console.aws.amazon.com/support/home
```

Or:
1. Go to AWS Console: https://console.aws.amazon.com/
2. Click your account name (top-right)
3. Click "Support"
4. Click "Contact Us"

---

## Step 2: Select Support Plan

- If you have a **Business** or **Enterprise** support plan:
  - You can open a ticket directly
  - Click "Create case"

- If you have **Developer** or **Basic** support:
  - You may be limited to Community forums
  - Click "Community forums" or upgrade to Business support

---

## Step 3: Create a New Support Case

Click **"Create case"** button

Fill in the form:

### Service
**CloudFormation**

### Category
**CloudFormation general question** or **Deployment issue**

### Severity
**High** (affects deployment)

### Subject
```
CloudFormation Deployment Blocked by AWS::EarlyValidation::ResourceExistenceCheck Hook
```

---

## Step 4: Describe the Issue

In the "Description" field, copy-paste this (from AWS_SUPPORT_TICKET_TEMPLATE.md):

```
Our AWS account (001018341557, region us-east-2) is unable to deploy CloudFormation stacks.

Error: Failed to create ChangeSet: FAILED, The following hook(s)/validation failed: 
[AWS::EarlyValidation::ResourceExistenceCheck]

Simple stacks (S3 only) deploy successfully.
Complex stacks (Cognito + API Gateway + Lambda) fail with this error.

This is blocking our infrastructure deployment. We are requesting:
1. Information about what validation hook is enabled
2. Why it's blocking our resources
3. An exemption or rule modification to allow our deployment

Account: 001018341557
Region: us-east-2
Resource types affected: AWS::Cognito::UserPool, AWS::ApiGateway::RestApi, AWS::Lambda::Function
```

---

## Step 5: Attach Files (Optional but Helpful)

Click **"Add attachments"**

Upload these files from `E:\MechPro-AWS`:
1. `lib/mech_pro-aws-stack.ts` — Infrastructure definition
2. `AWS_SUPPORT_TICKET_TEMPLATE.md` — Detailed information
3. Error log from deployment attempt (copy-paste from terminal)

---

## Step 6: Contact Information

Enter your:
- Email address
- Phone number (optional)
- Preferred contact method

---

## Step 7: Submit

Click **"Submit"**

---

## What to Expect

AWS Support will:
1. **Acknowledge receipt** within hours
2. **Investigate** the CloudFormation hook on your account (usually 1-2 days)
3. **Provide options**:
   - Disable the hook if it was accidental
   - Modify the hook rules
   - Grant exemption
   - Explain the restriction

---

## Alternative: AWS Community Forums

If you have Developer/Basic support:

1. Go to: https://forums.aws.amazon.com/forum.jspa?forumID=87
2. Click "New Discussion"
3. Post your issue
4. Community members or AWS staff may help

---

## Quick Links

- **AWS Support Center**: https://console.aws.amazon.com/support/
- **Create a Case**: https://console.aws.amazon.com/support/cases
- **CloudFormation Documentation**: https://docs.aws.amazon.com/cloudformation/
- **CloudFormation Hooks**: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-hooks.html

---

## Sample Support Ticket

Here's what your ticket should look like:

```
Subject: CloudFormation Deployment Blocked by AWS::EarlyValidation::ResourceExistenceCheck Hook

Description:
Our AWS account (001018341557, us-east-2) is blocked from deploying CloudFormation stacks.

Error Message:
"Failed to create ChangeSet cdk-deploy-change-set: FAILED, The following hook(s)/validation failed: 
[AWS::EarlyValidation::ResourceExistenceCheck]"

What Works:
✓ S3 buckets deploy successfully
✓ Simple CloudFormation stacks work fine
✓ Bootstrap was successful

What Fails:
✗ Stacks with: Cognito User Pool + API Gateway + Lambda Functions
✗ Error occurs at changeset creation stage
✗ Same error with different stack names and configurations

We believe there's a CloudFormation Hook or AWS Organizations policy blocking these resources.

Request:
1. Can you identify what validation hook is enabled on this account?
2. Why is it blocking Cognito + API Gateway + Lambda?
3. Can we request an exemption or rule modification?

This is blocking our infrastructure deployment for a production application.

Account: 001018341557
Region: us-east-2
Support Plan: [Your plan here - Business/Enterprise/Developer/Basic]
```

---

## Typical Response Time

- **Acknowledgment**: 15 minutes to 2 hours
- **Investigation**: 4-48 hours
- **Resolution**: Usually within 1-3 business days for infrastructure issues

---

## If Support Says No

If AWS denies the exemption, we have backup options:
1. **Manual AWS Console deployment** (I can guide you)
2. **Different AWS account** (if available)
3. **Simplified architecture** (deploy resources separately)

---

## Your Support Ticket Details to Save

Once submitted, AWS will give you a **Case ID** like: `case-XXXXXXXXX-1234`

Save this ID to track your case.

---

**Next Action**: Follow the steps above to submit the ticket to AWS Support.

I'll prepare the manual deployment guide in case we need it as a workaround.
