PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_guests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`name` text NOT NULL,
	`attendance` text DEFAULT 'pending' NOT NULL,
	`dietary_notes` text DEFAULT '' NOT NULL,
	`meal_choice` text DEFAULT '' NOT NULL,
	`response_source` text DEFAULT 'website' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_guests`("id", "household_id", "name", "attendance", "dietary_notes", "meal_choice", "response_source", "updated_at") SELECT "id", "household_id", "name", "attendance", "dietary_notes", "meal_choice", "response_source", "updated_at" FROM `guests`;--> statement-breakpoint
DROP TABLE `guests`;--> statement-breakpoint
ALTER TABLE `__new_guests` RENAME TO `guests`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `guests_household_idx` ON `guests` (`household_id`);