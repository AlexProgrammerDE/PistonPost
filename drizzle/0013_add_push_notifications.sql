CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`endpoint_hash` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`expiration_time` integer,
	`last_success_at` integer,
	`disabled_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "push_subscriptions_endpoint_length_check" CHECK(length("push_subscriptions"."endpoint") between 1 and 2048),
	CONSTRAINT "push_subscriptions_endpoint_hash_length_check" CHECK(length("push_subscriptions"."endpoint_hash") = 64),
	CONSTRAINT "push_subscriptions_p256dh_length_check" CHECK(length("push_subscriptions"."p256dh") between 1 and 512),
	CONSTRAINT "push_subscriptions_auth_length_check" CHECK(length("push_subscriptions"."auth") between 1 and 256)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_hash_idx` ON `push_subscriptions` (`endpoint_hash`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_active_idx` ON `push_subscriptions` (`user_id`,`disabled_at`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_session_idx` ON `push_subscriptions` (`session_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`legacy_id` text,
	`post_id` text NOT NULL,
	`author_id` text NOT NULL,
	`parent_id` text,
	`content` text NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer,
	`moderation_reason` text,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "comments_content_length_check" CHECK(length("__new_comments"."content") between 1 and 250),
	CONSTRAINT "comments_status_check" CHECK("__new_comments"."status" in ('published', 'moderated', 'deleted'))
);
--> statement-breakpoint
INSERT INTO `__new_comments`("id", "legacy_id", "post_id", "author_id", "parent_id", "content", "status", "created_at", "updated_at", "deleted_at", "moderation_reason") SELECT "id", "legacy_id", "post_id", "author_id", "parent_id", "content", "status", "created_at", "updated_at", "deleted_at", "moderation_reason" FROM `comments`;--> statement-breakpoint
DROP TABLE `comments`;--> statement-breakpoint
ALTER TABLE `__new_comments` RENAME TO `comments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `comments_legacy_id_unique` ON `comments` (`legacy_id`);--> statement-breakpoint
CREATE INDEX `comments_post_status_created_idx` ON `comments` (`post_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `comments_parent_status_created_idx` ON `comments` (`parent_id`,`status`,`created_at`);--> statement-breakpoint
ALTER TABLE `user_settings` ADD `comment_push_notifications` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `reply_push_notifications` integer DEFAULT true NOT NULL;