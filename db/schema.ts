import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const households = sqliteTable("households", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  householdName: text("household_name").notNull(),
});

export const guests = sqliteTable(
  "guests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    householdId: integer("household_id").notNull().references(() => households.id),
    name: text("name").notNull(),
    attendance: text("attendance").notNull().default("pending"),
    dietaryNotes: text("dietary_notes").notNull().default(""),
    mealChoice: text("meal_choice").notNull().default(""),
    responseSource: text("response_source").notNull().default("website"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("guests_household_idx").on(table.householdId)],
);

export const weddingSettings = sqliteTable("wedding_settings", {
  id: integer("id").primaryKey(),
  mealPhaseOpen: integer("meal_phase_open", { mode: "boolean" }).notNull().default(false),
});
