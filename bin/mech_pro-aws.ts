#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { MechProAwsStack } from '../lib/mech_pro-aws-stack';
import { MonitoringStack } from '../lib/monitoring-stack';

const app = new cdk.App();

const env = { account: '001018341557', region: 'us-east-1' };

new MechProAwsStack(app, 'MechProAwsStack', { env });
new MonitoringStack(app, 'MechProMonitoringStack', { env });
