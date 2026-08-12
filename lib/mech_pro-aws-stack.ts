import * as cdk from 'aws-cdk-lib/core';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export class MechProAwsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const environment = 'production';
    const appName = 'MechPro';

    // ============ COGNITO USER POOLS ============
    const userPool = new cognito.UserPool(this, 'MechProUserPool', {
      userPoolName: `${appName}-UserPool`,
      signInAliases: {
        email: true,
      },
      passwordPolicy: {
        minLength: 12,
        requireDigits: true,
        requireSymbols: true,
        requireUppercase: true,
        requireLowercase: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'MechProAppClient', {
      userPool,
      authFlows: {
        userPassword: true,
        custom: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: ['http://localhost:3000/callback', 'https://yourdomain.com/callback'],
        logoutUrls: ['http://localhost:3000', 'https://yourdomain.com'],
      },
      generateSecret: false,
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    // ============ IAM ROLE FOR LAMBDA ============
    const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    lambdaRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
    );

    // ============ LAMBDA FUNCTIONS ============
    const createLambdaFunction = (functionName: string): lambda.Function => {
      return new lambda.Function(this, functionName, {
        functionName: `${appName}-${functionName}`,
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline(
          'exports.handler = async (event) => { return { statusCode: 200, body: JSON.stringify({ message: "' + functionName + ' API" }) }; };'
        ),
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        role: lambdaRole,
        environment: {
          COGNITO_USER_POOL_ID: userPool.userPoolId,
          COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
          STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
          OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
          NHTSA_API_BASE: 'https://webapi.nhtsa.gov/api',
        },
      });
    };

    const customersFunction = createLambdaFunction('Customers');
    const bookingsFunction = createLambdaFunction('Bookings');
    const invoicesFunction = createLambdaFunction('Invoices');
    const inspectionsFunction = createLambdaFunction('Inspections');
    const employeesFunction = createLambdaFunction('Employees');

    // ============ API GATEWAY ============
    const api = new apigateway.RestApi(this, 'MechProAPI', {
      restApiName: `${appName}-API`,
      description: 'MechPro multi-tenant automotive management API',
      deployOptions: {
        stageName: environment,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        metricsEnabled: true,
      },
    });

    const cognitoAuth = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuth', {
      cognitoUserPools: [userPool],
      identitySource: 'method.request.header.Authorization',
    });

    // Routes: /customers
    const customersResource = api.root.addResource('customers');
    customersResource.addMethod('GET', new apigateway.LambdaIntegration(customersFunction), {
      authorizer: cognitoAuth,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    customersResource.addMethod('POST', new apigateway.LambdaIntegration(customersFunction), {
      authorizer: cognitoAuth,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const customerId = customersResource.addResource('{id}');
    customerId.addMethod('GET', new apigateway.LambdaIntegration(customersFunction), {
      authorizer: cognitoAuth,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    customerId.addMethod('PUT', new apigateway.LambdaIntegration(customersFunction), {
      authorizer: cognitoAuth,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    customerId.addMethod('DELETE', new apigateway.LambdaIntegration(customersFunction), {
      authorizer: cognitoAuth,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Routes: /bookings
    const bookingsResource = api.root.addResource('bookings');
    bookingsResource.addMethod('GET', new apigateway.LambdaIntegration(bookingsFunction), {
      authorizer: cognitoAuth,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    bookingsResource.addMethod('POST', new apigateway.LambdaIntegration(bookingsFunction), {
      authorizer: cognitoAuth,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Routes: /invoices
    const invoicesResource = api.root.addResource('invoices');
    invoicesResource.addMethod('GET', new apigateway.LambdaIntegration(invoicesFunction), {
      authorizer: cognitoAuth,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    invoicesResource.addMethod('POST', new apigateway.LambdaIntegration(invoicesFunction), {
      authorizer: cognitoAuth,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Routes: /inspections
    const inspectionsResource = api.root.addResource('inspections');
    inspectionsResource.addMethod('GET', new apigateway.LambdaIntegration(inspectionsFunction), {
      authorizer: cognitoAuth,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    inspectionsResource.addMethod('POST', new apigateway.LambdaIntegration(inspectionsFunction), {
      authorizer: cognitoAuth,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Routes: /employees
    const employeesResource = api.root.addResource('employees');
    employeesResource.addMethod('GET', new apigateway.LambdaIntegration(employeesFunction), {
      authorizer: cognitoAuth,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    employeesResource.addMethod('POST', new apigateway.LambdaIntegration(employeesFunction), {
      authorizer: cognitoAuth,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // ============ S3 FRONTEND BUCKET ============
    const frontendBucket = new s3.Bucket(this, 'MechProFrontendBucket', {
      bucketName: `${appName.toLowerCase()}-frontend-${this.account}`,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ============ CLOUDFRONT DISTRIBUTION ============
    const distribution = new cloudfront.Distribution(this, 'MechProDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
    });

    // ============ CLOUDWATCH LOGS ============
    new logs.LogGroup(this, 'APIGatewayLogs', {
      logGroupName: `/aws/apigateway/${appName}`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ============ OUTPUTS ============
    new cdk.CfnOutput(this, 'APIGatewayURL', {
      value: api.url,
      description: 'API Gateway URL',
      exportName: 'MechProAPIURL',
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: 'MechProUserPoolId',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: 'MechProUserPoolClientId',
    });

    new cdk.CfnOutput(this, 'CloudFrontURL', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront Distribution URL',
      exportName: 'MechProFrontendURL',
    });

    new cdk.CfnOutput(this, 'S3BucketName', {
      value: frontendBucket.bucketName,
      description: 'S3 Frontend Bucket',
      exportName: 'MechProFrontendBucket',
    });

    // ============ RDS DATABASE INFO ============
    new cdk.CfnOutput(this, 'RDSEndpoint', {
      value: 'database-1.cluster-crycioqkyke3.us-east-2.rds.amazonaws.com',
      description: 'Existing RDS Cluster Endpoint',
      exportName: 'MechProRDSEndpoint',
    });
  }
}
