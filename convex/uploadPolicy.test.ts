import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel.d.ts";
import schema from "./schema";
import {
  detectImageContentType,
  isImageVerificationValid,
  MAX_IMAGE_BYTES,
  validateImageUploadDeclaration,
} from "./uploadPolicy";

const modules = import.meta.glob("./**/*.*s");

afterEach(() => {
  vi.restoreAllMocks();
});

const recordVerifiedImage = makeFunctionReference<
  "mutation",
  { storageId: Id<"_storage">; claimToken: string; kind: "ro_photo"; detectedContentType: string },
  { recorded: boolean; reason?: string }
>("uploadPolicy:recordVerifiedImage");

const discardRejectedImage = makeFunctionReference<
  "mutation",
  { storageId: Id<"_storage">; claimToken: string },
  null
>("uploadPolicy:discardRejectedImage");

const expirePendingImageUpload = makeFunctionReference<
  "mutation",
  { claimToken: string },
  null
>("uploadPolicy:expirePendingImageUpload");

async function addOrganization(
  t: ReturnType<typeof convexTest>,
  tokenIdentifier: string,
) {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { tokenIdentifier, name: tokenIdentifier });
    const orgId = await ctx.db.insert("organizations", {
      name: tokenIdentifier,
      ownerId: userId,
      taxRate: 0,
      laborRate: 100,
      bayCount: 1,
      bayNames: ["Bay 1"],
      isActive: true,
    });
    await ctx.db.patch(userId, { currentOrgId: orgId });
    await ctx.db.insert("orgMembers", { orgId, userId, role: "owner", isActive: true });
    return { orgId, userId };
  });
}

async function addPendingUpload(
  t: ReturnType<typeof convexTest>,
  owner: { orgId: Id<"organizations">; userId: Id<"users"> },
  claimToken: string,
  storageId?: Id<"_storage">,
) {
  await t.run((ctx) => ctx.db.insert("pendingImageUploads", {
    claimToken,
    storageId,
    orgId: owner.orgId,
    userId: owner.userId,
    kind: "ro_photo",
    contentType: "image/jpeg",
    size: 4,
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + 60_000,
  }));
}

describe("image upload policy", () => {
  test("detects image content from magic bytes rather than metadata", () => {
    expect(detectImageContentType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectImageContentType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectImageContentType(new TextEncoder().encode("<html>not an image</html>"))).toBeNull();
  });
  test("accepts a declared image within the limit", () => {
    expect(() =>
      validateImageUploadDeclaration("ro_photo", "image/jpeg", MAX_IMAGE_BYTES),
    ).not.toThrow();
  });

  test("rejects unsupported MIME types", () => {
    expect(() =>
      validateImageUploadDeclaration("inspection_photo", "text/html", 128),
    ).toThrow("Unsupported image type");
  });

  test("rejects empty and oversized files", () => {
    expect(() =>
      validateImageUploadDeclaration("recommendation_photo", "image/png", 0),
    ).toThrow("10 MiB or smaller");
    expect(() =>
      validateImageUploadDeclaration("recommendation_photo", "image/png", MAX_IMAGE_BYTES + 1),
    ).toThrow("10 MiB or smaller");
  });

  test("requires verification from the attaching organization", () => {
    const firstOrg = "org-1" as never;
    const secondOrg = "org-2" as never;
    const verification = {
      orgId: firstOrg,
      kind: "ro_photo" as const,
      contentType: "image/jpeg",
      size: 128,
    };

    expect(isImageVerificationValid(verification, {
      orgId: firstOrg,
      kind: "ro_photo",
      contentType: "image/jpeg",
      size: 128,
    })).toBe(true);
    expect(isImageVerificationValid(verification, {
      orgId: secondOrg,
      kind: "ro_photo",
      contentType: "image/jpeg",
      size: 128,
    })).toBe(false);
  });

  test("prevents another organization from replacing or deleting a verified upload", async () => {
    const t = convexTest(schema, modules);
    const firstToken = "https://testissuer|upload-owner";
    const secondToken = "https://testissuer|upload-attacker";
    const firstOwner = await addOrganization(t, firstToken);
    const secondOwner = await addOrganization(t, secondToken);
    const storageId = await t.run(async (ctx) => {
      const id = await ctx.storage.store(
        new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])], { type: "image/jpeg" }),
      );
      await ctx.db.patch(id, { contentType: "image/jpeg" });
      return id;
    });
    await addPendingUpload(t, firstOwner, "owner-claim", storageId);

    await expect(t.withIdentity({ tokenIdentifier: firstToken }).mutation(recordVerifiedImage, {
      storageId,
      claimToken: "owner-claim",
      kind: "ro_photo",
      detectedContentType: "image/jpeg",
    })).resolves.toEqual({ recorded: true });

    await addPendingUpload(t, secondOwner, "attacker-claim", storageId);
    await expect(t.withIdentity({ tokenIdentifier: secondToken }).mutation(recordVerifiedImage, {
      storageId,
      claimToken: "attacker-claim",
      kind: "ro_photo",
      detectedContentType: "image/jpeg",
    })).resolves.toEqual({ recorded: false, reason: "Image belongs to another organization" });
    await expect(t.withIdentity({ tokenIdentifier: secondToken }).mutation(discardRejectedImage, {
      storageId,
      claimToken: "attacker-claim",
    })).rejects.toThrow("Image belongs to another organization");

    await t.run(async (ctx) => {
      const metadata = await ctx.db.system.get(storageId);
      const verification = await ctx.db.query("verifiedImageUploads")
        .withIndex("by_storage", (query) => query.eq("storageId", storageId))
        .unique();
      expect(metadata).not.toBeNull();
      expect(verification?.orgId).toBe(firstOwner.orgId);
    });
  });

  test("prevents another organization from claiming or deleting a pending upload", async () => {
    const t = convexTest(schema, modules);
    const ownerToken = "https://testissuer|pending-owner";
    const attackerToken = "https://testissuer|pending-attacker";
    const owner = await addOrganization(t, ownerToken);
    await addOrganization(t, attackerToken);
    const storageId = await t.run(async (ctx) => {
      const id = await ctx.storage.store(
        new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])], { type: "image/jpeg" }),
      );
      await ctx.db.patch(id, { contentType: "image/jpeg" });
      return id;
    });
    await addPendingUpload(t, owner, "pending-owner-claim", storageId);

    await expect(t.withIdentity({ tokenIdentifier: attackerToken }).mutation(recordVerifiedImage, {
      storageId,
      claimToken: "pending-owner-claim",
      kind: "ro_photo",
      detectedContentType: "image/jpeg",
    })).resolves.toEqual({
      recorded: false,
      reason: "Upload claim is invalid or belongs to another user",
    });
    await expect(t.withIdentity({ tokenIdentifier: attackerToken }).mutation(discardRejectedImage, {
      storageId,
      claimToken: "pending-owner-claim",
    })).rejects.toThrow("Upload claim is invalid or belongs to another user");

    await t.run(async (ctx) => {
      expect(await ctx.db.system.get(storageId)).not.toBeNull();
      expect(await ctx.db.query("pendingImageUploads")
        .withIndex("by_claim_token", (query) => query.eq("claimToken", "pending-owner-claim"))
        .unique()).not.toBeNull();
      expect(await ctx.db.query("verifiedImageUploads")
        .withIndex("by_storage", (query) => query.eq("storageId", storageId))
        .unique()).toBeNull();
    });
  });

  test("deletes an abandoned unverified upload", async () => {
    const t = convexTest(schema, modules);
    const tokenIdentifier = "https://testissuer|upload-cleanup";
    const owner = await addOrganization(t, tokenIdentifier);
    const storageId = await t.run((ctx) => ctx.storage.store(
      new Blob([new TextEncoder().encode("not an image")], { type: "image/jpeg" }),
    ));
    await addPendingUpload(t, owner, "cleanup-claim", storageId);

    await t.withIdentity({ tokenIdentifier }).mutation(discardRejectedImage, {
      storageId,
      claimToken: "cleanup-claim",
    });

    await t.run(async (ctx) => {
      expect(await ctx.db.system.get(storageId)).toBeNull();
      expect(await ctx.db.query("verifiedImageUploads")
        .withIndex("by_storage", (query) => query.eq("storageId", storageId))
        .unique()).toBeNull();
    });
  });

  test("expires abandoned allocations without deleting active uploads", async () => {
    const t = convexTest(schema, modules);
    const owner = await addOrganization(t, "https://testissuer|upload-expiry");
    const [expiredStorageId, activeStorageId] = await t.run(async (ctx) => Promise.all([
      ctx.storage.store(new Blob(["expired"], { type: "image/jpeg" })),
      ctx.storage.store(new Blob(["active"], { type: "image/jpeg" })),
    ]));
    await addPendingUpload(t, owner, "expired-claim", expiredStorageId);
    await addPendingUpload(t, owner, "active-claim", activeStorageId);
    await t.run(async (ctx) => {
      const expiredClaim = await ctx.db.query("pendingImageUploads")
        .withIndex("by_claim_token", (query) => query.eq("claimToken", "expired-claim"))
        .unique();
      await ctx.db.patch(expiredClaim!._id, { expiresAt: Date.now() - 1 });
    });

    await t.mutation(expirePendingImageUpload, { claimToken: "expired-claim" });
    await t.mutation(expirePendingImageUpload, { claimToken: "active-claim" });

    await t.run(async (ctx) => {
      expect(await ctx.db.system.get(expiredStorageId)).toBeNull();
      expect(await ctx.db.system.get(activeStorageId)).not.toBeNull();
      expect(await ctx.db.query("pendingImageUploads")
        .withIndex("by_claim_token", (query) => query.eq("claimToken", "expired-claim"))
        .unique()).toBeNull();
      expect(await ctx.db.query("pendingImageUploads")
        .withIndex("by_claim_token", (query) => query.eq("claimToken", "active-claim"))
        .unique()).not.toBeNull();
    });
  });

  test("deletes unsupported content rejected by action-level inspection", async () => {
    const t = convexTest(schema, modules);
    const tokenIdentifier = "https://testissuer|inspection-cleanup";
    const owner = await addOrganization(t, tokenIdentifier);
    const unsupportedBytes = new TextEncoder().encode("nope");
    const storageId = await t.run((ctx) => ctx.storage.store(
      new Blob([unsupportedBytes], { type: "image/jpeg" }),
    ));
    await addPendingUpload(t, owner, "inspection-cleanup-claim", storageId);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(unsupportedBytes));

    await expect(t.withIdentity({ tokenIdentifier }).action(api.uploadPolicy.verifyImageUpload, {
      storageId,
      claimToken: "inspection-cleanup-claim",
      kind: "ro_photo",
    })).rejects.toThrow("not a supported image");

    await t.run(async (ctx) => {
      expect(await ctx.db.system.get(storageId)).toBeNull();
      expect(await ctx.db.query("pendingImageUploads")
        .withIndex("by_claim_token", (query) => query.eq("claimToken", "inspection-cleanup-claim"))
        .unique()).toBeNull();
    });
  });

  test("prevents a valid claim from verifying or deleting another same-shaped object", async () => {
    const t = convexTest(schema, modules);
    const tokenIdentifier = "https://testissuer|object-binding";
    const owner = await addOrganization(t, tokenIdentifier);
    const [claimedStorageId, otherStorageId] = await t.run(async (ctx) => Promise.all([
      ctx.storage.store(new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])], { type: "image/jpeg" })),
      ctx.storage.store(new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])], { type: "image/jpeg" })),
    ]));
    await addPendingUpload(t, owner, "bound-claim", claimedStorageId);
    const authed = t.withIdentity({ tokenIdentifier });

    await expect(authed.mutation(recordVerifiedImage, {
      storageId: otherStorageId,
      claimToken: "bound-claim",
      kind: "ro_photo",
      detectedContentType: "image/jpeg",
    })).resolves.toEqual({ recorded: false, reason: "Upload claim belongs to another object" });
    await expect(authed.mutation(discardRejectedImage, {
      storageId: otherStorageId,
      claimToken: "bound-claim",
    })).rejects.toThrow("Upload claim belongs to another object");

    await t.run(async (ctx) => {
      expect(await ctx.db.system.get(claimedStorageId)).not.toBeNull();
      expect(await ctx.db.system.get(otherStorageId)).not.toBeNull();
    });
  });
});