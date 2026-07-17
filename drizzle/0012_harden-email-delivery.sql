CREATE TABLE `email_campaign_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`recipient_user_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`skip_reason` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`id`) REFERENCES `outbox`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `email_campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "email_campaign_deliveries_status_check" CHECK("email_campaign_deliveries"."status" in ('queued', 'sent', 'skipped', 'dead-lettered'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_campaign_deliveries_campaign_recipient_idx` ON `email_campaign_deliveries` (`campaign_id`,`recipient_user_id`);--> statement-breakpoint
CREATE INDEX `email_campaign_deliveries_campaign_status_idx` ON `email_campaign_deliveries` (`campaign_id`,`status`);--> statement-breakpoint
CREATE TABLE `email_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`created_by` text,
	`subject` text NOT NULL,
	`preview` text NOT NULL,
	`heading` text NOT NULL,
	`message` text NOT NULL,
	`action_label` text,
	`action_url` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`sent_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "email_campaigns_subject_length_check" CHECK(length("email_campaigns"."subject") between 1 and 160),
	CONSTRAINT "email_campaigns_preview_length_check" CHECK(length("email_campaigns"."preview") between 1 and 200),
	CONSTRAINT "email_campaigns_heading_length_check" CHECK(length("email_campaigns"."heading") between 1 and 120),
	CONSTRAINT "email_campaigns_message_length_check" CHECK(length("email_campaigns"."message") between 1 and 2000),
	CONSTRAINT "email_campaigns_status_check" CHECK("email_campaigns"."status" in ('draft', 'sending', 'sent')),
	CONSTRAINT "email_campaigns_action_pair_check" CHECK(("email_campaigns"."action_label" is null and "email_campaigns"."action_url" is null) or ("email_campaigns"."action_label" is not null and "email_campaigns"."action_url" is not null))
);
--> statement-breakpoint
CREATE INDEX `email_campaigns_status_created_idx` ON `email_campaigns` (`status`,`created_at`);--> statement-breakpoint
DROP INDEX `outbox_processed_available_idx`;--> statement-breakpoint
ALTER TABLE `outbox` ADD `lease_expires_at` integer;--> statement-breakpoint
ALTER TABLE `outbox` ADD `dead_lettered_at` integer;--> statement-breakpoint
ALTER TABLE `outbox` ADD `completed_reason` text;--> statement-breakpoint
CREATE INDEX `outbox_delivery_idx` ON `outbox` (`processed_at`,`dead_lettered_at`,`available_at`,`lease_expires_at`);--> statement-breakpoint
ALTER TABLE `comments` ADD `parent_id` text REFERENCES comments(id);--> statement-breakpoint
CREATE INDEX `comments_parent_status_created_idx` ON `comments` (`parent_id`,`status`,`created_at`);