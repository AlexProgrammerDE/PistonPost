CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_events_entity_created_idx` ON `audit_events` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`legacy_id` text,
	`post_id` text NOT NULL,
	`author_id` text NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer,
	`moderation_reason` text,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "comments_content_length_check" CHECK(length("comments"."content") between 1 and 250),
	CONSTRAINT "comments_status_check" CHECK("comments"."status" in ('published', 'moderated', 'deleted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `comments_legacy_id_unique` ON `comments` (`legacy_id`);--> statement-breakpoint
CREATE INDEX `comments_post_status_created_idx` ON `comments` (`post_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`legacy_id` text,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`provider` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`r2_key` text,
	`stream_uid` text,
	`original_filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`width` integer,
	`height` integer,
	`duration_ms` integer,
	`checksum` text,
	`alt_text` text,
	`provider_metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`finalized_at` integer,
	`deleted_at` integer,
	CONSTRAINT "media_assets_kind_check" CHECK("media_assets"."kind" in ('image', 'video', 'avatar')),
	CONSTRAINT "media_assets_provider_check" CHECK("media_assets"."provider" in ('r2', 'images', 'stream', 'legacy')),
	CONSTRAINT "media_assets_status_check" CHECK("media_assets"."status" in ('pending', 'uploading', 'processing', 'ready', 'failed', 'deleted')),
	CONSTRAINT "media_assets_byte_size_check" CHECK("media_assets"."byte_size" >= 0),
	CONSTRAINT "media_assets_width_check" CHECK("media_assets"."width" is null or "media_assets"."width" > 0),
	CONSTRAINT "media_assets_height_check" CHECK("media_assets"."height" is null or "media_assets"."height" > 0),
	CONSTRAINT "media_assets_duration_check" CHECK("media_assets"."duration_ms" is null or "media_assets"."duration_ms" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_assets_r2_key_unique` ON `media_assets` (`r2_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_assets_stream_uid_unique` ON `media_assets` (`stream_uid`);--> statement-breakpoint
CREATE INDEX `media_assets_owner_status_created_idx` ON `media_assets` (`owner_id`,`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_assets_legacy_id_idx` ON `media_assets` (`legacy_id`);--> statement-breakpoint
CREATE TABLE `migration_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`source_collection` text NOT NULL,
	`legacy_id` text NOT NULL,
	`target_table` text NOT NULL,
	`target_id` text,
	`checksum` text,
	`state` text NOT NULL,
	`reason` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `migration_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "migration_mappings_state_check" CHECK("migration_mappings"."state" in ('pending', 'imported', 'skipped', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `migration_mappings_source_legacy_idx` ON `migration_mappings` (`source_collection`,`legacy_id`);--> statement-breakpoint
CREATE INDEX `migration_mappings_run_state_idx` ON `migration_mappings` (`run_id`,`state`);--> statement-breakpoint
CREATE TABLE `migration_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_fingerprint` text NOT NULL,
	`state` text NOT NULL,
	`counters` text DEFAULT '{}' NOT NULL,
	`started_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`finished_at` integer,
	`last_error` text,
	CONSTRAINT "migration_runs_state_check" CHECK("migration_runs"."state" in ('analyzing', 'running', 'failed', 'complete'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `migration_runs_source_fingerprint_idx` ON `migration_runs` (`source_fingerprint`);--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`available_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`processed_at` integer,
	`last_error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "outbox_attempts_check" CHECK("outbox"."attempts" >= 0)
);
--> statement-breakpoint
CREATE INDEX `outbox_processed_available_idx` ON `outbox` (`processed_at`,`available_at`);--> statement-breakpoint
CREATE TABLE `post_media` (
	`post_id` text NOT NULL,
	`media_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`caption` text,
	PRIMARY KEY(`post_id`, `media_id`),
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "post_media_ordinal_check" CHECK("post_media"."ordinal" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `post_media_post_ordinal_idx` ON `post_media` (`post_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `post_tags` (
	`post_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	PRIMARY KEY(`post_id`, `tag_id`),
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "post_tags_ordinal_check" CHECK("post_tags"."ordinal" between 0 and 4)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `post_tags_post_ordinal_idx` ON `post_tags` (`post_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `post_tags_tag_post_idx` ON `post_tags` (`tag_id`,`post_id`);--> statement-breakpoint
CREATE TABLE `posts` (
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
	CONSTRAINT "posts_type_check" CHECK("posts"."type" in ('text', 'images', 'video')),
	CONSTRAINT "posts_status_check" CHECK("posts"."status" in ('draft', 'processing', 'published', 'moderated', 'deleted', 'failed')),
	CONSTRAINT "posts_visibility_check" CHECK("posts"."visibility" in ('public', 'unlisted')),
	CONSTRAINT "posts_title_length_check" CHECK(length("posts"."title") between 1 and 100),
	CONSTRAINT "posts_text_content_length_check" CHECK("posts"."text_content" is null or length("posts"."text_content") <= 1000),
	CONSTRAINT "posts_text_content_required_check" CHECK("posts"."type" <> 'text' or "posts"."text_content" is not null),
	CONSTRAINT "posts_published_at_check" CHECK("posts"."status" <> 'published' or "posts"."published_at" is not null),
	CONSTRAINT "posts_version_check" CHECK("posts"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `posts_legacy_id_idx` ON `posts` (`legacy_id`);--> statement-breakpoint
CREATE INDEX `posts_discovery_idx` ON `posts` (`status`,`visibility`,`published_at`,`id`);--> statement-breakpoint
CREATE INDEX `posts_author_status_created_idx` ON `posts` (`author_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`normalized_username` text NOT NULL,
	`bio` text,
	`website` text,
	`location` text,
	`avatar_media_id` text,
	`legacy_avatar_url` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "profiles_username_length_check" CHECK(length("profiles"."username") between 1 and 32),
	CONSTRAINT "profiles_normalized_username_length_check" CHECK(length("profiles"."normalized_username") between 1 and 32)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_normalized_username_idx` ON `profiles` (`normalized_username`);--> statement-breakpoint
CREATE TABLE `reactions` (
	`post_id` text NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`post_id`, `user_id`),
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "reactions_type_check" CHECK("reactions"."type" in ('like', 'dislike', 'heart'))
);
--> statement-breakpoint
CREATE INDEX `reactions_post_type_idx` ON `reactions` (`post_id`,`type`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "tags_display_name_check" CHECK(length("tags"."display_name") between 1 and 64),
	CONSTRAINT "tags_normalized_name_check" CHECK(length("tags"."normalized_name") between 1 and 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_normalized_name_unique` ON `tags` (`normalized_name`);--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email_notifications` integer DEFAULT true NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "user_settings_theme_check" CHECK("user_settings"."theme" in ('system', 'light', 'dark'))
);
