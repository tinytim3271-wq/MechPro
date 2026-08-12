import * as cdk from 'aws-cdk-lib/core';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export class MinimalStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Simple S3 bucket to test deployment
    const bucket = new s3.Bucket(this, 'TestBucket', {
      bucketName: `mechpro-test-${this.account}-${this.region}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    new cdk.CfnOutput(this, 'BucketName', {
      value: bucket.bucketName,
      description: 'Test bucket name',
    });
  }
}
