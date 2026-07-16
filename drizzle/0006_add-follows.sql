CREATE TABLE `tag_follows` (
	`user_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `tag_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tag_follows_tag_idx` ON `tag_follows` (`tag_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `user_follows` (
	`follower_id` text NOT NULL,
	`followed_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`follower_id`, `followed_user_id`),
	FOREIGN KEY (`follower_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`followed_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_follows_not_self_check" CHECK("user_follows"."follower_id" <> "user_follows"."followed_user_id")
);
--> statement-breakpoint
CREATE INDEX `user_follows_followed_user_idx` ON `user_follows` (`followed_user_id`,`follower_id`);