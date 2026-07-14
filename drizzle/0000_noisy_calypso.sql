CREATE TABLE `guests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`name` text NOT NULL,
	`attendance` text DEFAULT 'pending' NOT NULL,
	`dietary_notes` text DEFAULT '' NOT NULL,
	`meal_choice` text DEFAULT '' NOT NULL,
	`response_source` text DEFAULT 'website' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `households` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`household_name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `households_code_unique` ON `households` (`code`);--> statement-breakpoint
CREATE TABLE `wedding_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`meal_phase_open` integer DEFAULT false NOT NULL
);
