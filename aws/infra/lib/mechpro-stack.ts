/**
 * MechPro production stack.
 *
 * Provisions the AWS resources the Convex-compat runtime expects:
 *   VPC + Aurora Serverless v2 (Postgres 16)
 *   Cognito User Pool + SPA app client
 *   S3 uploads bucket (CORS for browser PUTs)
 *   Secrets Manager entries for Stripe / AI / VAPID / SES
 *   HTTP API Lambda (public functions + Stripe webhook)
 *   EventBridge → drainer Lambda for `_scheduledFunctions`
 *   Optional CloudFront SPA when `-c deploySpa=true`
 */
import * as cdk from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigwIntegrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as rds from "aws-cdk-lib/aws-rds";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sns from "aws-cdk-lib/aws-sns";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as ses from "aws-cdk-lib/aws-ses";
import { Construct } from "constructs";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const awsRoot = join(here, "..", "..");
const distDir = join(awsRoot, "dist");

export type MechProStackProps = cdk.StackProps & {
  frontendUrl: string;
  domainName?: string;
  sesFromEmail?: string;
  deploySpa?: boolean;
};

export class MechProStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MechProStackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: "private", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: "isolated", subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    const dbSecurityGroup = new ec2.SecurityGroup(this, "DbSg", {
      vpc,
      description: "Aurora access from MechPro Lambdas",
      allowAllOutbound: true,
    });

    const lambdaSecurityGroup = new ec2.SecurityGroup(this, "LambdaSg", {
      vpc,
      description: "MechPro Lambda functions",
      allowAllOutbound: true,
    });
    dbSecurityGroup.addIngressRule(lambdaSecurityGroup, ec2.Port.tcp(5432), "Postgres from Lambdas");

    const dbCluster = new rds.DatabaseCluster(this, "Aurora", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_6,
      }),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSecurityGroup],
      writer: rds.ClusterInstance.serverlessV2("writer"),
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 4,
      defaultDatabaseName: "mechpro",
      storageEncrypted: true,
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      credentials: rds.Credentials.fromGeneratedSecret("mechpro"),
    });

    const userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: "mechpro-users",
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 10,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: false, mutable: true },
      },
    });

    const userPoolClient = userPool.addClient("SpaClient", {
      userPoolClientName: "mechpro-spa",
      generateSecret: false,
      authFlows: { userSrp: true, userPassword: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          `${props.frontendUrl}/auth/callback`,
          "http://localhost:5173/auth/callback",
        ],
        logoutUrls: [props.frontendUrl, "http://localhost:5173"],
      },
      preventUserExistenceErrors: true,
    });

    const cognitoDomain = userPool.addDomain("Domain", {
      cognitoDomain: {
        domainPrefix: `mechpro-${cdk.Names.uniqueId(this).slice(-8).toLowerCase()}`,
      },
    });

    const cognitoIssuer = `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`;

    const uploadsBucket = new s3.Bucket(this, "Uploads", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: [props.frontendUrl, "http://localhost:5173"],
          allowedHeaders: ["*"],
          exposedHeaders: ["ETag"],
          maxAge: 3000,
        },
      ],
      lifecycleRules: [{ abortIncompleteMultipartUploadAfter: cdk.Duration.days(7) }],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const appSecrets = new secretsmanager.Secret(this, "AppSecrets", {
      secretName: "mechpro/app",
      description: "MechPro Stripe, VAPID, SES, and optional Hercules fall-through keys",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          STRIPE_SECRET_KEY: "REPLACE_ME",
          STRIPE_WEBHOOK_SECRET: "REPLACE_ME",
          HERCULES_API_KEY: "REPLACE_ME",
          VAPID_PUBLIC_KEY: "REPLACE_ME",
          VAPID_PRIVATE_KEY: "REPLACE_ME",
          SES_FROM_EMAIL: props.sesFromEmail ?? "REPLACE_ME@example.com",
        }),
        generateStringKey: "_nonce",
        excludePunctuation: true,
      },
    });

    if (props.sesFromEmail) {
      new ses.EmailIdentity(this, "SesFrom", {
        identity: ses.Identity.email(props.sesFromEmail),
      });
    }

    const commonEnv: Record<string, string> = {
      COGNITO_ISSUER: cognitoIssuer,
      COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
      S3_BUCKET: uploadsBucket.bucketName,
      FRONTEND_URL: props.frontendUrl,
      DB_SECRET_ARN: dbCluster.secret!.secretArn,
      APP_SECRET_ARN: appSecrets.secretArn,
      NODE_OPTIONS: "--enable-source-maps",
    };

    const httpFn = new lambda.Function(this, "HttpFn", {
      functionName: "mechpro-http",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: "http.handler",
      code: lambda.Code.fromAsset(distDir),
      memorySize: 1024,
      timeout: cdk.Duration.seconds(30),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: commonEnv,
      tracing: lambda.Tracing.ACTIVE,
    });

    const drainerFn = new lambda.Function(this, "DrainerFn", {
      functionName: "mechpro-drainer",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: "drainer.handler",
      code: lambda.Code.fromAsset(distDir),
      memorySize: 1024,
      timeout: cdk.Duration.seconds(60),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: { ...commonEnv, DRAINER_BATCH_SIZE: "10" },
      tracing: lambda.Tracing.ACTIVE,
    });

    for (const fn of [httpFn, drainerFn]) {
      dbCluster.secret!.grantRead(fn);
      appSecrets.grantRead(fn);
      uploadsBucket.grantReadWrite(fn);
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["ses:SendEmail", "ses:SendRawEmail"],
          resources: ["*"],
        }),
      );
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["bedrock:InvokeModel", "bedrock:Converse"],
          resources: [
            `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-sonnet-*`,
            `arn:aws:bedrock:${this.region}::foundation-model/amazon.nova-lite-*`,
            `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/us.anthropic.claude-sonnet-*`,
            `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/us.amazon.nova-lite-*`,
          ],
        }),
      );
    }

    const alarmTopic = new sns.Topic(this, "AlarmTopic", {
      displayName: "MechPro operational alarms",
    });
    const httpErrorsAlarm = new cloudwatch.Alarm(this, "HttpFnErrors", {
      alarmDescription: "MechPro HTTP Lambda errors",
      metric: httpFn.metricErrors({ period: cdk.Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
    });
    httpErrorsAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

    new events.Rule(this, "DrainerSchedule", {
      description: "Drain MechPro scheduled functions every minute",
      schedule: events.Schedule.rate(cdk.Duration.minutes(1)),
      targets: [new targets.LambdaFunction(drainerFn)],
    });

    const httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: "mechpro",
      corsPreflight: {
        allowHeaders: ["authorization", "content-type", "stripe-signature"],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: [props.frontendUrl, "http://localhost:5173"],
        maxAge: cdk.Duration.days(1),
      },
    });

    const integration = new apigwIntegrations.HttpLambdaIntegration("HttpIntegration", httpFn);
    httpApi.addRoutes({ path: "/health", methods: [apigwv2.HttpMethod.GET], integration });
    httpApi.addRoutes({ path: "/health/ready", methods: [apigwv2.HttpMethod.GET], integration });
    httpApi.addRoutes({ path: "/api", methods: [apigwv2.HttpMethod.POST], integration });
    httpApi.addRoutes({
      path: "/stripe-webhook",
      methods: [apigwv2.HttpMethod.POST],
      integration,
    });

    let spaUrl = props.frontendUrl;
    const spaAssets = join(awsRoot, "..", "dist");
    if (props.deploySpa && existsSync(spaAssets)) {
      const spaBucket = new s3.Bucket(this, "SpaBucket", {
        encryption: s3.BucketEncryption.S3_MANAGED,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        enforceSSL: true,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });
      const distribution = new cloudfront.Distribution(this, "SpaCdn", {
        defaultBehavior: {
          origin: origins.S3BucketOrigin.withOriginAccessControl(spaBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        defaultRootObject: "index.html",
        errorResponses: [
          { httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html" },
          { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html" },
        ],
      });
      spaUrl = `https://${distribution.distributionDomainName}`;
      new s3deploy.BucketDeployment(this, "SpaDeploy", {
        sources: [s3deploy.Source.asset(spaAssets)],
        destinationBucket: spaBucket,
        distribution,
        memoryLimit: 1024,
      });
      new cdk.CfnOutput(this, "CloudFrontDomain", { value: distribution.distributionDomainName });
    }

    new cdk.CfnOutput(this, "ApiUrl", { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, "StripeWebhookUrl", {
      value: `${httpApi.apiEndpoint}/stripe-webhook`,
    });
    new cdk.CfnOutput(this, "CognitoIssuer", { value: cognitoIssuer });
    new cdk.CfnOutput(this, "CognitoClientId", { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, "CognitoHostedUiDomain", { value: cognitoDomain.baseUrl() });
    new cdk.CfnOutput(this, "UploadsBucketName", { value: uploadsBucket.bucketName });
    new cdk.CfnOutput(this, "DbSecretArn", { value: dbCluster.secret!.secretArn });
    new cdk.CfnOutput(this, "AppSecretArn", { value: appSecrets.secretArn });
    new cdk.CfnOutput(this, "FrontendUrl", { value: spaUrl });
    new cdk.CfnOutput(this, "ViteEnvHint", {
      value: [
        `VITE_HERCULES_OIDC_AUTHORITY=${cognitoIssuer}`,
        `VITE_HERCULES_OIDC_CLIENT_ID=${userPoolClient.userPoolClientId}`,
        `VITE_CONVEX_URL=${httpApi.apiEndpoint}`,
      ].join(" "),
    });

    if (props.domainName) {
      new cdk.CfnOutput(this, "ConfiguredDomain", { value: props.domainName });
    }
  }
}
