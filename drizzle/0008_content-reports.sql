CREATE TABLE `content_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_id` text,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`reason` text NOT NULL,
	`details` text,
	`status` text DEFAULT 'open' NOT NULL,
	`resolved_by` text,
	`resolved_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`reporter_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`resolved_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "content_reports_target_type_check" CHECK("content_reports"."target_type" in ('post', 'comment', 'profile')),
	CONSTRAINT "content_reports_reason_check" CHECK("content_reports"."reason" in ('spam', 'harassment', 'illegal', 'copyright', 'other')),
	CONSTRAINT "content_reports_status_check" CHECK("content_reports"."status" in ('open', 'resolved', 'dismissed')),
	CONSTRAINT "content_reports_target_id_check" CHECK(length("content_reports"."target_id") between 1 and 128),
	CONSTRAINT "content_reports_details_check" CHECK("content_reports"."details" is null or length("content_reports"."details") <= 1000)
);
--> statement-breakpoint
CREATE INDEX `content_reports_status_created_idx` ON `content_reports` (`status`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `content_reports_target_idx` ON `content_reports` (`target_type`,`target_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `content_reports_reporter_created_idx` ON `content_reports` (`reporter_id`,`created_at`);