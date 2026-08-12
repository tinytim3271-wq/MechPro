# AWS Support Ticket Template - CloudFormation Validation Hook Issue

## Copy this entire content and submit to AWS Support

---

## Ticket Summary
**CloudFormation Deployment Blocked: AWS::EarlyValidation::ResourceExistenceCheck Hook**

---

## Description

Our AWS account (`001018341557`, region `us-east-2`) is unable to deploy CloudFormation stacks containing specific AWS resources.

### Error Message
```
Failed to create ChangeSet: FAILED, The following hook(s)/validation failed: 
[AWS::EarlyValidation::ResourceExistenceCheck]. 
To troubleshoot Early Validation errors, use the DescribeEvents API for detailed failure information.
```

### Issue Details
- **AWS Account ID**: 001018341557
- **Region**: us-east-2
- **Error Type**: AWS::EarlyValidation::ResourceExistenceCheck
- **Resource Combination**: Cognito User Pool + API Gateway + Lambda Functions

### What Works
- ✅ Simple S3 bucket deployments succeed
- ✅ CloudFormation bootstrap successful
- ✅ RDS Aurora deployment successful
- ✅ Basic resources deploy without issues

### What Fails
- ❌ CloudFormation stacks containing: Cognito + API Gateway + Lambda
- ❌ Error occurs at CloudFormation changeset creation stage
- ❌ Same error occurs regardless of stack name or changes to configuration

### Attempts Made
1. Destroyed and recreated stacks - **FAILED with same error**
2. Changed stack names multiple times - **FAILED**
3. Simplified stack to only Cognito + API Gateway + Lambda - **FAILED**
4. Deployed minimal stacks (S3 only) - **SUCCESS** (proving CloudFormation itself works)
5. Different configuration combinations - **All FAILED** when including Cognito/API Gateway/Lambda

### Questions for AWS Support

1. **Is there a CloudFormation Hook enabled on this account?**
   - If yes, what is it configured to block?
   - What are the specific resources or patterns being blocked?

2. **Is there an AWS Organizations policy preventing these deployments?**
   - If yes, what are the restrictions?
   - How can we request an exemption?

3. **How can we check the DescribeEvents API for more details?**
   - What command would provide the detailed failure information?

4. **Is there an exemption or whitelist we can request?**
   - To allow deployment of: AWS::Cognito::UserPool, AWS::ApiGateway::RestApi, AWS::Lambda::Function

### CloudFormation Template Summary
Our template includes:
- 1x Cognito User Pool with OAuth
- 1x Cognito User Pool Client
- 5x Lambda Functions (Node.js 20.x)
- 1x API Gateway REST API
- 1x API Gateway Cognito Authorizer
- 18x API Gateway Methods/Routes
- 1x S3 Bucket
- 1x CloudFront Distribution
- CloudWatch resources

**Template URL**: See attached CDK output or cdk.out/MechProStack.json

### Request
**We request an exemption or rule modification to allow deployment of this CloudFormation stack.**

The stack is for an internal automotive management SaaS platform and contains only standard AWS managed services with no unusual configurations.

---

## Contact Information
- **AWS Account**: 001018341557
- **Region**: us-east-2
- **Preferred Contact**: (Your email/phone here)

---

## Additional Information for AWS Support

### To reproduce:
```powershell
# After AWS credentials are configured
cd E:\MechPro-AWS
npm install
npm run build
npx cdk deploy --all --require-approval=never
```

### Error occurs at:
```
MechProStack: creating CloudFormation changeset...
[Error at /MechProStack] Hook validation failed
```

### Stack outputs (if needed):
CloudFormation stack name: `MechProStack` (or MechProApp[timestamp])

---

## Severity
- **Impact**: Application deployment blocked
- **Workaround**: Manual resource creation in AWS Console (time-consuming)
- **Urgency**: High - infrastructure code ready for deployment

---

## Attachments to Include
1. CDK output JSON template: `E:\MechPro-AWS\cdk.out\MechProStack.json`
2. Error logs: Full deployment output
3. TypeScript infrastructure code: `E:\MechPro-AWS\lib\mech_pro-aws-stack.ts`

---

**End of Template**
