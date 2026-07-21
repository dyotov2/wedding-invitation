CREATE TABLE `retention_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`deletion_date` text NOT NULL,
	`households_deleted` integer DEFAULT 0 NOT NULL,
	`guests_deleted` integer DEFAULT 0 NOT NULL,
	`imports_deleted` integer DEFAULT 0 NOT NULL,
	`completed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
