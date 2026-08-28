"use node";

import {
  AdminCreateUserCommand,
  CognitoIdentityProviderClient,
  UsernameExistsException,
} from "@aws-sdk/client-cognito-identity-provider";
import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

const client = new CognitoIdentityProviderClient({});

function userPoolId(): string {
  const issuer = process.env.COGNITO_ISSUER;
  const poolId = issuer?.split("/").filter(Boolean).at(-1);
  if (!poolId) {
    throw new ConvexError({ message: "Employee login service is not configured", code: "EXTERNAL_SERVICE_ERROR" });
  }
  return poolId;
}

export const inviteEmployee = action({
  args: {
    orgId: v.id("organizations"),
    email: v.string(),
    name: v.string(),
    role: v.union(
      v.literal("admin"),
      v.literal("service_writer"),
      v.literal("mechanic"),
      v.literal("mobile_mechanic")
    ),
  },
  handler: async (ctx, args) => {
    const employee = await ctx.runQuery(internal.organizations.validateEmployeeInvite, {
      orgId: args.orgId,
      name: args.name,
      email: args.email,
    });
    try {
      await client.send(new AdminCreateUserCommand({
        UserPoolId: userPoolId(),
        Username: employee.email,
        DesiredDeliveryMediums: ["EMAIL"],
        UserAttributes: [
          { Name: "email", Value: employee.email },
          { Name: "name", Value: employee.name },
        ],
      }));
    } catch (error) {
      if (!(error instanceof UsernameExistsException)) {
        console.error(`Cognito employee provisioning failed: ${error instanceof Error ? error.name : "UnknownError"}`);
        throw new ConvexError({ message: "Unable to create employee login", code: "EXTERNAL_SERVICE_ERROR" });
      }
    }

    await ctx.runMutation(internal.organizations.inviteMember, {
      orgId: args.orgId,
      name: employee.name,
      email: employee.email,
      role: args.role,
    });
  },
});