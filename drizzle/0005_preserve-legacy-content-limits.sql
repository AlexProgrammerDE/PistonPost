PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_post_tags` (
	`post_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	PRIMARY KEY(`post_id`, `tag_id`),
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "post_tags_ordinal_check" CHECK("__new_post_tags"."ordinal" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_post_tags`("post_id", "tag_id", "ordinal") SELECT "post_id", "tag_id", "ordinal" FROM `post_tags`;--> statement-breakpoint
DROP TABLE `post_tags`;--> statement-breakpoint
ALTER TABLE `__new_post_tags` RENAME TO `post_tags`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `post_tags_post_ordinal_idx` ON `post_tags` (`post_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `post_tags_tag_post_idx` ON `post_tags` (`tag_id`,`post_id`);--> statement-breakpoint
CREATE TABLE `__new_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`legacy_id` text,
	`author_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`title` text NOT NULL,
	`text_content` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`published_at` integer,
	`deleted_at` integer,
	`moderation_reason` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "posts_type_check" CHECK("__new_posts"."type" in ('text', 'images', 'video')),
	CONSTRAINT "posts_status_check" CHECK("__new_posts"."status" in ('draft', 'processing', 'published', 'moderated', 'deleted', 'failed')),
	CONSTRAINT "posts_visibility_check" CHECK("__new_posts"."visibility" in ('public', 'unlisted')),
	CONSTRAINT "posts_title_length_check" CHECK(length("__new_posts"."title") between 1 and 10000),
	CONSTRAINT "posts_text_content_length_check" CHECK("__new_posts"."text_content" is null or length("__new_posts"."text_content") <= 1000000),
	CONSTRAINT "posts_text_content_required_check" CHECK("__new_posts"."type" <> 'text' or "__new_posts"."text_content" is not null),
	CONSTRAINT "posts_published_at_check" CHECK("__new_posts"."status" <> 'published' or "__new_posts"."published_at" is not null),
	CONSTRAINT "posts_version_check" CHECK("__new_posts"."version" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_posts`("id", "legacy_id", "author_id", "type", "status", "visibility", "title", "text_content", "created_at", "updated_at", "published_at", "deleted_at", "moderation_reason", "version") SELECT "id", "legacy_id", "author_id", "type", "status", "visibility", "title", "text_content", "created_at", "updated_at", "published_at", "deleted_at", "moderation_reason", "version" FROM `posts`;--> statement-breakpoint
DROP TABLE `posts`;--> statement-breakpoint
ALTER TABLE `__new_posts` RENAME TO `posts`;--> statement-breakpoint
CREATE UNIQUE INDEX `posts_legacy_id_idx` ON `posts` (`legacy_id`);--> statement-breakpoint
CREATE INDEX `posts_discovery_idx` ON `posts` (`status`,`visibility`,`published_at`,`id`);--> statement-breakpoint
CREATE INDEX `posts_author_status_created_idx` ON `posts` (`author_id`,`status`,`created_at`);