PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`legacy_id` text,
	`owner_id` text,
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
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
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
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `media_assets_r2_key_unique` ON `media_assets` (`r2_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_assets_stream_uid_unique` ON `media_assets` (`stream_uid`);--> statement-breakpoint
CREATE INDEX `media_assets_owner_status_created_idx` ON `media_assets` (`owner_id`,`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_assets_legacy_id_idx` ON `media_assets` (`legacy_id`);