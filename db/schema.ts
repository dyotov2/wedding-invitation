import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const importBatches = sqliteTable("import_batches", {
  id: text("id").primaryKey(),
  sourceName: text("source_name").notNull(),
  sourceHash: text("source_hash").notNull().unique(),
  status: text("status").notNull().default("completed"),
  rowCount: integer("row_count").notNull().default(0),
  householdCount: integer("household_count").notNull().default(0),
  guestCount: integer("guest_count").notNull().default(0),
  importedBy: text("imported_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  check("import_batches_status_check", sql`${table.status} in ('completed', 'failed')`),
]);

export const importPreviews = sqliteTable("import_previews", {
  id: text("id").primaryKey(),
  sourceHash: text("source_hash").notNull(),
  previewedBy: text("previewed_by").notNull(),
  expiresAt: integer("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("import_previews_expiry_idx").on(table.expiresAt),
]);

export const households = sqliteTable("households", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  externalId: text("external_id").notNull().unique(),
  linkToken: text("link_token").notNull().unique(),
  shortCode: text("short_code").notNull().unique(),
  householdName: text("household_name").notNull(),
  greeting: text("greeting").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  responseVersion: integer("response_version").notNull().default(0),
  importBatchId: text("import_batch_id").references(() => importBatches.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("households_active_name_idx").on(table.active, table.householdName),
  uniqueIndex("households_external_id_nocase_unique").on(sql`upper(${table.externalId})`),
]);

export const guests = sqliteTable(
  "guests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    externalId: text("external_id").notNull().unique(),
    householdId: integer("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    displayOrder: integer("display_order").notNull().default(0),
    guestType: text("guest_type").notNull().default("adult"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    attendance: text("attendance").notNull().default("pending"),
    dietaryNotes: text("dietary_notes").notNull().default(""),
    mealChoice: text("meal_choice").notNull().default(""),
    responseSource: text("response_source").notNull().default("website"),
    responseVersion: integer("response_version").notNull().default(0),
    importBatchId: text("import_batch_id").references(() => importBatches.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("guests_household_idx").on(table.householdId),
    index("guests_household_active_order_idx").on(table.householdId, table.active, table.displayOrder),
    uniqueIndex("guests_external_id_nocase_unique").on(sql`upper(${table.externalId})`),
    check("guests_attendance_check", sql`${table.attendance} in ('pending', 'attending', 'declined')`),
    check("guests_response_source_check", sql`${table.responseSource} in ('website', 'phone', 'whatsapp', 'viber', 'paper')`),
    check("guests_guest_type_check", sql`${table.guestType} in ('adult', 'child', 'infant')`),
  ],
);

export const weddingSettings = sqliteTable("wedding_settings", {
  id: integer("id").primaryKey(),
  mealPhaseOpen: integer("meal_phase_open", { mode: "boolean" }).notNull().default(false),
  rsvpDeadline: text("rsvp_deadline").notNull().default("2027-01-01"),
  weddingDate: text("wedding_date").notNull().default("2027-06-20"),
  deletionDate: text("deletion_date").notNull().default("2027-06-27"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const invitationLookupLimits = sqliteTable("invitation_lookup_limits", {
  bucketKey: text("bucket_key").primaryKey(),
  attemptCount: integer("attempt_count").notNull().default(1),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [
  index("invitation_lookup_limits_expiry_idx").on(table.expiresAt),
  check("invitation_lookup_limits_count_check", sql`${table.attemptCount} >= 0`),
]);

export const retentionReceipts = sqliteTable("retention_receipts", {
  id: text("id").primaryKey(),
  deletionDate: text("deletion_date").notNull(),
  householdsDeleted: integer("households_deleted").notNull().default(0),
  guestsDeleted: integer("guests_deleted").notNull().default(0),
  importsDeleted: integer("imports_deleted").notNull().default(0),
  completedAt: text("completed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const mealOptions = sqliteTable("meal_options", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  optionKey: text("option_key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  guestType: text("guest_type").notNull().default("all"),
  displayOrder: integer("display_order").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("meal_options_active_order_idx").on(table.active, table.displayOrder),
  check("meal_options_guest_type_check", sql`${table.guestType} in ('all', 'adult', 'child', 'infant')`),
]);

export const auditEvents = sqliteTable("audit_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: text("event_id").notNull().unique(),
  actorType: text("actor_type").notNull(),
  actorEmail: text("actor_email").notNull().default(""),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull().default(""),
  householdId: integer("household_id").references(() => households.id, { onDelete: "set null" }),
  detailsJson: text("details_json").notNull().default("{}"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("audit_events_household_created_idx").on(table.householdId, table.createdAt),
  index("audit_events_action_created_idx").on(table.action, table.createdAt),
  check("audit_events_actor_type_check", sql`${table.actorType} in ('guest', 'admin', 'system')`),
]);
