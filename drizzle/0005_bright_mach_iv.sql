CREATE TABLE `import_previews` (
	`id` text PRIMARY KEY NOT NULL,
	`source_hash` text NOT NULL,
	`previewed_by` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `import_previews_expiry_idx` ON `import_previews` (`expires_at`);--> statement-breakpoint
UPDATE `households` SET `external_id` = upper(`external_id`);--> statement-breakpoint
UPDATE `guests` SET `external_id` = upper(`external_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `guests_external_id_nocase_unique` ON `guests` (upper("external_id"));--> statement-breakpoint
CREATE UNIQUE INDEX `households_external_id_nocase_unique` ON `households` (upper("external_id"));
