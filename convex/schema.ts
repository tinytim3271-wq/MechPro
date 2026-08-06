import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ─── Multi-tenant orgs ────────────────────────────────────────────────────
  organizations: defineTable({
    name: v.string(),
    ownerId: v.id("users"),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    taxRate: v.number(), // percentage e.g. 8.25
    laborRate: v.number(), // default $/hr
    bayCount: v.number(), // number of service bays
    bayNames: v.array(v.string()), // e.g. ["Bay 1","Bay 2"...]
    isActive: v.boolean(),
    // SMS settings
    smsEnabled: v.optional(v.boolean()),
    smsAutoOnComplete: v.optional(v.boolean()), // auto-send SMS when RO is completed
    smsAutoOnStart: v.optional(v.boolean()), // auto-send SMS when work begins (in_progress)
    twilioAccountSid: v.optional(v.string()),
    twilioAuthToken: v.optional(v.string()),
    twilioPhoneNumber: v.optional(v.string()), // Twilio phone number to send from
    // Editable SMS templates (use {{name}}, {{vehicle}}, {{roNumber}}, {{shopName}}, {{shopPhone}})
    smsTemplateStart: v.optional(v.string()),
    smsTemplateComplete: v.optional(v.string()),
    // Carfax Service Network settings
    carfaxEnabled: v.optional(v.boolean()),
    carfaxPartnerKey: v.optional(v.string()), // Carfax partner API key
    carfaxLocationId: v.optional(v.string()), // Carfax-assigned location/shop ID
    // Auto-applied shop fees (percent of parts/labor subtotal, optional cap)
    shopSupplyFeeEnabled: v.optional(v.boolean()),
    shopSupplyFeePercent: v.optional(v.number()),
    shopSupplyFeeCap: v.optional(v.number()),
    hazmatFeeEnabled: v.optional(v.boolean()),
    hazmatFeePercent: v.optional(v.number()),
    hazmatFeeCap: v.optional(v.number()),
  }).index("by_owner", ["ownerId"]),

  // ─── Users / staff ────────────────────────────────────────────────────────
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    currentOrgId: v.optional(v.id("organizations")),
    currentLocationId: v.optional(v.id("locations")), // active location filter (null = all)
    commerceCustomerId: v.optional(v.string()), // Hercules Commerce customer ID
    activeDeviceSession: v.optional(v.string()), // Current device session token for single-device lock
    freeAccessUntil: v.optional(v.string()), // ISO 8601 UTC — admin-granted free access expiry
    // legacy fields from previous schema versions
    role: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  // org membership — one user can belong to multiple orgs
  orgMembers: defineTable({
    orgId: v.id("organizations"),
    userId: v.id("users"),
    role: v.union(
      v.literal("owner"),
      v.literal("admin"),
      v.literal("service_writer"),
      v.literal("mechanic"),
      v.literal("mobile_mechanic")
    ),
    isActive: v.boolean(),
    locationId: v.optional(v.id("locations")), // primary location for this member
    hasAdminAccess: v.optional(v.boolean()), // grants admin privileges (reports, employee mgmt) regardless of role
    inviteEmail: v.optional(v.string()),
    inviteStatus: v.optional(
      v.union(v.literal("pending"), v.literal("accepted"), v.literal("declined"))
    ),
    // W2 = regular employee, 1099 = independent contractor
    employmentType: v.optional(v.union(v.literal("w2"), v.literal("1099"))),
  })
    .index("by_org", ["orgId"])
    .index("by_user", ["userId"])
    .index("by_org_user", ["orgId", "userId"])
    .index("by_invite_email", ["inviteEmail"]),

  // ─── Shop Locations ──────────────────────────────────────────────────────
  // Multiple physical locations within an organization
  locations: defineTable({
    orgId: v.id("organizations"),
    name: v.string(), // e.g. "Main Shop", "Downtown Branch"
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    phone: v.optional(v.string()),
    bayCount: v.number(),
    bayNames: v.array(v.string()),
    isActive: v.boolean(),
    sortOrder: v.number(),
  })
    .index("by_org", ["orgId"]),

  // ─── Payroll Deductions & Advances ───────────────────────────────────────
  // Tracks advances, uniform charges, tool costs, or any other payroll deduction.
  // Each deduction can be applied across multiple paychecks or taken in one lump sum.
  payrollDeductions: defineTable({
    orgId: v.id("organizations"),
    memberId: v.id("orgMembers"),       // employee being deducted
    type: v.union(
      v.literal("advance"),
      v.literal("uniform"),
      v.literal("tools"),
      v.literal("other"),
    ),
    description: v.string(),            // e.g. "Cash advance 7/15", "Work shirts x3"
    totalAmount: v.number(),            // total amount to be deducted
    amountPerCheck: v.optional(v.number()), // per paycheck amount (null = deduct full amount in one check)
    amountApplied: v.number(),          // how much has been deducted so far
    status: v.union(
      v.literal("active"),
      v.literal("paid_off"),
      v.literal("cancelled"),
    ),
    createdAt: v.string(),              // ISO timestamp
    notes: v.optional(v.string()),      // optional admin notes
  })
    .index("by_org", ["orgId"])
    .index("by_member", ["memberId"])
    .index("by_member_status", ["memberId", "status"]),

  // ─── Deduction Payments (ledger) ─────────────────────────────────────────
  // Each payment applied against a deduction (enables tracking history).
  deductionPayments: defineTable({
    orgId: v.id("organizations"),
    deductionId: v.id("payrollDeductions"),
    memberId: v.id("orgMembers"),
    amount: v.number(),
    appliedAt: v.string(),              // ISO timestamp
    note: v.optional(v.string()),       // e.g. "Pay period 7/1 – 7/15"
  })
    .index("by_deduction", ["deductionId"])
    .index("by_member", ["memberId"]),

  // ─── Tech Pay Records ─────────────────────────────────────────────────────
  // Created automatically when an invoice is marked as paid.
  // One record per RO per tech — private to the tech, visible to managers.
  techPayRecords: defineTable({
    orgId: v.id("organizations"),
    memberId: v.id("orgMembers"),   // the tech who did the work
    userId: v.id("users"),          // denormalized for fast queries
    roId: v.id("repairOrders"),
    invoiceId: v.id("invoices"),
    roNumber: v.string(),
    customerName: v.string(),
    vehicleSummary: v.string(),
    // Labor lines credited to this tech
    laborLines: v.array(
      v.object({
        description: v.string(),
        laborHours: v.number(),
        laborRate: v.number(),
        amount: v.number(), // laborHours * laborRate
      })
    ),
    totalHours: v.number(),
    totalEarned: v.number(), // sum of all line amounts
    paidAt: v.string(),       // ISO timestamp when invoice was paid
    employmentType: v.optional(v.union(v.literal("w2"), v.literal("1099"))), // snapshot at time of pay
  })
    .index("by_org", ["orgId"])
    .index("by_member", ["memberId"])
    .index("by_member_paidAt", ["memberId", "paidAt"])
    .index("by_org_paidAt", ["orgId", "paidAt"])
    .index("by_ro", ["roId"]),

  // ─── Customers ────────────────────────────────────────────────────────────
  customers: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    notes: v.optional(v.string()),
    source: v.optional(v.string()), // walk-in, phone, online, referral
    lastVisit: v.optional(v.string()),
    smsOptOut: v.optional(v.boolean()), // customer opted out of SMS notifications
  })
    .index("by_org", ["orgId"])
    .index("by_org_name", ["orgId", "name"])
    .searchIndex("search_email", { searchField: "email", filterFields: ["orgId"] }),

  // ─── Vehicles ─────────────────────────────────────────────────────────────
  vehicles: defineTable({
    orgId: v.id("organizations"),
    customerId: v.id("customers"),
    year: v.string(),
    make: v.string(),
    model: v.string(),
    trim: v.optional(v.string()),
    vin: v.optional(v.string()),
    licensePlate: v.optional(v.string()),
    color: v.optional(v.string()),
    mileageIn: v.optional(v.number()),
    engine: v.optional(v.string()),
    transmission: v.optional(v.string()),
    notes: v.optional(v.string()),
  })
    .index("by_org", ["orgId"])
    .index("by_customer", ["customerId"])
    .index("by_vin", ["vin"]),

  // ─── Repair Orders ────────────────────────────────────────────────────────
  repairOrders: defineTable({
    orgId: v.id("organizations"),
    locationId: v.optional(v.id("locations")), // which shop location this RO belongs to
    roNumber: v.string(), // e.g. "RO-0042"
    customerId: v.id("customers"),
    vehicleId: v.id("vehicles"),
    assignedTo: v.optional(v.id("orgMembers")), // tech or mobile mechanic
    bayName: v.optional(v.string()), // "Bay 3" or "Mobile"
    isMobile: v.boolean(),
    mobileAddress: v.optional(v.string()),
    serviceAddress: v.optional(v.string()),
    serviceCity: v.optional(v.string()),
    serviceState: v.optional(v.string()),
    serviceZip: v.optional(v.string()),
    serviceLat: v.optional(v.number()), // geocoded job site latitude
    serviceLng: v.optional(v.number()), // geocoded job site longitude
    status: v.union(
      v.literal("estimate"),
      v.literal("approved"),
      v.literal("in_progress"),
      v.literal("waiting_parts"),
      v.literal("completed"),
      v.literal("invoiced"),
      v.literal("cancelled")
    ),
    priority: v.union(v.literal("low"), v.literal("normal"), v.literal("high")),
    complaint: v.string(), // customer complaint
    cause: v.optional(v.string()), // tech diagnosis
    correction: v.optional(v.string()), // work performed
    mileageIn: v.optional(v.number()),
    mileageOut: v.optional(v.number()),
    scheduledAt: v.optional(v.string()),
    startedAt: v.optional(v.string()),
    completedAt: v.optional(v.string()),
    promisedAt: v.optional(v.string()),
    laborLines: v.array(
      v.object({
        description: v.string(),
        laborHours: v.number(),
        laborRate: v.number(),
        techNotes: v.optional(v.string()),
      })
    ),
    partLines: v.array(
      v.object({
        partId: v.optional(v.string()),
        partNumber: v.optional(v.string()),
        description: v.string(),
        quantity: v.number(),
        unitCost: v.number(),
        unitPrice: v.number(),
      })
    ),
    shopFees: v.array(
      v.object({
        description: v.string(),
        amount: v.number(),
      })
    ),
    subtotal: v.number(),
    taxAmount: v.number(),
    totalAmount: v.number(),
    internalNotes: v.optional(v.string()),
    authorizationName: v.optional(v.string()),
    authorizationMethod: v.optional(v.string()),
    customerSignature: v.optional(v.string()), // base64 data URL of drawn signature
    signedAt: v.optional(v.string()), // ISO 8601 UTC
    approvalToken: v.optional(v.string()), // secret token for public estimate approval links
    carfaxReportedAt: v.optional(v.string()), // ISO 8601 UTC — when submitted to Carfax
    // Tech location tracking status
    techLocationStatus: v.optional(v.union(
      v.literal("en_route"),
      v.literal("on_site"),
      v.literal("left_site")
    )),
    techLocationUpdatedAt: v.optional(v.string()), // ISO 8601 UTC
    // AI-generated workflow data
    diagnosticChecklist: v.optional(v.array(
      v.object({
        item: v.string(),
        category: v.optional(v.union(
          v.literal("visual"),
          v.literal("electrical"),
          v.literal("mechanical"),
          v.literal("scan_tool"),
          v.literal("measurement")
        )),
        toolsRequired: v.optional(v.array(v.string())),
        verificationCriteria: v.optional(v.string()),
        completed: v.boolean(),
        notes: v.optional(v.string()),
      })
    )),
    repairChecklist: v.optional(v.array(
      v.object({
        step: v.number(),
        title: v.string(),
        details: v.string(),
        toolsRequired: v.optional(v.array(v.string())),
        torqueSpecs: v.optional(v.string()),
        warning: v.optional(v.string()),
        completed: v.boolean(),
        notes: v.optional(v.string()),
      })
    )),
    // AI-determined probable causes with ranked likelihood
    probableCauses: v.optional(v.array(
      v.object({
        cause: v.string(),
        likelihood: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
        explanation: v.string(),
      })
    )),
    // AI-suggested additional services (upsell)
    recommendedServices: v.optional(v.array(
      v.object({
        service: v.string(),
        reason: v.string(),
        estimatedCost: v.optional(v.number()),
      })
    )),
    aiWorkflowStatus: v.optional(v.union(
      v.literal("pending"),
      v.literal("generating"),
      v.literal("completed"),
      v.literal("failed")
    )),
    // Flag when AI couldn't confidently interpret symptoms
    aiAmbiguityFlag: v.optional(v.string()),
  })
    .index("by_org", ["orgId"])
    .index("by_org_status", ["orgId", "status"])
    .index("by_customer", ["customerId"])
    .index("by_vehicle", ["vehicleId"])
    .index("by_roNumber", ["roNumber"]),

  // ─── Invoices ─────────────────────────────────────────────────────────────
  invoices: defineTable({
    orgId: v.id("organizations"),
    locationId: v.optional(v.id("locations")),
    roId: v.id("repairOrders"),
    customerId: v.id("customers"),
    invoiceNumber: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("sent"),
      v.literal("partial"),
      v.literal("paid"),
      v.literal("void")
    ),
    issuedAt: v.string(),
    dueAt: v.optional(v.string()),
    subtotal: v.number(),
    taxAmount: v.number(),
    total: v.number(),
    amountPaid: v.number(),
    payments: v.array(
      v.object({
        method: v.union(
          v.literal("cash"),
          v.literal("card"),
          v.literal("check"),
          v.literal("other")
        ),
        amount: v.number(),
        paidAt: v.string(),
        reference: v.optional(v.string()),
      })
    ),
    notes: v.optional(v.string()),
    // Reminder tracking
    remindersEnabled: v.optional(v.boolean()), // default true when not set
    lastReminderSentAt: v.optional(v.string()), // ISO 8601
    remindersSentCount: v.optional(v.number()),
  })
    .index("by_org", ["orgId"])
    .index("by_ro", ["roId"])
    .index("by_customer", ["customerId"])
    .index("by_org_status", ["orgId", "status"]),

  // ─── Parts / Inventory ────────────────────────────────────────────────────
  parts: defineTable({
    orgId: v.id("organizations"),
    sku: v.optional(v.string()),
    partNumber: v.optional(v.string()),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    stockQty: v.number(),
    lowStockThreshold: v.number(),
    unitCost: v.number(),
    unitPrice: v.number(),
    supplier: v.optional(v.string()),
    location: v.optional(v.string()), // shelf/bin
  })
    .index("by_org", ["orgId"])
    .index("by_org_name", ["orgId", "name"])
    .searchIndex("search_name", { searchField: "name", filterFields: ["orgId"] }),

  // ─── Labor Matrix ─────────────────────────────────────────────────────────
  laborMatrix: defineTable({
    orgId: v.id("organizations"),
    serviceCategory: v.string(), // "Brakes", "Oil Change", etc.
    serviceDescription: v.string(),
    flatRateHours: v.number(),
    notes: v.optional(v.string()),
  })
    .index("by_org", ["orgId"])
    .index("by_org_category", ["orgId", "serviceCategory"]),

  // ─── GPS / Location pings ─────────────────────────────────────────────────
  locationPings: defineTable({
    orgId: v.id("organizations"),
    memberId: v.id("orgMembers"),
    lat: v.number(),
    lng: v.number(),
    accuracy: v.optional(v.number()),
    timestamp: v.string(),
    roId: v.optional(v.id("repairOrders")),
  })
    .index("by_org", ["orgId"])
    .index("by_member", ["memberId"])
    .index("by_member_timestamp", ["memberId", "timestamp"]),

  // ─── Time Clock Entries ───────────────────────────────────────────────────
  timeEntries: defineTable({
    orgId: v.id("organizations"),
    memberId: v.id("orgMembers"),
    clockInAt: v.string(),       // ISO timestamp
    clockOutAt: v.optional(v.string()), // null if still clocked in
    clockInLat: v.optional(v.number()),
    clockInLng: v.optional(v.number()),
    clockOutLat: v.optional(v.number()),
    clockOutLng: v.optional(v.number()),
    totalHours: v.optional(v.number()), // computed on clock-out
    notes: v.optional(v.string()),
  })
    .index("by_org", ["orgId"])
    .index("by_member", ["memberId"])
    .index("by_member_clockIn", ["memberId", "clockInAt"]),

  // ─── Suppliers ────────────────────────────────────────────────────────────
  suppliers: defineTable({
    orgId: v.id("organizations"),
    name: v.string(),
    contactName: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    website: v.optional(v.string()),
    accountNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    isActive: v.boolean(),
  })
    .index("by_org", ["orgId"])
    .index("by_org_name", ["orgId", "name"]),

  // ─── Purchase Orders ──────────────────────────────────────────────────────
  purchaseOrders: defineTable({
    orgId: v.id("organizations"),
    poNumber: v.string(), // e.g. "PO-0001"
    supplierId: v.id("suppliers"),
    status: v.union(
      v.literal("draft"),
      v.literal("sent"),
      v.literal("partial"),
      v.literal("received"),
      v.literal("cancelled")
    ),
    lines: v.array(
      v.object({
        partId: v.optional(v.string()),
        partNumber: v.optional(v.string()),
        description: v.string(),
        qtyOrdered: v.number(),
        qtyReceived: v.number(),
        unitCost: v.number(),
      })
    ),
    subtotal: v.number(),
    notes: v.optional(v.string()),
    aiGenerated: v.optional(v.boolean()),
    aiReason: v.optional(v.string()),
    orderedAt: v.optional(v.string()),
    expectedAt: v.optional(v.string()),
    receivedAt: v.optional(v.string()),
    createdBy: v.id("users"),
  })
    .index("by_org", ["orgId"])
    .index("by_org_status", ["orgId", "status"])
    .index("by_supplier", ["supplierId"]),

  // ─── Import History ───────────────────────────────────────────────────────
  importHistory: defineTable({
    orgId: v.id("organizations"),
    importType: v.union(
      v.literal("customers"),
      v.literal("vehicles"),
      v.literal("parts")
    ),
    fileName: v.string(),
    totalRows: v.number(),
    imported: v.number(),
    skipped: v.number(),
    duplicates: v.number(),
    noCustomerMatch: v.optional(v.number()),
    importedAt: v.string(),
    importedBy: v.id("users"),
  })
    .index("by_org", ["orgId"])
    .index("by_org_importedAt", ["orgId", "importedAt"]),

  // ─── RO Photos (documentation) ──────────────────────────────────────────────
  roPhotos: defineTable({
    orgId: v.id("organizations"),
    roId: v.id("repairOrders"),
    storageId: v.id("_storage"),
    caption: v.optional(v.string()),
    uploadedBy: v.id("users"),
    uploadedAt: v.string(),
    photoType: v.optional(
      v.union(
        v.literal("intake"),
        v.literal("damage"),
        v.literal("during"),
        v.literal("complete")
      )
    ),
  })
    .index("by_ro", ["roId"])
    .index("by_org", ["orgId"]),

  // ─── Booking Requests (public, no auth required to submit) ──────────────────
  bookingRequests: defineTable({
    orgId: v.id("organizations"),
    // Customer info (entered in form)
    customerName: v.string(),
    customerPhone: v.string(),
    customerEmail: v.optional(v.string()),
    // Vehicle info
    vehicleYear: v.optional(v.string()),
    vehicleMake: v.optional(v.string()),
    vehicleModel: v.optional(v.string()),
    vehicleVin: v.optional(v.string()),
    // Appointment request
    serviceDescription: v.string(),
    preferredDate: v.string(), // ISO date string YYYY-MM-DD
    preferredTime: v.optional(v.string()), // e.g. "09:00"
    notes: v.optional(v.string()),
    // Status managed by staff
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("declined"),
      v.literal("converted") // turned into an RO
    ),
    staffNotes: v.optional(v.string()),
    submittedAt: v.string(), // ISO 8601
  })
    .index("by_org", ["orgId"])
    .index("by_org_status", ["orgId", "status"])
    .index("by_org_submittedAt", ["orgId", "submittedAt"]),

  // ─── Vehicle Inspections ─────────────────────────────────────────────────
  inspections: defineTable({
    orgId: v.id("organizations"),
    roId: v.id("repairOrders"),
    templateName: v.string(),
    completedBy: v.optional(v.id("orgMembers")),
    completedAt: v.optional(v.string()),
    status: v.union(v.literal("in_progress"), v.literal("completed")),
    notes: v.optional(v.string()),
  })
    .index("by_ro", ["roId"])
    .index("by_org", ["orgId"]),

  inspectionItems: defineTable({
    inspectionId: v.id("inspections"),
    orgId: v.id("organizations"),
    category: v.string(),
    itemName: v.string(),
    result: v.union(v.literal("ok"), v.literal("needs_attention"), v.literal("critical"), v.literal("na")),
    notes: v.optional(v.string()),
    photoStorageId: v.optional(v.id("_storage")),
    sortOrder: v.number(),
  })
    .index("by_inspection", ["inspectionId"])
    .index("by_org", ["orgId"]),

  // ─── Device Sessions (multi-device support, max 3 per user) ────────────────
  deviceSessions: defineTable({
    userId: v.id("users"),
    sessionToken: v.string(),
    deviceName: v.string(), // e.g. "Chrome on Windows", "Safari on iPhone"
    registeredAt: v.string(), // ISO 8601
    lastActiveAt: v.string(), // ISO 8601
  })
    .index("by_user", ["userId"])
    .index("by_user_token", ["userId", "sessionToken"]),

  // ─── Social / Marketing Posts ─────────────────────────────────────────────
  socialPosts: defineTable({
    orgId: v.id("organizations"),
    platform: v.union(
      v.literal("facebook"),
      v.literal("instagram"),
      v.literal("google"),
      v.literal("general")
    ),
    content: v.string(),
    status: v.union(v.literal("draft"), v.literal("scheduled"), v.literal("published")),
    scheduledAt: v.optional(v.string()),
    publishedAt: v.optional(v.string()),
    tags: v.array(v.string()),
    createdBy: v.id("users"),
    imageUrl: v.optional(v.string()),
  })
    .index("by_org", ["orgId"])
    .index("by_org_status", ["orgId", "status"]),

  // ─── RO Messages (tech <-> office communication per repair order) ───────────
  roMessages: defineTable({
    orgId: v.id("organizations"),
    roId: v.id("repairOrders"),
    senderId: v.id("orgMembers"),
    senderName: v.string(),
    senderRole: v.string(), // "mechanic", "mobile_mechanic", "service_writer", "admin", "owner"
    body: v.string(),
    readByOffice: v.boolean(),
    readByTech: v.boolean(),
  })
    .index("by_ro", ["roId"])
    .index("by_org", ["orgId"]),

  // ─── Office Notifications (real-time alerts for tech tracking etc.) ──────────
  officeNotifications: defineTable({
    orgId: v.id("organizations"),
    roId: v.optional(v.id("repairOrders")),
    type: v.union(
      v.literal("tech_arrived"),
      v.literal("tech_left"),
      v.literal("tech_en_route")
    ),
    title: v.string(),
    body: v.string(),
    techMemberId: v.optional(v.id("orgMembers")),
    isRead: v.boolean(),
    createdAt: v.string(), // ISO 8601
  })
    .index("by_org", ["orgId"])
    .index("by_org_unread", ["orgId", "isRead"]),

  // ─── Tech Notifications (job assignments, updates from office) ──────────────
  techNotifications: defineTable({
    orgId: v.id("organizations"),
    memberId: v.id("orgMembers"), // the tech receiving the notification
    roId: v.optional(v.id("repairOrders")),
    type: v.union(
      v.literal("job_assigned"),
      v.literal("job_updated"),
      v.literal("general")
    ),
    title: v.string(),
    body: v.string(),
    isRead: v.boolean(),
    createdAt: v.string(), // ISO 8601
  })
    .index("by_member", ["memberId"])
    .index("by_member_unread", ["memberId", "isRead"]),

  // ─── Tech Recommendations (additional work suggested by mechanics) ─────────
  techRecommendations: defineTable({
    orgId: v.id("organizations"),
    roId: v.id("repairOrders"),
    memberId: v.id("orgMembers"), // the tech who made the recommendation
    techName: v.string(),
    title: v.string(), // short summary e.g. "Replace front brake pads"
    description: v.string(), // detailed explanation
    urgency: v.union(
      v.literal("immediate"),
      v.literal("soon"),
      v.literal("future")
    ),
    photoIds: v.array(v.id("_storage")), // attached photos showing the issue
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("declined")
    ),
    createdAt: v.string(), // ISO 8601
    reviewedAt: v.optional(v.string()),
    reviewedBy: v.optional(v.id("orgMembers")),
  })
    .index("by_ro", ["roId"])
    .index("by_org", ["orgId"])
    .index("by_org_status", ["orgId", "status"]),

  // ─── Push notification identities ──────────────────────────────────────────
  pushIdentities: defineTable({
    secret: v.string(), // Subscription secret (unique per device)
    visitorId: v.string(), // User identifier for targeting notifications
  })
    .index("by_secret", ["secret"])
    .index("by_visitorId", ["visitorId"]),
});
