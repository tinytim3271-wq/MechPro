import { relations } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  auditColumns,
  bps,
  employmentTypeEnum,
  inviteStatusEnum,
  memberRoleEnum,
  money,
  primaryId,
  subscriptionStatusEnum,
  ts,
} from "./_shared.js";

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: primaryId(),

    /** Cognito `sub` claim. Replaces the Hercules OIDC tokenIdentifier. */
    cognitoSub: text("cognito_sub").notNull(),

    /** Stored lowercased; the domain layer normalizes before writing. */
    email: text("email").notNull(),
    name: text("name"),
    phone: text("phone"),
    avatarUrl: text("avatar_url"),

    currentOrgId: uuid("current_org_id").references(
      (): AnyPgColumn => organizations.id,
      { onDelete: "set null" },
    ),
    currentLocationId: uuid("current_location_id").references(
      (): AnyPgColumn => locations.id,
      { onDelete: "set null" },
    ),

    /** Complimentary access granted by a platform owner. */
    freeAccessUntil: ts("free_access_until"),

    lastSeenAt: ts("last_seen_at"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("users_cognito_sub_key").on(table.cognitoSub),
    uniqueIndex("users_email_key").on(table.email),
    index("users_current_org_idx").on(table.currentOrgId),
  ],
);

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

export const organizations = pgTable(
  "organizations",
  {
    id: primaryId(),
    name: text("name").notNull(),

    /**
     * `restrict` rather than `cascade`: deleting a user must not silently take
     * a shop's entire history with it. The reverse pointer, `users.current_org_id`,
     * is nullable, so the two tables can reference each other without needing a
     * deferred constraint.
     */
    ownerId: uuid("owner_id")
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "restrict" }),

    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    logoUrl: text("logo_url"),
    timezone: text("timezone").notNull().default("America/Chicago"),

    /** Rates as basis points and cents, never floats. */
    taxRateBps: bps("tax_rate_bps").notNull().default(0),
    laborRateCents: money("labor_rate_cents").notNull().default(0),

    shopSupplyFeeEnabled: boolean("shop_supply_fee_enabled")
      .notNull()
      .default(false),
    shopSupplyFeeBps: bps("shop_supply_fee_bps").notNull().default(0),
    shopSupplyFeeCapCents: money("shop_supply_fee_cap_cents"),

    hazmatFeeEnabled: boolean("hazmat_fee_enabled").notNull().default(false),
    hazmatFeeBps: bps("hazmat_fee_bps").notNull().default(0),
    hazmatFeeCapCents: money("hazmat_fee_cap_cents"),

    /** Templates for the device SMS composer. No server-side SMS sending. */
    smsEnabled: boolean("sms_enabled").notNull().default(false),
    smsTemplateStart: text("sms_template_start"),
    smsTemplateComplete: text("sms_template_complete"),

    carfaxEnabled: boolean("carfax_enabled").notNull().default(false),
    carfaxLocationId: text("carfax_location_id"),
    /**
     * The Carfax partner key lives in AWS Secrets Manager; only its ARN is
     * stored here. The original kept the key itself in a row that was returned
     * to every browser, so a query bug leaked the credential. A reference
     * cannot leak anything on its own.
     */
    carfaxSecretArn: text("carfax_secret_arn"),

    isActive: boolean("is_active").notNull().default(true),
    ...auditColumns(),
  },
  (table) => [index("organizations_owner_idx").on(table.ownerId)],
);

// ---------------------------------------------------------------------------
// Locations and bays
// ---------------------------------------------------------------------------

export const locations = pgTable(
  "locations",
  {
    id: primaryId(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),

    taxRateBps: bps("tax_rate_bps"),
    laborRateCents: money("labor_rate_cents"),

    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...auditColumns(),
  },
  (table) => [index("locations_org_idx").on(table.orgId, table.sortOrder)],
);

/**
 * Service bays as rows rather than a JSON array of names on the organization.
 * A repair order can then reference a bay by id, which makes "what is in bay 3"
 * a join instead of a string match.
 */
export const bays = pgTable(
  "bays",
  {
    id: primaryId(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").references(() => locations.id, {
      onDelete: "cascade",
    }),

    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...auditColumns(),
  },
  (table) => [
    index("bays_org_idx").on(table.orgId, table.sortOrder),
    uniqueIndex("bays_org_name_key").on(table.orgId, table.name),
  ],
);

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

export const orgMembers = pgTable(
  "org_members",
  {
    id: primaryId(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /**
     * Null until an invited person signs up.
     *
     * The original pointed pending invites at the *inviter's* user id, so an
     * unclaimed invite looked like a real membership for the wrong person.
     */
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),

    /** Lowercased. Used to claim the invite at first sign-in. */
    inviteEmail: text("invite_email"),
    inviteStatus: inviteStatusEnum("invite_status").notNull().default("pending"),
    invitedAt: ts("invited_at"),
    joinedAt: ts("joined_at"),

    role: memberRoleEnum("role").notNull(),
    /** Elevates a non-admin role to administrative permissions. */
    hasAdminAccess: boolean("has_admin_access").notNull().default(false),

    employmentType: employmentTypeEnum("employment_type"),
    locationId: uuid("location_id").references(() => locations.id, {
      onDelete: "set null",
    }),

    /** Technician pay: either an hourly rate or a share of billed labor. */
    hourlyRateCents: money("hourly_rate_cents"),
    laborCommissionBps: bps("labor_commission_bps"),

    isActive: boolean("is_active").notNull().default(true),
    ...auditColumns(),
  },
  (table) => [
    index("org_members_org_idx").on(table.orgId),
    index("org_members_user_idx").on(table.userId),
    uniqueIndex("org_members_org_user_key").on(table.orgId, table.userId),
    index("org_members_invite_email_idx").on(table.inviteEmail),
  ],
);

// ---------------------------------------------------------------------------
// Subscription billing (Stripe, replacing Hercules Commerce)
// ---------------------------------------------------------------------------

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: primaryId(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripePriceId: text("stripe_price_id"),

    status: subscriptionStatusEnum("status").notNull().default("none"),
    currentPeriodEnd: ts("current_period_end"),
    trialEndsAt: ts("trial_ends_at"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),

    seats: integer("seats").notNull().default(1),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("subscriptions_org_key").on(table.orgId),
    uniqueIndex("subscriptions_stripe_subscription_key").on(
      table.stripeSubscriptionId,
    ),
    index("subscriptions_stripe_customer_idx").on(table.stripeCustomerId),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ one, many }) => ({
  currentOrg: one(organizations, {
    fields: [users.currentOrgId],
    references: [organizations.id],
  }),
  memberships: many(orgMembers),
}));

export const organizationsRelations = relations(
  organizations,
  ({ one, many }) => ({
    owner: one(users, {
      fields: [organizations.ownerId],
      references: [users.id],
    }),
    locations: many(locations),
    bays: many(bays),
    members: many(orgMembers),
    subscription: one(subscriptions),
  }),
);

export const locationsRelations = relations(locations, ({ one, many }) => ({
  org: one(organizations, {
    fields: [locations.orgId],
    references: [organizations.id],
  }),
  bays: many(bays),
}));

export const orgMembersRelations = relations(orgMembers, ({ one }) => ({
  org: one(organizations, {
    fields: [orgMembers.orgId],
    references: [organizations.id],
  }),
  user: one(users, { fields: [orgMembers.userId], references: [users.id] }),
  location: one(locations, {
    fields: [orgMembers.locationId],
    references: [locations.id],
  }),
}));
