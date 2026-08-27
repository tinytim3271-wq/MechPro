/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as actionAuth from "../actionAuth.js";
import type * as admin from "../admin.js";
import type * as ai from "../ai.js";
import type * as aiDataBoundary from "../aiDataBoundary.js";
import type * as aiPolicy from "../aiPolicy.js";
import type * as authorization from "../authorization.js";
import type * as bookings from "../bookings.js";
import type * as carfax from "../carfax.js";
import type * as carfaxInternal from "../carfaxInternal.js";
import type * as commerce from "../commerce.js";
import type * as commerceHelpers from "../commerceHelpers.js";
import type * as customers from "../customers.js";
import type * as dashboard from "../dashboard.js";
import type * as deductions from "../deductions.js";
import type * as deviceSession from "../deviceSession.js";
import type * as duplicates from "../duplicates.js";
import type * as email from "../email.js";
import type * as employees from "../employees.js";
import type * as estimates from "../estimates.js";
import type * as http from "../http.js";
import type * as import_ from "../import.js";
import type * as importRecords from "../importRecords.js";
import type * as inspections from "../inspections.js";
import type * as invoiceTechPay from "../invoiceTechPay.js";
import type * as invoices from "../invoices.js";
import type * as jobTracking from "../jobTracking.js";
import type * as locations from "../locations.js";
import type * as marketing from "../marketing.js";
import type * as marketingData from "../marketingData.js";
import type * as messages from "../messages.js";
import type * as messaging from "../messaging.js";
import type * as nhtsa from "../nhtsa.js";
import type * as notifications from "../notifications.js";
import type * as orgSanitize from "../orgSanitize.js";
import type * as organizations from "../organizations.js";
import type * as parts from "../parts.js";
import type * as partsAI from "../partsAI.js";
import type * as payroll from "../payroll.js";
import type * as portal from "../portal.js";
import type * as pushIdentities from "../pushIdentities.js";
import type * as pushNotifications from "../pushNotifications.js";
import type * as recommendations from "../recommendations.js";
import type * as repairOrders from "../repairOrders.js";
import type * as reports from "../reports.js";
import type * as roPhotos from "../roPhotos.js";
import type * as stripe from "../stripe.js";
import type * as stripeWebhookValidation from "../stripeWebhookValidation.js";
import type * as techNotifications from "../techNotifications.js";
import type * as timeclock from "../timeclock.js";
import type * as uploadPolicy from "../uploadPolicy.js";
import type * as users from "../users.js";
import type * as vehicles from "../vehicles.js";
import type * as vin from "../vin.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  actionAuth: typeof actionAuth;
  admin: typeof admin;
  ai: typeof ai;
  aiDataBoundary: typeof aiDataBoundary;
  aiPolicy: typeof aiPolicy;
  authorization: typeof authorization;
  bookings: typeof bookings;
  carfax: typeof carfax;
  carfaxInternal: typeof carfaxInternal;
  commerce: typeof commerce;
  commerceHelpers: typeof commerceHelpers;
  customers: typeof customers;
  dashboard: typeof dashboard;
  deductions: typeof deductions;
  deviceSession: typeof deviceSession;
  duplicates: typeof duplicates;
  email: typeof email;
  employees: typeof employees;
  estimates: typeof estimates;
  http: typeof http;
  import: typeof import_;
  importRecords: typeof importRecords;
  inspections: typeof inspections;
  invoiceTechPay: typeof invoiceTechPay;
  invoices: typeof invoices;
  jobTracking: typeof jobTracking;
  locations: typeof locations;
  marketing: typeof marketing;
  marketingData: typeof marketingData;
  messages: typeof messages;
  messaging: typeof messaging;
  nhtsa: typeof nhtsa;
  notifications: typeof notifications;
  orgSanitize: typeof orgSanitize;
  organizations: typeof organizations;
  parts: typeof parts;
  partsAI: typeof partsAI;
  payroll: typeof payroll;
  portal: typeof portal;
  pushIdentities: typeof pushIdentities;
  pushNotifications: typeof pushNotifications;
  recommendations: typeof recommendations;
  repairOrders: typeof repairOrders;
  reports: typeof reports;
  roPhotos: typeof roPhotos;
  stripe: typeof stripe;
  stripeWebhookValidation: typeof stripeWebhookValidation;
  techNotifications: typeof techNotifications;
  timeclock: typeof timeclock;
  uploadPolicy: typeof uploadPolicy;
  users: typeof users;
  vehicles: typeof vehicles;
  vin: typeof vin;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
