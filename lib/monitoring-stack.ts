import * as cdk from 'aws-cdk-lib/core';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sns_subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cw_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';

/**
 * CloudWatch Monitoring Stack for MechPro
 * Provides dashboards, alarms, and logs for observability
 */
export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ============ SNS TOPIC FOR ALARMS ============
    const alarmTopic = new sns.Topic(this, 'MechProAlarmTopic', {
      topicName: 'MechPro-Alerts',
      displayName: 'MechPro Alarm Notifications',
    });

    // Add email subscription (replace with your email)
    alarmTopic.addSubscription(
      new sns_subscriptions.EmailSubscription('your-email@example.com')
    );

    // ============ LOG GROUPS ============
    new logs.LogGroup(this, 'APIGatewayLogGroup', {
      logGroupName: '/aws/apigateway/MechPro',
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new logs.LogGroup(this, 'LambdaLogGroup', {
      logGroupName: '/aws/lambda/MechPro',
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new logs.LogGroup(this, 'RDSLogGroup', {
      logGroupName: '/aws/rds/MechPro',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ============ CLOUDWATCH DASHBOARD ============
    const dashboard = new cloudwatch.Dashboard(this, 'MechProDashboard', {
      dashboardName: 'MechPro-Operations',
    });

    // API Gateway Metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Gateway - Request Count',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: 'Count',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: 'API Requests',
          }),
        ],
      })
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Gateway - Latency',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: 'Latency',
            statistic: 'Average',
            period: cdk.Duration.minutes(1),
            label: 'Average Latency (ms)',
          }),
        ],
      })
    );

    // Lambda Metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda - Invocations & Duration',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/Lambda',
            metricName: 'Invocations',
            statistic: 'Sum',
            period: cdk.Duration.minutes(1),
            label: 'Invocations',
          }),
        ],
        right: [
          new cloudwatch.Metric({
            namespace: 'AWS/Lambda',
            metricName: 'Duration',
            statistic: 'Average',
            period: cdk.Duration.minutes(1),
            label: 'Avg Duration (ms)',
          }),
        ],
      })
    );

    // RDS Metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'RDS Aurora - CPU & Connections',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/RDS',
            metricName: 'CPUUtilization',
            statistic: 'Average',
            period: cdk.Duration.minutes(1),
            label: 'CPU Utilization (%)',
          }),
        ],
        right: [
          new cloudwatch.Metric({
            namespace: 'AWS/RDS',
            metricName: 'DatabaseConnections',
            statistic: 'Average',
            period: cdk.Duration.minutes(1),
            label: 'Active Connections',
          }),
        ],
      })
    );

    // ============ CLOUDWATCH ALARMS ============

    // API Gateway 5XX Errors Alarm
    const api5xxAlarm = new cloudwatch.Alarm(this, 'APIGateway5XXAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '5XXError',
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 2,
      alarmName: 'MechPro-APIGateway-5XX-Errors',
      alarmDescription: 'Alert when API Gateway has 5XX errors',
    });
    api5xxAlarm.addAlarmAction(new cw_actions.SnsAction(alarmTopic));

    // Lambda Error Alarm
    const lambdaErrorAlarm = new cloudwatch.Alarm(this, 'LambdaErrorAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Errors',
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5,
      evaluationPeriods: 1,
      alarmName: 'MechPro-Lambda-Errors',
      alarmDescription: 'Alert when Lambda functions error',
    });
    lambdaErrorAlarm.addAlarmAction(new cw_actions.SnsAction(alarmTopic));

    // RDS CPU Alarm
    const rdsCpuAlarm = new cloudwatch.Alarm(this, 'RDSCPUAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'CPUUtilization',
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 80,
      evaluationPeriods: 2,
      alarmName: 'MechPro-RDS-HighCPU',
      alarmDescription: 'Alert when RDS CPU exceeds 80%',
    });
    rdsCpuAlarm.addAlarmAction(new cw_actions.SnsAction(alarmTopic));

    // ============ OUTPUTS ============
    new cdk.CfnOutput(this, 'DashboardURL', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=MechPro-Operations`,
      description: 'CloudWatch Dashboard URL',
      exportName: 'MechProDashboardURL',
    });

    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: alarmTopic.topicArn,
      description: 'SNS Topic ARN for alarm notifications',
      exportName: 'MechProAlarmTopicArn',
    });
  }
}
