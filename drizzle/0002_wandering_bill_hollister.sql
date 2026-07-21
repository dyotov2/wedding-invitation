CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`source_name` text NOT NULL,
	`source_hash` text NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`row_count` integer DEFAULT 0 NOT NULL,
	`household_count` integer DEFAULT 0 NOT NULL,
	`guest_count` integer DEFAULT 0 NOT NULL,
	`imported_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `import_batches_status_check` CHECK(`status` in ('completed', 'failed'))
);--> statement-breakpoint
CREATE UNIQUE INDEX `import_batches_source_hash_unique` ON `import_batches` (`source_hash`);--> statement-breakpoint

CREATE TABLE `meal_options` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`option_key` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`guest_type` text DEFAULT 'all' NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `meal_options_guest_type_check` CHECK(`guest_type` in ('all', 'adult', 'child', 'infant'))
);--> statement-breakpoint
CREATE UNIQUE INDEX `meal_options_option_key_unique` ON `meal_options` (`option_key`);--> statement-breakpoint
CREATE INDEX `meal_options_active_order_idx` ON `meal_options` (`active`,`display_order`);--> statement-breakpoint
INSERT INTO `meal_options` (`option_key`, `name`, `description`, `guest_type`, `display_order`, `active`) VALUES
	('garden', 'Garden table', 'Seasonal vegetables, herbs and grains', 'all', 1, 1),
	('estate', 'Estate table', 'A celebratory meat main with summer sides', 'all', 2, 1),
	('little', 'Little guest', 'A simple child-friendly plate', 'all', 3, 1);--> statement-breakpoint

CREATE TABLE `__new_households` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`external_id` text NOT NULL,
	`link_token` text NOT NULL,
	`short_code` text NOT NULL,
	`household_name` text NOT NULL,
	`greeting` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`response_version` integer DEFAULT 0 NOT NULL,
	`import_batch_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_households` (
	`id`, `external_id`, `link_token`, `short_code`, `household_name`, `greeting`,
	`active`, `response_version`, `created_at`, `updated_at`
)
SELECT
	`id`,
	'LEGACY-HOUSEHOLD-' || `id`,
	lower(hex(randomblob(32))),
	substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (random() & 31) + 1, 1) ||
		substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (random() & 31) + 1, 1) ||
		substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (random() & 31) + 1, 1) ||
		substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (random() & 31) + 1, 1) ||
		substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (random() & 31) + 1, 1) ||
		substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (random() & 31) + 1, 1) ||
		substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (random() & 31) + 1, 1) ||
		substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (random() & 31) + 1, 1) ||
		substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (random() & 31) + 1, 1) ||
		substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (random() & 31) + 1, 1),
	`household_name`,
	'',
	1,
	0,
	CURRENT_TIMESTAMP,
	CURRENT_TIMESTAMP
FROM `households`
WHERE NOT (upper(`code`) = 'ROSE27' AND `household_name` = 'The Petrov Family');--> statement-breakpoint

ALTER TABLE `guests` RENAME TO `legacy_guests`;--> statement-breakpoint
ALTER TABLE `households` RENAME TO `legacy_households`;--> statement-breakpoint
ALTER TABLE `__new_households` RENAME TO `households`;--> statement-breakpoint

CREATE TABLE `__new_guests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`external_id` text NOT NULL,
	`household_id` integer NOT NULL,
	`name` text NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`guest_type` text DEFAULT 'adult' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`attendance` text DEFAULT 'pending' NOT NULL,
	`dietary_notes` text DEFAULT '' NOT NULL,
	`meal_choice` text DEFAULT '' NOT NULL,
	`response_source` text DEFAULT 'website' NOT NULL,
	`response_version` integer DEFAULT 0 NOT NULL,
	`import_batch_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `guests_attendance_check` CHECK(`attendance` in ('pending', 'attending', 'declined')),
	CONSTRAINT `guests_response_source_check` CHECK(`response_source` in ('website', 'phone', 'whatsapp', 'viber', 'paper')),
	CONSTRAINT `guests_guest_type_check` CHECK(`guest_type` in ('adult', 'child', 'infant'))
);--> statement-breakpoint
INSERT INTO `__new_guests` (
	`id`, `external_id`, `household_id`, `name`, `display_order`, `guest_type`, `active`,
	`attendance`, `dietary_notes`, `meal_choice`, `response_source`, `response_version`,
	`created_at`, `updated_at`
)
SELECT
	g.`id`,
		'LEGACY-GUEST-' || g.`id`,
	g.`household_id`,
	g.`name`,
	g.`id`,
	'adult',
	1,
	g.`attendance`,
	g.`dietary_notes`,
	g.`meal_choice`,
	g.`response_source`,
	0,
	CURRENT_TIMESTAMP,
	CASE WHEN g.`updated_at` = 'CURRENT_TIMESTAMP' THEN CURRENT_TIMESTAMP ELSE g.`updated_at` END
FROM `legacy_guests` g
JOIN `legacy_households` h ON h.`id` = g.`household_id`
WHERE NOT (upper(h.`code`) = 'ROSE27' AND h.`household_name` = 'The Petrov Family');--> statement-breakpoint

DROP TABLE `legacy_guests`;--> statement-breakpoint
DROP TABLE `legacy_households`;--> statement-breakpoint
ALTER TABLE `__new_guests` RENAME TO `guests`;--> statement-breakpoint

CREATE UNIQUE INDEX `households_external_id_unique` ON `households` (`external_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `households_link_token_unique` ON `households` (`link_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `households_short_code_unique` ON `households` (`short_code`);--> statement-breakpoint
CREATE INDEX `households_active_name_idx` ON `households` (`active`,`household_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `guests_external_id_unique` ON `guests` (`external_id`);--> statement-breakpoint
CREATE INDEX `guests_household_idx` ON `guests` (`household_id`);--> statement-breakpoint
CREATE INDEX `guests_household_active_order_idx` ON `guests` (`household_id`,`active`,`display_order`);--> statement-breakpoint

CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_email` text DEFAULT '' NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text DEFAULT '' NOT NULL,
	`household_id` integer,
	`details_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT `audit_events_actor_type_check` CHECK(`actor_type` in ('guest', 'admin', 'system'))
);--> statement-breakpoint
CREATE UNIQUE INDEX `audit_events_event_id_unique` ON `audit_events` (`event_id`);--> statement-breakpoint
CREATE INDEX `audit_events_household_created_idx` ON `audit_events` (`household_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_events_action_created_idx` ON `audit_events` (`action`,`created_at`);--> statement-breakpoint

CREATE TABLE `__new_wedding_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`meal_phase_open` integer DEFAULT false NOT NULL,
	`rsvp_deadline` text DEFAULT '2027-01-01' NOT NULL,
	`wedding_date` text DEFAULT '2027-06-20' NOT NULL,
	`deletion_date` text DEFAULT '2027-06-27' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
INSERT INTO `__new_wedding_settings` (`id`, `meal_phase_open`)
SELECT `id`, `meal_phase_open` FROM `wedding_settings`;--> statement-breakpoint
INSERT OR IGNORE INTO `__new_wedding_settings` (`id`, `meal_phase_open`) VALUES (1, 0);--> statement-breakpoint
DROP TABLE `wedding_settings`;--> statement-breakpoint
ALTER TABLE `__new_wedding_settings` RENAME TO `wedding_settings`;--> statement-breakpoint
