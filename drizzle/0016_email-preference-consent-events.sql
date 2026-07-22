CREATE TABLE `email_preference_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`preference` text NOT NULL,
	`enabled` integer NOT NULL,
	`source` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "email_preference_changes_preference_check" CHECK("email_preference_changes"."preference" in ('comment-email', 'reply-email', 'product-email')),
	CONSTRAINT "email_preference_changes_source_check" CHECK("email_preference_changes"."source" in ('settings', 'email-link', 'one-click'))
);
--> statement-breakpoint
CREATE INDEX `email_preference_changes_user_preference_created_idx` ON `email_preference_changes` (`user_id`,`preference`,`created_at`);