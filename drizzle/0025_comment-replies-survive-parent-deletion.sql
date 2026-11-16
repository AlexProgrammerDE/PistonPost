PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_comments` (
	`id` text PRIMARY KEY NOT NULL,
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
	FOREIGN KEY (`parent_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "comments_content_length_check" CHECK(length("__new_comments"."content") between 1 and 250),
	CONSTRAINT "comments_status_check" CHECK("__new_comments"."status" in ('published', 'moderated', 'deleted'))
);
--> statement-breakpoint
INSERT INTO `__new_comments`("id", "post_id", "author_id", "parent_id", "content", "status", "created_at", "updated_at", "deleted_at", "moderation_reason") SELECT "id", "post_id", "author_id", "parent_id", "content", "status", "created_at", "updated_at", "deleted_at", "moderation_reason" FROM `comments`;--> statement-breakpoint
DROP TABLE `comments`;--> statement-breakpoint
ALTER TABLE `__new_comments` RENAME TO `comments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `comments_post_status_created_idx` ON `comments` (`post_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `comments_parent_status_created_idx` ON `comments` (`parent_id`,`status`,`created_at`);