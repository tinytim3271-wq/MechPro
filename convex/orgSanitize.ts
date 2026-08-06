import type { Doc } from "./_generated/dataModel.d.ts";

type OrgMemberRole = Doc<"orgMembers">["role"];

/** Strip sensitive org fields before returning to clients. */
export function sanitizeOrgForClient(
  org: Doc<"organizations">,
  memberRole?: OrgMemberRole | null,
  hasAdminAccess?: boolean,
): Doc<"organizations"> {
  const canManageSecrets =
    memberRole === "owner" ||
    memberRole === "admin" ||
    hasAdminAccess === true;

  return {
    ...org,
    twilioAccountSid: undefined,
    twilioAuthToken: undefined,
    twilioPhoneNumber: canManageSecrets ? org.twilioPhoneNumber : undefined,
    carfaxPartnerKey: canManageSecrets ? org.carfaxPartnerKey : undefined,
    carfaxLocationId: canManageSecrets ? org.carfaxLocationId : undefined,
    carfaxEnabled: canManageSecrets ? org.carfaxEnabled : undefined,
  };
}

/** Public/customer-facing org payload — never includes integration secrets. */
export function sanitizeOrgForPublic(org: Doc<"organizations">): Doc<"organizations"> {
  return sanitizeOrgForClient(org, null, false);
}
