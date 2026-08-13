import * as path from 'path';
import * as cdk from 'aws-cdk-lib/core';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as r53 from 'aws-cdk-lib/aws-route53';
import * as r53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export class MechProAwsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const appName = 'MechPro';
    const environment = 'production';

    const vpc = new ec2.Vpc(this, 'MechProVpc', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { cidrMask: 24, name: 'public', subnetType: ec2.SubnetType.PUBLIC },
        { cidrMask: 24, name: 'private', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      ],
    });

    const databaseCredentials = new secretsmanager.Secret(this, 'MechProDatabaseCredentials', {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'postgres' }),
        generateStringKey: 'password',
        excludePunctuation: true,
      },
    });

    const database = new rds.DatabaseCluster(this, 'MechProDatabase', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.of('15.10', '15'),
      }),
      credentials: rds.Credentials.fromSecret(databaseCredentials),
      defaultDatabaseName: 'mechpro',
      writer: rds.ClusterInstance.provisioned('writer', {
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MEDIUM),
      }),
      readers: [
        rds.ClusterInstance.provisioned('reader', {
          instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MEDIUM),
        }),
      ],
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      storageEncrypted: true,
      backup: {
        retention: cdk.Duration.days(7),
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPool = new cognito.UserPool(this, 'MechProUserPool', {
      signInAliases: { email: true },
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
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: [
          'http://localhost:5173/auth/callback',
          'http://localhost:3000/auth/callback',
          'https://www.yourcarguy806.com/auth/callback',
          'https://yourcarguy806.com/auth/callback',
        ],
        logoutUrls: [
          'http://localhost:5173',
          'http://localhost:3000',
          'https://www.yourcarguy806.com',
          'https://yourcarguy806.com',
        ],
      },
      generateSecret: false,
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    lambdaRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
    );
    lambdaRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole')
    );
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      sid: 'LambdaVpcNetworkAccess',
      effect: iam.Effect.ALLOW,
      actions: [
        'ec2:CreateNetworkInterface',
        'ec2:DescribeNetworkInterfaces',
        'ec2:DeleteNetworkInterface',
        'ec2:DescribeSubnets',
        'ec2:DescribeSecurityGroups',
        'ec2:DescribeVpcs',
      ],
      resources: ['*'],
    }));

    const baseEnv = {
      COGNITO_USER_POOL_ID: userPool.userPoolId,
      COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? '',
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
      NHTSA_API_BASE: 'https://webapi.nhtsa.gov/api',
      DB_HOST: database.clusterEndpoint.hostname,
      DB_PORT: '5432',
      DB_NAME: 'mechpro',
      DB_USER: 'postgres',
      DB_PASSWORD: databaseCredentials.secretValueFromJson('password').unsafeUnwrap(),
    };

    const createLambdaFunction = (functionName: string, entryFile: string): lambda.Function => {
      const fn = new lambdaNodejs.NodejsFunction(this, functionName, {
        entry: path.join(__dirname, '../lambda/functions', `${entryFile}.ts`),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(30),
        memorySize: 512,
        role: lambdaRole,
        vpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        environment: baseEnv,
        depsLockFilePath: path.join(__dirname, '../package-lock.json'),
        bundling: {
          minify: false,
          sourceMap: true,
          target: 'node20',
        },
      });

      return fn;
    };

    const authFunction = createLambdaFunction('Auth', 'auth');
    const customersFunction = createLambdaFunction('Customers', 'customers');
    const bookingsFunction = createLambdaFunction('Bookings', 'bookings');
    const invoicesFunction = createLambdaFunction('Invoices', 'invoices');
    const inspectionsFunction = createLambdaFunction('Inspections', 'inspections');
    const employeesFunction = createLambdaFunction('Employees', 'employees');

    database.connections.allowDefaultPortFrom(customersFunction);
    database.connections.allowDefaultPortFrom(bookingsFunction);
    database.connections.allowDefaultPortFrom(invoicesFunction);
    database.connections.allowDefaultPortFrom(inspectionsFunction);
    database.connections.allowDefaultPortFrom(employeesFunction);
    database.connections.allowDefaultPortFrom(authFunction);

    const api = new apigateway.RestApi(this, 'MechProAPI', {
      description: 'MechPro multi-tenant automotive management API',
      cloudWatchRole: true,
      deployOptions: {
        stageName: environment,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        metricsEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    const cognitoAuth = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuth', {
      cognitoUserPools: [userPool],
      identitySource: 'method.request.header.Authorization',
    });

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

    const bookingsResource = api.root.addResource('bookings');
    bookingsResource.addMethod('GET', new apigateway.LambdaIntegration(bookingsFunction), {
      authorizer: cognitoAuth,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    bookingsResource.addMethod('POST', new apigateway.LambdaIntegration(bookingsFunction), {
      authorizer: cognitoAuth,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const invoicesResource = api.root.addResource('invoices');
    invoicesResource.addMethod('GET', new apigateway.LambdaIntegration(invoicesFunction), {
      authorizer: cognitoAuth,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    invoicesResource.addMethod('POST', new apigateway.LambdaIntegration(invoicesFunction), {
      authorizer: cognitoAuth,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const inspectionsResource = api.root.addResource('inspections');
    inspectionsResource.addMethod('GET', new apigateway.LambdaIntegration(inspectionsFunction), {
      authorizer: cognitoAuth,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    inspectionsResource.addMethod('POST', new apigateway.LambdaIntegration(inspectionsFunction), {
      authorizer: cognitoAuth,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const employeesResource = api.root.addResource('employees');
    employeesResource.addMethod('GET', new apigateway.LambdaIntegration(employeesFunction), {
      authorizer: cognitoAuth,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    employeesResource.addMethod('POST', new apigateway.LambdaIntegration(employeesFunction), {
      authorizer: cognitoAuth,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const authResource = api.root.addResource('auth');
    const registerResource = authResource.addResource('register');
    const loginResource = authResource.addResource('login');
    registerResource.addMethod('POST', new apigateway.LambdaIntegration(authFunction));
    loginResource.addMethod('POST', new apigateway.LambdaIntegration(authFunction));

    const frontendBucket = new s3.Bucket(this, 'MechProFrontendBucket', {
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      publicReadAccess: true,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
      }),
    });

    const hostedZone = r53.HostedZone.fromLookup(this, 'MechProHostedZone', {
      domainName: 'yourcarguy806.com',
    });

    const siteCertificate = new acm.Certificate(this, 'MechProSiteCertificate', {
      domainName: 'www.yourcarguy806.com',
      validation: acm.CertificateValidation.fromDns(hostedZone),
      subjectAlternativeNames: ['yourcarguy806.com'],
    });

    const frontendDistribution = new cloudfront.Distribution(this, 'MechProFrontendDistribution', {
      defaultRootObject: 'index.html',
      certificate: siteCertificate,
      domainNames: ['www.yourcarguy806.com', 'yourcarguy806.com'],
      defaultBehavior: {
        origin: new origins.HttpOrigin(frontendBucket.bucketWebsiteDomainName, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        compress: true,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
    });

    new r53.ARecord(this, 'RootDnsARecord', {
      zone: hostedZone,
      target: r53.RecordTarget.fromAlias(new r53Targets.CloudFrontTarget(frontendDistribution)),
    });

    new r53.AaaaRecord(this, 'RootDnsAAAARecord', {
      zone: hostedZone,
      target: r53.RecordTarget.fromAlias(new r53Targets.CloudFrontTarget(frontendDistribution)),
    });

    new r53.ARecord(this, 'WwwDnsARecord', {
      zone: hostedZone,
      recordName: 'www',
      target: r53.RecordTarget.fromAlias(new r53Targets.CloudFrontTarget(frontendDistribution)),
    });

    new r53.AaaaRecord(this, 'WwwDnsAAAARecord', {
      zone: hostedZone,
      recordName: 'www',
      target: r53.RecordTarget.fromAlias(new r53Targets.CloudFrontTarget(frontendDistribution)),
    });

    new logs.LogGroup(this, 'APIGatewayLogs', {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

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

    new cdk.CfnOutput(this, 'FrontendURL', {
      value: frontendBucket.bucketWebsiteUrl,
      description: 'S3 website URL for the frontend',
      exportName: 'MechProFrontendURL',
    });

    new cdk.CfnOutput(this, 'S3BucketName', {
      value: frontendBucket.bucketName,
      description: 'S3 Frontend Bucket',
      exportName: 'MechProFrontendBucket',
    });

    new cdk.CfnOutput(this, 'RDSEndpoint', {
      value: database.clusterEndpoint.hostname,
      description: 'RDS Aurora PostgreSQL cluster endpoint',
      exportName: 'MechProRDSEndpoint',
    });
  }
}
