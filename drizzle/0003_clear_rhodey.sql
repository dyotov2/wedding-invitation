CREATE TABLE `invitation_lookup_limits` (
	`bucket_key` text PRIMARY KEY NOT NULL,
	`attempt_count` integer DEFAULT 1 NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT "invitation_lookup_limits_count_check" CHECK("invitation_lookup_limits"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX `invitation_lookup_limits_expiry_idx` ON `invitation_lookup_limits` (`expires_at`);