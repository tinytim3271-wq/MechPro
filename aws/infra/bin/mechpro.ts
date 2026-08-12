#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { MechProStack } from "../lib/mechpro-stack.ts";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? process.env.AWS_REGION ?? "us-east-1",
};

const domainName = app.node.tryGetContext("domainName") as string | undefined;
const frontendUrl =
  (app.node.tryGetContext("frontendUrl") as string | undefined) ??
  (domainName ? `https://${domainName}` : "https://yourcarguy806.com");
const sesFromEmail = app.node.tryGetContext("sesFromEmail") as string | undefined;
const deploySpa = String(app.node.tryGetContext("deploySpa") ?? "") === "true";

new MechProStack(app, "MechProStack", {
  env,
  description: "MechPro AWS backend: Aurora, Cognito, S3, API, scheduler",
  frontendUrl,
  domainName,
  sesFromEmail,
  deploySpa,
});
