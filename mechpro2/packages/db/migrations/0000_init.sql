CREATE TYPE "public"."authorization_method" AS ENUM('in_person_signature', 'online_approval', 'phone', 'email');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('pending', 'confirmed', 'declined', 'converted');--> statement-breakpoint
CREATE TYPE "public"."customer_source" AS ENUM('walk_in', 'phone', 'online', 'referral', 'other');--> statement-breakpoint
CREATE TYPE "public"."deduction_status" AS ENUM('active', 'paid_off', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."deduction_type" AS ENUM('advance', 'uniform', 'tools', 'other');--> statement-breakpoint
CREATE TYPE "public"."employment_type" AS ENUM('w2', '1099');--> statement-breakpoint
CREATE TYPE "public"."inspection_result" AS ENUM('ok', 'needs_attention', 'critical', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."inventory_movement_reason" AS ENUM('purchase_received', 'consumed_by_repair_order', 'returned_from_repair_order', 'manual_adjustment', 'stock_count', 'merge_consolidation');--> statement-breakpoint
CREATE TYPE "public"."invite_status" AS ENUM('pending', 'accepted', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'sent', 'partial', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'service_writer', 'mechanic', 'mobile_mechanic');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'card', 'check', 'other');--> statement-breakpoint
CREATE TYPE "public"."photo_type" AS ENUM('intake', 'damage', 'during', 'complete');--> statement-breakpoint
CREATE TYPE "public"."purchase_order_status" AS ENUM('draft', 'sent', 'partial', 'received', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."recommendation_status" AS ENUM('pending', 'approved', 'declined');--> statement-breakpoint
CREATE TYPE "public"."repair_order_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."repair_order_status" AS ENUM('estimate', 'approved', 'in_progress', 'waiting_parts', 'completed', 'invoiced', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."social_platform" AS ENUM('facebook', 'instagram', 'google', 'general');--> statement-breakpoint
CREATE TYPE "public"."social_post_status" AS ENUM('draft', 'scheduled', 'published');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'none');--> statement-breakpoint
CREATE TYPE "public"."tech_location_status" AS ENUM('en_route', 'on_site', 'left_site');--> statement-breakpoint
CREATE TABLE "bays" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"location_id" uuid,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"address" text,
	"city" text,
	"state" text,
	"zip" text,
	"tax_rate_bps" integer,
	"labor_rate_cents" bigint,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid,
	"invite_email" text,
	"invite_status" "invite_status" DEFAULT 'pending' NOT NULL,
	"invited_at" timestamp with time zone,
	"joined_at" timestamp with time zone,
	"role" "member_role" NOT NULL,
	"has_admin_access" boolean DEFAULT false NOT NULL,
	"employment_type" "employment_type",
	"location_id" uuid,
	"hourly_rate_cents" bigint,
	"labor_commission_bps" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"phone" text,
	"email" text,
	"address" text,
	"city" text,
	"state" text,
	"zip" text,
	"logo_url" text,
	"timezone" text DEFAULT 'America/Chicago' NOT NULL,
	"tax_rate_bps" integer DEFAULT 0 NOT NULL,
	"labor_rate_cents" bigint DEFAULT 0 NOT NULL,
	"shop_supply_fee_enabled" boolean DEFAULT false NOT NULL,
	"shop_supply_fee_bps" integer DEFAULT 0 NOT NULL,
	"shop_supply_fee_cap_cents" bigint,
	"hazmat_fee_enabled" boolean DEFAULT false NOT NULL,
	"hazmat_fee_bps" integer DEFAULT 0 NOT NULL,
	"hazmat_fee_cap_cents" bigint,
	"sms_enabled" boolean DEFAULT false NOT NULL,
	"sms_template_start" text,
	"sms_template_complete" text,
	"carfax_enabled" boolean DEFAULT false NOT NULL,
	"carfax_location_id" text,
	"carfax_secret_arn" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"stripe_price_id" text,
	"status" "subscription_status" DEFAULT 'none' NOT NULL,
	"current_period_end" timestamp with time zone,
	"trial_ends_at" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"seats" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cognito_sub" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"phone" text,
	"avatar_url" text,
	"current_org_id" uuid,
	"current_location_id" uuid,
	"free_access_until" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"full_name" text GENERATED ALWAYS AS (trim(both from coalesce(first_name, '') || ' ' || coalesce(last_name, ''))) STORED NOT NULL,
	"phone" text,
	"email" text,
	"address" text,
	"city" text,
	"state" text,
	"zip" text,
	"notes" text,
	"source" "customer_source",
	"sms_opt_out" boolean DEFAULT false NOT NULL,
	"email_opt_out" boolean DEFAULT false NOT NULL,
	"last_visit_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"year" integer,
	"make" text,
	"model" text,
	"trim" text,
	"vin" text,
	"license_plate" text,
	"license_state" text,
	"color" text,
	"engine" text,
	"transmission" text,
	"mileage" integer,
	"notes" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"part_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" "inventory_movement_reason" NOT NULL,
	"reference_type" text,
	"reference_id" uuid,
	"unit_cost_cents" bigint,
	"note" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_movements_delta_nonzero" CHECK (delta <> 0)
);
--> statement-breakpoint
CREATE TABLE "parts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"part_number" text,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"cost_cents" bigint DEFAULT 0 NOT NULL,
	"price_cents" bigint DEFAULT 0 NOT NULL,
	"stock_on_hand" integer DEFAULT 0 NOT NULL,
	"is_inventoried" boolean DEFAULT true NOT NULL,
	"reorder_point" integer DEFAULT 0 NOT NULL,
	"reorder_quantity" integer DEFAULT 0 NOT NULL,
	"preferred_supplier_id" uuid,
	"bin_location" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parts_stock_non_negative" CHECK (stock_on_hand >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"part_id" uuid,
	"description" text NOT NULL,
	"part_number" text,
	"quantity_ordered" integer NOT NULL,
	"quantity_received" integer DEFAULT 0 NOT NULL,
	"unit_cost_cents" bigint DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_order_lines_quantities" CHECK (quantity_ordered > 0 and quantity_received >= 0 and quantity_received <= quantity_ordered)
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"supplier_id" uuid,
	"po_number" text NOT NULL,
	"status" "purchase_order_status" DEFAULT 'draft' NOT NULL,
	"notes" text,
	"generated_by_ai" boolean DEFAULT false NOT NULL,
	"ordered_at" timestamp with time zone,
	"expected_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"phone" text,
	"email" text,
	"address" text,
	"account_number" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspection_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"inspection_id" uuid NOT NULL,
	"category" text NOT NULL,
	"label" text NOT NULL,
	"result" "inspection_result" DEFAULT 'not_applicable' NOT NULL,
	"notes" text,
	"measurement" text,
	"file_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"repair_order_id" uuid NOT NULL,
	"template_name" text DEFAULT 'multi_point' NOT NULL,
	"performed_by_member_id" uuid,
	"notes" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labor_matrix" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"hours_hundredths" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repair_order_fees" (
	"id" uuid PRIMARY KEY NOT NULL,
	"repair_order_id" uuid NOT NULL,
	"label" text NOT NULL,
	"kind" text DEFAULT 'flat' NOT NULL,
	"rate_bps" integer,
	"cap_cents" bigint,
	"amount_cents" bigint DEFAULT 0 NOT NULL,
	"is_taxable" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ro_fees_kind" CHECK (kind in ('flat', 'percent'))
);
--> statement-breakpoint
CREATE TABLE "repair_order_labor_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"repair_order_id" uuid NOT NULL,
	"description" text NOT NULL,
	"hours_hundredths" integer DEFAULT 0 NOT NULL,
	"rate_cents" bigint DEFAULT 0 NOT NULL,
	"amount_cents" bigint DEFAULT 0 NOT NULL,
	"performed_by_member_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repair_order_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"repair_order_id" uuid NOT NULL,
	"author_member_id" uuid,
	"author_kind" text NOT NULL,
	"body" text NOT NULL,
	"read_by_office_at" timestamp with time zone,
	"read_by_tech_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ro_messages_author_kind" CHECK (author_kind in ('office', 'tech', 'system'))
);
--> statement-breakpoint
CREATE TABLE "repair_order_part_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"repair_order_id" uuid NOT NULL,
	"part_id" uuid,
	"description" text NOT NULL,
	"part_number" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_cost_cents" bigint DEFAULT 0 NOT NULL,
	"unit_price_cents" bigint DEFAULT 0 NOT NULL,
	"amount_cents" bigint DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ro_part_lines_quantity_positive" CHECK (quantity > 0)
);
--> statement-breakpoint
CREATE TABLE "repair_order_photos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"repair_order_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"photo_type" "photo_type" NOT NULL,
	"caption" text,
	"uploaded_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repair_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"location_id" uuid,
	"ro_number" integer NOT NULL,
	"customer_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"assigned_to_member_id" uuid,
	"bay_id" uuid,
	"status" "repair_order_status" DEFAULT 'estimate' NOT NULL,
	"priority" "repair_order_priority" DEFAULT 'normal' NOT NULL,
	"is_mobile" boolean DEFAULT false NOT NULL,
	"service_address" text,
	"service_lat" double precision,
	"service_lng" double precision,
	"tech_location_status" "tech_location_status",
	"complaint" text,
	"cause" text,
	"correction" text,
	"mileage_in" integer,
	"mileage_out" integer,
	"scheduled_at" timestamp with time zone,
	"promised_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"authorization_method" "authorization_method",
	"authorized_by_name" text,
	"authorized_at" timestamp with time zone,
	"signature_file_id" uuid,
	"approval_token_hash" text,
	"approval_token_expires_at" timestamp with time zone,
	"labor_subtotal_cents" bigint DEFAULT 0 NOT NULL,
	"parts_subtotal_cents" bigint DEFAULT 0 NOT NULL,
	"fees_subtotal_cents" bigint DEFAULT 0 NOT NULL,
	"discount_cents" bigint DEFAULT 0 NOT NULL,
	"tax_rate_bps" integer DEFAULT 0 NOT NULL,
	"tax_cents" bigint DEFAULT 0 NOT NULL,
	"total_cents" bigint DEFAULT 0 NOT NULL,
	"carfax_reported_at" timestamp with time zone,
	"ai_workflow_status" text,
	"ai_ambiguity_flag" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repair_orders_totals_non_negative" CHECK (total_cents >= 0)
);
--> statement-breakpoint
CREATE TABLE "technician_recommendations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"repair_order_id" uuid NOT NULL,
	"recommended_by_member_id" uuid,
	"title" text NOT NULL,
	"details" text,
	"urgency" text,
	"estimated_hours_hundredths" integer,
	"estimated_parts_cents" bigint,
	"status" "recommendation_status" DEFAULT 'pending' NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"method" "payment_method" NOT NULL,
	"amount_cents" bigint NOT NULL,
	"reference" text,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by_user_id" uuid,
	"stripe_payment_intent_id" text,
	"stripe_checkout_session_id" text,
	"reversed_at" timestamp with time zone,
	"reversal_of_payment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_payments_amount_nonzero" CHECK (amount_cents <> 0)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"location_id" uuid,
	"invoice_number" integer NOT NULL,
	"repair_order_id" uuid,
	"customer_id" uuid NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"labor_subtotal_cents" bigint DEFAULT 0 NOT NULL,
	"parts_subtotal_cents" bigint DEFAULT 0 NOT NULL,
	"fees_subtotal_cents" bigint DEFAULT 0 NOT NULL,
	"discount_cents" bigint DEFAULT 0 NOT NULL,
	"tax_rate_bps" integer DEFAULT 0 NOT NULL,
	"tax_cents" bigint DEFAULT 0 NOT NULL,
	"total_cents" bigint DEFAULT 0 NOT NULL,
	"amount_paid_cents" bigint DEFAULT 0 NOT NULL,
	"balance_cents" bigint GENERATED ALWAYS AS (total_cents - amount_paid_cents) STORED,
	"issued_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"voided_by_user_id" uuid,
	"void_reason" text,
	"notes" text,
	"public_token_hash" text,
	"public_token_expires_at" timestamp with time zone,
	"reminders_enabled" boolean DEFAULT true NOT NULL,
	"reminder_count" integer DEFAULT 0 NOT NULL,
	"last_reminder_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_amount_paid_range" CHECK (amount_paid_cents >= 0),
	CONSTRAINT "invoices_no_overpayment" CHECK (amount_paid_cents <= total_cents)
);
--> statement-breakpoint
CREATE TABLE "deduction_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"deduction_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deduction_payments_amount_positive" CHECK (amount_cents > 0)
);
--> statement-breakpoint
CREATE TABLE "location_pings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"repair_order_id" uuid,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"accuracy_meters" double precision,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_deductions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"type" "deduction_type" NOT NULL,
	"description" text,
	"total_cents" bigint NOT NULL,
	"per_paycheck_cents" bigint DEFAULT 0 NOT NULL,
	"paid_cents" bigint DEFAULT 0 NOT NULL,
	"remaining_cents" bigint GENERATED ALWAYS AS (total_cents - paid_cents) STORED,
	"status" "deduction_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_deductions_paid_range" CHECK (paid_cents between 0 and total_cents)
);
--> statement-breakpoint
CREATE TABLE "technician_pay_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"repair_order_id" uuid NOT NULL,
	"invoice_id" uuid,
	"labor_hours_hundredths" integer DEFAULT 0 NOT NULL,
	"labor_billed_cents" bigint DEFAULT 0 NOT NULL,
	"pay_cents" bigint DEFAULT 0 NOT NULL,
	"employment_type" "employment_type",
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"clock_in_at" timestamp with time zone NOT NULL,
	"clock_out_at" timestamp with time zone,
	"total_minutes" integer,
	"clock_in_lat" double precision,
	"clock_in_lng" double precision,
	"clock_out_lat" double precision,
	"clock_out_lng" double precision,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_entries_interval" CHECK (clock_out_at is null or clock_out_at >= clock_in_at)
);
--> statement-breakpoint
CREATE TABLE "booking_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"location_id" uuid,
	"customer_name" text NOT NULL,
	"phone" text,
	"email" text,
	"vehicle_year" integer,
	"vehicle_make" text,
	"vehicle_model" text,
	"vehicle_vin" text,
	"concern" text,
	"preferred_at" timestamp with time zone,
	"status" "booking_status" DEFAULT 'pending' NOT NULL,
	"converted_repair_order_id" uuid,
	"matched_customer_id" uuid,
	"matched_vehicle_id" uuid,
	"submitter_ip_hash" text,
	"reviewed_at" timestamp with time zone,
	"review_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_posts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"platform" "social_platform" NOT NULL,
	"topic" text,
	"content" text NOT NULL,
	"hashtags" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "social_post_status" DEFAULT 'draft' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"published_at" timestamp with time zone,
	"generated_by_ai" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"ip_hash" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "counters_org_id_name_pk" PRIMARY KEY("org_id","name")
);
--> statement-breakpoint
CREATE TABLE "device_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"device_token_hash" text NOT NULL,
	"label" text,
	"user_agent" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"s3_bucket" text NOT NULL,
	"s3_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" bigint,
	"checksum_sha256" text,
	"purpose" text NOT NULL,
	"original_filename" text,
	"uploaded_by_user_id" uuid,
	"uploaded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"recipient_member_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link_path" text,
	"metadata" jsonb,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"last_error" text,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"completed_at" timestamp with time zone,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_jobs_attempts" CHECK (attempts >= 0 and attempts <= max_attempts)
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid,
	"endpoint" text NOT NULL,
	"p256dh_key" text NOT NULL,
	"auth_key" text NOT NULL,
	"user_agent" text,
	"last_used_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bays" ADD CONSTRAINT "bays_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bays" ADD CONSTRAINT "bays_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_current_org_id_organizations_id_fk" FOREIGN KEY ("current_org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_current_location_id_locations_id_fk" FOREIGN KEY ("current_location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parts" ADD CONSTRAINT "parts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parts" ADD CONSTRAINT "parts_preferred_supplier_id_suppliers_id_fk" FOREIGN KEY ("preferred_supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_items" ADD CONSTRAINT "inspection_items_inspection_id_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_repair_order_id_repair_orders_id_fk" FOREIGN KEY ("repair_order_id") REFERENCES "public"."repair_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_performed_by_member_id_org_members_id_fk" FOREIGN KEY ("performed_by_member_id") REFERENCES "public"."org_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labor_matrix" ADD CONSTRAINT "labor_matrix_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order_fees" ADD CONSTRAINT "repair_order_fees_repair_order_id_repair_orders_id_fk" FOREIGN KEY ("repair_order_id") REFERENCES "public"."repair_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order_labor_lines" ADD CONSTRAINT "repair_order_labor_lines_repair_order_id_repair_orders_id_fk" FOREIGN KEY ("repair_order_id") REFERENCES "public"."repair_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order_labor_lines" ADD CONSTRAINT "repair_order_labor_lines_performed_by_member_id_org_members_id_fk" FOREIGN KEY ("performed_by_member_id") REFERENCES "public"."org_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order_messages" ADD CONSTRAINT "repair_order_messages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order_messages" ADD CONSTRAINT "repair_order_messages_repair_order_id_repair_orders_id_fk" FOREIGN KEY ("repair_order_id") REFERENCES "public"."repair_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order_messages" ADD CONSTRAINT "repair_order_messages_author_member_id_org_members_id_fk" FOREIGN KEY ("author_member_id") REFERENCES "public"."org_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order_part_lines" ADD CONSTRAINT "repair_order_part_lines_repair_order_id_repair_orders_id_fk" FOREIGN KEY ("repair_order_id") REFERENCES "public"."repair_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order_part_lines" ADD CONSTRAINT "repair_order_part_lines_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order_photos" ADD CONSTRAINT "repair_order_photos_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order_photos" ADD CONSTRAINT "repair_order_photos_repair_order_id_repair_orders_id_fk" FOREIGN KEY ("repair_order_id") REFERENCES "public"."repair_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order_photos" ADD CONSTRAINT "repair_order_photos_uploaded_by_member_id_org_members_id_fk" FOREIGN KEY ("uploaded_by_member_id") REFERENCES "public"."org_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_assigned_to_member_id_org_members_id_fk" FOREIGN KEY ("assigned_to_member_id") REFERENCES "public"."org_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_bay_id_bays_id_fk" FOREIGN KEY ("bay_id") REFERENCES "public"."bays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technician_recommendations" ADD CONSTRAINT "technician_recommendations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technician_recommendations" ADD CONSTRAINT "technician_recommendations_repair_order_id_repair_orders_id_fk" FOREIGN KEY ("repair_order_id") REFERENCES "public"."repair_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technician_recommendations" ADD CONSTRAINT "technician_recommendations_recommended_by_member_id_org_members_id_fk" FOREIGN KEY ("recommended_by_member_id") REFERENCES "public"."org_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_repair_order_id_repair_orders_id_fk" FOREIGN KEY ("repair_order_id") REFERENCES "public"."repair_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_voided_by_user_id_users_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deduction_payments" ADD CONSTRAINT "deduction_payments_deduction_id_payroll_deductions_id_fk" FOREIGN KEY ("deduction_id") REFERENCES "public"."payroll_deductions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_pings" ADD CONSTRAINT "location_pings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_pings" ADD CONSTRAINT "location_pings_member_id_org_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."org_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_pings" ADD CONSTRAINT "location_pings_repair_order_id_repair_orders_id_fk" FOREIGN KEY ("repair_order_id") REFERENCES "public"."repair_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_deductions" ADD CONSTRAINT "payroll_deductions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_deductions" ADD CONSTRAINT "payroll_deductions_member_id_org_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."org_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technician_pay_records" ADD CONSTRAINT "technician_pay_records_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technician_pay_records" ADD CONSTRAINT "technician_pay_records_member_id_org_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."org_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technician_pay_records" ADD CONSTRAINT "technician_pay_records_repair_order_id_repair_orders_id_fk" FOREIGN KEY ("repair_order_id") REFERENCES "public"."repair_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technician_pay_records" ADD CONSTRAINT "technician_pay_records_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_member_id_org_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."org_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_converted_repair_order_id_repair_orders_id_fk" FOREIGN KEY ("converted_repair_order_id") REFERENCES "public"."repair_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_matched_customer_id_customers_id_fk" FOREIGN KEY ("matched_customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_matched_vehicle_id_vehicles_id_fk" FOREIGN KEY ("matched_vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counters" ADD CONSTRAINT "counters_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_member_id_org_members_id_fk" FOREIGN KEY ("recipient_member_id") REFERENCES "public"."org_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_jobs" ADD CONSTRAINT "outbox_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bays_org_idx" ON "bays" USING btree ("org_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "bays_org_name_key" ON "bays" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "locations_org_idx" ON "locations" USING btree ("org_id","sort_order");--> statement-breakpoint
CREATE INDEX "org_members_org_idx" ON "org_members" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "org_members_user_idx" ON "org_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_members_org_user_key" ON "org_members" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "org_members_invite_email_idx" ON "org_members" USING btree ("invite_email");--> statement-breakpoint
CREATE INDEX "organizations_owner_idx" ON "organizations" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_org_key" ON "subscriptions" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_key" ON "subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "subscriptions_stripe_customer_idx" ON "subscriptions" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_cognito_sub_key" ON "users" USING btree ("cognito_sub");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_current_org_idx" ON "users" USING btree ("current_org_id");--> statement-breakpoint
CREATE INDEX "customers_org_idx" ON "customers" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "customers_org_name_idx" ON "customers" USING btree ("org_id","last_name","first_name");--> statement-breakpoint
CREATE INDEX "customers_org_phone_idx" ON "customers" USING btree ("org_id","phone");--> statement-breakpoint
CREATE INDEX "customers_org_email_idx" ON "customers" USING btree ("org_id","email");--> statement-breakpoint
CREATE INDEX "customers_name_trgm_idx" ON "customers" USING gin ("full_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "vehicles_org_idx" ON "vehicles" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "vehicles_customer_idx" ON "vehicles" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_org_vin_key" ON "vehicles" USING btree ("org_id","vin");--> statement-breakpoint
CREATE INDEX "vehicles_org_plate_idx" ON "vehicles" USING btree ("org_id","license_plate");--> statement-breakpoint
CREATE INDEX "inventory_movements_part_idx" ON "inventory_movements" USING btree ("part_id","created_at");--> statement-breakpoint
CREATE INDEX "inventory_movements_org_idx" ON "inventory_movements" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "inventory_movements_reference_idx" ON "inventory_movements" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_movements_dedupe_key" ON "inventory_movements" USING btree ("part_id","reason","reference_type","reference_id") WHERE reference_id is not null;--> statement-breakpoint
CREATE INDEX "parts_org_idx" ON "parts" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "parts_org_part_number_key" ON "parts" USING btree ("org_id","part_number");--> statement-breakpoint
CREATE INDEX "parts_org_name_idx" ON "parts" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "parts_name_trgm_idx" ON "parts" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "parts_low_stock_idx" ON "parts" USING btree ("org_id") WHERE is_inventoried and stock_on_hand <= reorder_point;--> statement-breakpoint
CREATE INDEX "purchase_order_lines_po_idx" ON "purchase_order_lines" USING btree ("purchase_order_id","sort_order");--> statement-breakpoint
CREATE INDEX "purchase_orders_org_idx" ON "purchase_orders" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_org_number_key" ON "purchase_orders" USING btree ("org_id","po_number");--> statement-breakpoint
CREATE INDEX "suppliers_org_idx" ON "suppliers" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "inspection_items_inspection_idx" ON "inspection_items" USING btree ("inspection_id","sort_order");--> statement-breakpoint
CREATE INDEX "inspections_ro_idx" ON "inspections" USING btree ("repair_order_id");--> statement-breakpoint
CREATE INDEX "labor_matrix_org_idx" ON "labor_matrix" USING btree ("org_id","category");--> statement-breakpoint
CREATE INDEX "ro_fees_ro_idx" ON "repair_order_fees" USING btree ("repair_order_id","sort_order");--> statement-breakpoint
CREATE INDEX "ro_labor_lines_ro_idx" ON "repair_order_labor_lines" USING btree ("repair_order_id","sort_order");--> statement-breakpoint
CREATE INDEX "ro_labor_lines_member_idx" ON "repair_order_labor_lines" USING btree ("performed_by_member_id");--> statement-breakpoint
CREATE INDEX "ro_messages_ro_idx" ON "repair_order_messages" USING btree ("repair_order_id","created_at");--> statement-breakpoint
CREATE INDEX "ro_part_lines_ro_idx" ON "repair_order_part_lines" USING btree ("repair_order_id","sort_order");--> statement-breakpoint
CREATE INDEX "ro_part_lines_part_idx" ON "repair_order_part_lines" USING btree ("part_id");--> statement-breakpoint
CREATE INDEX "ro_photos_ro_idx" ON "repair_order_photos" USING btree ("repair_order_id","photo_type");--> statement-breakpoint
CREATE UNIQUE INDEX "repair_orders_org_number_key" ON "repair_orders" USING btree ("org_id","ro_number");--> statement-breakpoint
CREATE INDEX "repair_orders_org_status_idx" ON "repair_orders" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "repair_orders_customer_idx" ON "repair_orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "repair_orders_vehicle_idx" ON "repair_orders" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "repair_orders_assigned_idx" ON "repair_orders" USING btree ("assigned_to_member_id");--> statement-breakpoint
CREATE INDEX "repair_orders_org_location_idx" ON "repair_orders" USING btree ("org_id","location_id");--> statement-breakpoint
CREATE INDEX "repair_orders_scheduled_idx" ON "repair_orders" USING btree ("org_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "tech_recommendations_ro_idx" ON "technician_recommendations" USING btree ("repair_order_id","status");--> statement-breakpoint
CREATE INDEX "invoice_payments_invoice_idx" ON "invoice_payments" USING btree ("invoice_id","paid_at");--> statement-breakpoint
CREATE INDEX "invoice_payments_org_idx" ON "invoice_payments" USING btree ("org_id","paid_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_payments_stripe_intent_key" ON "invoice_payments" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_payments_stripe_session_key" ON "invoice_payments" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_org_number_key" ON "invoices" USING btree ("org_id","invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_repair_order_key" ON "invoices" USING btree ("repair_order_id");--> statement-breakpoint
CREATE INDEX "invoices_org_status_idx" ON "invoices" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "invoices_customer_idx" ON "invoices" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "invoices_org_location_idx" ON "invoices" USING btree ("org_id","location_id");--> statement-breakpoint
CREATE INDEX "invoices_due_idx" ON "invoices" USING btree ("org_id","due_at") WHERE status in ('sent', 'partial');--> statement-breakpoint
CREATE INDEX "deduction_payments_deduction_idx" ON "deduction_payments" USING btree ("deduction_id","paid_at");--> statement-breakpoint
CREATE INDEX "location_pings_member_idx" ON "location_pings" USING btree ("member_id","recorded_at");--> statement-breakpoint
CREATE INDEX "location_pings_org_idx" ON "location_pings" USING btree ("org_id","recorded_at");--> statement-breakpoint
CREATE INDEX "payroll_deductions_member_idx" ON "payroll_deductions" USING btree ("member_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "tech_pay_ro_member_key" ON "technician_pay_records" USING btree ("repair_order_id","member_id");--> statement-breakpoint
CREATE INDEX "tech_pay_member_idx" ON "technician_pay_records" USING btree ("member_id","earned_at");--> statement-breakpoint
CREATE INDEX "tech_pay_org_idx" ON "technician_pay_records" USING btree ("org_id","earned_at");--> statement-breakpoint
CREATE INDEX "time_entries_member_idx" ON "time_entries" USING btree ("member_id","clock_in_at");--> statement-breakpoint
CREATE INDEX "time_entries_org_idx" ON "time_entries" USING btree ("org_id","clock_in_at");--> statement-breakpoint
CREATE UNIQUE INDEX "time_entries_one_open_per_member" ON "time_entries" USING btree ("member_id") WHERE clock_out_at is null;--> statement-breakpoint
CREATE INDEX "booking_requests_org_status_idx" ON "booking_requests" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "booking_requests_org_created_idx" ON "booking_requests" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "booking_requests_ip_idx" ON "booking_requests" USING btree ("submitter_ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "social_posts_org_idx" ON "social_posts" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "social_posts_scheduled_idx" ON "social_posts" USING btree ("scheduled_for") WHERE status = 'scheduled';--> statement-breakpoint
CREATE INDEX "audit_log_org_idx" ON "audit_log" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "device_sessions_token_key" ON "device_sessions" USING btree ("device_token_hash");--> statement-breakpoint
CREATE INDEX "device_sessions_user_idx" ON "device_sessions" USING btree ("user_id","last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "files_bucket_key_key" ON "files" USING btree ("s3_bucket","s3_key");--> statement-breakpoint
CREATE INDEX "files_org_idx" ON "files" USING btree ("org_id","purpose");--> statement-breakpoint
CREATE INDEX "files_pending_idx" ON "files" USING btree ("created_at") WHERE uploaded_at is null;--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "notifications" USING btree ("recipient_member_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("recipient_member_id") WHERE read_at is null;--> statement-breakpoint
CREATE INDEX "outbox_jobs_claim_idx" ON "outbox_jobs" USING btree ("run_at") WHERE status = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_jobs_idempotency_key" ON "outbox_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "outbox_jobs_org_idx" ON "outbox_jobs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rate_limits_expiry_idx" ON "rate_limits" USING btree ("expires_at");