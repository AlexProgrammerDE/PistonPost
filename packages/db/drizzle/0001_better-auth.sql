CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `passkey` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`public_key` text NOT NULL,
	`user_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`counter` integer NOT NULL,
	`device_type` text NOT NULL,
	`backed_up` integer NOT NULL,
	`transports` text,
	`created_at` integer,
	`aaguid` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `passkey_userId_idx` ON `passkey` (`user_id`);--> statement-breakpoint
CREATE INDEX `passkey_credentialID_idx` ON `passkey` (`credential_id`);--> statement-breakpoint
CREATE TABLE `rate_limit` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`count` integer NOT NULL,
	`last_request` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_limit_key_unique` ON `rate_limit` (`key`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`impersonated_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `two_factor` (
	`id` text PRIMARY KEY NOT NULL,
	`secret` text NOT NULL,
	`backup_codes` text NOT NULL,
	`user_id` text NOT NULL,
	`verified` integer DEFAULT true,
	`failed_verification_count` integer DEFAULT 0,
	`locked_until` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `twoFactor_secret_idx` ON `two_factor` (`secret`);--> statement-breakpoint
CREATE INDEX `twoFactor_userId_idx` ON `two_factor` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`username` text,
	`display_username` text,
	`two_factor_enabled` integer DEFAULT false,
	`role` text,
	`banned` integer DEFAULT false,
	`ban_reason` text,
	`ban_expires` integer,
	`normalized_email` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_username_unique` ON `user` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_normalized_email_unique` ON `user` (`normalized_email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_audit_events`("id", "actor_id", "action", "entity_type", "entity_id", "metadata", "created_at") SELECT "id", "actor_id", "action", "entity_type", "entity_id", "metadata", "created_at" FROM `audit_events`;--> statement-breakpoint
DROP TABLE `audit_events`;--> statement-breakpoint
ALTER TABLE `__new_audit_events` RENAME TO `audit_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `audit_events_entity_created_idx` ON `audit_events` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `__new_comments` (
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
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "comments_content_length_check" CHECK(length("__new_comments"."content") between 1 and 250),
	CONSTRAINT "comments_status_check" CHECK("__new_comments"."status" in ('published', 'moderated', 'deleted'))
);
--> statement-breakpoint
INSERT INTO `__new_comments`("id", "legacy_id", "post_id", "author_id", "content", "status", "created_at", "updated_at", "deleted_at", "moderation_reason") SELECT "id", "legacy_id", "post_id", "author_id", "content", "status", "created_at", "updated_at", "deleted_at", "moderation_reason" FROM `comments`;--> statement-breakpoint
DROP TABLE `comments`;--> statement-breakpoint
ALTER TABLE `__new_comments` RENAME TO `comments`;--> statement-breakpoint
CREATE UNIQUE INDEX `comments_legacy_id_unique` ON `comments` (`legacy_id`);--> statement-breakpoint
CREATE INDEX `comments_post_status_created_idx` ON `comments` (`post_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `__new_media_assets` (
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
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "media_assets_kind_check" CHECK("__new_media_assets"."kind" in ('image', 'video', 'avatar')),
	CONSTRAINT "media_assets_provider_check" CHECK("__new_media_assets"."provider" in ('r2', 'images', 'stream', 'legacy')),
	CONSTRAINT "media_assets_status_check" CHECK("__new_media_assets"."status" in ('pending', 'uploading', 'processing', 'ready', 'failed', 'deleted')),
	CONSTRAINT "media_assets_byte_size_check" CHECK("__new_media_assets"."byte_size" >= 0),
	CONSTRAINT "media_assets_width_check" CHECK("__new_media_assets"."width" is null or "__new_media_assets"."width" > 0),
	CONSTRAINT "media_assets_height_check" CHECK("__new_media_assets"."height" is null or "__new_media_assets"."height" > 0),
	CONSTRAINT "media_assets_duration_check" CHECK("__new_media_assets"."duration_ms" is null or "__new_media_assets"."duration_ms" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_media_assets`("id", "legacy_id", "owner_id", "kind", "provider", "status", "r2_key", "stream_uid", "original_filename", "mime_type", "byte_size", "width", "height", "duration_ms", "checksum", "alt_text", "provider_metadata", "created_at", "finalized_at", "deleted_at") SELECT "id", "legacy_id", "owner_id", "kind", "provider", "status", "r2_key", "stream_uid", "original_filename", "mime_type", "byte_size", "width", "height", "duration_ms", "checksum", "alt_text", "provider_metadata", "created_at", "finalized_at", "deleted_at" FROM `media_assets`;--> statement-breakpoint
DROP TABLE `media_assets`;--> statement-breakpoint
ALTER TABLE `__new_media_assets` RENAME TO `media_assets`;--> statement-breakpoint
CREATE UNIQUE INDEX `media_assets_r2_key_unique` ON `media_assets` (`r2_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_assets_stream_uid_unique` ON `media_assets` (`stream_uid`);--> statement-breakpoint
CREATE INDEX `media_assets_owner_status_created_idx` ON `media_assets` (`owner_id`,`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_assets_legacy_id_idx` ON `media_assets` (`legacy_id`);--> statement-breakpoint
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
	CONSTRAINT "posts_title_length_check" CHECK(length("__new_posts"."title") between 1 and 100),
	CONSTRAINT "posts_text_content_length_check" CHECK("__new_posts"."text_content" is null or length("__new_posts"."text_content") <= 1000),
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
CREATE INDEX `posts_author_status_created_idx` ON `posts` (`author_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `__new_profiles` (
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
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "profiles_username_length_check" CHECK(length("__new_profiles"."username") between 1 and 32),
	CONSTRAINT "profiles_normalized_username_length_check" CHECK(length("__new_profiles"."normalized_username") between 1 and 32)
);
--> statement-breakpoint
INSERT INTO `__new_profiles`("user_id", "username", "normalized_username", "bio", "website", "location", "avatar_media_id", "legacy_avatar_url", "created_at", "updated_at") SELECT "user_id", "username", "normalized_username", "bio", "website", "location", "avatar_media_id", "legacy_avatar_url", "created_at", "updated_at" FROM `profiles`;--> statement-breakpoint
DROP TABLE `profiles`;--> statement-breakpoint
ALTER TABLE `__new_profiles` RENAME TO `profiles`;--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_normalized_username_idx` ON `profiles` (`normalized_username`);--> statement-breakpoint
CREATE TABLE `__new_reactions` (
	`post_id` text NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`post_id`, `user_id`),
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "reactions_type_check" CHECK("__new_reactions"."type" in ('like', 'dislike', 'heart'))
);
--> statement-breakpoint
INSERT INTO `__new_reactions`("post_id", "user_id", "type", "created_at", "updated_at") SELECT "post_id", "user_id", "type", "created_at", "updated_at" FROM `reactions`;--> statement-breakpoint
DROP TABLE `reactions`;--> statement-breakpoint
ALTER TABLE `__new_reactions` RENAME TO `reactions`;--> statement-breakpoint
CREATE INDEX `reactions_post_type_idx` ON `reactions` (`post_id`,`type`);--> statement-breakpoint
CREATE TABLE `__new_user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email_notifications` integer DEFAULT true NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_settings_theme_check" CHECK("__new_user_settings"."theme" in ('system', 'light', 'dark'))
);
--> statement-breakpoint
INSERT INTO `__new_user_settings`("user_id", "email_notifications", "theme", "created_at", "updated_at") SELECT "user_id", "email_notifications", "theme", "created_at", "updated_at" FROM `user_settings`;--> statement-breakpoint
DROP TABLE `user_settings`;--> statement-breakpoint
ALTER TABLE `__new_user_settings` RENAME TO `user_settings`;